import Link from "next/link";
import { CHAIN, explorerAddress } from "@/config/brand";
import { CONTRACTS, CONTRACT_NAME, TESTNET, bookLive } from "@/config/contracts";
import { ETH_USD_FEED } from "@/config/chain";
import { PageHead, StatusBadge } from "@/components/site/PageHead";
import { ALL_BITS, BITS, BIT_TEXT } from "@/lib/rules/bits";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/method",
  title: "Method and limits: parser, rules, scenario lab, contract | Lotiq",
  description: "How Lotiq reads a strategy, what each rule means, how the calendar and limits are computed, what the rule book contract stores, and what is planned.",
});

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <>
    <dt>{k}</dt>
    <dd>{v}</dd>
  </>
);

export default function MethodPage() {
  return (
    <>
      <PageHead title="Method and limits" accent="Everything the studio assumes.">
        <p>What is real today, what each number means, and what is planned. If something is not listed here, the studio does not do it.</p>
      </PageHead>
      <div className="wrap grid gap-6 pb-10">
        <section className="panel" aria-labelledby="m1">
          <h2 id="m1" className="h3">
            What runs today
          </h2>
          <dl className="kv mt-6">
            <Row k="Strategy parser" v={<><StatusBadge status="Prototype" /> Fixed patterns in the page (src/lib/rules/parse.ts), no language model. Reads one buy strategy for one asset. Asks instead of guessing: which asset (several or none named), fuzzy amounts (&ldquo;about $50&rdquo;), missing amount, weekly without a day, monthly, times without a time zone, whether approvals are needed. Refuses to silently drop selling, price conditions and percentages.</>} />
            <Row k="Rule check" v={<><StatusBadge status="Prototype" /> Every line editable, with its source (written, derived, default, answered) and the same validity rules as the contract.</>} />
            <Row k="Scenario lab" v={<><StatusBadge status="Prototype" /> Standard and custom test orders on a fresh practice book; each result names the rule and the numbers.</>} />
            <Row k="Versions and approvals" v={<><StatusBadge status="Prototype" /> Practice book in this browser; on chain through {CONTRACT_NAME} once deployed.</>} />
            <Row k="Order journal" v={<><StatusBadge status="Prototype" /> The agent records orders on chain; the contract counts them against the limits. No tokens move.</>} />
            <Row k="Hosted service + holder tier" v={<><StatusBadge status="Prototype" /> One EIP-4361 sign-in signature (≤ 4 h, checked against a fixed domain list on every request, revoked on sign out). Saved rule books and server scenario runs with quotas enforced on the server; holder = balance ≥ total supply / 1000 of the token, read on chain at each request. Unlocks at launch.</>} />
            <Row k="Alerts" v={<><StatusBadge status="Prototype" /> Free. A bell inbox derived from the rule book&apos;s events (refused orders via submitOrder, period limit ≥ 80 % / reached, versions waiting, pause, revoke) and browser notifications while a tab is open. No e-mail, no push service.</>} />
            <Row k="Trade execution" v={<><StatusBadge status="Concept" /> Routing real buys through a DEX, with the output forced to the owner, is planned. It is not built because it moves funds and needs its own contract, fork tests and an outside review.</>} />
            <Row k="Agent runtime" v={<><StatusBadge status="Concept" /> A hosted agent that reads the approved version and records orders on schedule is planned. Today the agent is whatever wallet you bind.</>} />
          </dl>
        </section>

        <section className="panel" aria-labelledby="m2">
          <h2 id="m2" className="h3">
            Rules, units and calendar
          </h2>
          <dl className="kv mt-6">
            <Row k="Money" v="US dollars with 6 decimals (the same scale as USDG). Limits are in dollars, not token units: a planned agent would size each order from a price feed." />
            <Row k="Days and hours" v="UTC. Weekdays Monday to Sunday; hours from H (inclusive) to H (exclusive), whole hours only." />
            <Row k="Periods" v="1 day (resets 00:00 UTC), 7 days (resets Monday 00:00 UTC) or 30 days (fixed windows counted from Monday 1970-01-05). Spending is counted per rule book, so a new version with a lower limit sees what was already spent in the window." />
            <Row k="Approval threshold" v="An order strictly above the threshold needs the owner's approval of that exact order (rule book, version, asset, amount, order number). The approval is used up when the order is recorded." />
            <Row k="Minimum gap" v="Seconds between two recorded orders, up to 30 days." />
            <Row k="Validity" v="A version is valid from the minute it is proposed to its end date, at most 730 days. An expired version cannot be approved." />
            <Row k="Canonical text" v="The rule set written as fixed lines (format lotiq-rules/1). Its keccak256 is the version's commitment on chain; the studio shows both before you approve." />
          </dl>
        </section>

        <section className="panel" aria-labelledby="m3">
          <h2 id="m3" className="h3">
            Reason codes
          </h2>
          <p className="mt-3 text-muted">The same 17 bits in the studio and in {CONTRACT_NAME}. A unit test reads the Solidity source and fails if they ever differ.</p>
          <div className="scroll-x mt-5">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Bit</th>
                  <th>Name</th>
                  <th>Rule</th>
                  <th>Meaning</th>
                </tr>
              </thead>
              <tbody>
                {ALL_BITS.map((b) => (
                  <tr key={b}>
                    <td className="font-mono">{Math.log2(BITS[b])}</td>
                    <td className="font-mono text-[12px]">R_{b}</td>
                    <td>{BIT_TEXT[b].rule}</td>
                    <td className="text-muted">{BIT_TEXT[b].text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="contract" className="panel scroll-mt-28" aria-labelledby="m4">
          <h2 id="m4" className="h3">
            The contract: {CONTRACT_NAME}
          </h2>
          <dl className="kv mt-6">
            <Row k="Address" v={bookLive() ? <a className="ul font-mono" href={explorerAddress(CONTRACTS.book)} target="_blank" rel="noreferrer">{CONTRACTS.book}</a> : "Not deployed yet. The owner deploys it; the address then appears here and in the footer."} />
            <Row k="Stores" v="Rule books (owner, label, active version, pause / revoke, spending window, last order time, order count) and versions (hash + every limit + status + parent)." />
            <Row k="Owner can" v="openBook, propose, approve (exact number + hash), withdraw, pause, unpause, revoke (final), approveOrder, cancelOrderApproval." />
            <Row k="Agent can" v="recordOrder (re-checks every rule at the current block and reverts with Refused(bits) when one fails), submitOrder (same check, but a refusal is logged as OrderRefused instead of reverting, so the owner is alerted) and halt (pause only; it can never unpause or raise a limit)." />
            <Row k="Anyone can" v="checkOrder (reason bits for any order and time), getBook, getVersion, remainingInPeriod, orderKey, booksOf, booksOfAgent." />
            <Row k="Never" v="Holds or moves tokens or ETH, has no admin, no fee, no upgrade path, no owner over other people's books." />
            <Row k="Tests" v={`Unit, fuzz (1,024 runs each), invariant (5 invariants over random owner/agent sequences) and ${CHAIN.name} fork tests (real stock tokens, a real Chainlink feed).`} />
            <Row k="Review" v="No outside security review yet. It holds no funds, but treat it as new code." />
          </dl>
        </section>

        <section className="panel" aria-labelledby="m5">
          <h2 id="m5" className="h3">
            Networks and data sources
          </h2>
          <dl className="kv mt-6">
            <Row k={CHAIN.name} v={`Chain id ${CHAIN.id}, gas in ETH, explorer ${CHAIN.explorer}. Reads go through the site's rate-limited relay first, then public RPCs.`} />
            <Row k={TESTNET.name} v={`Chain id ${TESTNET.id}, proven from this build's machine on 25 Nov 2026 (RPC and explorer answered). The rule book has no chain-specific code, so a trial copy can be deployed there; the studio itself works on mainnet, where stock-token identity can be proven.`} />
            <Row k="Stock tokens" v={<>See <Link className="ul" href="/assets">Assets</Link>: proxy code hash + beacon slot + minted supply, re-read live; candidates from a vetted 23 Nov 2026 scan.</>} />
            <Row k="Prices" v={<>Chainlink data feeds on {CHAIN.name} (stock feeds pause outside market hours); ETH/USD at <span className="font-mono text-[12px]">{ETH_USD_FEED}</span>.</>} />
          </dl>
        </section>
      </div>
    </>
  );
}
