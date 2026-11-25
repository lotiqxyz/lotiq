import { PageHead } from "@/components/site/PageHead";
import { AssetsTable } from "@/components/studio/AssetsTable";
import { STOCK_BEACON, STOCK_PROXY_CODEHASH, FEED_DIRECTORY } from "@/config/chain";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/assets",
  title: "Supported stock tokens with on-chain proof | Lotiq",
  description: "Every Robinhood stock token a Lotiq rule set may name, re-proven live on Robinhood Chain (proxy code, beacon, minted supply), with Chainlink prices and update times.",
});

export default function AssetsPage() {
  return (
    <>
      <PageHead title="Supported assets" accent="A ticker is not an identity.">
        <p>
          Dozens of tokens on Robinhood Chain copy stock tickers. A rule set may only name a token that passes three checks read from the chain:
          its runtime code hashes to Robinhood&apos;s beacon proxy (<span className="font-mono text-[13px]">{STOCK_PROXY_CODEHASH.slice(0, 12)}…</span>), its ERC-1967
          beacon slot holds Robinhood&apos;s beacon (<span className="font-mono text-[13px]">{STOCK_BEACON.slice(0, 12)}…</span>), and it has minted supply (minting needs a
          role only Robinhood&apos;s keys hold). Candidates come from the beacon&apos;s upgrade events; feeds from the{" "}
          <a className="ul" href={FEED_DIRECTORY} target="_blank" rel="noreferrer">
            Chainlink directory
          </a>
          .
        </p>
      </PageHead>
      <div className="wrap pb-10">
        <AssetsTable />
      </div>
    </>
  );
}
