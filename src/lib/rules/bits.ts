/*
 * Reason bits: the same positions as contracts/src/LotiqRuleMath.sol (bits.test.ts reads that file and fails on any drift).
 * Each bit names the exact rule that refused an order, so the site can say which line of the rule set fired.
 */

export const BITS = {
  UNKNOWN_BOOK: 1 << 0,
  REVOKED: 1 << 1,
  PAUSED: 1 << 2,
  NO_ACTIVE_VERSION: 1 << 3,
  VERSION_MISMATCH: 1 << 4,
  NOT_AGENT: 1 << 5,
  WRONG_ASSET: 1 << 6,
  ZERO_AMOUNT: 1 << 7,
  OVER_ORDER_MAX: 1 << 8,
  OVER_PERIOD_MAX: 1 << 9,
  OFF_DAY: 1 << 10,
  OFF_HOURS: 1 << 11,
  NOT_STARTED: 1 << 12,
  EXPIRED: 1 << 13,
  TOO_SOON: 1 << 14,
  NEEDS_APPROVAL: 1 << 15,
  NONCE_USED: 1 << 16,
} as const;

export type BitName = keyof typeof BITS;

/** Solidity constant name for each bit (R_ + name). */
export const SOL_NAME: Record<BitName, string> = Object.fromEntries(Object.keys(BITS).map((k) => [k, `R_${k}`])) as Record<BitName, string>;

/** Which rule line a bit belongs to, and a plain sentence for it. */
export const BIT_TEXT: Record<BitName, { rule: string; text: string }> = {
  UNKNOWN_BOOK: { rule: "Rule book", text: "There is no rule book with this number." },
  REVOKED: { rule: "Rule book", text: "The owner revoked this rule book. It refuses every order." },
  PAUSED: { rule: "Pause", text: "The rule book is paused." },
  NO_ACTIVE_VERSION: { rule: "Approval", text: "No version of the rules has been approved yet." },
  VERSION_MISMATCH: { rule: "Approval", text: "The order names a version that is not the approved one." },
  NOT_AGENT: { rule: "Agent", text: "This address is not the agent bound to the approved version." },
  WRONG_ASSET: { rule: "Asset", text: "The order is for a different asset than the rule set allows." },
  ZERO_AMOUNT: { rule: "Amount", text: "The order amount is zero." },
  OVER_ORDER_MAX: { rule: "Max per order", text: "The order is larger than the maximum per order." },
  OVER_PERIOD_MAX: { rule: "Max per period", text: "The order would take this period's spending past its maximum." },
  OFF_DAY: { rule: "Schedule", text: "The agent may not act on this weekday." },
  OFF_HOURS: { rule: "Schedule", text: "The agent may not act at this hour (UTC)." },
  NOT_STARTED: { rule: "Validity", text: "The rule set is not valid yet at this time." },
  EXPIRED: { rule: "Validity", text: "The rule set has expired." },
  TOO_SOON: { rule: "Minimum gap", text: "Too soon after the previous order." },
  NEEDS_APPROVAL: { rule: "Approval threshold", text: "Orders above the approval threshold need your approval for that exact order." },
  NONCE_USED: { rule: "Order number", text: "This order number was already used." },
};

export const ALL_BITS = Object.keys(BITS) as BitName[];

/** Names of the bits set in a mask, lowest first. */
export function bitNames(mask: number): BitName[] {
  return ALL_BITS.filter((k) => (mask & BITS[k]) !== 0);
}
