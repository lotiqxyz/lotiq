import { BRAND, isAddress } from "@/config/brand";

/*
 * Lotiq's own contract on Robinhood Chain (chain 4663), deployed by the owner on 25 Nov 2026 (block 122889425, 2,509,096 gas).
 * Check it yourself: `npm run verify-deployment -- --book <address> --book-tx <tx>` (values below) prints MATCH.
 *   book  LotiqRuleBook (+ internal library LotiqRuleMath, inlined, nothing to link): rule books with versioned rule sets
 *         (hash + key limits), owner approval of an exact version, agent bound to the approved version, checkOrder reason bits,
 *         an order journal (recordOrder) that counts limits but moves no tokens, pause / halt / revoke. No admin, no fee, no upgrade.
 */
const DEPLOYED = {
  book: "0xe32009d97332710696bae0a2b0420759aff18288",
  /** Block of the deployment transaction (log scans start here). */
  block: 122889425,
  /** Creation transaction. */
  tx: "0xd1d6022fbd207b07f0fd62ae117919ed87da2061d65e3645822de753d302af00",
  /** Local tests only (override): a test ERC-20 standing in for $LOTIQ. Empty in production, where BRAND.ca is used. */
  token: "",
};

/**
 * Local tests only: NEXT_PUBLIC_LOTIQ_TEST_CONTRACTS='{"book":"0x…","block":1}' at build time points a second build at a contract on an
 * anvil chain. Never set it on Vercel.
 */
function testOverride(): typeof DEPLOYED | null {
  const raw = process.env.NEXT_PUBLIC_LOTIQ_TEST_CONTRACTS;
  if (!raw) return null;
  try {
    const v = { ...DEPLOYED, ...(JSON.parse(raw) as Partial<typeof DEPLOYED>) };
    return isAddress(v.book) ? v : null;
  } catch {
    return null;
  }
}

export const CONTRACTS = testOverride() ?? DEPLOYED;
export const bookLive = () => isAddress(CONTRACTS.book);
export const CONTRACT_NAME = "LotiqRuleBook" as const;

/** The token the holder tier reads: the test token under the local override, else $LOTIQ's CA once it exists. */
export function holderToken(): string | null {
  if (isAddress(CONTRACTS.token)) return CONTRACTS.token;
  return isAddress(BRAND.ca) ? BRAND.ca : null;
}

/**
 * Robinhood Chain Testnet, proven from this machine on 25 Nov 2026 (eth_chainId 0xb626 = 46630 through the official RPC host, block
 * 157.7 M; Blockscout explorer answering /api/v2/stats). The rule book has no chain-specific code, so a trial copy could be deployed
 * there with the same artifacts. The studio itself works against mainnet, where stock-token identity can be proven (the testnet has many unofficial
 * "TSLA" test tokens and no proven list).
 */
export const TESTNET = {
  id: 46630,
  hex: "0xb626",
  name: "Robinhood Chain Testnet",
  rpc: "https://rpc.testnet.chain.robinhood.com",
  explorer: "https://explorer.testnet.chain.robinhood.com",
} as const;
