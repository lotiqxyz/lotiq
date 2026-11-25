import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ALL_BITS, BITS, bitNames } from "@/lib/rules/bits";
import { DAY, NO_THRESHOLD, USD, WEEK, check, freshState, hourOf, nextOffSchedule, nextScheduled, record, ruleProblems, weekday, windowStart, type Rule } from "@/lib/rules/engine";
import { canonicalText, diffRules, ruleHash } from "@/lib/rules/canonical";
import { parseStrategy, type Known } from "@/lib/rules/parse";
import { runScenario, standardScenarios, PRACTICE_AGENT } from "@/lib/rules/scenarios";
import { approve, emptyBook, loadBook, propose, setPaused, withdraw } from "@/lib/rules/book";

const SOL = readFileSync(new URL("../../../contracts/src/LotiqRuleMath.sol", import.meta.url), "utf8");
const BOOK_SOL = readFileSync(new URL("../../../contracts/src/LotiqRuleBook.sol", import.meta.url), "utf8");

// Monday 2026-11-23 15:00 UTC (same instant as the forge tests)
const MON_15H = 1795446000;
const NVDA: Known = { symbol: "NVDA", name: "NVIDIA", address: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec" };
const TSLA: Known = { symbol: "TSLA", name: "Tesla", address: "0x322f0929c4625ed5bad873c95208d54e1c003b2d" };
const AAPL: Known = { symbol: "AAPL", name: "Apple", address: "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9" };
const KNOWN = [NVDA, TSLA, AAPL];

const RULE: Rule = {
  assetSymbol: "NVDA",
  asset: NVDA.address,
  agent: PRACTICE_AGENT,
  orderAmount: 40 * USD,
  maxPerOrder: 50 * USD,
  maxPerPeriod: 120 * USD,
  period: WEEK,
  approvalAbove: 40 * USD,
  days: 0x01 | 0x04,
  startHour: 14,
  endHour: 20,
  minGap: 0,
  validFrom: MON_15H,
  validUntil: MON_15H + 90 * DAY,
};
const active = () => ({ ...freshState(), active: 1 });
const order = (amount: number, at = MON_15H, nonce = 1) => ({ agent: PRACTICE_AGENT, version: 1, asset: NVDA.address, amount, nonce, at });

test("every reason bit matches LotiqRuleMath.sol", () => {
  const found = [...SOL.matchAll(/uint256 internal constant R_([A-Z_]+) = 1 << (\d+);/g)].map((m) => [m[1], Number(m[2])] as const);
  assert.equal(found.length, ALL_BITS.length);
  for (const [name, shift] of found) {
    assert.ok(name in BITS, `site lacks ${name}`);
    assert.equal(BITS[name as keyof typeof BITS], 1 << shift, name);
  }
  assert.deepEqual(bitNames(BITS.PAUSED | BITS.OFF_DAY), ["PAUSED", "OFF_DAY"]);
});

test("calendar constants match the contract", () => {
  assert.match(SOL, /MONDAY_ZERO = 4 days/);
  assert.match(BOOK_SOL, /MAX_VALIDITY = 730 days/);
  assert.equal(weekday(0), 3);
  assert.equal(weekday(MON_15H), 0);
  assert.equal(hourOf(MON_15H), 15);
  assert.equal(windowStart(MON_15H + 3 * DAY, WEEK), MON_15H - 15 * 3600);
});

test("engine parity cases (same numbers as LotiqRuleBook.t.sol)", () => {
  assert.equal(check(RULE, active(), order(30 * USD)), 0);
  assert.ok(check(RULE, active(), order(60 * USD)) & BITS.OVER_ORDER_MAX);
  assert.equal(check(RULE, active(), order(10 * USD, MON_15H + DAY)), BITS.OFF_DAY);
  assert.equal(check(RULE, active(), order(10 * USD, MON_15H + 2 * DAY - 6 * 3600)), BITS.OFF_HOURS);
  assert.equal(check(RULE, active(), order(10 * USD, MON_15H - 6 * 3600)), BITS.OFF_HOURS | BITS.NOT_STARTED);
  assert.equal(check(RULE, active(), { ...order(10 * USD), asset: TSLA.address }), BITS.WRONG_ASSET);
  assert.equal(check(RULE, active(), { ...order(10 * USD), agent: "0x0000000000000000000000000000000000000bad" }), BITS.NOT_AGENT);
  assert.equal(check(RULE, active(), order(45 * USD)), BITS.NEEDS_APPROVAL);
  assert.equal(check(RULE, active(), order(0)), BITS.ZERO_AMOUNT);
  assert.equal(check(null, freshState(), order(10 * USD)), BITS.NO_ACTIVE_VERSION);
  assert.equal(check(RULE, { ...active(), paused: true }, order(10 * USD)), BITS.PAUSED);
  assert.equal(check(RULE, { ...freshState(), exists: false }, order(10 * USD)), BITS.UNKNOWN_BOOK);
  let s = active();
  for (const n of [1, 2, 3]) {
    assert.equal(check(RULE, s, order(40 * USD, MON_15H, n)), 0);
    s = record(RULE, s, order(40 * USD, MON_15H, n));
  }
  assert.equal(check(RULE, s, order(1 * USD, MON_15H, 4)), BITS.OVER_PERIOD_MAX);
  assert.equal(check(RULE, s, order(1 * USD, MON_15H, 3)), BITS.OVER_PERIOD_MAX | BITS.NONCE_USED);
  assert.equal(check(RULE, s, order(40 * USD, MON_15H + WEEK, 4)), 0);
});

test("schedule helpers find on- and off-schedule times", () => {
  const t = nextScheduled(RULE, MON_15H + 6 * 3600)!; // Monday 21:00 -> Wednesday 14:00
  assert.equal(weekday(t), 2);
  assert.equal(hourOf(t), 14);
  const off = nextOffSchedule(RULE, MON_15H)!;
  assert.ok(check(RULE, active(), order(10 * USD, off)) & (BITS.OFF_DAY | BITS.OFF_HOURS));
});

test("rule problems mirror the contract's BadRule checks", () => {
  assert.deepEqual(ruleProblems(RULE, MON_15H), []);
  const bad = ruleProblems({ ...RULE, maxPerOrder: 200 * USD, days: 0, startHour: 20, endHour: 20, validUntil: MON_15H + 800 * DAY }, MON_15H).map((p) => p.field);
  for (const f of ["maxPerPeriod", "days", "hours", "validUntil"]) assert.ok(bad.includes(f), f);
});

test("canonical text and hash are stable and change with any field", () => {
  const text = canonicalText(RULE);
  assert.match(text, /^format: lotiq-rules\/1\nasset: NVDA 0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec\n/);
  assert.match(text, /approval_above_usd6: 40000000/);
  assert.equal(ruleHash(RULE), ruleHash({ ...RULE }));
  assert.notEqual(ruleHash(RULE), ruleHash({ ...RULE, maxPerPeriod: RULE.maxPerPeriod + 1 }));
  assert.match(canonicalText({ ...RULE, approvalAbove: NO_THRESHOLD }), /approval_above_usd6: none/);
});

test("diff lists exactly the changed lines", () => {
  const changes = diffRules(RULE, { ...RULE, maxPerOrder: 60 * USD, maxPerPeriod: 150 * USD });
  assert.deepEqual(changes.map((c) => c.key), ["maxPerOrder", "maxPerPeriod"]);
  assert.equal(changes[0].before, "$50");
  assert.equal(changes[0].after, "$60");
  assert.equal(diffRules(null, RULE).length, 10);
});

test("parser: a complete strategy becomes a rule without questions", () => {
  const p = parseStrategy("Buy $50 of NVDA every Monday between 14 and 20 UTC, max $120 a week, ask me before any order above $40. For 12 weeks.", KNOWN, {}, MON_15H);
  assert.deepEqual(p.clarifications, []);
  assert.ok(p.rule);
  assert.equal(p.rule!.assetSymbol, "NVDA");
  assert.equal(p.rule!.orderAmount, 50 * USD);
  assert.equal(p.rule!.maxPerOrder, 50 * USD);
  assert.equal(p.rule!.maxPerPeriod, 120 * USD);
  assert.equal(p.rule!.period, WEEK);
  assert.equal(p.rule!.approvalAbove, 40 * USD);
  assert.equal(p.rule!.days, 1);
  assert.deepEqual([p.rule!.startHour, p.rule!.endHour], [14, 20]);
  assert.equal(p.rule!.validUntil, MON_15H + 12 * WEEK);
  assert.equal(p.fields.maxPerOrder!.source, "derived");
});

test("parser: ambiguity is asked, never guessed", () => {
  const p = parseStrategy("Buy about $50 of NVDA or TSLA weekly at 3pm", KNOWN, {}, MON_15H);
  const ids = p.clarifications.map((c) => c.id).sort();
  assert.deepEqual(ids, ["approval", "asset", "fuzzy-0", "tz", "weekday"]);
  assert.equal(p.rule, null);
  const answered = parseStrategy("Buy about $50 of NVDA or TSLA weekly at 3pm", KNOWN, { "fuzzy-0": "exact", asset: "TSLA", weekday: "4", tz: "ny", approval: "none" }, MON_15H);
  assert.deepEqual(answered.clarifications, []);
  assert.equal(answered.rule!.assetSymbol, "TSLA");
  assert.equal(answered.rule!.days, 1 << 4);
  assert.deepEqual([answered.rule!.startHour, answered.rule!.endHour], [20, 21]);
  assert.equal(answered.rule!.approvalAbove, NO_THRESHOLD);
});

test("parser: unsupported intents and unknown tickers", () => {
  const p = parseStrategy("Sell XYZQ if the price drops below $100, half of my balance", KNOWN, {}, MON_15H);
  const ids = p.clarifications.map((c) => c.id);
  for (const id of ["side", "condition", "percent", "asset", "schedule"]) assert.ok(ids.includes(id), id);
  assert.ok(p.notes.some((n) => n.includes("XYZQ")));
  const strat = parseStrategy("My Strategy: Trade $20 of NVDA every Monday. No approval needed.", [...KNOWN, { symbol: "MSTR", name: "Strategy Inc.", address: "0xec262a75e413fafd0df80480274532c79d42da09" }, { symbol: "TTD", name: "Trade Desk", address: "0x0b5fb4031cae9163db10b169ee72685f0edc8545" }], {}, MON_15H);
  assert.equal(strat.fields.asset!.value.symbol, "NVDA");
  const none = parseStrategy("buy Apple every weekday", KNOWN, {}, MON_15H);
  assert.equal(none.fields.asset!.value.symbol, "AAPL");
  assert.equal(none.fields.days!.value, 0x1f);
  assert.ok(none.clarifications.some((c) => c.id === "amount-missing"));
});

test("parser: approval phrases and every template parses without crashing", async () => {
  const { TEMPLATES } = await import("@/lib/rules/templates");
  assert.equal(parseStrategy("Buy $10 of NVDA every day. No approval needed.", KNOWN, {}, MON_15H).rule!.approvalAbove, NO_THRESHOLD);
  assert.equal(parseStrategy("Buy $10 of NVDA every day. Ask me before every order.", KNOWN, {}, MON_15H).rule!.approvalAbove, 0);
  const all = [...KNOWN, { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", address: "0x117cc2133c37b721f49de2a7a74833232b3b4c0c" }, { symbol: "GOOGL", name: "Alphabet Class A", address: "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3" }, { symbol: "QQQ", name: "Invesco QQQ", address: "0xd5f3879160bc7c32ebb4dc785f8a4f505888de68" }, { symbol: "MSFT", name: "Microsoft", address: "0xe93237c50d904957cf27e7b1133b510c669c2e74" }];
  const ready = TEMPLATES.filter((t) => parseStrategy(t.text, all, {}, MON_15H).rule).map((t) => t.id);
  assert.deepEqual(ready, ["weekly-nvda", "weekday-spy", "two-day-googl", "daily-qqq", "fridays-tsla"]);
});

test("scenario lab: each standard scenario behaves as labelled", () => {
  const list = standardScenarios(RULE, TSLA, MON_15H);
  const ids = list.map((s) => s.id);
  for (const id of ["under", "over-order", "over-period", "wrong-asset", "off-schedule", "not-approved", "paused", "expired"]) assert.ok(ids.includes(id), id);
  for (const sc of list) {
    const r = runScenario(sc, RULE);
    assert.ok(r.ok, `${sc.id}: ${JSON.stringify(r.steps.map((s) => [s.label, s.bits]))}`);
  }
  const op = runScenario(list.find((s) => s.id === "over-period")!, RULE);
  assert.equal(op.steps[op.steps.length - 1].reasons[0].bit, "OVER_PERIOD_MAX");
  const ap = runScenario(list.find((s) => s.id === "approval")!, { ...RULE, approvalAbove: 30 * USD });
  assert.equal(ap.steps[0].reasons[0].bit, "NEEDS_APPROVAL");
  assert.equal(ap.steps[1].accepted, true);
});

test("practice book: versions, exact-hash approval, supersede, log", () => {
  let b = propose(emptyBook(), RULE, MON_15H);
  const v1 = b.versions[0];
  assert.equal(approve(b, 1, "0xdeadbeef", MON_15H).error, "The text you reviewed does not match this version.");
  b = approve(b, 1, v1.hash, MON_15H).book;
  b = propose(b, { ...RULE, maxPerOrder: 60 * USD, maxPerPeriod: 150 * USD }, MON_15H + 60);
  assert.equal(b.versions[1].parent, 1);
  assert.equal(b.versions[1].changes.length, 2);
  b = approve(b, 2, b.versions[1].hash, MON_15H + 120).book;
  assert.deepEqual(b.versions.map((v) => v.status), ["superseded", "active"]);
  b = propose(b, RULE, MON_15H + 180);
  b = withdraw(b, 3, MON_15H + 200);
  b = setPaused(b, true, MON_15H + 300);
  assert.deepEqual(b.log.map((l) => l.kind), ["paused", "withdrawn", "proposed", "approved", "proposed", "approved", "proposed"]);
  assert.equal(loadBook("not json").versions.length, 0);
  assert.equal(loadBook(JSON.stringify(b)).versions.length, 3);
});
