import { BITS } from "./bits";

/*
 * The rule engine. Same arithmetic and the same reason bits as contracts/src/LotiqRuleBook.sol + LotiqRuleMath.sol, so practice mode,
 * the scenario lab and the contract's checkOrder give the same answer for the same inputs (engine.test.ts holds the parity cases).
 * Money is USD with 6 decimals as plain integers ("micro-USD"); 1 USD = 1_000_000. Time is unix seconds, UTC.
 */

export const USD = 1_000_000;
export const DAY = 86_400;
export const WEEK = 7 * DAY;
export const MONTH30 = 30 * DAY;
/** 1970-01-05 00:00 UTC, the first Monday after the epoch: every spending window starts on this grid. */
export const MONDAY_ZERO = 4 * DAY;
export const ALL_DAYS = 0x7f;
/** "No approval threshold": the contract stores type(uint128).max. */
export const NO_THRESHOLD = Number.MAX_SAFE_INTEGER;
export const MAX_VALIDITY = 730 * DAY;
export const MAX_GAP = 30 * DAY;

export type Period = typeof DAY | typeof WEEK | typeof MONTH30;
export const PERIODS: { value: Period; label: string; per: string }[] = [
  { value: DAY, label: "1 day (resets 00:00 UTC)", per: "per day" },
  { value: WEEK, label: "1 week (resets Monday 00:00 UTC)", per: "per week" },
  { value: MONTH30, label: "30 days", per: "per 30 days" },
];
export const periodWord = (p: number) => PERIODS.find((x) => x.value === p)?.per ?? `per ${p / DAY} days`;

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const WD_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** One complete rule set (what a version commits to). */
export type Rule = {
  assetSymbol: string;
  asset: string; // token address
  agent: string; // agent address ("" in practice mode = the practice agent)
  orderAmount: number; // micro-USD, the planned amount per order (not enforced on its own; maxPerOrder is)
  maxPerOrder: number;
  maxPerPeriod: number;
  period: Period;
  approvalAbove: number; // NO_THRESHOLD = never
  days: number; // bit 0 Monday .. bit 6 Sunday
  startHour: number; // inclusive, UTC
  endHour: number; // exclusive, UTC, <= 24
  minGap: number; // seconds
  validFrom: number;
  validUntil: number;
};

export type BookState = {
  exists: boolean;
  revoked: boolean;
  paused: boolean;
  active: number; // approved version number, 0 = none
  windowStart: number;
  spent: number;
  lastOrderAt: number;
  orders: number;
  nonces: number[];
  approvedOrders: string[]; // order keys approved by the owner
};

export const freshState = (): BookState => ({ exists: true, revoked: false, paused: false, active: 0, windowStart: 0, spent: 0, lastOrderAt: 0, orders: 0, nonces: [], approvedOrders: [] });

export type Order = { agent: string; version: number; asset: string; amount: number; nonce: number; at: number };

export const weekday = (ts: number) => (Math.floor(ts / DAY) + 3) % 7;
export const hourOf = (ts: number) => Math.floor((ts % DAY) / 3600);
export function windowStart(ts: number, period: number) {
  if (ts < MONDAY_ZERO) return 0;
  return Math.floor((ts - MONDAY_ZERO) / period) * period + MONDAY_ZERO;
}
export const spentAt = (s: BookState, ts: number, period: number) => (s.windowStart === windowStart(ts, period) ? s.spent : 0);

/** The key the owner approves for one order above the threshold (the contract hashes the same five fields). */
export const orderKey = (o: Pick<Order, "version" | "asset" | "amount" | "nonce">, bookId = 0) => `${bookId}:${o.version}:${o.asset.toLowerCase()}:${o.amount}:${o.nonce}`;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Reason bits for one order; 0 = every rule passes. Mirrors LotiqRuleBook._check. */
export function check(rule: Rule | null, s: BookState, o: Order, bookId = 0): number {
  if (!s.exists) return BITS.UNKNOWN_BOOK;
  let bits = 0;
  if (s.revoked) bits |= BITS.REVOKED;
  if (s.paused) bits |= BITS.PAUSED;
  if (s.active === 0 || !rule) return bits | BITS.NO_ACTIVE_VERSION;
  if (o.version !== s.active) bits |= BITS.VERSION_MISMATCH;
  if (!same(o.agent, rule.agent)) bits |= BITS.NOT_AGENT;
  if (!same(o.asset, rule.asset)) bits |= BITS.WRONG_ASSET;
  bits |= amountBits(o.amount, rule.maxPerOrder, rule.maxPerPeriod, spentAt(s, o.at, rule.period));
  bits |= scheduleBits(rule.days, rule.startHour, rule.endHour, o.at);
  bits |= timeBits(rule.validFrom, rule.validUntil, s.lastOrderAt, rule.minGap, o.at);
  if (o.amount !== 0 && o.amount > rule.approvalAbove && !s.approvedOrders.includes(orderKey(o, bookId))) bits |= BITS.NEEDS_APPROVAL;
  if (s.nonces.includes(o.nonce)) bits |= BITS.NONCE_USED;
  return bits;
}

export function amountBits(amount: number, maxPerOrder: number, maxPerPeriod: number, spent: number) {
  if (amount === 0) return BITS.ZERO_AMOUNT;
  let bits = 0;
  if (amount > maxPerOrder) bits |= BITS.OVER_ORDER_MAX;
  if (amount > maxPerPeriod || spent + amount > maxPerPeriod) bits |= BITS.OVER_PERIOD_MAX;
  return bits;
}

