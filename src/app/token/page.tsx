import Link from "next/link";
import { CaBox } from "@/components/site/CaCopy";
import { MarkGlyph } from "@/components/site/Mark";
import { PageHead, StatusBadge } from "@/components/site/PageHead";
import { BRAND, CHAIN, TOKEN } from "@/config/brand";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/token",
  title: `${BRAND.symbol} token | ${BRAND.name}`,
  description: `${BRAND.symbol} on ${BRAND.chainName}: contract address${TOKEN.isLive ? "" : " (published at launch)"}, the token features, and what it is not. The studio never needs it.`,
});

export default function TokenPage() {
  return (
    <>
      <PageHead title={BRAND.symbol} accent="Not needed to write a rule.">
        <p>
          {BRAND.tokenName} ({BRAND.symbol}) is planned for {CHAIN.name}. The studio, the scenario lab, versions, approvals and the rule book contract all
          work without it. It is the community token of Lotiq, not a share of anything and not a promise of value.
        </p>
      </PageHead>
      <div className="wrap grid grid-cols-1 gap-6 pb-10 lg:grid-cols-2">
        <section className="panel" data-testid="token-ca">
          <h2 className="h3 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded bg-[var(--bg)]" data-testid="token-logo">
              <MarkGlyph size={28} accent />
            </span>
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
        <section className="panel" id="utility">
          <h2 className="h3 flex flex-wrap items-center gap-3">
            Token features <StatusBadge status="Concept" />
          </h2>
          <ul className="mt-5 grid list-disc gap-2 pl-5 text-muted">
            <li>Higher limits for saved rule books and scenario runs on a hosted service (planned).</li>
            <li>Alerts when an agent&apos;s order is refused or a rule book nears its period limit (planned).</li>
            <li>Access to the planned agent runtime once it exists (planned).</li>
          </ul>
          <p className="mt-5 text-muted">
            None of these exists yet, and launching the token does not create them. Practice mode and the contract stay usable without {BRAND.symbol}. No yield, no revenue share, no price
            promise, not advice.
          </p>
          <Link href="/studio" className="btn brand mt-6">
            Use the studio without it
          </Link>
        </section>
      </div>
    </>
  );
}
