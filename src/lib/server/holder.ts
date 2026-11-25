import "server-only";
import { encodeFunctionData } from "viem";
import { QUOTAS, type Tier } from "@/config/quotas";
import { holderToken } from "@/config/contracts";
import { ERC20_ABI } from "@/lib/abi";
import { rpcBatch } from "@/lib/server/chainread";
import { decodeCredential, holderThreshold, isHolder, verifyCredential } from "@/lib/holder/session";
import { dataStore, type DataStore } from "@/lib/server/data";

/*
 * Who is calling, and which tier. The credential (signed session message) is verified on every request; the tier is read from the token
 * on chain: balanceOf(wallet) and totalSupply() at the same block, cached at most 30 s per wallet. Before $LOTIQ exists the tier is
 * "free" with status "unlocks-at-launch". A failed read is never cached and falls back to the free tier, said plainly.
 */

export const TOTAL_SUPPLY = "0x18160ddd";
const CACHE_MS = 30_000;

export type TierInfo = {
  tier: Tier;
  status: "holder" | "below-threshold" | "unlocks-at-launch" | "read-failed";
  token: string | null;
  balance: string | null;
  supply: string | null;
  threshold: string | null;
  block: number | null;
  checkedAt: number;
  quotas: (typeof QUOTAS)[Tier];
};

const cache = new Map<string, { at: number; value: TierInfo }>();

export async function readTier(wallet: string): Promise<TierInfo> {
  const key = wallet.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const token = holderToken();
  const base = { token, balance: null, supply: null, threshold: null, block: null, checkedAt: Math.floor(Date.now() / 1000) };
  if (!token) return { ...base, tier: "free", status: "unlocks-at-launch", quotas: QUOTAS.free };
  try {
    const head = await rpcBatch<string>([{ method: "eth_blockNumber", params: [] }]);
    const tag = typeof head[0] === "string" ? head[0] : "latest";
    const r = await rpcBatch<string>([
      { method: "eth_call", params: [{ to: token, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [wallet as `0x${string}`] }) }, tag] },
      { method: "eth_call", params: [{ to: token, data: TOTAL_SUPPLY }, tag] },
    ]);
    if (typeof r[0] !== "string" || typeof r[1] !== "string" || r[0].length < 66 || r[1].length < 66) throw new Error("token read failed");
    const balance = BigInt(r[0].slice(0, 66));
    const supply = BigInt(r[1].slice(0, 66));
    const holder = isHolder(balance, supply);
    const value: TierInfo = {
      token,
      tier: holder ? "holder" : "free",
      status: holder ? "holder" : "below-threshold",
      balance: balance.toString(),
      supply: supply.toString(),
      threshold: holderThreshold(supply).toString(),
      block: tag === "latest" ? null : Number(BigInt(tag)),
      checkedAt: Math.floor(Date.now() / 1000),
      quotas: QUOTAS[holder ? "holder" : "free"],
    };
    if (cache.size > 2000) cache.clear();
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return { ...base, tier: "free", status: "read-failed", quotas: QUOTAS.free };
  }
}

/*
 * Replay guard: within its (≤ 4 h) lifetime the signed message is a bearer credential, like a session cookie, kept only in the tab's
 * sessionStorage and sent over HTTPS. Sign out revokes its nonce on the server (KV when configured, memory otherwise) until the message
 * expires, so a copied credential stops working for every request, reads and writes alike.
 */
const revokedKey = (nonce: string) => `rv:${nonce}`;

/** The verified wallet behind a request, or the reason it was refused. The domain check uses the fixed allowlist, never Host. */
export async function authWallet(request: Request, store: DataStore = dataStore().store): Promise<{ ok: true; wallet: string; nonce: string; expiresAt: number } | { ok: false; reason: string }> {
  const cred = decodeCredential(request.headers.get("authorization"));
  if (!cred) return { ok: false, reason: "Sign in with your wallet first (one signature, no gas)." };
  const v = await verifyCredential(cred, Math.floor(Date.now() / 1000));
  if (!v.ok) return { ok: false, reason: v.reason };
  if (await store.get(revokedKey(v.nonce))) return { ok: false, reason: "This session was signed out. Sign in again." };
  return { ok: true, wallet: v.address, nonce: v.nonce, expiresAt: v.expiresAt };
}

/** Sign out: the session's nonce is refused until the message would have expired anyway. */
export async function revokeSession(store: DataStore, nonce: string, expiresAt: number) {
  await store.setEx(revokedKey(nonce), "1", Math.max(1, expiresAt - Math.floor(Date.now() / 1000)));
}

export const clearTierCache = () => cache.clear();