export function scheduleBits(days: number, startHour: number, endHour: number, ts: number) {
  let bits = 0;
  if (((days >> weekday(ts)) & 1) === 0) bits |= BITS.OFF_DAY;
  const h = hourOf(ts);
  if (h < startHour || h >= endHour) bits |= BITS.OFF_HOURS;
  return bits;
}

export function timeBits(validFrom: number, validUntil: number, lastOrderAt: number, minGap: number, ts: number) {
  let bits = 0;
  if (ts < validFrom) bits |= BITS.NOT_STARTED;
  if (ts >= validUntil) bits |= BITS.EXPIRED;
  if (minGap !== 0 && lastOrderAt !== 0 && ts < lastOrderAt + minGap) bits |= BITS.TOO_SOON;
  return bits;
}

/** Applies an accepted order to the state (LotiqRuleBook._count). Call only when check() returned 0. */
export function record(rule: Rule, s: BookState, o: Order, bookId = 0): BookState {
  const w = windowStart(o.at, rule.period);
  const spent = (s.windowStart === w ? s.spent : 0) + o.amount;
  const key = orderKey(o, bookId);
  return {
    ...s,
    windowStart: w,
    spent,
    lastOrderAt: o.at,
    orders: s.orders + 1,
    nonces: [...s.nonces, o.nonce],
    approvedOrders: o.amount > rule.approvalAbove ? s.approvedOrders.filter((k) => k !== key) : s.approvedOrders,
  };
}

/** Problems that make the contract refuse a version (BadRule field codes) — shown before anyone signs. */
export function ruleProblems(r: Rule, now: number): { field: string; text: string }[] {
  const out: { field: string; text: string }[] = [];
  if (!/^0x[0-9a-fA-F]{40}$/.test(r.asset)) out.push({ field: "asset", text: "Pick a supported stock token." });
  if (r.maxPerOrder <= 0) out.push({ field: "maxPerOrder", text: "The maximum per order must be above zero." });
  if (r.maxPerOrder > r.maxPerPeriod) out.push({ field: "maxPerPeriod", text: "The maximum per period must be at least the maximum per order." });
  if (r.orderAmount > r.maxPerOrder) out.push({ field: "orderAmount", text: "The planned order amount is above the maximum per order, so every planned order would be refused." });
  if (![DAY, WEEK, MONTH30].includes(r.period)) out.push({ field: "period", text: "The period must be 1, 7 or 30 days." });
  if (r.days === 0 || r.days > ALL_DAYS) out.push({ field: "days", text: "Pick at least one weekday." });
  if (!(r.startHour >= 0 && r.startHour < r.endHour && r.endHour <= 24)) out.push({ field: "hours", text: "The start hour must be before the end hour (0 to 24, UTC)." });
  if (r.minGap < 0 || r.minGap > MAX_GAP) out.push({ field: "minGap", text: "The minimum gap must be between 0 and 30 days." });
  if (!(r.validUntil > Math.max(r.validFrom, now) && r.validUntil <= now + MAX_VALIDITY)) out.push({ field: "validUntil", text: "The end date must be in the future and at most 730 days ahead." });
  return out;
}

/** Next time at or after `from` (rounded to the hour) that fits the schedule; null if none within 8 days. */
export function nextScheduled(r: Pick<Rule, "days" | "startHour" | "endHour">, from: number): number | null {
  let t = Math.ceil(from / 3600) * 3600;
  for (let i = 0; i < 24 * 8; i++, t += 3600) if (scheduleBits(r.days, r.startHour, r.endHour, t) === 0) return t;
  return null;
}

/** First time at or after `from` that is OFF schedule (by day if possible, else by hour). */
export function nextOffSchedule(r: Pick<Rule, "days" | "startHour" | "endHour">, from: number): number | null {
  let t = Math.ceil(from / 3600) * 3600;
  for (let i = 0; i < 24 * 8; i++, t += 3600) if (scheduleBits(r.days, r.startHour, r.endHour, t) !== 0) return t;
  return null;
}

/** Number of scheduled weekdays inside one period (used to derive a period maximum from the order amount). */
export function scheduledDaysPerPeriod(days: number, period: number) {
  const perWeek = [0, 1, 2, 3, 4, 5, 6].filter((d) => (days >> d) & 1).length;
  if (period === DAY) return Math.min(1, perWeek);
  if (period === WEEK) return perWeek;
  return Math.ceil((perWeek * 30) / 7);
}

export const usd = (micro: number) => (micro >= NO_THRESHOLD ? "no threshold" : `$${(micro / USD).toLocaleString("en-US", { minimumFractionDigits: micro % USD === 0 ? 0 : 2, maximumFractionDigits: 2 })}`);
export const daysText = (mask: number) => {
  if (mask === ALL_DAYS) return "every day";
  if (mask === 0x1f) return "weekdays (Mon–Fri)";
  if (mask === 0x60) return "weekends";
  return WEEKDAYS.filter((_, i) => (mask >> i) & 1).join(", ");
};
export const hoursText = (s: number, e: number) => (s === 0 && e === 24 ? "any hour (UTC)" : `${String(s).padStart(2, "0")}:00–${String(e).padStart(2, "0")}:00 UTC`);
export const gapText = (g: number) => (g === 0 ? "none" : g % DAY === 0 ? `${g / DAY} day${g === DAY ? "" : "s"}` : `${g / 3600} hour${g === 3600 ? "" : "s"}`);
export const dateText = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
