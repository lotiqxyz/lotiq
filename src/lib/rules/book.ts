import { canonicalText, diffRules, ruleHash, type Change } from "./canonical";
import type { Rule } from "./engine";

/*
 * The practice rule book: the same life cycle as LotiqRuleBook (propose -> approve exact version -> supersede, withdraw, pause,
 * revoke), kept in this browser. Every change is appended to the log; nothing is ever edited in place.
 */

export type VersionStatus = "proposed" | "active" | "superseded" | "withdrawn";
export type Version = { n: number; rule: Rule; text: string; hash: string; status: VersionStatus; parent: number; proposedAt: number; approvedAt: number | null; changes: Change[] };
export type LogKind = "proposed" | "approved" | "withdrawn" | "paused" | "unpaused" | "revoked" | "scenarios" | "order-approved";
export type LogEntry = { at: number; kind: LogKind; version: number | null; text: string };
export type ScenarioRun = { at: number; version: number; passed: number; total: number; lines: { title: string; ok: boolean; last: string }[] };
export type PracticeBook = { label: string; versions: Version[]; log: LogEntry[]; paused: boolean; revoked: boolean; runs: ScenarioRun[] };

export const emptyBook = (label = "Practice rule book"): PracticeBook => ({ label, versions: [], log: [], paused: false, revoked: false, runs: [] });
export const activeVersion = (b: PracticeBook) => b.versions.find((v) => v.status === "active") ?? null;
export const MAX_LOG = 400;

const push = (b: PracticeBook, e: LogEntry): PracticeBook => ({ ...b, log: [e, ...b.log].slice(0, MAX_LOG) });

export function propose(b: PracticeBook, rule: Rule, now: number): PracticeBook {
  if (b.revoked) return b;
  const parentV = activeVersion(b) ?? b.versions[b.versions.length - 1] ?? null;
  const n = b.versions.length + 1;
  const v: Version = { n, rule, text: canonicalText(rule), hash: ruleHash(rule), status: "proposed", parent: parentV?.n ?? 0, proposedAt: now, approvedAt: null, changes: diffRules(parentV?.rule ?? null, rule) };
  const changed = v.changes.length;
  return push({ ...b, versions: [...b.versions, v] }, { at: now, kind: "proposed", version: n, text: `Version ${n} proposed${parentV ? ` from version ${parentV.n}, ${changed} line${changed === 1 ? "" : "s"} changed` : ""}.` });
}

/** Approves version n only if its hash matches what the owner reviewed (same rule as the contract). */
export function approve(b: PracticeBook, n: number, expectedHash: string, now: number): { book: PracticeBook; error: string | null } {
  if (b.revoked) return { book: b, error: "The rule book is revoked." };
  const v = b.versions.find((x) => x.n === n);
  if (!v) return { book: b, error: "Unknown version." };
  if (v.status !== "proposed") return { book: b, error: "Only a proposed version can be approved." };
  if (v.hash !== expectedHash) return { book: b, error: "The text you reviewed does not match this version." };
  if (now >= v.rule.validUntil) return { book: b, error: "This version has already expired." };
  const prev = activeVersion(b);
  const versions = b.versions.map((x) => (x.n === n ? { ...x, status: "active" as const, approvedAt: now } : x.status === "active" ? { ...x, status: "superseded" as const } : x));
  return { book: push({ ...b, versions }, { at: now, kind: "approved", version: n, text: `Version ${n} approved${prev ? `; version ${prev.n} superseded` : ""}. Hash ${v.hash.slice(0, 10)}…` }), error: null };
}

export function withdraw(b: PracticeBook, n: number, now: number): PracticeBook {
  const v = b.versions.find((x) => x.n === n);
  if (!v || v.status !== "proposed") return b;
  return push({ ...b, versions: b.versions.map((x) => (x.n === n ? { ...x, status: "withdrawn" as const } : x)) }, { at: now, kind: "withdrawn", version: n, text: `Version ${n} withdrawn before approval.` });
}

export function setPaused(b: PracticeBook, paused: boolean, now: number): PracticeBook {
  if (b.revoked || b.paused === paused) return b;
  return push({ ...b, paused }, { at: now, kind: paused ? "paused" : "unpaused", version: activeVersion(b)?.n ?? null, text: paused ? "Rule book paused: every order is refused until you unpause." : "Rule book unpaused." });
}

export function revoke(b: PracticeBook, now: number): PracticeBook {
  if (b.revoked) return b;
  return push({ ...b, revoked: true }, { at: now, kind: "revoked", version: activeVersion(b)?.n ?? null, text: "Rule book revoked. It refuses every order and can no longer change." });
}

export function addRun(b: PracticeBook, run: ScenarioRun): PracticeBook {
  return push({ ...b, runs: [run, ...b.runs].slice(0, 60) }, { at: run.at, kind: "scenarios", version: run.version, text: `Scenario lab on version ${run.version || "draft"}: ${run.passed} of ${run.total} behaved as expected.` });
}

/** Defensive load: anything malformed becomes an empty book (browser storage is the visitor's, never trusted). */
export function loadBook(raw: string | null): PracticeBook {
  if (!raw) return emptyBook();
  try {
    const v = JSON.parse(raw) as PracticeBook;
    if (!v || !Array.isArray(v.versions) || !Array.isArray(v.log) || !Array.isArray(v.runs)) return emptyBook();
    return { ...emptyBook(), ...v };
  } catch {
    return emptyBook();
  }
}
