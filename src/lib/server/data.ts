import "server-only";
import { getStore } from "@/lib/server/store";

/*
 * Storage for the hosted service (saved rule books, scenario history, daily counters, revoked sessions). Uses the configured Redis /
 * kv-gateway store (KV_REST_API_URL + KV_REST_API_TOKEN, …) when there is one; otherwise an in-memory map in this server instance, and
 * every answer says `persistent: false` so the page shows "Not configured: saved data may be lost on restart". Export / import always work.
 *
 * The memory fallback is bounded on EVERY write path: at most MAX_KEYS keys and MAX_BYTES of stored text; a write that would pass
 * either limit is refused (MemoryFull), expired entries are swept first. Every entry expires (lists and plain values after
 * DEFAULT_TTL unless a shorter TTL is given), so abandoned wallets do not stay in memory forever.
 */

export type DataStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  /** Sets with an expiry in seconds. */
  setEx(key: string, value: string, ttl: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Counter that expires `ttl` seconds after it was created. */
  incrEx(key: string, ttl: number): Promise<number>;
  pushCapped(key: string, value: string, keep: number): Promise<void>;
  range(key: string, count: number): Promise<string[]>;
};

export class MemoryFull extends Error {
  constructor() {
    super("The server's temporary storage is full. Try again later or export your data.");
  }
}

export const MEMORY_LIMITS = { MAX_KEYS: 20_000, MAX_BYTES: 32_000_000, DEFAULT_TTL: 30 * 86400 };

type Entry = { v: string | string[]; until: number; bytes: number };
const mem = new Map<string, Entry>();
let used = 0;
const size = (k: string, v: string | string[]) => k.length + (Array.isArray(v) ? v.reduce((n, x) => n + x.length, 0) : v.length);

function sweep() {
  const now = Date.now();
  for (const [k, e] of mem) if (e.until < now) drop(k);
}
function drop(k: string) {
  const e = mem.get(k);
  if (!e) return;
  used -= e.bytes;
  mem.delete(k);
}
function live(k: string) {
  const e = mem.get(k);
  if (e && e.until < Date.now()) {
    drop(k);
    return undefined;
  }
  return e;
}
/** The single write path: checks the key cap and the byte budget before storing. */
function put(k: string, v: string | string[], until: number) {
  const bytes = size(k, v);
  const old = mem.get(k);
  const grow = bytes - (old?.bytes ?? 0);
  if ((!old && mem.size >= MEMORY_LIMITS.MAX_KEYS) || used + grow > MEMORY_LIMITS.MAX_BYTES) {
    sweep();
    const o2 = mem.get(k);
    if ((!o2 && mem.size >= MEMORY_LIMITS.MAX_KEYS) || used + bytes - (o2?.bytes ?? 0) > MEMORY_LIMITS.MAX_BYTES) throw new MemoryFull();
  }
  const prev = mem.get(k);
  used += bytes - (prev?.bytes ?? 0);
  mem.set(k, { v, until, bytes });
}
const ttlMs = (sec: number) => Date.now() + Math.max(1, sec) * 1000;

export const memoryStore: DataStore = {
  get: async (k) => {
    const e = live(k);
    return typeof e?.v === "string" ? e.v : null;
  },
  set: async (k, v) => put(k, v, ttlMs(MEMORY_LIMITS.DEFAULT_TTL)),
  setEx: async (k, v, ttl) => put(k, v, ttlMs(ttl)),
  del: async (k) => drop(k),
  incrEx: async (k, ttl) => {
    const e = live(k);
    const n = (typeof e?.v === "string" ? Number(e.v) : 0) + 1;
    put(k, String(n), e?.until ?? ttlMs(ttl));
    return n;
  },
  pushCapped: async (k, v, keep) => {
    const e = live(k);
    const list = Array.isArray(e?.v) ? e.v : [];
    put(k, [v, ...list].slice(0, keep), ttlMs(MEMORY_LIMITS.DEFAULT_TTL));
  },
  range: async (k, count) => {
    const e = live(k);
    return Array.isArray(e?.v) ? e.v.slice(0, count) : [];
  },
};

export function dataStore(): { store: DataStore; persistent: boolean } {
  const s = getStore();
  return s ? { store: s, persistent: true } : { store: memoryStore, persistent: false };
}

/** Test hooks. */
export const resetMemory = () => {
  mem.clear();
  used = 0;
};
export const memoryUsage = () => ({ keys: mem.size, bytes: used });
