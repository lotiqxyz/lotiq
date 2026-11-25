import "server-only";
import { decodeEventLog, getAddress, pad, toHex } from "viem";
import { CONTRACTS, bookLive } from "@/config/contracts";
import { BOOK_ABI } from "@/lib/abi";
import { headBlock, logReader, reads, type RawLog, type Read } from "@/lib/server/chainread";
import { scanBack } from "@/lib/logscan";

/*
 * Rule books of one owner (or the books an agent was ever bound to), read from LotiqRuleBook views, plus every event of those books
 * from logs: proposals (with every field of the version), approvals, withdrawals, pauses, revokes, order approvals and recorded
 * orders. The dashboard's version timeline and change log are rebuilt from these logs. A refused order leaves no log; the studio
 * records refusals from checkOrder instead.
 */

const MAX_BOOKS = 20;
const MAX_VERSIONS_READ = 30;

export type VersionView = {
  n: number;
  ruleHash: string;
  agent: string;
  asset: string;
  maxPerOrder: string;
  maxPerPeriod: string;
  approvalAbove: string;
  period: number;
  minGap: number;
  days: number;
  startHour: number;
  endHour: number;
  status: number;
  validFrom: number;
  validUntil: number;
  proposedAt: number;
  approvedAt: number;
  parent: number;
};
export type BookView = { id: number; owner: string; active: number; versions: VersionView[]; versionCount: number; paused: boolean; revoked: boolean; openedAt: number; label: string; windowStart: number; spent: string; lastOrderAt: number; orders: number };
export type BookEvent = { name: string; bookId: number; block: number; tx: string; logIndex: number; args: Record<string, unknown> };
export type BooksAnswer = { deployed: boolean; book: string; head: number | null; books: BookView[]; events: BookEvent[]; scanned: { fromBlock: number; toBlock: number; gaps: [number, number][]; complete: boolean } | null };

const r = (fn: string, args: readonly unknown[] = []): Read => ({ to: CONTRACTS.book, abi: BOOK_ABI, fn, args });
const str = (v: unknown): string => (typeof v === "bigint" ? v.toString() : typeof v === "string" ? v : String(v));
const plain = (v: unknown): unknown => (typeof v === "bigint" ? v.toString() : Array.isArray(v) ? v.map(plain) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v);
const label = (b: string) => {
  try {
    return Buffer.from(b.slice(2), "hex").toString("utf8").replace(/\u0000+$/, "").replace(/[^\x20-\x7e]/g, "");
  } catch {
    return "";
  }
};

function version(n: number, v: Record<string, unknown>): VersionView {
  return {
    n,
    ruleHash: str(v.ruleHash),
    agent: str(v.agent).toLowerCase(),
    asset: str(v.asset).toLowerCase(),
    maxPerOrder: str(v.maxPerOrder),
    maxPerPeriod: str(v.maxPerPeriod),
    approvalAbove: str(v.approvalAbove),
    period: Number(v.period),
    minGap: Number(v.minGap),
    days: Number(v.days_),
    startHour: Number(v.startHour),
    endHour: Number(v.endHour),
    status: Number(v.status),
    validFrom: Number(v.validFrom),
    validUntil: Number(v.validUntil),
    proposedAt: Number(v.proposedAt),
    approvedAt: Number(v.approvedAt),
    parent: Number(v.parent),
  };
}

export async function readBooks(who: { owner?: string; agent?: string }): Promise<BooksAnswer> {
  if (!bookLive()) return { deployed: false, book: CONTRACTS.book, head: null, books: [], events: [], scanned: null };
  const head = await headBlock();
  const [ids] = await reads([who.owner ? r("booksOf", [getAddress(who.owner)]) : r("booksOfAgent", [getAddress(who.agent!)])]);
  if (ids.kind !== "ok") throw new Error("The rule book contract did not answer.");
  const list = (ids.value as bigint[]).slice(-MAX_BOOKS).map(Number);
  const books: BookView[] = [];
  for (const id of list) {
    const [b] = await reads([r("getBook", [BigInt(id)])]);
    if (b.kind !== "ok") throw new Error("A rule book read failed.");
    const m = b.value as Record<string, unknown>;
    const count = Number(m.versions);
    const ns = Array.from({ length: Math.min(count, MAX_VERSIONS_READ) }, (_, i) => count - i).reverse();
    const vs = await reads(ns.map((n) => r("getVersion", [BigInt(id), n])));
    if (vs.some((a) => a.kind !== "ok")) throw new Error("A version read failed.");
    books.push({
      id,
      owner: str(m.owner).toLowerCase(),
      active: Number(m.active),
      versionCount: count,
      versions: ns.map((n, k) => version(n, (vs[k] as { value: Record<string, unknown> }).value)),
      paused: Boolean(m.paused),
      revoked: Boolean(m.revoked),
      openedAt: Number(m.openedAt),
      label: label(str(m.label)),
      windowStart: Number(m.windowStart),
      spent: str(m.spent),
      lastOrderAt: Number(m.lastOrderAt),
      orders: Number(m.orders),
    });
  }
  if (list.length === 0) return { deployed: true, book: CONTRACTS.book, head, books, events: [], scanned: { fromBlock: CONTRACTS.block, toBlock: head, gaps: [], complete: true } };

  const topicIds = list.map((id) => pad(toHex(id), { size: 32 }));
  const scan = await scanBack<RawLog>(logReader({ address: CONTRACTS.book, topics: [null, topicIds] }), Math.max(0, CONTRACTS.block), head, { maxCalls: 24 });
  const events: BookEvent[] = [];
  for (const l of scan.logs) {
    if ((l as RawLog & { removed?: boolean }).removed) continue;
    try {
      const d = decodeEventLog({ abi: BOOK_ABI, data: l.data as `0x${string}`, topics: l.topics as [`0x${string}`, ...`0x${string}`[]] });
      const args = plain(d.args ?? {}) as Record<string, unknown>;
      events.push({ name: String(d.eventName), bookId: Number(args.bookId ?? 0), block: Number(BigInt(l.blockNumber)), tx: l.transactionHash, logIndex: Number(BigInt(l.logIndex)), args });
    } catch {
      // not one of the book's events
    }
  }
  events.sort((a, b) => b.block - a.block || b.logIndex - a.logIndex);
  return { deployed: true, book: CONTRACTS.book, head, books, events: events.slice(0, 400), scanned: { fromBlock: CONTRACTS.block, toBlock: head, gaps: scan.gaps, complete: scan.gaps.length === 0 } };
}
