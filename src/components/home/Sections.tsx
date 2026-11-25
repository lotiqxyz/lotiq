import Link from "next/link";
import { BRAND, CHAIN, TOKEN } from "@/config/brand";
import { CONTRACT_NAME } from "@/config/contracts";
import { CharFade } from "@/components/site/Motion";
import { StatusBadge } from "@/components/site/PageHead";
import { TEMPLATES } from "@/lib/rules/templates";
import { BITS, BIT_TEXT, ALL_BITS } from "@/lib/rules/bits";
import { CheckIcon } from "@/components/site/Icons";

/* Home sections after the hero, in the UI reference's order (referensi/recon-ui/NOTES.txt "LOTIQ MAPPING"). */

const d = (ms: number) => ({ "--delay": `${ms}ms` }) as React.CSSProperties;

// ------------------------------------------------------------------ 1. sticky stack of the four MVP steps

const STEPS = [
  {
    n: 1,
    chip: "f-lime",
    field: "f-lime",
    title: "Write the strategy",
    body: "Type it the way you would say it: an asset, an amount, a schedule, a ceiling. The parser reads it with fixed rules, not a language model, and asks a question whenever a word could mean two things.",
    win: [
      ["Strategy", "Buy about $50 of NVDA weekly at 3pm"],
      ["Question", "You wrote “about $50”. Use exactly $50?"],
      ["Question", "Weekly on which day?"],
      ["Question", "Was 15:00 meant in UTC?"],
    ],
  },
  {
    n: 2,
    chip: "f-pink",
    field: "f-pink",
    title: "Check the rules",
    body: "Every line of the rule set with where it came from: written by you, derived, a default, or your answer. The asset shows its on-chain identity proof; limits that cannot work together are flagged before anyone signs.",
    win: [
      ["Asset", "NVDA · proxy code ✓ · beacon ✓ · supply ✓"],
      ["Max per order", "$50 (derived from the order amount)"],
      ["Max per period", "$120 per week (written)"],
      ["Your approval", "needed above $40 (written)"],
    ],
  },
  {
    n: 3,
    chip: "f-blue",
    field: "f-blue",
    title: "Run the scenario lab",
    body: "Test orders run against the exact rules: under the limit, over it, the wrong asset, off schedule, not yet approved. Each one is accepted or refused, with the rule that fired and the numbers behind it.",
    win: [
      ["Under the limit", "Accepted"],
      ["Over the limit per order", "Refused · Max per order"],
      ["Wrong asset", "Refused · Asset"],
      ["Rules not approved yet", "Refused · Approval"],
    ],
  },
  {
    n: 4,
    chip: "f-orange",
    field: "f-orange",
    title: "Review and approve a version",
    body: "Each change is a new version with a line-by-line diff against the last one. You approve that exact version, by number and hash, on Robinhood Chain. Nothing changes for the agent until you do.",
    win: [
      ["Version 2", "proposed from version 1"],
      ["Max per period", "$120 → $150"],
      ["Hash", "0x6f1c…a90e"],
      ["Approve", "version 2, this hash"],
    ],
  },
] as const;

