import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { allowedOrigins, buildMessage, decodeCredential, encodeCredential, holderThreshold, isHolder, verifyCredential, type SessionFields } from "@/lib/holder/session";
import { authWallet, revokeSession } from "@/lib/server/holder";
import { QUOTAS } from "@/config/quotas";
import { MEMORY_LIMITS, MemoryFull, memoryStore, memoryUsage, resetMemory } from "@/lib/server/data";
import { deleteBook, listBooks, listRuns, runOnServer, saveBook } from "@/lib/server/hosted";
import { propose, emptyBook } from "@/lib/rules/book";
import { USD, WEEK, type Rule } from "@/lib/rules/engine";
import { deriveAlerts, unread } from "@/lib/rules/alerts";
import { BITS } from "@/lib/rules/bits";

// anvil's well-known test key #0 (public test vector, holds nothing)
const acct = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const NOW = Math.floor(Date.now() / 1000);
const fields = (o: Partial<SessionFields> = {}): SessionFields => ({ domain: "lotiq.xyz", uri: "https://lotiq.xyz", address: acct.address.toLowerCase(), chainId: 4663, nonce: "0123456789abcdef", issuedAt: NOW, expiresAt: NOW + 3600, ...o });
const signed = async (o: Partial<SessionFields> = {}) => {
  const message = buildMessage(fields(o));
  return { message, signature: await acct.signMessage({ message }) };
};
const PROD = allowedOrigins({ vercel: "1" });

test("session: an EIP-4361 message for the brand domain verifies; header round trip", async () => {
  const c = await signed();
  assert.match(c.message, /^lotiq\.xyz wants you to sign in with your Ethereum account:\n0x/);
  assert.match(c.message, /\nURI: https:\/\/lotiq\.xyz\nVersion: 1\nChain ID: 4663\n/);
  const v = await verifyCredential(c, NOW + 10, PROD);
  assert.equal(v.ok, true);
  assert.deepEqual(decodeCredential(encodeCredential(c)), c);
  assert.ok((await verifyCredential(await signed({ domain: "www.lotiq.xyz", uri: "https://www.lotiq.xyz" }), NOW, PROD)).ok);
});

test("session: foreign domain, URI mismatch, localhost on Vercel, non-SIWE text, wrong chain, expired, > 4 h, future, wrong signer are refused", async () => {
  const no = async (c: { message: string; signature: `0x${string}` }, allowed = PROD) => assert.equal((await verifyCredential(c, NOW, allowed)).ok, false);
  await no(await signed({ domain: "evil.example", uri: "https://evil.example" }));
  await no(await signed({ uri: "https://evil.example" }));
  await no(await signed({ domain: "localhost:6681", uri: "http://localhost:6681" }));
  assert.ok((await verifyCredential(await signed({ domain: "localhost:6681", uri: "http://localhost:6681" }), NOW, allowedOrigins({ vercel: undefined }))).ok);
  await no(await signed({ domain: "localhost:9999", uri: "http://localhost:9999" }), allowedOrigins({ vercel: undefined }));
  const plain = "lotiq.xyz asks you to sign in.\nNonce: 0123456789abcdef";
  await no({ message: plain, signature: await acct.signMessage({ message: plain }) });
  await no(await signed({ chainId: 1 }));
  const c = await signed();
  const exp = await verifyCredential(c, NOW + 3600, PROD);
  assert.equal(exp.ok, false);
  assert.match((exp as { reason: string }).reason, /expired/);
  await no(await signed({ expiresAt: NOW + 4 * 3600 + 1 }));
  await no(await signed({ issuedAt: NOW + 600, expiresAt: NOW + 3600 }));
  const other = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const message = buildMessage(fields());
  await no({ message, signature: await other.signMessage({ message }) });
  await no({ message: c.message + "\nResources: x", signature: c.signature });
  assert.equal(decodeCredential("Bearer x"), null);
});

test("server auth ignores a spoofed Host header and honours sign out", async () => {
  resetMemory();
  // A session signed for a foreign domain is refused even when the request claims that domain as its Host.
  const foreign = await signed({ domain: "evil.example", uri: "https://evil.example" });
  const r1 = await authWallet(new Request("http://x/api/holder", { headers: { host: "evil.example", "x-forwarded-host": "evil.example", authorization: encodeCredential(foreign) } }), memoryStore);
  assert.equal(r1.ok, false);
  const good = await signed({ nonce: "fedcba9876543210" });
  const req = () => new Request("http://x/api/holder", { headers: { host: "evil.example", authorization: encodeCredential(good) } });
  const r2 = await authWallet(req(), memoryStore);
  assert.equal(r2.ok, true);
  await revokeSession(memoryStore, "fedcba9876543210", NOW + 3600);
  const r3 = await authWallet(req(), memoryStore);
  assert.equal(r3.ok, false);
  assert.match((r3 as { reason: string }).reason, /signed out/);
});

