"use client";

import { useState } from "react";
import { BITS } from "@/lib/rules/bits";
import { USD, WEEK, check, freshState, record, type Rule } from "@/lib/rules/engine";
import { PRACTICE_AGENT } from "@/lib/rules/scenarios";

/*
 * The reference's sticky "pick a size" block, as a limits demo: pick an order amount; three read-outs (per order / per period after two
 * earlier orders / approval) answer live from the real engine. The sample rule set is fixed and labelled.
 */
const RULE: Rule = {
  assetSymbol: "NVDA",
  asset: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec",
  agent: PRACTICE_AGENT,
  orderAmount: 50 * USD,
  maxPerOrder: 60 * USD,
  maxPerPeriod: 150 * USD,
  period: WEEK,
  approvalAbove: 40 * USD,
  days: 0x7f,
  startHour: 0,
  endHour: 24,
  minGap: 0,
  validFrom: 1795446000,
  validUntil: 1795446000 + 90 * 86400,
};
const AT = 1795446000 + 3600;
const SIZES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 120, 150];

export function LimitPicker() {
  const [amt, setAmt] = useState(45);
  const order = (a: number, nonce: number, at = AT) => ({ agent: PRACTICE_AGENT, version: 1, asset: RULE.asset, amount: a * USD, nonce, at });
  let s = { ...freshState(), active: 1 };
  s = record(RULE, s, order(40, 1));
  s = record(RULE, s, order(40, 2, AT + 60));
  const bits = check(RULE, s, order(amt, 3, AT + 120));
  const rows = [
    { k: "Per order", limit: "max $60", ok: !(bits & BITS.OVER_ORDER_MAX), word: bits & BITS.OVER_ORDER_MAX ? "Refused" : "Within" },
    { k: "Per week", limit: "$80 spent of $150", ok: !(bits & BITS.OVER_PERIOD_MAX), word: bits & BITS.OVER_PERIOD_MAX ? "Refused" : "Within" },
    { k: "Your approval", limit: "above $40", ok: !(bits & BITS.NEEDS_APPROVAL), word: bits & BITS.NEEDS_APPROVAL ? "Waits for you" : "Not needed" },
  ];
  const verdict = bits === 0;
  return (
    <section className="pt-28 md:pt-40" aria-labelledby="lim-t">
      <div className="wrap">
        <h2 id="lim-t" className="d2" data-reveal="">
          Limits that hold
          <br />
          <span className="lime">at every order size.</span>
        </h2>
        <div className="mt-14 grid gap-8 lg:grid-cols-[1fr_auto_1fr] lg:items-start">
          <div className="max-w-[340px] text-muted" data-reveal="">
            <p>
              Small orders pass every line; larger ones meet the approval threshold first, then the maximum per order, then what is left of the
              week. Two $40 orders were already recorded this week in this sample rule set.
            </p>
            <p className="mt-4">Pick an amount and watch the three limits answer, from the same engine the studio and the contract use.</p>
            <p className="mt-4">
              <span className="badge-sample">Sample data</span>
            </p>
          </div>
          <div className="card mx-auto w-full max-w-[390px] p-2" data-reveal="">
            <p className="label px-4 pb-1 pt-3">Order amount</p>
            <div className="pick" role="group" aria-label="Order amount">
              {SIZES.map((v) => (
                <button key={v} type="button" aria-pressed={amt === v} onClick={() => setAmt(v)} data-testid={`pick-${v}`}>
                  <span>${v}</span>
                  <span>{v === amt ? "selected" : ""}</span>
                </button>
              ))}
            </div>
            <div className="m-2 mt-3 rounded bg-[var(--bg)] p-4 text-center">
              <span className={`status ${verdict ? "ok" : bits & BITS.NEEDS_APPROVAL && !(bits & ~BITS.NEEDS_APPROVAL) ? "wait" : "no"}`} data-testid="pick-verdict">
                {verdict ? "Accepted" : bits & ~BITS.NEEDS_APPROVAL ? "Refused" : "Waits for your approval"}
              </span>
            </div>
          </div>
          <div data-reveal="">
            {rows.map((r) => (
              <div key={r.k} className="readout">
                <div className="flex justify-between text-[11px] uppercase tracking-wider text-muted">
                  <span>{r.k}</span>
                  <span className="text-ink normal-case tracking-normal">{r.limit}</span>
                </div>
                <span className={`glyph mt-2 ${r.ok ? "" : "text-[var(--bad)]"}`} style={{ fontSize: `clamp(26px, 8vw, ${r.ok ? 34 + Math.min(amt, 60) * 0.35 : 40}px)` }}>
                  {r.word}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
