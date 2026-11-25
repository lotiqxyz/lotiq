"use client";

import { useMemo } from "react";
import { useJson } from "@/lib/useJson";
import { FIXTURE_KNOWN } from "@/lib/rules/known";
import type { Known } from "@/lib/rules/parse";
import type { Board, Stock } from "@/lib/server/stocks";

/** Supported assets: the live, re-proven board when it answered, else the 23 Nov proven list (labelled as such). */
export function useAssets() {
  const { data, error, loading } = useJson<Board>("/api/assets", 120_000);
  return useMemo(() => {
    const live = !!data && data.stocks.length > 0;
    const list: Known[] = live ? data!.stocks.map((s) => ({ symbol: s.symbol, name: s.name, address: s.address })) : FIXTURE_KNOWN;
    const bySym = new Map<string, Stock>((data?.stocks ?? []).map((s) => [s.symbol, s]));
    return { list, live, board: data, bySym, error, loading };
  }, [data, error, loading]);
}

/** Latest usable Chainlink price for a stock (standard feed first), as a number of USD. */
export function priceOf(s: Stock | undefined) {
  const f = s?.feeds.find((x) => x.answer !== null);
  if (!f || !f.answer) return null;
  return { usd: Number(f.answer) / 10 ** f.decimals, updatedAt: f.updatedAt, feed: f.proxy, name: f.name, stale: f.stale };
}