test("memory store: key cap and byte budget apply to every write path; lists expire", async () => {
  resetMemory();
  const old = { ...MEMORY_LIMITS };
  MEMORY_LIMITS.MAX_KEYS = 3;
  MEMORY_LIMITS.MAX_BYTES = 200;
  try {
    await memoryStore.set("a", "1");
    await memoryStore.incrEx("b", 60);
    await memoryStore.pushCapped("c", "x", 5);
    await assert.rejects(memoryStore.set("d", "1"), MemoryFull);
    await assert.rejects(memoryStore.incrEx("e", 60), MemoryFull);
    await assert.rejects(memoryStore.pushCapped("f", "x", 5), MemoryFull);
    await assert.rejects(memoryStore.setEx("g", "x", 5), MemoryFull);
    await memoryStore.del("a");
    await assert.rejects(memoryStore.set("big", "y".repeat(300)), MemoryFull);
    await memoryStore.set("small", "ok");
    assert.ok(memoryUsage().bytes <= 200);
    await memoryStore.setEx("t", "1", 1); // replaces nothing: key cap reached
  } catch (e) {
    if (!(e instanceof MemoryFull)) throw e;
  } finally {
    Object.assign(MEMORY_LIMITS, old);
    resetMemory();
  }
  await memoryStore.setEx("short", "1", 1);
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(await memoryStore.get("short"), null);
  assert.equal(memoryUsage().keys, 0);
});

test("tier math: exactly 0.1 %, one wei under, zero supply", () => {
  const supply = 1_000_000n * 10n ** 18n;
  const t = holderThreshold(supply);
  assert.equal(t, 1_000n * 10n ** 18n);
  assert.equal(isHolder(t, supply), true);
  assert.equal(isHolder(t - 1n, supply), false);
  assert.equal(isHolder(10n ** 30n, 0n), false);
  assert.equal(isHolder(0n, 999n), true); // supply/1000 floors to 0: the brief's integer rule
});

const RULE: Rule = { assetSymbol: "NVDA", asset: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", agent: "0x00000000000000000000000000000000000a6e47", orderAmount: 40 * USD, maxPerOrder: 50 * USD, maxPerPeriod: 120 * USD, period: WEEK, approvalAbove: 40 * USD, days: 0x7f, startHour: 0, endHour: 24, minGap: 0, validFrom: NOW, validUntil: NOW + 30 * 86400 };

test("quotas enforced on the server: books and daily runs per tier", async () => {
  resetMemory();
  const w = "0xabc";
  const book = propose(emptyBook(), RULE, NOW);
  for (let i = 0; i < QUOTAS.free.books; i++) assert.equal((await saveBook(memoryStore, w, "free", { id: `b${i}`, book }, NOW)).ok, true);
  const over = await saveBook(memoryStore, w, "free", { id: "extra", book }, NOW);
  assert.equal(over.ok, false);
  assert.equal((over as { status: number }).status, 429);
  assert.equal((await saveBook(memoryStore, w, "free", { id: "b0", label: "replaced", book }, NOW)).ok, true); // replacing is fine
  assert.equal((await saveBook(memoryStore, w, "holder", { id: "extra", book }, NOW)).ok, true);
  assert.equal((await saveBook(memoryStore, w, "free", { id: "bad", book: { nope: 1 } }, NOW)).ok, false);
  assert.equal((await listBooks(memoryStore, w)).length, 3);
  assert.equal((await deleteBook(memoryStore, w, "extra")).length, 2);
  for (let i = 0; i < QUOTAS.free.runsPerDay; i++) assert.equal((await runOnServer(memoryStore, w, "free", RULE, NOW)).ok, true);
  const no = await runOnServer(memoryStore, w, "free", RULE, NOW);
  assert.equal(no.ok, false);
  assert.equal((no as { status: number }).status, 429);
  assert.equal((await runOnServer(memoryStore, w, "holder", RULE, NOW)).ok, true);
  assert.equal((await listRuns(memoryStore, w, "free")).length, QUOTAS.free.history);
  assert.equal((await runOnServer(memoryStore, "0xdef", "free", { ...RULE, maxPerOrder: 999 * USD }, NOW)).ok, false);
});

test("alerts from logs: refused, limit near/reached, waiting version, pause; unread by block", () => {
  const books = [{ id: 1, label: "dca", versions: [{ n: 1, maxPerPeriod: String(100 * USD), status: 2 }, { n: 2, maxPerPeriod: String(150 * USD), status: 1 }] }];
  const ev = (name: string, block: number, args: Record<string, unknown>) => ({ name, bookId: 1, block, tx: `0x${block}`, logIndex: 0, args });
  const alerts = deriveAlerts(books, [
    ev("OrderRecorded", 10, { version: 1, spentInWindow: String(50 * USD) }),
    ev("OrderRecorded", 11, { version: 1, spentInWindow: String(85 * USD) }),
    ev("OrderRecorded", 12, { version: 1, spentInWindow: String(100 * USD) }),
    ev("OrderRefused", 13, { version: 1, amount: String(70 * USD), bits: String(BITS.OVER_ORDER_MAX) }),
    ev("VersionProposed", 14, { version: 2 }),
    ev("BookPaused", 15, {}),
  ]);
  assert.deepEqual(alerts.map((a) => a.kind), ["paused", "waiting", "refused", "limit", "limit"]);
  assert.match(alerts[2].body, /Max per order/);
  assert.match(alerts[3].title, /reached/);
  assert.match(alerts[4].title, /near/);
  assert.equal(unread(alerts, 13).length, 2);
});
