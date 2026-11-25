"use client";

import { useEffect, useMemo, useState } from "react";
import { MarkGlyph } from "@/components/site/Mark";
import { FIXTURE_KNOWN } from "@/lib/rules/known";
import { parseStrategy } from "@/lib/rules/parse";
import { plainLines } from "@/lib/rules/canonical";
import { runScenario, standardScenarios } from "@/lib/rules/scenarios";
import { BIT_TEXT } from "@/lib/rules/bits";

/*
 * The hero's product panel: a live miniature of the studio. The strategy is typed in, the real parser (src/lib/rules/parse.ts) reads it,
 * the rule lines appear, and the real scenario lab runs. Nothing here is a picture: every line comes from the same code as /studio.
 * The final frame is rendered on the server too, so the panel is complete without JavaScript or with reduced motion.
 */
const TEXT = "Buy $50 of NVDA every Monday between 14 and 20 UTC, max $120 a week. Ask me before any order above $40.";
// Fixed clock (Monday 2026-11-23 15:00 UTC) so the server and the browser render the same frame.
const NOW = 1795446000;

export function StudioMini() {
  const parsed = useMemo(() => parseStrategy(TEXT, FIXTURE_KNOWN, {}, NOW), []);
  const rule = parsed.rule;
  const lines = rule ? plainLines(rule).filter((l) => l.key !== "agent") : [];
  const results = useMemo(() => {
    if (!rule) return [];
    const other = FIXTURE_KNOWN.find((k) => k.symbol === "TSLA") ?? FIXTURE_KNOWN[0];
    return standardScenarios(rule, other, NOW).slice(0, 6).map((s) => runScenario(s, rule));
  }, [rule]);
  // 0..TEXT.length typing, then lines, then results. Starts at the final frame (server + no-JS), the client rewinds once.
  const total = TEXT.length + lines.length + results.length;
  const [t, setT] = useState(total);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = -1;
    const id = window.setInterval(() => {
      i += 1;
      setT(i);
      if (i >= total + 40) i = 0;
    }, 45);
    return () => window.clearInterval(id);
  }, [total]);
  const typed = Math.min(t, TEXT.length);
  const shownLines = Math.max(0, Math.min(lines.length, Math.floor((t - TEXT.length) / 3)));
  const shownResults = Math.max(0, Math.min(results.length, Math.floor((t - TEXT.length - lines.length * 3) / 4)));

  return (
    <div className="win mx-auto w-full max-w-[860px] text-left" data-testid="studio-mini">
      <div className="win-h">
        <MarkGlyph size={14} accent />
        <span>Lotiq studio</span>
        <span className="ml-auto flex gap-3 text-[11px] font-medium text-muted">
          <span className="text-ink">Write</span>
          <span>Check</span>
          <span>Scenario lab</span>
          <span>Approve</span>
        </span>
      </div>
      <div className="grid md:grid-cols-[1.05fr_1fr]">
        <div className="border-b border-white/5 p-3 md:border-r md:border-b-0">
          <p className="label mb-2">Strategy</p>
          <p className={`min-h-[72px] rounded bg-black/30 p-2.5 font-mono text-[11.5px] leading-relaxed ${typed < TEXT.length ? "caret" : ""}`}>{TEXT.slice(0, typed)}</p>
          <p className="label mb-1 mt-3">Rule set (version 1, proposed)</p>
          <div>
            {lines.slice(0, shownLines).map((l) => (
              <div key={l.key} className="win-row tick-in px-0">
                <span className="text-muted">{l.label}</span>
                <span className="text-right">{l.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="p-3">
          <p className="label mb-2">Scenario lab</p>
          <ul className="grid gap-1.5">
            {results.slice(0, shownResults).map((r) => {
              const last = r.steps[r.steps.length - 1];
              return (
                <li key={r.id} className="tick-in flex items-start justify-between gap-3 rounded bg-black/25 px-2.5 py-2">
                  <span className="min-w-0">
                    <span className="block">{r.title}</span>
                    <span className="block text-[11px] text-muted">{last.accepted ? "every rule passes" : last.reasons.map((x) => BIT_TEXT[x.bit].rule).join(" · ")}</span>
                  </span>
                  <span className={`status ${last.accepted ? "ok" : "no"}`}>{last.accepted ? "Accepted" : "Refused"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
