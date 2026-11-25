import { BIT_TEXT, bitNames, type BitName } from "./bits";
import { DAY, USD, check, dateText, freshState, hoursText, daysText, nextOffSchedule, nextScheduled, orderKey, record, spentAt, usd, type BookState, type Order, type Rule } from "./engine";

/*
 * The scenario lab: test orders run against a rule set on a fresh practice book, with the exact rule behind every accept or refuse.
 * The standard set covers what the product brief asks for: under the limit, over the limit, wrong asset, outside the schedule and not
 * yet approved (plus the per-order approval path, pause and expiry). Every scenario starts from an empty book whose version 1 is the rule
 * set under test, unless the scenario says the version is not approved.
 */

export const PRACTICE_AGENT = "0x00000000000000000000000000000000000a6e47";

export type StepSetup = { approveVersion?: boolean; approveOrder?: boolean; pause?: boolean };
export type Step = { label: string; order: Order; setup?: StepSetup };
export type Scenario = { id: string; title: string; expect: "accepted" | "refused" | "mixed"; why: string; steps: Step[] };
export type StepResult = { label: string; order: Order; bits: number; accepted: boolean; reasons: { bit: BitName; rule: string; text: string; detail: string }[]; spentAfter: number };
export type ScenarioResult = { id: string; title: string; expect: Scenario["expect"]; ok: boolean; steps: StepResult[] };

/** What the rule set says for the line a bit belongs to, filled in with this rule set's numbers. */
export function detail(bit: BitName, r: Rule, o: Order, s: BookState): string {
  switch (bit) {
    case "OVER_ORDER_MAX":
      return `${usd(o.amount)} > max ${usd(r.maxPerOrder)} per order`;
    case "OVER_PERIOD_MAX":
      return `${usd(spentAt(s, o.at, r.period))} already spent + ${usd(o.amount)} > ${usd(r.maxPerPeriod)} for the period`;
    case "OFF_DAY":
      return `${dateText(o.at)} is not on: ${daysText(r.days)}`;
    case "OFF_HOURS":
      return `${dateText(o.at).slice(11)} is outside ${hoursText(r.startHour, r.endHour)}`;
    case "WRONG_ASSET":
      return `the rule set allows ${r.assetSymbol} only`;
    case "NEEDS_APPROVAL":
      return `${usd(o.amount)} > approval threshold ${usd(r.approvalAbove)}, and this order is not approved`;
    case "EXPIRED":
      return `the rule set ended ${dateText(r.validUntil)}`;
    case "NOT_STARTED":
      return `the rule set starts ${dateText(r.validFrom)}`;
    case "TOO_SOON":
      return `previous order at ${dateText(s.lastOrderAt)}, gap ${r.minGap / 3600} h`;
    default:
      return BIT_TEXT[bit].text;
  }
}

/** Runs one scenario on a fresh practice book. */
export function runScenario(sc: Scenario, rule: Rule): ScenarioResult {
  let s: BookState = { ...freshState(), active: 1 };
  if (sc.steps[0]?.setup?.approveVersion === false) s = { ...s, active: 0 };
  const out: StepResult[] = [];
  for (const st of sc.steps) {
    if (st.setup?.pause) s = { ...s, paused: true };
    if (st.setup?.approveOrder) s = { ...s, approvedOrders: [...s.approvedOrders, orderKey(st.order)] };
    const bits = check(s.active ? rule : null, s, st.order);
    const before = s;
    if (bits === 0) s = record(rule, s, st.order);
    out.push({
      label: st.label,
      order: st.order,
      bits,
      accepted: bits === 0,
      reasons: bitNames(bits).map((b) => ({ bit: b, rule: BIT_TEXT[b].rule, text: BIT_TEXT[b].text, detail: detail(b, rule, st.order, before) })),
      spentAfter: s.spent,
    });
  }
  const last = out[out.length - 1];
  const ok = sc.expect === "accepted" ? out.every((x) => x.accepted) : sc.expect === "refused" ? !last.accepted : true;
  return { id: sc.id, title: sc.title, expect: sc.expect, ok, steps: out };
}

