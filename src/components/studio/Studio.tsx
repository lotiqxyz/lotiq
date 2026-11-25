"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CHAIN, explorerAddress } from "@/config/brand";
import { storageKey } from "@/config/storage";
import { useLocalStore } from "@/components/wallet/useLocalStore";
import { StatusBadge, SampleBadge, LiveBadge } from "@/components/site/PageHead";
import { CopyChip } from "@/components/site/CaCopy";
import { BIT_TEXT, bitNames } from "@/lib/rules/bits";
import { canonicalText, diffRules, plainLines, ruleHash } from "@/lib/rules/canonical";
import { DAY, NO_THRESHOLD, PERIODS, USD, WD_SHORT, check, nextScheduled, dateText, freshState, orderKey, ruleProblems, usd, type BookState, type Period, type Rule } from "@/lib/rules/engine";
import { parseStrategy, type Field, type Source } from "@/lib/rules/parse";
import { PRACTICE_AGENT, runScenario, standardScenarios, type ScenarioResult } from "@/lib/rules/scenarios";
import { activeVersion, addRun, approve, emptyBook, loadBook, propose, revoke, setPaused, withdraw, type PracticeBook } from "@/lib/rules/book";
import { TEMPLATES } from "@/lib/rules/templates";
import { STOCK_BEACON, STOCK_PROXY_CODEHASH } from "@/config/chain";
import { ago } from "@/lib/format";
import { priceOf, useAssets } from "./useAssets";
import { ChainPanel, type ChainCtx } from "./ChainPanel";

/*
 * The studio: the product brief's four steps on one page.
 *   1 Write   plain-text strategy -> deterministic parser -> clarification questions (answers stored), notes, fields with their source
 *   2 Check   every rule line editable, problems the contract would refuse, asset identity proof + live price, canonical text + hash
 *   3 Lab     standard scenarios + a custom order, each accepted/refused with the exact rule; runs saved to the log
 *   4 Approve versions with diffs, approve the exact hash, withdraw, pause, revoke (practice book in this browser, or on chain)
 * Practice mode needs no wallet; on-chain mode uses LotiqRuleBook through the visitor's wallet.
 */

type Step = "write" | "check" | "lab" | "approve";
const STEPS: { id: Step; label: string }[] = [
  { id: "write", label: "Write" },
  { id: "check", label: "Check" },
  { id: "lab", label: "Scenario lab" },
  { id: "approve", label: "Review & approve" },
];
const K = {
  text: storageKey("lq", "text"),
  answers: storageKey("lq", "answers"),
  edits: storageKey("lq", "edits"),
  book: storageKey("lq", "book"),
};

const nowMin = () => Math.floor(Date.now() / 60_000) * 60;

