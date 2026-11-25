import { isAddress } from "@/config/brand";

/*
 * Lotiq's own contract on Robinhood Chain (chain 4663). Not deployed yet: the owner deploys it from the localhost-only /deploy page and
 * pastes the address, block and transaction here. Until then the studio's on-chain mode says "contract not deployed yet" and the
 * practice mode (same rules, in the browser) is the whole demo.
 *   book  LotiqRuleBook (+ internal library LotiqRuleMath, inlined, nothing to link): rule books with versioned rule sets
 *         (hash + key limits), owner approval of an exact version, agent bound to the approved version, checkOrder reason bits,
 *         an order journal (recordOrder) that counts limits but moves no tokens, pause / halt / revoke. No admin, no fee, no upgrade.
 */
const DEPLOYED = {
  book: "TBA",
  /** Block of the deployment transaction (log scans start here). */
  block: 0,
  /** Creation transaction. */
  tx: "",
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

/**
 * Robinhood Chain Testnet, proven from this machine on 25 Nov 2026 (eth_chainId 0xb626 = 46630 through the official RPC host, block
 * 157.7 M; Blockscout explorer answering /api/v2/stats). The rule book has no chain-specific code, so the owner may deploy a trial copy
 * there from /deploy. The studio itself works against mainnet, where stock-token identity can be proven (the testnet has many unofficial
 * "TSLA" test tokens and no proven list).
 */
export const TESTNET = {
  id: 46630,
  hex: "0xb626",
  name: "Robinhood Chain Testnet",
  rpc: "https://rpc.testnet.chain.robinhood.com",
  explorer: "https://explorer.testnet.chain.robinhood.com",
} as const;