export function Steps() {
  return (
    <section id="how" className="pt-28 md:pt-40" aria-labelledby="how-t">
      <div className="wrap">
        <h2 id="how-t" className="d2 max-w-[1000px]" data-reveal="">
          A strategy in your head is not a rule.
          <br />
          <CharFade className="lime" text="Lotiq writes it down, line by line." />
        </h2>
        <div className="stack mt-16 md:mt-24">
          {STEPS.map((s) => (
            <article key={s.n} className={`stack-card card mx-auto grid gap-6 p-6 md:grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)] md:gap-10 md:p-8 ${s.n === 4 ? "max-w-[1248px]" : "max-w-[1000px]"}`} data-testid={`step-${s.n}`}>
              <div className="flex min-w-0 flex-col">
                <span className={`num-chip ${s.chip}`}>{s.n}</span>
                <h3 className="h3 mt-6">{s.title}</h3>
                <p className="mt-6 text-muted md:mt-auto">{s.body}</p>
              </div>
              <div className={`field ${s.field} grid min-h-[300px] place-items-center p-5 md:min-h-[400px] md:p-10`}>
                <div className="win w-full max-w-[520px]">
                  <div className="win-h">
                    <span className="h-2 w-2 rounded-full bg-[var(--lime)]" />
                    Step {s.n}
                    <span className="badge-sample ml-auto">Sample data</span>
                  </div>
                  {s.win.map(([k, v]) => (
                    <div key={k + v} className="win-row">
                      <span className="text-muted">{k}</span>
                      <span className="text-right">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ 2. three cards: versions / approvals / change log

export function Records() {
  const cards = [
    { title: "Versions", field: "f-lime", body: "Every edit is a new version that points to its parent. Old versions are superseded, never rewritten, so you can always see what the agent was allowed to do on a given day." },
    { title: "Approvals", field: "f-pink", body: "Approving binds the version's agent and replaces the previous version in the same block. Orders above your threshold also wait for an approval of that one order." },
    { title: "Change log", field: "f-orange", body: "Proposals, approvals, withdrawals, pauses, scenario runs and recorded orders, newest first. On chain, the log is rebuilt from the contract's events by anyone." },
  ];
  return (
    <section className="pt-28 md:pt-40" aria-labelledby="rec-t">
      <div className="wrap">
        <h2 id="rec-t" className="d2" data-reveal="">
          Every rule set,
          <br />
          <CharFade className="lime" text="versioned and on the record" />
        </h2>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {cards.map((c, i) => (
            <article key={c.title} className="card p-6 md:p-8" data-reveal="" style={d(i * 90)}>
              <div className={`field ${c.field} relative grid aspect-[4/3] place-items-center p-5`}>
                <span className="badge-sample absolute left-3 top-3">Sample data</span>
                <RecordArt kind={c.title} />
              </div>
              <h3 className="h3 mt-8">{c.title}</h3>
              <p className="mt-6 text-muted">{c.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function RecordArt({ kind }: { kind: string }) {
  if (kind === "Versions")
    return (
      <div className="win w-[78%]">
        {[
          ["v3", "proposed", "wait"],
          ["v2", "active", "ok"],
          ["v1", "superseded", "off"],
        ].map(([v, s, c]) => (
          <div key={v} className="win-row">
            <span className="serif text-[17px]">Version {v.slice(1)}</span>
            <span className={`status ${c}`}>{s}</span>
          </div>
        ))}
      </div>
    );
  if (kind === "Approvals")
    return (
      <div className="win w-[80%]">
        <div className="win-h">Approve version 2</div>
        <div className="win-row">
          <span className="text-muted">hash</span>
          <span className="font-mono">0x6f1c…a90e</span>
        </div>
        <div className="win-row">
          <span className="text-muted">agent</span>
          <span className="font-mono">0x7a3e…41b0</span>
        </div>
        <div className="win-row">
          <span className="text-muted">order #7, $45</span>
          <span className="status ok">approved</span>
        </div>
      </div>
    );
  return (
    <div className="win w-[82%] font-mono text-[11px]">
      {["approved v2 · superseded v1", "scenario lab: 8 of 8 as expected", "paused by owner", "order #7 recorded · $45"].map((l, i) => (
        <div key={l} className="win-row">
          <span className="text-muted">{String(9 - i).padStart(2, "0")}</span>
          <span className="text-right">{l}</span>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ 3. templates (folder tiles)

export function Templates() {
  return (
    <section className="pt-28 md:pt-40" aria-labelledby="tpl-t">
      <div className="wrap">
        <h2 id="tpl-t" className="d2 max-w-[900px]" data-reveal="">
          Start from a template
          <br />
          and make it <span className="grad">your own rule set.</span>
        </h2>
        <ul className="mt-14 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4 lg:grid-cols-8" data-fan-row="">
          {TEMPLATES.map((t) => (
            <li key={t.id}>
              <Link href={`/studio?t=${t.id}`} className="tpl block" data-testid={`tpl-${t.id}`}>
                <span className={`folder ${t.color} grid place-items-end p-2.5`} data-fan="">
                  <span className="text-[22px] font-medium leading-none">{t.title.split(" ").pop()}</span>
                </span>
                <span className="mt-3 block text-[15px] text-muted">{t.title}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-8 max-w-[640px] text-[14px] text-muted" data-reveal="">
          Templates are plain text that goes through the same parser as anything you type. Two of them are written to trigger questions, so you
          can see what the parser refuses to guess.
        </p>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ 4. alternating rows: on chain / reason codes

export function OnChain() {
  const fields = [
    ["ruleHash", "keccak256(canonical rule text)"],
    ["agent", "0x… bound on approval"],
    ["asset", "proven stock token"],
    ["maxPerOrder", "uint128, USD 6 dec"],
    ["maxPerPeriod", "uint128, 1 / 7 / 30 days"],
    ["approvalAbove", "uint128"],
    ["days_, startHour, endHour", "UTC schedule"],
    ["validFrom, validUntil", "≤ 730 days"],
  ];
  return (
    <section className="pt-28 md:pt-40" aria-labelledby="oc-t">
      <div className="wrap">
        <h2 id="oc-t" className="d2 max-w-[1000px]" data-reveal="">
          Rules people can read,
          <br />
          <CharFade className="lime" text="limits the chain can enforce." />
        </h2>
        <div className="mt-14 grid items-center gap-8 md:grid-cols-2 md:gap-16" data-reveal="">
          <div className="field f-lime p-5 md:p-12">
            <div className="win">
              <div className="win-h">
                {CONTRACT_NAME}.RuleVersion
                <span className="ml-auto">
                  <StatusBadge status="Prototype" />
                </span>
              </div>
              {fields.map(([k, v]) => (
                <div key={k} className="win-row font-mono text-[11.5px]">
                  <span className="text-[var(--lime)]">{k}</span>
                  <span className="text-right text-muted">{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="h3">One commitment per version</h3>
            <p className="mt-5 text-[17px] leading-relaxed text-muted">
              The contract stores the hash of the exact text you reviewed plus the limits as plain numbers. You approve version N only if its hash
              matches; the approved version binds the agent. Pause and revoke apply from the next call, in the same block. The contract holds no
              funds and moves no tokens: the agent&apos;s orders are journal entries counted against your limits.
            </p>
          </div>
        </div>
        <div className="mt-20 grid items-center gap-8 md:grid-cols-2 md:gap-16" data-reveal="">
          <div className="md:order-2">
            <div className="field f-orange p-5 md:p-12">
              <div className="win">
                <div className="win-h">checkOrder → reason bits</div>
                <div className="grid grid-cols-1 sm:grid-cols-2">
                  {ALL_BITS.slice(5, 17).map((b) => (
                    <div key={b} className="win-row font-mono text-[11px]">
                      <span className="text-muted">1 &lt;&lt; {Math.log2(BITS[b])}</span>
                      <span className="text-right">{BIT_TEXT[b].rule}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="md:order-1">
            <h3 className="h3">
              Reason codes <span className="tag align-middle">NEW</span>
            </h3>
            <p className="mt-5 text-[17px] leading-relaxed text-muted">
              A refused transaction leaves no log, so the contract answers a question first: <span className="font-mono text-ink">checkOrder</span>{" "}
              returns a bitmask with one bit per rule. The studio uses the same 17 bits, and a unit test reads the Solidity file so the two can never
              drift apart.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ 5. plans (free / gas / holder tier)

export function Plans() {
  const plans = [
    { name: "Practice", who: "No wallet, in your browser", small: "Prototype", price: "Free", cta: { href: "/studio", label: "Open the studio", cls: "brand" }, badge: "Prototype" as const },
    { name: "On chain", who: `Rule books on ${CHAIN.name}`, small: "You pay network gas only", price: "Gas (ETH)", cta: { href: "/studio?mode=chain", label: "Use on chain", cls: "brand" }, badge: "Prototype" as const },
    { name: "Holder tier", who: `Hold 0.1 % of ${BRAND.symbol} supply`, small: TOKEN.isLive ? "Larger hosted quotas, read on chain" : "Larger hosted quotas; unlocks at launch", price: "0.1 %", cta: { href: "/token", label: "Token features", cls: "" }, badge: "Prototype" as const },
  ];
  const incl = [
    ["Deterministic strategy parser", "Prototype"],
    ["Clarification questions", "Prototype"],
    ["On-chain asset identity proof", "Prototype"],
    ["Scenario lab with reason codes", "Prototype"],
    ["Versioned rule sets + diffs", "Prototype"],
    ["Approve exact version on chain", "Prototype"],
    ["Order journal (no tokens move)", "Prototype"],
    ["Free alerts: bell + browser notifications", "Prototype"],
    ["Hosted rule books + server runs (larger for holders)", "Prototype"],
    ["Executing trades through a router", "Concept"],
  ] as const;
  return (
    <section id="plans" className="pt-28 md:pt-40" aria-labelledby="plans-t">
      <div className="wrap">
        <h2 id="plans-t" className="d2" data-reveal="">
          Free to use, <span className="lime">more for holders.</span>
        </h2>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {plans.map((p, i) => (
            <div key={p.name} className="ticket" data-reveal="" style={d(i * 90)}>
              <div className="top">
                <div className="flex items-start justify-between gap-3">
                  <p className="h4">
                    {p.name}
                    <span className="block text-muted">{p.who}</span>
                  </p>
                  <StatusBadge status={p.badge} />
                </div>
                <p className="mt-4 text-[14px] text-muted">{p.small}</p>
                <p className="d3 mt-10">{p.price}</p>
              </div>
              <div className="bot">
                <Link href={p.cta.href} className={`btn w-full ${p.cta.cls}`}>
                  {p.cta.label}
                </Link>
              </div>
            </div>
          ))}
        </div>
        <div className="card mt-6 p-6 md:p-12" data-reveal="">
          <h3 className="h4">Everything included</h3>
          <ul className="mt-8 grid gap-x-10 gap-y-4 md:grid-cols-2">
            {incl.map(([t, s]) => (
              <li key={t} className="flex items-center gap-3">
                <CheckIcon size={16} />
                <span>{t}</span>
                <StatusBadge status={s} />
              </li>
            ))}
          </ul>
          <p className="mt-8 text-[14px] text-muted">
            The core never needs {BRAND.symbol}; holding 0.1 % of its supply only raises the hosted quotas.{TOKEN.isLive ? <> Contract address: <span className="break-all">{BRAND.ca}</span>, the only one.</> : " Contract address: TBA until launch (launchpad TBA)."} Nothing here is a promise of value.
          </p>
        </div>
      </div>
    </section>
  );
}