export function Studio() {
  const sp = useSearchParams();
  const router = useRouter();
  const [step, setStepState] = useState<Step>(() => (STEPS.some((s) => s.id === sp.get("step")) ? (sp.get("step") as Step) : "write"));
  const [mode, setMode] = useState<"practice" | "chain">(sp.get("mode") === "chain" ? "chain" : "practice");
  const [text, setText] = useLocalStore<string>(K.text, TEMPLATES[0].text);
  const [answers, setAnswers] = useLocalStore<Record<string, string>>(K.answers, {});
  const [edits, setEdits] = useLocalStore<Partial<Rule>>(K.edits, {});
  const [bookRaw, setBookRaw] = useLocalStore<PracticeBook | null>(K.book, null);
  const book = useMemo(() => loadBook(bookRaw ? JSON.stringify(bookRaw) : null), [bookRaw]);
  const setBook = (b: PracticeBook) => setBookRaw(b);
  const [now, setNow] = useState(nowMin);
  const [chain, setChain] = useState<ChainCtx | null>(null);
  const assets = useAssets();

  useEffect(() => {
    const id = window.setInterval(() => setNow(nowMin()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // ?t=<template> loads that template once and clears answers and edits.
  useEffect(() => {
    const t = TEMPLATES.find((x) => x.id === sp.get("t"));
    if (!t) return;
    setText(t.text);
    setAnswers({});
    setEdits({});
    const q = new URLSearchParams(sp.toString());
    q.delete("t");
    router.replace(`/studio${q.size ? `?${q}` : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setStep = (s: Step) => {
    setStepState(s);
    const q = new URLSearchParams(sp.toString());
    q.set("step", s);
    router.replace(`/studio?${q}`, { scroll: false });
  };

  const parsed = useMemo(() => parseStrategy(text, assets.list, answers, now), [text, assets.list, answers, now]);
  const agentDefault = mode === "chain" ? (chain?.address ?? "") : PRACTICE_AGENT;
  const draft: Rule | null = parsed.rule ? { ...parsed.rule, agent: agentDefault, ...edits, validFrom: now } : null;
  if (draft && mode === "practice") draft.agent = PRACTICE_AGENT;

  const updateText = (v: string) => {
    setText(v);
    setEdits({});
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="tabs max-w-full" role="tablist" aria-label="Studio steps">
          {STEPS.map((s, i) => (
            <button key={s.id} type="button" role="tab" aria-selected={step === s.id} onClick={() => setStep(s.id)} data-testid={`tab-${s.id}`}>
              <span className="n">{i + 1}</span>
              {s.label}
              {s.id === "lab" ? <span className="tag">NEW</span> : null}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Mode">
          <button type="button" aria-pressed={mode === "practice"} onClick={() => setMode("practice")} data-testid="mode-practice">
            Practice
          </button>
          <button type="button" aria-pressed={mode === "chain"} onClick={() => setMode("chain")} data-testid="mode-chain">
            On chain
          </button>
        </div>
      </div>
      <p className="-mt-2 text-[13px] text-muted">
        {mode === "practice"
          ? "Practice mode: the rule book lives in this browser and the agent is a practice address. Same rules, same reason codes as the contract."
          : `On-chain mode: rule books on ${CHAIN.name} through your wallet. Every transaction costs gas in ETH; no tokens are moved.`}
      </p>

      {step === "write" ? <WriteStep text={text} setText={updateText} parsed={parsed} answers={answers} setAnswers={setAnswers} next={() => setStep("check")} assetsLive={assets.live} /> : null}
      {step === "check" ? <CheckStep draft={draft} parsed={parsed} edits={edits} setEdits={setEdits} assets={assets} mode={mode} now={now} back={() => setStep("write")} next={() => setStep("lab")} /> : null}
      {step === "lab" ? <LabStep draft={draft} assets={assets} now={now} book={book} setBook={setBook} chain={chain} mode={mode} next={() => setStep("approve")} back={() => setStep("write")} /> : null}
      {step === "approve" && mode === "practice" ? <PracticeApprove draft={draft} book={book} setBook={setBook} now={now} assets={assets} /> : null}
      {mode === "chain" ? (
        <div className={step === "approve" ? "" : "hidden"}>
          <ChainPanel draft={draft} problems={draft ? ruleProblems(draft, now) : []} now={now} onCtx={setChain} assets={assets.list} />
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ 1 write

const SOURCE_TEXT: Record<Source, string> = { written: "written", derived: "derived", default: "default", answered: "answered" };

function FieldRow({ label, f, show }: { label: string; f: Field<unknown> | undefined; show: (v: never) => string }) {
  return (
    <tr>
      <td className="text-muted">{label}</td>
      <td>{f ? show(f.value as never) : <span className="text-muted">— not read yet</span>}</td>
      <td>{f ? <span className={`src ${f.source}`}>{SOURCE_TEXT[f.source]}</span> : null}</td>
      <td className="text-[13px] text-muted">{f?.why ?? ""}</td>
    </tr>
  );
}

function WriteStep({ text, setText, parsed, answers, setAnswers, next, assetsLive }: { text: string; setText: (v: string) => void; parsed: ReturnType<typeof parseStrategy>; answers: Record<string, string>; setAnswers: (v: Record<string, string>) => void; next: () => void; assetsLive: boolean }) {
  const f = parsed.fields;
  const open = parsed.clarifications.length;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="panel" aria-labelledby="w-t">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="w-t" className="h4">
            Write the strategy
          </h2>
          <StatusBadge status="Prototype" />
        </div>
        <label className="lbl mt-5" htmlFor="strategy">
          One buy strategy for one stock token, in plain English
        </label>
        <textarea id="strategy" className="inp" value={text} maxLength={600} onChange={(e) => setText(e.target.value)} data-testid="strategy" />
        <p className="mt-2 text-[12px] text-muted">
          Read by fixed patterns in this page (no language model): amounts, tickers, weekdays, UTC hours, &ldquo;max … per week&rdquo;, &ldquo;ask me
          above …&rdquo;, &ldquo;for N weeks&rdquo; / &ldquo;until YYYY-MM-DD&rdquo;. {assetsLive ? "Tickers are matched against the live proven list." : "Tickers are matched against the 23 Nov proven list until the live list answers."}
        </p>
        <p className="label mt-6">Templates</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" className="opt" onClick={() => setText(t.text)} data-testid={`template-${t.id}`}>
              {t.title}
            </button>
          ))}
        </div>
      </section>
      <section className="panel" aria-labelledby="q-t">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="q-t" className="h4">
            {open ? `${open} question${open === 1 ? "" : "s"} before this becomes a rule set` : "Every line is clear"}
          </h2>
          <span className={`status ${open ? "wait" : "ok"}`} data-testid="clar-count">
            {open ? `${open} open` : "Ready"}
          </span>
        </div>
        <ul className="mt-5 grid gap-3" data-testid="clarifications">
          {parsed.clarifications.map((c) => (
            <li key={c.id} className="clar" data-testid={`clar-${c.id}`}>
              <p>{c.question}</p>
              {c.quote ? <p className="mt-1 text-[12px] text-muted">From your text: &ldquo;{c.quote}&rdquo;</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {c.options.map((o) => (
                  <button key={o.id} type="button" className="opt" aria-pressed={answers[c.id] === o.id} onClick={() => setAnswers({ ...answers, [c.id]: o.id })} data-testid={`ans-${c.id}-${o.id}`}>
                    {o.label}
                  </button>
                ))}
              </div>
              {c.options.length === 0 ? <p className="mt-2 text-[13px] text-muted">Edit the text to answer this one.</p> : null}
            </li>
          ))}
        </ul>
        {parsed.notes.length ? (
          <ul className="mt-4 grid gap-2">
            {parsed.notes.map((n) => (
              <li key={n} className="note warn">
                {n}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="scroll-x mt-5">
          <table className="tbl">
            <thead>
              <tr>
                <th>Rule line</th>
                <th>Value</th>
                <th>Source</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              <FieldRow label="Asset" f={f.asset} show={(v: { symbol: string }) => v.symbol} />
              <FieldRow label="Planned order" f={f.orderAmount} show={(v: number) => usd(v)} />
              <FieldRow label="Max per order" f={f.maxPerOrder} show={(v: number) => usd(v)} />
              <FieldRow label="Max per period" f={f.maxPerPeriod} show={(v: number) => usd(v)} />
              <FieldRow label="Period" f={f.period} show={(v: number) => PERIODS.find((p) => p.value === v)?.label ?? ""} />
              <FieldRow label="Your approval" f={f.approvalAbove} show={(v: number) => (v >= NO_THRESHOLD ? "never needed" : v === 0 ? "every order" : `above ${usd(v)}`)} />
              <FieldRow label="Days" f={f.days} show={(v: number) => WD_SHORT.filter((_, i) => (v >> i) & 1).join(", ")} />
              <FieldRow label="Hours (UTC)" f={f.hours} show={(v: [number, number]) => `${v[0]}:00–${v[1]}:00`} />
              <FieldRow label="Min gap" f={f.minGap} show={(v: number) => (v ? `${v / 3600} h` : "none")} />
              <FieldRow label="Valid until" f={f.validUntil} show={(v: number) => dateText(v).slice(0, 10)} />
            </tbody>
          </table>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" className="btn brand" disabled={!parsed.rule} onClick={next} data-testid="to-check">
            Check the rules
          </button>
          {Object.keys(answers).length ? (
            <button type="button" className="btn line" onClick={() => setAnswers({})}>
              Clear answers
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ 2 check

type Assets = ReturnType<typeof useAssets>;

function CheckStep({ draft, parsed, edits, setEdits, assets, mode, now, back, next }: { draft: Rule | null; parsed: ReturnType<typeof parseStrategy>; edits: Partial<Rule>; setEdits: (e: Partial<Rule>) => void; assets: Assets; mode: "practice" | "chain"; now: number; back: () => void; next: () => void }) {
  if (!draft)
    return (
      <div className="panel">
        <p>
          {parsed.clarifications.length} question{parsed.clarifications.length === 1 ? "" : "s"} still open in step 1. A rule set exists only when every
          question is answered: nothing is guessed.
        </p>
        <button type="button" className="btn mt-4" onClick={back}>
          Back to step 1
        </button>
      </div>
    );
  const set = (p: Partial<Rule>) => setEdits({ ...edits, ...p });
  const problems = ruleProblems(draft, now);
  const stock = assets.bySym.get(draft.assetSymbol);
  const price = priceOf(stock);
  const qty = price ? draft.orderAmount / USD / price.usd : null;
  const dollars = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);
  const approvalNone = draft.approvalAbove >= NO_THRESHOLD;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <section className="panel" aria-labelledby="c-t">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="c-t" className="h4">
            Check the rules
          </h2>
          <span className={`status ${problems.length ? "no" : "ok"}`} data-testid="problems">
            {problems.length ? `${problems.length} problem${problems.length === 1 ? "" : "s"}` : "Contract would accept"}
          </span>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="lbl" htmlFor="asset">
              Asset (proven stock token)
            </label>
            <select id="asset" className="inp" value={draft.assetSymbol} onChange={(e) => {
              const k = assets.list.find((x) => x.symbol === e.target.value);
              if (k) set({ assetSymbol: k.symbol, asset: k.address });
            }} data-testid="asset-select">
              {assets.list.map((k) => (
                <option key={k.address} value={k.symbol}>
                  {k.symbol} · {k.name}
                </option>
              ))}
            </select>
          </div>
          <Money id="order" label="Planned order ($)" value={draft.orderAmount} onChange={(v) => set({ orderAmount: v })} />
          <Money id="maxo" label="Max per order ($)" value={draft.maxPerOrder} onChange={(v) => set({ maxPerOrder: v })} />
          <Money id="maxp" label="Max per period ($)" value={draft.maxPerPeriod} onChange={(v) => set({ maxPerPeriod: v })} />
          <div>
            <label className="lbl" htmlFor="period">
              Period
            </label>
            <select id="period" className="inp" value={draft.period} onChange={(e) => set({ period: Number(e.target.value) as Period })}>
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="appr">
              Your approval needed above ($)
            </label>
            <input id="appr" className="inp" type="number" min={0} step="0.01" disabled={approvalNone} value={approvalNone ? "" : dollars(draft.approvalAbove / USD)} onChange={(e) => set({ approvalAbove: Math.round(Number(e.target.value) * USD) })} />
            <label className="mt-2 flex items-center gap-2 text-[13px] text-muted">
              <input type="checkbox" checked={approvalNone} onChange={(e) => set({ approvalAbove: e.target.checked ? NO_THRESHOLD : draft.orderAmount })} /> No approval needed for any order
            </label>
          </div>
          <div>
            <label className="lbl" htmlFor="gap">
              Min gap between orders (hours)
            </label>
            <input id="gap" className="inp" type="number" min={0} max={720} value={draft.minGap / 3600} onChange={(e) => set({ minGap: Math.max(0, Math.round(Number(e.target.value) * 3600)) })} />
          </div>
          <div className="sm:col-span-2">
            <span className="lbl">Days (UTC)</span>
            <div className="flex flex-wrap gap-1.5">
              {WD_SHORT.map((d, i) => (
                <button key={d} type="button" className="daychip" aria-pressed={((draft.days >> i) & 1) === 1} onClick={() => set({ days: draft.days ^ (1 << i) })}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="lbl" htmlFor="sh">
              From hour (UTC)
            </label>
            <input id="sh" className="inp" type="number" min={0} max={23} value={draft.startHour} onChange={(e) => set({ startHour: Math.max(0, Math.min(23, Math.round(Number(e.target.value)))) })} />
          </div>
          <div>
            <label className="lbl" htmlFor="eh">
              To hour (UTC, exclusive)
            </label>
            <input id="eh" className="inp" type="number" min={1} max={24} value={draft.endHour} onChange={(e) => set({ endHour: Math.max(1, Math.min(24, Math.round(Number(e.target.value)))) })} />
          </div>
          <div>
            <label className="lbl" htmlFor="until">
              Valid until (UTC date)
            </label>
            <input id="until" className="inp" type="date" value={new Date(draft.validUntil * 1000).toISOString().slice(0, 10)} onChange={(e) => {
              const t = Date.parse(`${e.target.value}T00:00:00Z`) / 1000;
              if (Number.isFinite(t)) set({ validUntil: t });
            }} />
          </div>
          {mode === "chain" ? (
            <div>
              <label className="lbl" htmlFor="agent">
                Agent address (the wallet allowed to record orders)
              </label>
              <input id="agent" className="inp font-mono text-[13px]" value={draft.agent} placeholder="0x…" onChange={(e) => set({ agent: e.target.value.trim() })} data-testid="agent-input" />
            </div>
          ) : (
            <div>
              <span className="lbl">Agent</span>
              <p className="pt-2 font-mono text-[13px] text-muted">practice agent {PRACTICE_AGENT.slice(0, 8)}…</p>
            </div>
          )}
        </div>
        {problems.length ? (
          <ul className="mt-5 grid gap-2">
            {problems.map((p) => (
              <li key={p.field} className="note warn">
                {p.text}
              </li>
            ))}
          </ul>
        ) : null}
        {Object.keys(edits).length ? (
          <button type="button" className="btn line sm mt-4" onClick={() => setEdits({})}>
            Undo edits (back to the parsed text)
          </button>
        ) : null}
      </section>

      <div className="grid grid-cols-1 content-start gap-6">
        <section className="panel" aria-labelledby="id-t" data-testid="asset-proof">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="id-t" className="h4">
              {draft.assetSymbol}: identity on chain
            </h2>
            {assets.live ? <LiveBadge /> : <span className="badge-sample">23 Nov list, not re-read yet</span>}
          </div>
          <dl className="kv mt-4">
            <dt>Token</dt>
            <dd>
              <a className="ul font-mono text-[13px]" href={explorerAddress(draft.asset)} target="_blank" rel="noreferrer">
                {draft.asset}
              </a>
            </dd>
            <dt>Proxy code hash</dt>
            <dd className="font-mono text-[12px]">{stock ? "= " : "expected "}{STOCK_PROXY_CODEHASH.slice(0, 18)}…</dd>
            <dt>Beacon slot</dt>
            <dd className="font-mono text-[12px]">{stock ? "= " : "expected "}{STOCK_BEACON.slice(0, 14)}… (Robinhood)</dd>
            <dt>Minted supply</dt>
            <dd>{stock ? `${(Number(BigInt(stock.supply) / 10n ** 14n) / 1e4).toLocaleString("en-US")} tokens` : "—"}</dd>
            <dt>Price (Chainlink)</dt>
            <dd>
              {price ? (
                <>
                  ${price.usd.toFixed(2)} <span className={`text-[12px] ${price.stale ? "text-[var(--warn)]" : "text-muted"}`}>updated {price.updatedAt ? ago(price.updatedAt) : "—"}{price.stale ? " (older than its heartbeat)" : ""}</span>
                  <a className="ul ml-2 text-[12px] text-muted" href={explorerAddress(price.feed)} target="_blank" rel="noreferrer">
                    {price.name}
                  </a>
                </>
              ) : (
                "No Chainlink feed for this token, or not read yet"
              )}
            </dd>
            <dt>One planned order</dt>
            <dd>{qty !== null ? `≈ ${qty.toFixed(4)} ${draft.assetSymbol} for ${usd(draft.orderAmount)} at that price` : "—"}</dd>
          </dl>
          <p className="mt-3 text-[12px] text-muted">
            {stock ? `All three proofs passed on the read at ${assets.board ? new Date(assets.board.readAt).toISOString().slice(11, 19) : "—"} UTC.` : "The live list did not answer: the address comes from the 23 Nov proven list."} A token with the same ticker but another
            address is refused. A stock token is a token on {CHAIN.name}, not the share itself.
          </p>
        </section>
        <section className="panel" aria-labelledby="sum-t">
          <h2 id="sum-t" className="h4">
            What the agent may do
          </h2>
          <dl className="kv mt-4">
            {plainLines(draft).map((l) => (
              <FragmentRow key={l.key} k={l.label} v={l.value} />
            ))}
          </dl>
          <p className="label mt-5">Approvals this rule set needs</p>
          <ul className="mt-2 grid gap-1 text-[14px]">
            <li>• Once: you approve this version (number + hash) before any order counts.</li>
            <li>• {approvalNone ? "No per-order approvals." : draft.approvalAbove === 0 ? "Every order: approve each one." : `Each order above ${usd(draft.approvalAbove)}: approve that exact order.`}</li>
          </ul>
          <p className="label mt-5">Canonical text (what the hash commits to)</p>
          <pre className="codebox mt-2" data-testid="canonical">{canonicalText(draft)}</pre>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            keccak256 <CopyChip value={ruleHash(draft)} head={10} tail={6} /> <span>(valid_from is the minute you propose)</span>
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn brand" onClick={next} data-testid="to-lab">
              Run the scenario lab
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function FragmentRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}

function Money({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="lbl" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="inp" type="number" min={0} step="0.01" value={Math.round((value / USD) * 100) / 100} onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value) * USD)))} data-testid={`money-${id}`} />
    </div>
  );
}

// ------------------------------------------------------------------ 3 lab

function Verdict({ ok, wait }: { ok: boolean; wait?: boolean }) {
  return <span className={`status ${ok ? "ok" : wait ? "wait" : "no"}`}>{ok ? "Accepted" : "Refused"}</span>;
}

function LabStep({ draft, assets, now, book, setBook, chain, mode, next, back }: { draft: Rule | null; assets: Assets; now: number; book: PracticeBook; setBook: (b: PracticeBook) => void; chain: ChainCtx | null; mode: "practice" | "chain"; next: () => void; back: () => void }) {
  const results: ScenarioResult[] = useMemo(() => {
    if (!draft || ruleProblems(draft, now).length) return [];
    const rule = { ...draft, agent: draft.agent || PRACTICE_AGENT };
    const other = assets.list.find((k) => k.symbol !== draft.assetSymbol) ?? assets.list[0];
    return standardScenarios(rule, other, now).map((s) => runScenario(s, rule));
  }, [draft, assets.list, now]);
  const [saved, setSaved] = useState(false);
  if (!draft)
    return (
      <div className="panel">
        <p>Finish step 1 first: the lab needs a complete rule set.</p>
        <button type="button" className="btn mt-4" onClick={back}>
          Back to step 1
        </button>
      </div>
    );
  const problems = ruleProblems(draft, now);
  if (problems.length)
    return (
      <div className="panel">
        <p>The rule set has {problems.length} problem(s) the contract would refuse. Fix them in step 2 first.</p>
      </div>
    );
  const passed = results.filter((r) => r.ok).length;
  const save = () => {
    const v = activeVersion(book);
    setBook(addRun(book, { at: Math.floor(Date.now() / 1000), version: v && v.hash === ruleHash(draft) ? v.n : 0, passed, total: results.length, lines: results.map((r) => ({ title: r.title, ok: r.ok, last: r.steps[r.steps.length - 1].accepted ? "accepted" : bitNames(r.steps[r.steps.length - 1].bits).join("|") })) }));
    setSaved(true);
  };
  return (
    <div className="grid grid-cols-1 gap-6">
      <section className="panel" aria-labelledby="l-t">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="l-t" className="h4">
            Scenario lab: {passed} of {results.length} behave as labelled
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <SampleBadge label="Test orders" />
            <button type="button" className="btn sm line" onClick={save} data-testid="save-run">
              {saved ? "Saved to the log" : "Save this run to the log"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-[13px] text-muted">
          Each scenario starts from an empty rule book whose version 1 is this rule set (approved, unless the scenario says otherwise). Times are UTC.
        </p>
        <ul className="mt-5 grid gap-3 md:grid-cols-2" data-testid="scenarios">
          {results.map((r) => (
            <li key={r.id} className="panel inset" data-testid={`sc-${r.id}`}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[17px] font-medium">{r.title}</h3>
                <span className="text-[12px] text-muted">expected: {r.expect === "mixed" ? "refused, then accepted" : r.expect}</span>
              </div>
              <ol className="mt-3 grid gap-2">
                {r.steps.map((s, i) => (
                  <li key={i} className="rounded bg-[var(--bg)] p-3 text-[14px]">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        {s.label}
                        <span className="block text-[12px] text-muted">{dateText(s.order.at)}</span>
                      </span>
                      <Verdict ok={s.accepted} />
                    </div>
                    {s.reasons.length ? (
                      <ul className="mt-2 grid gap-1 text-[13px]">
                        {s.reasons.map((x) => (
                          <li key={x.bit}>
                            <span className="text-[var(--bad)]">{x.rule}</span> · {x.detail} <span className="font-mono text-[11px] text-muted">R_{x.bit}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      </section>
      <CustomOrder draft={draft} assets={assets} now={now} chain={mode === "chain" ? chain : null} />
      <div>
        <button type="button" className="btn brand" onClick={next} data-testid="to-approve">
          Review and approve
        </button>
      </div>
    </div>
  );
}

function CustomOrder({ draft, assets, now, chain }: { draft: Rule; assets: Assets; now: number; chain: ChainCtx | null }) {
  const [sym, setSym] = useState(draft.assetSymbol);
  const [amount, setAmount] = useState(draft.orderAmount / USD);
  const [when, setWhen] = useState(() => new Date((nextScheduled(draft, Math.max(now, draft.validFrom)) ?? now) * 1000).toISOString().slice(0, 16));
  const [approvedOrder, setApprovedOrder] = useState(false);
  const [versionApproved, setVersionApproved] = useState(true);
  const [paused, setPausedS] = useState(false);
  const [spent, setSpent] = useState(0);
  const at = Math.floor(Date.parse(`${when}:00Z`) / 1000);
  const asset = assets.list.find((k) => k.symbol === sym)?.address ?? draft.asset;
  const order = { agent: draft.agent || PRACTICE_AGENT, version: 1, asset, amount: Math.round(amount * USD), nonce: 1, at };
  const state: BookState = { ...freshState(), active: versionApproved ? 1 : 0, paused, spent: Math.round(spent * USD), windowStart: spent ? Math.floor((at - 4 * DAY) / draft.period) * draft.period + 4 * DAY : 0, approvedOrders: approvedOrder ? [orderKey(order)] : [] };
  const bits = Number.isFinite(at) ? check({ ...draft, agent: draft.agent || PRACTICE_AGENT }, state, order) : 0;
  const names = bitNames(bits);
  return (
    <section className="panel" aria-labelledby="co-t">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="co-t" className="h4">
          Try your own order
        </h2>
        <span data-testid="custom-verdict">
          <Verdict ok={bits === 0} />
        </span>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="lbl" htmlFor="co-asset">
            Asset
          </label>
          <select id="co-asset" className="inp" value={sym} onChange={(e) => setSym(e.target.value)} data-testid="co-asset">
            {assets.list.map((k) => (
              <option key={k.address} value={k.symbol}>
                {k.symbol}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="lbl" htmlFor="co-amt">
            Amount ($)
          </label>
          <input id="co-amt" className="inp" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} data-testid="co-amount" />
        </div>
        <div>
          <label className="lbl" htmlFor="co-at">
            When (UTC)
          </label>
          <input id="co-at" className="inp" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
        <div>
          <label className="lbl" htmlFor="co-spent">
            Already spent this period ($)
          </label>
          <input id="co-spent" className="inp" type="number" min={0} value={spent} onChange={(e) => setSpent(Math.max(0, Number(e.target.value)))} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={versionApproved} onChange={(e) => setVersionApproved(e.target.checked)} data-testid="co-version" /> Version approved
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={approvedOrder} onChange={(e) => setApprovedOrder(e.target.checked)} /> You approved this order
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={paused} onChange={(e) => setPausedS(e.target.checked)} /> Book paused
        </label>
      </div>
      <div className="mt-4 rounded bg-[var(--bg)] p-4 text-[14px]">
        {names.length === 0 ? (
          <p>Every rule passes: the agent may record this order.</p>
        ) : (
          <ul className="grid gap-1">
            {names.map((n) => (
              <li key={n}>
                <span className="text-[var(--bad)]">{BIT_TEXT[n].rule}</span> · {BIT_TEXT[n].text} <span className="font-mono text-[11px] text-muted">R_{n}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 font-mono text-[11px] text-muted">reason bits = {bits} (0x{bits.toString(16)})</p>
      </div>
      {chain?.active ? <ChainCompare chain={chain} draft={draft} asset={asset} amount={Math.round(amount * USD)} at={at} siteBits={bits} /> : null}
    </section>
  );
}

function ChainCompare({ chain, draft, asset, amount, at, siteBits }: { chain: ChainCtx; draft: Rule; asset: string; amount: number; at: number; siteBits: number }) {
  const [res, setRes] = useState<{ bits: number | null; err: string | null } | null>(null);
  const run = async () => {
    setRes(null);
    try {
      setRes({ bits: await chain.checkOrder({ agent: draft.agent, asset, amount, at }), err: null });
    } catch (e) {
      setRes({ bits: null, err: e instanceof Error ? e.message : "Read failed." });
    }
  };
  return (
    <div className="mt-4 rounded border border-[var(--line)] p-4 text-[14px]">
      <p>
        Ask the contract: <span className="font-mono">checkOrder</span> on rule book #{chain.active!.bookId}, version {chain.active!.version} (state as it is on chain now: spent, pause, approvals).
      </p>
      <button type="button" className="btn sm mt-3" onClick={run} data-testid="chain-check">
        Check on chain
      </button>
      {res ? (
        <p className="mt-3" data-testid="chain-check-result">
          {res.err ? (
            <span className="text-[var(--bad)]">{res.err}</span>
          ) : (
            <>
              Contract bits {res.bits} {res.bits === 0 ? "(accepted)" : `(${bitNames(res.bits!).join(", ")})`}; this page&apos;s practice state answered {siteBits}. They differ when the on-chain
              book has spending, pauses or approvals the form above does not.
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ 4 approve (practice)

function PracticeApprove({ draft, book, setBook, now, assets }: { draft: Rule | null; book: PracticeBook; setBook: (b: PracticeBook) => void; now: number; assets: Assets }) {
  const active = activeVersion(book);
  const latest = book.versions[book.versions.length - 1] ?? null;
  const base = active ?? latest;
  const problems = draft ? ruleProblems(draft, now) : [];
  // the same rules as the last version, ignoring the start minute
  const same = (a: Rule, b: Rule) => ruleHash({ ...a, validFrom: 0 }) === ruleHash({ ...b, validFrom: 0 });
  const pending = book.versions.filter((v) => v.status === "proposed");
  const unchanged = !!(draft && book.versions.some((v) => (v.status === "proposed" || v.status === "active") && same(v.rule, draft)));
  const changes = draft ? diffRules(base?.rule ?? null, draft) : [];
  const [error, setError] = useState<string | null>(null);
  const stamp = () => Math.floor(Date.now() / 1000);
  void assets;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <div className="grid grid-cols-1 content-start gap-6">
        <section className="panel" aria-labelledby="p-t">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="p-t" className="h4">
              {base ? `Draft vs version ${base.n}` : "First version"}
            </h2>
            {book.revoked ? <span className="status no">Revoked</span> : book.paused ? <span className="status wait">Paused</span> : active ? <span className="status ok">Version {active.n} active</span> : <span className="status off">Nothing approved yet</span>}
          </div>
          {!draft ? (
            <p className="mt-4 text-muted">Finish step 1 to have a draft.</p>
          ) : (
            <>
              <div className="scroll-x mt-4">
                <table className="tbl" data-testid="diff">
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th>{base ? `Version ${base.n}` : "Before"}</th>
                      <th>Draft</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-muted">
                          No line differs from version {base?.n}.
                        </td>
                      </tr>
                    ) : (
                      changes.map((c) => (
                        <tr key={c.key}>
                          <td className="text-muted">{c.label}</td>
                          <td className="diff-old">{c.before}</td>
                          <td className="diff-new">{c.after}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {problems.length ? <p className="note warn mt-4">Fix {problems.length} problem(s) in step 2 first.</p> : null}
              <button
                type="button"
                className="btn brand mt-5"
                disabled={book.revoked || problems.length > 0 || unchanged}
                onClick={() => {
                  setBook(propose(book, { ...draft, validFrom: stamp() }, stamp()));
                  setError(null);
                }}
                data-testid="propose"
              >
                Propose as version {book.versions.length + 1}
              </button>
              {unchanged ? <p className="mt-2 text-[13px] text-muted">This draft is already a proposed or active version.</p> : null}
            </>
          )}
        </section>
        {pending.map((v) => (
          <section key={v.n} className="panel" aria-label={`Version ${v.n}`} data-testid={`pending-${v.n}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="h4">Version {v.n} · proposed</h2>
              <span className="text-[13px] text-muted">{v.parent ? `from version ${v.parent}` : "first version"} · {v.changes.length} line(s) changed</span>
            </div>
            <pre className="codebox mt-4">{v.text}</pre>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted">
              You are approving hash <CopyChip value={v.hash} head={10} tail={6} />
            </p>
            {error ? <p className="rq-alert mt-3">{error}</p> : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className="btn brand"
                disabled={book.revoked}
                onClick={() => {
                  const r = approve(book, v.n, v.hash, stamp());
                  setError(r.error);
                  if (!r.error) setBook(r.book);
                }}
                data-testid={`approve-${v.n}`}
              >
                Approve version {v.n}
              </button>
              <button type="button" className="btn line" onClick={() => setBook(withdraw(book, v.n, stamp()))}>
                Withdraw
              </button>
            </div>
          </section>
        ))}
        <section className="panel" aria-labelledby="ctl-t">
          <h2 id="ctl-t" className="h4">
            Pause and revoke
          </h2>
          <p className="mt-2 text-[14px] text-muted">Pause refuses every order from the next one on; revoke is permanent. On chain both take effect in the same block.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="btn line" disabled={book.revoked} onClick={() => setBook(setPaused(book, !book.paused, stamp()))} data-testid="pause">
              {book.paused ? "Unpause" : "Pause"}
            </button>
            <button type="button" className="btn bad" disabled={book.revoked} onClick={() => setBook(revoke(book, stamp()))}>
              Revoke
            </button>
            <button type="button" className="btn ghost" onClick={() => setBook(emptyBook())}>
              Start a new practice book
            </button>
          </div>
        </section>
      </div>
      <div className="grid grid-cols-1 content-start gap-6">
        <section className="panel" aria-labelledby="v-t">
          <h2 id="v-t" className="h4">
            Versions
          </h2>
          {book.versions.length === 0 ? <p className="mt-3 text-muted">No versions yet.</p> : null}
          <ol className="timeline mt-4" data-testid="versions">
            {[...book.versions].reverse().map((v) => (
              <li key={v.n} className={v.status === "active" ? "on" : ""}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="serif text-[20px]">Version {v.n}</span>
                  <span className={`status ${v.status === "active" ? "ok" : v.status === "proposed" ? "wait" : "off"}`}>{v.status}</span>
                </div>
                <p className="text-[13px] text-muted">
                  {v.rule.assetSymbol} · {usd(v.rule.maxPerOrder)} per order · {usd(v.rule.maxPerPeriod)} {PERIODS.find((p) => p.value === v.rule.period)?.per} · {v.hash.slice(0, 10)}…
                </p>
              </li>
            ))}
          </ol>
        </section>
        <section className="panel" aria-labelledby="log-t">
          <div className="flex items-center justify-between gap-2">
            <h2 id="log-t" className="h4">
              Change log
            </h2>
            <Link className="ul text-[13px] text-muted" href="/dashboard">
              Dashboard
            </Link>
          </div>
          <ul className="mt-4 grid gap-2 text-[14px]" data-testid="log">
            {book.log.length === 0 ? <li className="text-muted">Nothing yet.</li> : null}
            {book.log.slice(0, 12).map((l, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-[110px] shrink-0 font-mono text-[11px] text-muted">{dateText(l.at).slice(5, 16)}</span>
                <span>{l.text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
