import { bitNames, BIT_TEXT } from "./bits";

/*
 * Alerts for a wallet's rule books, derived from LotiqRuleBook's events (as returned by /api/books). Free for everyone: the browser
 * could read these events itself. Kinds:
 *   refused   the bound agent submitted an order the rules refused (OrderRefused, from submitOrder)
 *   limit     a recorded order brought the period spend to >= 80 % ("near") or 100 % ("reached") of the version's period maximum
 *   waiting   a version is proposed and still waiting for your approval
 *   paused / revoked   the book was paused (by you or by the agent's halt) or revoked
 */

export type AlertKind = "refused" | "limit" | "waiting" | "paused" | "revoked";
export type Alert = { id: string; kind: AlertKind; bookId: number; block: number; title: string; body: string; tx: string };

type Ev = { name: string; bookId: number; block: number; tx: string; logIndex: number; args: Record<string, unknown> };
type Ver = { n: number; maxPerPeriod: string; status: number };
type Bk = { id: number; label: string; versions: Ver[] };

const usd = (v: unknown) => `$${(Number(v) / 1e6).toFixed(2)}`;
export const NEAR = 0.8;

export function deriveAlerts(books: Bk[], events: Ev[]): Alert[] {
  const out: Alert[] = [];
  const name = (id: number) => {
    const b = books.find((x) => x.id === id);
    return `Rule book #${id}${b?.label ? ` (${b.label})` : ""}`;
  };
  for (const e of events) {
    const id = `${e.tx}:${e.logIndex}`;
    const base = { id, bookId: e.bookId, block: e.block, tx: e.tx };
    if (e.name === "OrderRefused") {
      const bits = Number(e.args.bits ?? 0);
      out.push({ ...base, kind: "refused", title: `${name(e.bookId)}: agent order refused`, body: `${usd(e.args.amount)} refused by ${bitNames(bits).map((b) => BIT_TEXT[b].rule).join(", ") || "the rules"}.` });
    } else if (e.name === "OrderRecorded") {
      const v = books.find((b) => b.id === e.bookId)?.versions.find((x) => x.n === Number(e.args.version));
      if (!v) continue;
      const max = Number(v.maxPerPeriod);
      const spent = Number(e.args.spentInWindow ?? 0);
      if (max > 0 && spent >= max * NEAR) {
        const reached = spent >= max;
        out.push({ ...base, kind: "limit", title: `${name(e.bookId)}: period limit ${reached ? "reached" : "near"}`, body: `${usd(spent)} of ${usd(max)} spent in this period.` });
      }
    } else if (e.name === "VersionProposed") {
      const n = Number(e.args.version);
      const v = books.find((b) => b.id === e.bookId)?.versions.find((x) => x.n === n);
      if (v && v.status === 1) out.push({ ...base, kind: "waiting", title: `${name(e.bookId)}: version ${n} waits for your approval`, body: "Review the diff and approve the exact hash in the studio." });
    } else if (e.name === "BookPaused") {
      out.push({ ...base, kind: "paused", title: `${name(e.bookId)} paused`, body: "Every order is refused until the owner unpauses." });
    } else if (e.name === "BookRevoked") {
      out.push({ ...base, kind: "revoked", title: `${name(e.bookId)} revoked`, body: "The book refuses every order from now on." });
    }
  }
  return out.sort((a, b) => b.block - a.block || (a.id < b.id ? 1 : -1));
}

/** Alerts newer than the last block the wallet has seen. */
export const unread = (alerts: Alert[], lastSeenBlock: number) => alerts.filter((a) => a.block > lastSeenBlock);
