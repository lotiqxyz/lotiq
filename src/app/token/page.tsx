import Link from "next/link";
import { CaBox } from "@/components/site/CaCopy";
import { PageHead, StatusBadge } from "@/components/site/PageHead";
import { ThresholdLive } from "@/components/holder/ThresholdLive";
import { BRAND, CHAIN, TOKEN } from "@/config/brand";
import { QUOTAS } from "@/config/quotas";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/token",
  title: `${BRAND.symbol} token | ${BRAND.name}`,
  description: `${BRAND.symbol} on ${BRAND.chainName}: contract address${TOKEN.isLive ? "" : " (published at launch)"}, the token features unlocked at 0.1 % of supply, and what stays free. The studio never needs it.`,
});

export default function TokenPage() {
  const rows = [
    { what: "Hosted rule books saved per wallet", free: QUOTAS.free.books, holder: QUOTAS.holder.books },
    { what: "Server scenario-lab runs per day", free: QUOTAS.free.runsPerDay, holder: QUOTAS.holder.runsPerDay },
    { what: "Server run history kept", free: QUOTAS.free.history, holder: QUOTAS.holder.history },
  ];
  return (
    <>
      <PageHead title={BRAND.symbol} accent="Not needed to write a rule.">
        <p>
          {BRAND.tokenName} ({BRAND.symbol}) is the community token of Lotiq on {CHAIN.name}. The studio, the scenario lab, versions, approvals, alerts and the rule book
          contract all work without it. Holding 0.1 % of the supply raises the quotas of the hosted service. It is not a share of anything and not a promise of value.
        </p>
      </PageHead>
      <div className="wrap grid grid-cols-1 gap-6 pb-10 lg:grid-cols-2">
        <section className="panel" data-testid="token-ca">
          <h2 className="h3 flex items-center gap-3">
            { }
            <img src="/brand/mark-tile.webp?v=02f2353b" alt={`${BRAND.symbol} logo`} width={44} height={44} className="block shrink-0 rounded" data-testid="token-logo" />
            Contract address
          </h2>
          <p className="mt-4 text-muted">
            {TOKEN.isLive
              ? `The only ${BRAND.symbol} contract on ${CHAIN.name}. Copies with the same name can exist; check the address.`
              : `Not launched yet. The address is published here and on X ${BRAND.xHandle} at launch; any address shared before that is not ours.`}
          </p>
          <CaBox testid="ca-token" className="mt-6 w-full" />
          <p className="mt-4 text-[13px] text-muted">
            Network: {CHAIN.name} (chain {CHAIN.id}), gas paid in {CHAIN.nativeSymbol}. {TOKEN.isLive ? "" : "Launchpad: TBA. "}We never send direct messages first.
          </p>
        </section>
        <section className="panel" id="utility" data-testid="token-features">
          <h2 className="h3 flex flex-wrap items-center gap-3">
            Token features <StatusBadge status="Prototype" />
          </h2>
          <ThresholdLive />
          <div className="scroll-x mt-5">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Hosted service</th>
                  <th>Free</th>
                  <th>Holder (≥ 0.1 %)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.what}>
                    <td>{r.what}</td>
                    <td className="whitespace-nowrap">{r.free}</td>
                    <td className="whitespace-nowrap">{r.holder}</td>
                  </tr>
                ))}
                <tr>
                  <td>Alerts: bell inbox + browser notifications</td>
                  <td className="whitespace-nowrap">yes</td>
                  <td className="whitespace-nowrap">yes</td>
                </tr>
              </tbody>
            </table>
          </div>
          <h3 className="mt-6 text-[17px] font-medium">How the check works</h3>
          <ul className="mt-2 grid list-disc gap-2 pl-5 text-[14px] text-muted">
            <li>You sign one sign-in message with your wallet (no gas, valid up to 4 hours). The server checks the signature, the site, the chain and the expiry on every request.</li>
            <li>Holder = your balance ≥ total supply / 1000, both read from the token contract on chain at each hosted action (cached at most 30 seconds). The account page shows your balance, the threshold, your share and the block.</li>
            <li>Every quota is enforced on the server. Practice mode, the studio, the contract and alerts stay free and work without a wallet or the token.</li>
          </ul>
          <p className="mt-4 text-[13px] text-muted">
            Prototype: runs today and is covered by end-to-end tests on a local Robinhood Chain devnet with a test token. Until {BRAND.symbol} launches, the holder tier shows
            &ldquo;Unlocks at launch&rdquo; and everyone uses the free tier. No fee discounts, revenue share, rewards or airdrops. Not advice.
          </p>
          <Link href="/account" className="btn brand mt-6">
            Check my tier
          </Link>
        </section>
      </div>
    </>
  );
}
