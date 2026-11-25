"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CHAIN, explorerTx } from "@/config/brand";
import { CONTRACT_NAME, bookLive } from "@/config/contracts";
import { storageKey } from "@/config/storage";
import { useLocalStore } from "@/components/wallet/useLocalStore";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { LiveBadge, StatusBadge } from "@/components/site/PageHead";
import { loadBook, type PracticeBook } from "@/lib/rules/book";
import { PERIODS, dateText, usd } from "@/lib/rules/engine";
import { statusWord } from "@/lib/rules/chain";
import { useJson } from "@/lib/useJson";
import type { BooksAnswer } from "@/lib/server/books";
import { useAssets } from "./useAssets";
import { ContractLive } from "./ContractLive";

/* Dashboard: versions timeline, approvals and scenario results for the practice book (this browser) and, with a wallet, the rule
   books on chain rebuilt from LotiqRuleBook's events. */
export function Dashboard() {
  const [raw] = useLocalStore<PracticeBook | null>(storageKey("lq", "book"), null);
  const book = useMemo(() => loadBook(raw ? JSON.stringify(raw) : null), [raw]);
  const approvals = book.log.filter((l) => l.kind === "approved" || l.kind === "order-approved" || l.kind === "paused" || l.kind === "unpaused" || l.kind === "revoked");
  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="panel" aria-labelledby="dv-t">
          <div className="flex items-center justify-between gap-2">
            <h2 id="dv-t" className="h4">
              Versions
            </h2>
            <span className="text-[12px] text-muted">practice book</span>
          </div>
          {book.versions.length === 0 ? (
            <p className="mt-3 text-muted">
              No versions yet. <Link className="ul" href="/studio">Open the studio</Link>.
            </p>
          ) : null}
          <ol className="timeline mt-4" data-testid="dash-versions">
            {[...book.versions].reverse().map((v) => (
              <li key={v.n} className={v.status === "active" ? "on" : ""}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="serif text-[20px]">Version {v.n}</span>
                  <span className={`status ${v.status === "active" ? "ok" : v.status === "proposed" ? "wait" : "off"}`}>{v.status}</span>
                </div>
                <p className="text-[13px] text-muted">
                  {v.rule.assetSymbol} · {usd(v.rule.maxPerOrder)} per order · {usd(v.rule.maxPerPeriod)} {PERIODS.find((p) => p.value === v.rule.period)?.per}
                </p>
                {v.changes.length && v.parent ? (
                  <ul className="mt-1 text-[12px]">
                    {v.changes.map((c) => (
                      <li key={c.key}>
                        {c.label}: <span className="diff-old">{c.before}</span> → <span className="diff-new">{c.after}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
        <section className="panel" aria-labelledby="da-t">
          <h2 id="da-t" className="h4">
            Approvals and controls
          </h2>
          <ul className="mt-4 grid gap-2 text-[14px]">
            {approvals.length === 0 ? <li className="text-muted">None yet.</li> : null}
            {approvals.slice(0, 15).map((l, i) => (
              <li key={i}>
                <span className="block font-mono text-[11px] text-muted">{dateText(l.at)}</span>
                {l.text}
              </li>
            ))}
          </ul>
        </section>
        <section className="panel" aria-labelledby="ds-t">
          <h2 id="ds-t" className="h4">
            Scenario results
          </h2>
          <ul className="mt-4 grid gap-3 text-[14px]" data-testid="dash-runs">
            {book.runs.length === 0 ? <li className="text-muted">No saved runs. Save one from the scenario lab.</li> : null}
            {book.runs.slice(0, 8).map((r, i) => (
              <li key={i} className="rounded bg-[var(--bg)] p-3">
                <div className="flex justify-between gap-2">
                  <span>{r.version ? `Version ${r.version}` : "Draft"}</span>
                  <span className={`status ${r.passed === r.total ? "ok" : "wait"}`}>
                    {r.passed}/{r.total} as expected
                  </span>
                </div>
                <span className="mt-1 block font-mono text-[11px] text-muted">{dateText(r.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section className="panel" aria-labelledby="dl-t">
        <h2 id="dl-t" className="h4">
          Change log
        </h2>
        <ul className="mt-4 grid gap-2 text-[14px]" data-testid="dash-log">
          {book.log.length === 0 ? <li className="text-muted">Nothing yet.</li> : null}
          {book.log.slice(0, 40).map((l, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-[150px] shrink-0 font-mono text-[11px] text-muted">{dateText(l.at)}</span>
              <span className="min-w-0">{l.text}</span>
            </li>
          ))}
        </ul>
      </section>
      <ChainHistory />
    </div>
  );
}

function ChainHistory() {
  const wallet = useWallet();
  const { open } = useWalletModal();
  const assets = useAssets();
  const live = bookLive();
  const { data, error } = useJson<BooksAnswer>(live && wallet.address ? `/api/books?owner=${wallet.address}` : null, 30_000);
  const sym = (a: string) => assets.list.find((k) => k.address.toLowerCase() === a.toLowerCase())?.symbol ?? a.slice(0, 8);
  return (
    <section className="panel" aria-labelledby="dc-t">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="dc-t" className="h4">
          On {CHAIN.name}
        </h2>
        {live ? <LiveBadge /> : <StatusBadge status="Prototype" />}
      </div>
      {live ? (
        <div className="mt-4">
          <ContractLive />
        </div>
      ) : null}
      {!live ? (
        <p className="mt-3 text-muted">{CONTRACT_NAME} is not deployed yet; on-chain books appear here once it is.</p>
      ) : !wallet.address ? (
        <button type="button" className="btn mt-4" onClick={open}>
          Connect a wallet to see its rule books
        </button>
      ) : error ? (
        <p className="rq-alert mt-3">{error}</p>
      ) : !data ? (
        <p className="mt-3 text-muted">Reading…</p>
      ) : data.books.length === 0 ? (
        <p className="mt-3 text-muted">This wallet owns no rule book.</p>
      ) : (
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          {data.books.map((b) => (
            <div key={b.id} className="panel inset">
              <p className="text-[17px] font-medium">
                #{b.id} {b.label} {b.revoked ? <span className="status no">revoked</span> : b.paused ? <span className="status wait">paused</span> : null}
              </p>
              <ol className="timeline mt-3">
                {[...b.versions].reverse().map((v) => (
                  <li key={v.n} className={v.status === 2 ? "on" : ""}>
                    Version {v.n} · {statusWord(v.status)} · {sym(v.asset)} · {usd(Number(v.maxPerOrder))} / {usd(Number(v.maxPerPeriod))}
                  </li>
                ))}
              </ol>
              <ul className="mt-2 grid gap-1 text-[13px]">
                {data.events
                  .filter((e) => e.bookId === b.id)
                  .slice(0, 12)
                  .map((e) => (
                    <li key={`${e.tx}-${e.logIndex}`} className="flex justify-between gap-2">
                      <span>
                        {e.name}
                        {e.name === "OrderRecorded" ? ` ${usd(Number(e.args.amount))}` : ""}
                      </span>
                      <a className="ul font-mono text-[11px] text-muted" href={explorerTx(e.tx)} target="_blank" rel="noreferrer">
                        {e.block.toLocaleString("en-US")}
                      </a>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
