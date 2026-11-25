"use client";

import { useEffect, useState } from "react";
import { explorerAddress, explorerTx } from "@/config/brand";
import { CONTRACTS, CONTRACT_NAME, bookLive } from "@/config/contracts";
import { BOOK_ABI } from "@/lib/abi";
import { read, rpcCall } from "@/lib/client";
import { LiveBadge } from "@/components/site/PageHead";

/* The live rule book: address, creation tx, source-verified link, and counters read from chain now (rule books opened, head block). */
export function ContractLive() {
  const [v, setV] = useState<{ books: number; block: number; code: boolean } | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!bookLive()) return;
    let dead = false;
    (async () => {
      try {
        const [books, block, code] = await Promise.all([
          read<bigint>({ to: CONTRACTS.book, abi: BOOK_ABI, fn: "bookCount" }),
          rpcCall<string>("eth_blockNumber", []),
          rpcCall<string>("eth_getCode", [CONTRACTS.book, "latest"]),
        ]);
        if (!dead) setV({ books: Number(books), block: Number(BigInt(block)), code: code.length > 2 });
      } catch {
        if (!dead) setErr(true);
      }
    })();
    return () => {
      dead = true;
    };
  }, []);
  if (!bookLive()) return null;
  return (
    <div className="rounded bg-[var(--bg)] p-4 text-[14px]" data-testid="contract-live">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{CONTRACT_NAME} on Robinhood Chain</span>
        <LiveBadge />
      </div>
      <p className="mt-2 break-all font-mono text-[12.5px]">
        <a className="ul" href={`${explorerAddress(CONTRACTS.book)}?tab=contract`} target="_blank" rel="noreferrer">
          {CONTRACTS.book}
        </a>
      </p>
      <p className="mt-2 text-muted">
        Deployed in block {CONTRACTS.block.toLocaleString("en-US")} (
        <a className="ul" href={explorerTx(CONTRACTS.tx)} target="_blank" rel="noreferrer">
          creation tx
        </a>
        ), source verified on the explorer.{" "}
        {err ? "Counters could not be read right now." : v ? `${v.books} rule book${v.books === 1 ? "" : "s"} opened so far, read at block ${v.block.toLocaleString("en-US")}.` : "Reading counters…"}
      </p>
    </div>
  );
}
