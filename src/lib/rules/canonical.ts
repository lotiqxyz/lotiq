import { keccak256, toBytes } from "viem";
import { DAY, NO_THRESHOLD, PERIODS, daysText, gapText, hoursText, usd, type Rule } from "./engine";

/*
 * The canonical text of a rule set: the exact lines the owner reads before approving, in a fixed order with fixed number formats. The
 * version's commitment on chain is keccak256 of these UTF-8 bytes, so anyone holding the text can check it against the chain.
 */

export const FORMAT = "lotiq-rules/1";

export function canonicalText(r: Rule): string {
  const iso = (t: number) => new Date(t * 1000).toISOString().replace(".000Z", "Z");
  return [
    `format: ${FORMAT}`,
    `asset: ${r.assetSymbol} ${r.asset.toLowerCase()}`,
    `agent: ${r.agent.toLowerCase()}`,
    `side: buy`,
    `order_amount_usd6: ${r.orderAmount}`,
    `max_per_order_usd6: ${r.maxPerOrder}`,
    `max_per_period_usd6: ${r.maxPerPeriod}`,
    `period_seconds: ${r.period}`,
    `approval_above_usd6: ${r.approvalAbove >= NO_THRESHOLD ? "none" : r.approvalAbove}`,
    `weekdays_mask: ${r.days}`,
    `hours_utc: ${r.startHour}-${r.endHour}`,
    `min_gap_seconds: ${r.minGap}`,
    `valid_from: ${iso(r.validFrom)}`,
    `valid_until: ${iso(r.validUntil)}`,
  ].join("\n");
}

export const ruleHash = (r: Rule) => keccak256(toBytes(canonicalText(r)));

/** The same rule set in plain English, line by line (what the review screen shows next to the canonical text). */
export function plainLines(r: Rule): { key: string; label: string; value: string }[] {
  const per = PERIODS.find((p) => p.value === r.period)?.per ?? `per ${r.period / DAY} days`;
  return [
    { key: "asset", label: "Asset", value: `${r.assetSymbol} (buy only)` },
    { key: "orderAmount", label: "Planned order", value: usd(r.orderAmount) },
    { key: "maxPerOrder", label: "Max per order", value: usd(r.maxPerOrder) },
    { key: "maxPerPeriod", label: "Max per period", value: `${usd(r.maxPerPeriod)} ${per}` },
    { key: "approvalAbove", label: "Your approval", value: r.approvalAbove >= NO_THRESHOLD ? "not needed for any order" : `needed for orders above ${usd(r.approvalAbove)}` },
    { key: "days", label: "Days", value: daysText(r.days) },
    { key: "hours", label: "Hours", value: hoursText(r.startHour, r.endHour) },
    { key: "minGap", label: "Min gap between orders", value: gapText(r.minGap) },
    { key: "validUntil", label: "Valid", value: `${new Date(r.validFrom * 1000).toISOString().slice(0, 10)} to ${new Date(r.validUntil * 1000).toISOString().slice(0, 10)}` },
    { key: "agent", label: "Agent", value: r.agent || "practice agent" },
  ];
}

export type Change = { key: string; label: string; before: string; after: string };

/** Field-by-field difference between two versions (null `prev` = first version: every line is new). */
export function diffRules(prev: Rule | null, next: Rule): Change[] {
  const a = prev ? plainLines(prev) : [];
  return plainLines(next)
    .map((line) => {
      const old = a.find((x) => x.key === line.key);
      return { key: line.key, label: line.label, before: old?.value ?? "—", after: line.value };
    })
    .filter((c) => c.before !== c.after);
}
