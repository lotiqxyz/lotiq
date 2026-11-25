import { NO_THRESHOLD, type Period, type Rule } from "./engine";
import { ruleHash } from "./canonical";

/* Conversions between the site's Rule and LotiqRuleBook's RuleInput / RuleVersion. */

export const UINT128_MAX = (1n << 128n) - 1n;
const STATUS = ["", "proposed", "active", "superseded", "withdrawn"] as const;
export const statusWord = (n: number) => STATUS[n] ?? "unknown";

/** The struct for openBook / propose. The hash is the canonical text's keccak256 (what the owner reviewed). */
export function toRuleInput(r: Rule) {
  return {
    ruleHash: ruleHash(r),
    agent: r.agent as `0x${string}`,
    asset: r.asset as `0x${string}`,
    maxPerOrder: BigInt(r.maxPerOrder),
    maxPerPeriod: BigInt(r.maxPerPeriod),
    approvalAbove: r.approvalAbove >= NO_THRESHOLD ? UINT128_MAX : BigInt(r.approvalAbove),
    period: r.period,
    minGap: r.minGap,
    days_: r.days,
    startHour: r.startHour,
    endHour: r.endHour,
    validFrom: r.validFrom,
    validUntil: r.validUntil,
  };
}

/** Rebuilds a Rule from a version read on chain (the planned order amount is not on chain: it equals the max per order here). */
export function fromVersion(v: { agent: string; asset: string; maxPerOrder: string; maxPerPeriod: string; approvalAbove: string; period: number; minGap: number; days: number; startHour: number; endHour: number; validFrom: number; validUntil: number }, symbol: string): Rule {
  const above = BigInt(v.approvalAbove);
  return {
    assetSymbol: symbol,
    asset: v.asset,
    agent: v.agent,
    orderAmount: Number(v.maxPerOrder),
    maxPerOrder: Number(v.maxPerOrder),
    maxPerPeriod: Number(v.maxPerPeriod),
    period: v.period as Period,
    approvalAbove: above >= BigInt(NO_THRESHOLD) ? NO_THRESHOLD : Number(above),
    days: v.days,
    startHour: v.startHour,
    endHour: v.endHour,
    minGap: v.minGap,
    validFrom: v.validFrom,
    validUntil: v.validUntil,
  };
}

/** A 32-byte label from a short text (openBook's `label`). */
export function labelBytes(text: string): `0x${string}` {
  const bytes = new TextEncoder().encode(text.slice(0, 31));
  return `0x${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("").padEnd(64, "0")}`;
}
