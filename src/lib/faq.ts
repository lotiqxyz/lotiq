import { BRAND } from "@/config/brand";

/* Home FAQ (also emitted as FAQPage JSON-LD). Plain answers; every limit stated where it applies. */
export const FAQ = [
  {
    q: `What exactly does ${BRAND.name} do?`,
    a: `It turns a stock-token buying strategy into a rule set an agent must follow: one asset, the weekdays and UTC hours it may act in, a maximum per order, a maximum per 1, 7 or 30 days, the orders that need your approval, a minimum gap and an end date. You test the rules with sample orders, then approve an exact version on Robinhood Chain.`,
  },
  {
    q: "Is there an AI reading my strategy?",
    a: "No. The parser is a fixed set of patterns written in the site's code. It reads amounts, tickers, weekdays, hours, limits and end dates. Anything it is not sure about becomes a question with explicit choices; it never fills a gap by guessing. Price conditions, selling and percentages of a balance are not supported in v1 and are asked about, not dropped silently.",
  },
  {
    q: "Which assets are supported?",
    a: "Robinhood stock tokens on Robinhood Chain that pass three on-chain checks: the token's code is Robinhood's beacon proxy, its beacon slot points at Robinhood's beacon, and it has minted supply. A ticker alone proves nothing: many tokens on the chain copy stock tickers. The Assets page lists every token with its proof and its Chainlink feed when one exists. Stock tokens are tokens, not the shares themselves.",
  },
  {
    q: "Does Lotiq trade for me or hold my funds?",
    a: "No. The rule book contract never holds or moves tokens or ETH. An agent records its orders against your approved version, and the contract counts them against your limits and refuses anything outside them. Executing trades through a router is a planned stage (Concept), not part of this prototype.",
  },
  {
    q: "What does approving a version mean?",
    a: "Each change to the rules is a new version: the hash of its full text plus the key limits, stored on chain. Approving version N with its hash makes it the active rule set, binds its agent and supersedes the previous version in the same transaction. Until you approve, the agent's orders are refused with the reason 'no approved version'.",
  },
  {
    q: "Do I need a wallet or the token?",
    a: `No wallet for practice mode: the full flow runs in your browser on the same rules. A wallet is needed to create rule books on Robinhood Chain (gas in ETH) and to sign in to the hosted service. ${BRAND.symbol} is never needed: holding 0.1 % of its supply only raises the hosted quotas (saved rule books, server scenario runs).`,
  },
  {
    q: "How does the holder check work?",
    a: "You sign one sign-in message (no gas, valid up to 4 hours). On every hosted request the server checks that signature, the site, the chain and the expiry, then reads your token balance and the total supply on chain: balance ≥ supply / 1000 is the holder tier. Before the token launches everyone uses the free tier.",
  },
  {
    q: "What alerts are there, and do they cost anything?",
    a: "Alerts are free and web only. The bell in the header lists, for the rule books your wallet owns: agent orders the rules refused, a period limit near or reached, versions waiting for your approval, pauses and revokes, all read from the contract's events. Turn on browser notifications to see new ones while a tab of the site is open. No e-mail, no messenger, no push service.",
  },
  {
    q: "Is it safe to rely on?",
    a: "It is a new prototype. The contract has unit, fuzz, invariant and fork tests, but no outside security review yet. Rules limit what an agent may do; they do not make its orders good ones, and nothing here is financial advice.",
  },
] as const;
