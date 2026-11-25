"use client";

import { useEffect, useState } from "react";
import { holderToken } from "@/config/contracts";
import { rpcCall } from "@/lib/client";
import { holderThreshold } from "@/lib/holder/session";

/* The live threshold: totalSupply() / 1000 read from the token on chain, or "Unlocks at launch" before the token exists. */
export function ThresholdLive() {
  const token = holderToken();
  const [v, setV] = useState<{ supply: bigint; block: number } | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!token) return;
    let dead = false;
    (async () => {
      try {
        const [supply, block] = await Promise.all([rpcCall<string>("eth_call", [{ to: token, data: "0x18160ddd" }, "latest"]), rpcCall<string>("eth_blockNumber", [])]);
        if (!dead) setV({ supply: BigInt(supply), block: Number(BigInt(block)) });
      } catch {
        if (!dead) setErr(true);
      }
    })();
    return () => {
      dead = true;
    };
  }, [token]);
  const n = (x: bigint) => (Number(x / 10n ** 12n) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return (
    <p className="mt-4 rounded bg-[var(--bg)] p-4 text-[15px]" data-testid="threshold">
      {!token ? (
        <>
          Holder threshold: <strong>Unlocks at launch</strong>. It will be 0.1 % of the total supply, read live from the token contract.
        </>
      ) : err ? (
        "The token could not be read right now."
      ) : !v ? (
        "Reading the supply from chain…"
      ) : (
        <>
          Holder threshold: <strong>{n(holderThreshold(v.supply))}</strong> of {n(v.supply)} tokens (0.1 %), read at block {v.block.toLocaleString("en-US")}.
        </>
      )}
    </p>
  );
}
