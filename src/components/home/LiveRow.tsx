"use client";

import Link from "next/link";
import { CHAIN } from "@/config/brand";
import { useJson } from "@/lib/useJson";
import { ago } from "@/lib/format";
import type { ChainSnapshot } from "@/lib/server/snapshot";
import type { Board } from "@/lib/server/stocks";

/* Live facts under the hero, each with its source: head block + gas (RPC), proven stock tokens (on-chain proof) and three Chainlink
   prices with their update age. "—" while loading or when a read failed; nothing is filled in. */
const PICK = ["NVDA", "AAPL", "TSLA"];

export function LiveRow() {
  const chain = useJson<ChainSnapshot>("/api/chain", 30_000);
  const board = useJson<Board>("/api/assets", 120_000);
  const c = chain.data;
  const b = board.data;
  const gwei = c?.gasPriceWei ? Number(BigInt(c.gasPriceWei)) / 1e9 : null;
  const prices = PICK.map((s) => {
    const st = b?.stocks.find((x) => x.symbol === s);
    const f = st?.feeds.find((x) => x.answer !== null);
    return { s, price: f?.answer ? Number(f.answer) / 10 ** f.decimals : null, at: f?.updatedAt ?? null, stale: f?.stale ?? null };
  });
  const cell = "flex min-w-0 flex-col gap-1 px-4 py-3";
  return (
    <div className="card mx-auto mt-6 grid max-w-[1000px] grid-cols-2 text-left sm:grid-cols-3 lg:grid-cols-6" data-testid="live-row">
      <div className={cell}>
        <span className="label">Block</span>
        <span className="font-mono text-[15px]">{c?.block ? c.block.toLocaleString("en-US") : "—"}</span>
      </div>
      <div className={cell}>
        <span className="label">Gas</span>
        <span className="font-mono text-[15px]">{gwei !== null ? `${gwei < 0.01 ? gwei.toFixed(4) : gwei.toFixed(3)} gwei` : "—"}</span>
      </div>
      <Link href="/assets" className={`${cell} hover:bg-white/[0.03]`}>
        <span className="label">Proven stock tokens</span>
        <span className="font-mono text-[15px]">{b ? b.stocks.length : "—"}</span>
      </Link>
      {prices.map((p) => (
        <Link key={p.s} href="/assets" className={`${cell} hover:bg-white/[0.03]`}>
          <span className="label">{p.s} · Chainlink</span>
          <span className="font-mono text-[15px]">
            {p.price !== null ? `$${p.price.toFixed(2)}` : "—"}
            {p.at ? <span className={`ml-2 text-[11px] ${p.stale ? "text-[var(--warn)]" : "text-muted"}`}>{ago(p.at)}</span> : null}
          </span>
        </Link>
      ))}
      <p className="col-span-full border-t border-white/5 px-4 py-2 text-[11px] text-muted">
        <span className="badge-live mr-2">Live from chain</span>
        {CHAIN.name} RPC · Chainlink feeds on {CHAIN.name}. Stock feeds pause outside market hours, so an age of days is normal at weekends.
      </p>
    </div>
  );
}