/** The standard scenarios for a rule set. `other` is a second proven asset for the wrong-asset case. */
export function standardScenarios(rule: Rule, other: { symbol: string; address: string }, now: number): Scenario[] {
  const r = { ...rule, agent: rule.agent || PRACTICE_AGENT };
  const t0 = nextScheduled(r, Math.max(now, r.validFrom)) ?? now;
  const base = (amount: number, nonce: number, at = t0, asset = r.asset): Order => ({ agent: r.agent, version: 1, asset, amount, nonce, at });
  const small = Math.min(r.orderAmount, r.approvalAbove, r.maxPerOrder);
  const off = nextOffSchedule(r, t0);
  const fill: Step[] = [];
  let left = r.maxPerPeriod;
  let i = 1;
  const chunk = Math.max(1, Math.min(r.maxPerOrder, r.approvalAbove));
  while (left > 0 && i < 40) {
    const a = Math.min(chunk, left);
    fill.push({ label: `Order ${i}: ${usd(a)}`, order: base(a, i, t0 + (i - 1) * Math.max(r.minGap, 60)), setup: a > r.approvalAbove ? { approveOrder: true } : undefined });
    left -= a;
    i++;
  }
  const overAmt = r.maxPerOrder + USD;
  const sc: Scenario[] = [
    { id: "under", title: "Under the limit, on schedule", expect: "accepted", why: "A planned order at a scheduled time.", steps: [{ label: `${usd(small)} of ${r.assetSymbol}`, order: base(small, 1) }] },
    { id: "over-order", title: "Over the limit per order", expect: "refused", why: "One order larger than the maximum per order.", steps: [{ label: `${usd(overAmt)} of ${r.assetSymbol}`, order: base(overAmt, 1) }] },
    { id: "over-period", title: "Over the limit for the period", expect: "refused", why: "Orders fill the period's maximum; one more dollar is refused.", steps: [...fill, { label: `One more: ${usd(Math.min(USD, r.maxPerOrder))}`, order: base(Math.min(USD, r.maxPerOrder), 99, t0 + fill.length * Math.max(r.minGap, 60)) }] },
    { id: "wrong-asset", title: "Wrong asset", expect: "refused", why: `An order for ${other.symbol} under a ${r.assetSymbol} rule set.`, steps: [{ label: `${usd(small)} of ${other.symbol}`, order: base(small, 1, t0, other.address) }] },
    ...(off !== null ? [{ id: "off-schedule", title: "Outside the schedule", expect: "refused" as const, why: "The same order at a time the schedule does not allow.", steps: [{ label: `${usd(small)} at ${dateText(off)}`, order: base(small, 1, off) }] }] : []),
    { id: "not-approved", title: "Rules not approved yet", expect: "refused", why: "The version was proposed but you have not approved it.", steps: [{ label: `${usd(small)} of ${r.assetSymbol}`, order: base(small, 1), setup: { approveVersion: false } }] },
  ];
  if (r.approvalAbove < r.maxPerOrder) {
    const big = Math.min(r.maxPerOrder, r.approvalAbove + USD);
    sc.push({
      id: "approval",
      title: "Above the approval threshold",
      expect: "mixed",
      why: "Refused until you approve that exact order, then accepted.",
      steps: [
        { label: `${usd(big)}, not approved`, order: base(big, 7) },
        { label: `${usd(big)}, approved by you`, order: base(big, 7, t0 + Math.max(r.minGap, 60)), setup: { approveOrder: true } },
      ],
    });
  }
  sc.push({ id: "paused", title: "Paused by you", expect: "refused", why: "Pause applies to the very next order.", steps: [{ label: `${usd(small)} while paused`, order: base(small, 1), setup: { pause: true } }] });
  sc.push({ id: "expired", title: "After the end date", expect: "refused", why: "The rule set's validity has ended.", steps: [{ label: `${usd(small)} after ${dateText(r.validUntil).slice(0, 10)}`, order: base(small, 1, nextScheduled(r, r.validUntil) ?? r.validUntil + DAY) }] });
  return sc;
}
