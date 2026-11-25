import { MAX_BOOK_BYTES, QUOTAS, type Tier } from "@/config/quotas";
import type { DataStore } from "@/lib/server/data";
import { loadBook, type PracticeBook } from "@/lib/rules/book";
import { DAY, MONTH30, WEEK, ruleProblems, type Rule } from "@/lib/rules/engine";
import { ruleHash } from "@/lib/rules/canonical";
import { runScenario, standardScenarios } from "@/lib/rules/scenarios";
import { FIXTURE_KNOWN } from "@/lib/rules/known";

/*
 * The hosted service, kept free of I/O so the quotas can be unit tested: rule books saved per wallet and scenario runs computed on the
 * server with a daily quota and a kept history. Every limit is checked HERE, never only in the page.
 */

export type HostedBook = { id: string; label: string; savedAt: number; book: PracticeBook };
export type RunRecord = { at: number; ruleHash: string; asset: string; passed: number; total: number; lines: { title: string; ok: boolean; last: string }[] };
export type Fail = { ok: false; status: number; error: string };

const kBooks = (w: string) => `hb:${w}`;
const kRuns = (w: string) => `hr:${w}`;
const kDay = (w: string, now: number) => `hd:${w}:${Math.floor(now / 86400)}`;

async function readBooks(s: DataStore, w: string): Promise<HostedBook[]> {
  const raw = await s.get(kBooks(w));
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as HostedBook[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function listBooks(s: DataStore, w: string) {
  return readBooks(s, w);
}

/** Saves (or replaces, same id) one rule book. Free tier: QUOTAS.free.books books; holder: QUOTAS.holder.books. */
export async function saveBook(s: DataStore, w: string, tier: Tier, input: { id?: unknown; label?: unknown; book?: unknown }, now: number): Promise<{ ok: true; books: HostedBook[] } | Fail> {
  const id = typeof input.id === "string" && /^[a-z0-9-]{1,40}$/.test(input.id) ? input.id : null;
  if (!id) return { ok: false, status: 400, error: "Give a rule book id (a-z, 0-9, -)." };
  const label = typeof input.label === "string" ? input.label.slice(0, 60) : "Rule book";
  const json = JSON.stringify(input.book ?? null);
  if (json.length > MAX_BOOK_BYTES) return { ok: false, status: 413, error: `A hosted rule book is limited to ${MAX_BOOK_BYTES / 1000} kB.` };
  const book = loadBook(json);
  if (!book.versions.length && !book.log.length) return { ok: false, status: 400, error: "That is not a rule book (no versions, no log)." };
  const books = await readBooks(s, w);
  const replace = books.some((b) => b.id === id);
  const max = QUOTAS[tier].books;
  if (!replace && books.length >= max) return { ok: false, status: 429, error: `Quota reached: ${max} hosted rule books on the ${tier} tier.${tier === "free" ? " Holders of 0.1 % of the token supply get " + QUOTAS.holder.books + "." : ""}` };
  const next = [...books.filter((b) => b.id !== id), { id, label, savedAt: now, book }];
  await s.set(kBooks(w), JSON.stringify(next));
  return { ok: true, books: next };
}

export async function deleteBook(s: DataStore, w: string, id: string) {
  const books = (await readBooks(s, w)).filter((b) => b.id !== id);
  await s.set(kBooks(w), JSON.stringify(books));
  return books;
}

/** Validates a rule set sent by a browser: every field a number of the right kind, the same checks as the contract. */
export function parseRule(v: unknown, now: number): Rule | null {
  const r = v as Rule;
  if (!r || typeof r !== "object") return null;
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0 && Number.isSafeInteger(Math.round(x));
  const keys = ["orderAmount", "maxPerOrder", "maxPerPeriod", "approvalAbove", "days", "startHour", "endHour", "minGap", "validFrom", "validUntil", "period"] as const;
  if (!keys.every((k) => num(r[k]))) return null;
  if (![DAY, WEEK, MONTH30].includes(r.period)) return null;
  if (typeof r.assetSymbol !== "string" || typeof r.asset !== "string" || typeof r.agent !== "string") return null;
  const clean: Rule = { ...r, assetSymbol: r.assetSymbol.slice(0, 12), agent: r.agent.slice(0, 42), asset: r.asset.slice(0, 42) };
  return ruleProblems(clean, Math.min(now, clean.validFrom)).length ? null : clean;
}

/** Runs the standard scenarios on the server and keeps the result, inside the daily quota. */
export async function runOnServer(s: DataStore, w: string, tier: Tier, rule: unknown, now: number): Promise<{ ok: true; run: RunRecord; usedToday: number } | Fail> {
  const r = parseRule(rule, now);
  if (!r) return { ok: false, status: 400, error: "The rule set is incomplete or the contract would refuse it." };
  const q = QUOTAS[tier];
  const used = await s.incrEx(kDay(w, now), 2 * 86400);
  if (used > q.runsPerDay) return { ok: false, status: 429, error: `Quota reached: ${q.runsPerDay} server scenario runs per day on the ${tier} tier.` };
  const other = FIXTURE_KNOWN.find((k) => k.symbol !== r.assetSymbol) ?? FIXTURE_KNOWN[0];
  const results = standardScenarios(r, other, now).map((sc) => runScenario(sc, r));
  const run: RunRecord = {
    at: now,
    ruleHash: ruleHash(r),
    asset: r.assetSymbol,
    passed: results.filter((x) => x.ok).length,
    total: results.length,
    lines: results.map((x) => ({ title: x.title, ok: x.ok, last: x.steps[x.steps.length - 1].accepted ? "accepted" : x.steps[x.steps.length - 1].reasons.map((y) => y.bit).join("|") })),
  };
  await s.pushCapped(kRuns(w), JSON.stringify(run), q.history);
  return { ok: true, run, usedToday: used };
}

export async function listRuns(s: DataStore, w: string, tier: Tier): Promise<RunRecord[]> {
  const raw = await s.range(kRuns(w), QUOTAS[tier].history);
  return raw.flatMap((x) => {
    try {
      return [JSON.parse(x) as RunRecord];
    } catch {
      return [];
    }
  });
}
