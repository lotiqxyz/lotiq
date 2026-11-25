/*
 * Hosted-service quotas: the free tier for every signed-in wallet, the holder tier for wallets holding at least 0.1 % of $LOTIQ's
 * total supply (read on chain at each request). Enforced on the server (src/lib/server/hosted.ts), shown on /token and /account.
 * Practice mode in the browser has no quota and never needs a wallet or the token.
 */
export const QUOTAS = {
  free: { books: 2, runsPerDay: 20, history: 10 },
  holder: { books: 25, runsPerDay: 300, history: 200 },
} as const;

/** Largest hosted rule book accepted (bytes of JSON). */
export const MAX_BOOK_BYTES = 64_000;
/** Holder threshold: balance >= totalSupply / HOLDER_DIVISOR (0.1 %). */
export const HOLDER_DIVISOR = 1000n;
/** Longest session a signature may grant (4 h). */
export const SESSION_MAX_SECONDS = 4 * 3600;

export type Tier = keyof typeof QUOTAS;
