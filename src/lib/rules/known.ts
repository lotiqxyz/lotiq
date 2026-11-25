import TOKENS from "@/lib/fixtures/stock-tokens.json";
import type { Known } from "./parse";

/*
 * Where to look for supported assets before the live board answers: Robinhood stock tokens proven on 23 Nov 2026 (proxy code hash +
 * beacon slot + minted supply; see /method). The site re-proves every token live (/api/assets) and the studio says which list it is
 * using. A ticker alone is never identity: the parser only accepts symbols from this list, and the address comes with it.
 */
type Raw = { a: string; s: string; n: string; proven: boolean };
export const FIXTURE_KNOWN: Known[] = (TOKENS.tokens as Raw[])
  .filter((t) => t.proven)
  .map((t) => ({ symbol: t.s, name: t.n, address: t.a }))
  .sort((a, b) => a.symbol.localeCompare(b.symbol));
export const FIXTURE_DATE = "2026-11-23";
