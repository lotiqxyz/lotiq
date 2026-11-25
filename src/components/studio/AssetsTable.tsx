"use client";

import { useState } from "react";
import { CHAIN, explorerAddress } from "@/config/brand";
import { LiveBadge } from "@/components/site/PageHead";
import { ago } from "@/lib/format";
import { useAssets, priceOf } from "./useAssets";

/* Every supported stock token with its live proof and its Chainlink feeds. */
export function AssetsTable() {
  const a = useAssets();
  const [q, setQ] = useState("");
  const stocks = (a.board?.stocks ?? []).filter((s) => !q || s.symbol.toLowerCase().includes(q.toLowerCase()) || s.name.toLowerCase().includes(q.toLowerCase()));
  const withFeed = a.board?.stocks.filter((s) => s.feeds.some((f) => f.answer)).length ?? 0;
  return (
    <section className="panel" aria-labelledby="as-t">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="as-t" className="h4">
          {a.board ? `${a.board.stocks.length} proven stock tokens, ${withFeed} with a Chainlink price` : a.error ? "The live list did not answer" : "Reading the chain…"}
        </h2>
        <div className="flex items-center gap-3">
          {a.board ? <LiveBadge /> : null}
          <input className="inp w-[200px]" placeholder="Search ticker or name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        </div>
      </div>
      {a.board ? (
        <p className="mt-2 text-[13px] text-muted">
          Read {new Date(a.board.readAt).toISOString().replace("T", " ").slice(0, 19)} UTC at block {a.board.head?.toLocaleString("en-US") ?? "—"}; {a.board.candidates} candidates checked
          {a.board.unknown ? `, ${a.board.unknown} could not be read this time (not listed)` : ""}. {a.board.complete ? "Complete read." : "Some reads failed; missing values show as —."}
        </p>
      ) : null}
      {a.error && !a.board ? <p className="rq-alert mt-3">{a.error}</p> : null}
      <div className="scroll-x mt-4">
        <table className="tbl" data-testid="assets-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Address</th>
              <th>Proof</th>
              <th>Chainlink price</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {stocks.map((s) => {
              const p = priceOf(s);
              return (
                <tr key={s.address}>
                  <td>
                    <span className="font-medium">{s.symbol}</span>
                    <span className="block text-[12px] text-muted">{s.name}</span>
                  </td>
                  <td>
                    <a className="ul font-mono text-[12px]" href={explorerAddress(s.address)} target="_blank" rel="noreferrer">
                      {s.address.slice(0, 10)}…{s.address.slice(-6)}
                    </a>
                  </td>
                  <td>
                    <span className="status ok">code · beacon · supply</span>
                  </td>
                  <td className="font-mono">{p ? `$${p.usd.toFixed(2)}` : <span className="text-muted">no feed</span>}</td>
                  <td className={`text-[12px] ${p?.stale ? "text-[var(--warn)]" : "text-muted"}`}>{p?.updatedAt ? ago(p.updatedAt) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[13px] text-muted">
        Prices are Chainlink data feeds on {CHAIN.name}; the standard stock feeds follow US market hours and go stale at weekends (amber = older than
        the feed&apos;s heartbeat). A price is shown for orientation: Lotiq&apos;s limits are written in US dollars.
      </p>
    </section>
  );
}
