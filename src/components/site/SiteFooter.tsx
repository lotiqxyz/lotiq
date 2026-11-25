import Link from "next/link";
import { BRAND, CHAIN, hasGithub } from "@/config/brand";
import { CONTRACTS, CONTRACT_NAME, bookLive } from "@/config/contracts";
import { MarkGlyph } from "@/components/site/Mark";
import { CaBox } from "@/components/site/CaCopy";
import { ArrowRight } from "@/components/site/Icons";

/* The reference's closing: a large "stay updated" line with an arrow (here: follow on X, no e-mail is collected), a centred footer
   card (mark, 56 px title with lime words, one button), then a small legal row. */
export function SiteFooter() {
  return (
    <footer className="pb-28 pt-24 md:pb-10" data-testid="site-footer">
      <div className="wrap">
        <a href={BRAND.x} target="_blank" rel="noreferrer" className="group flex items-center justify-between gap-6" data-reveal="">
          <span className="d2 block">
            Stay <span className="lime">updated</span>
            <br />
            <span className="text-[var(--faint)] transition-colors duration-200 group-hover:text-[var(--muted)]">x.com/{BRAND.xHandle.slice(1)}</span>
          </span>
          <span className="shrink-0 transition-transform duration-300 group-hover:translate-x-1">
            <ArrowRight size={48} />
          </span>
        </a>

        <div className="card mt-14 grid place-items-center px-6 py-20 text-center md:py-24" data-reveal="">
          <MarkGlyph size={48} accent />
          <p className="d3 mt-7 max-w-[620px]">
            The <span className="lime">starting point</span> for every agent rule
          </p>
          <Link href="/studio" className="btn mt-8">
            Open the studio
          </Link>
          <div className="mt-10 w-full max-w-[520px]">
            <CaBox testid="footer-ca" />
          </div>
        </div>

        <div className="mt-8 grid gap-6 text-[13px] text-muted md:grid-cols-[1.3fr_1fr]">
          <p className="max-w-[620px] leading-relaxed">
            {BRAND.name} is an independent prototype on {CHAIN.name}, not affiliated with Robinhood or with any token, feed or venue it reads.
            Stock tokens are tokens on {CHAIN.name}, not the shares themselves. Rules limit what an agent may do; they do not make its orders good
            ones. Nothing here is financial advice.
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 md:justify-end">
            <li>
              <Link className="ul" href="/method">
                Method &amp; limits
              </Link>
            </li>
            <li>
              <Link className="ul" href="/assets">
                Assets
              </Link>
            </li>
            <li>
              {bookLive() ? (
                <a className="ul" href={`${CHAIN.explorer}/address/${CONTRACTS.book}`} target="_blank" rel="noreferrer">
                  {CONTRACT_NAME}
                </a>
              ) : (
                <Link className="ul" href="/method#contract">
                  {CONTRACT_NAME} (not deployed yet)
                </Link>
              )}
            </li>
            <li>
              <a className="ul" href={BRAND.x} target="_blank" rel="noreferrer">
                X
              </a>
            </li>
            {hasGithub ? (
              <li>
                <a className="ul" href={BRAND.github} target="_blank" rel="noreferrer">
                  GitHub
                </a>
              </li>
            ) : null}
            <li>
              <a className="ul" href="/llms.txt">
                llms.txt
              </a>
            </li>
          </ul>
        </div>
        <div className="mt-8 flex flex-wrap justify-between gap-3 text-[10px] font-medium text-muted">
          <span>© 2026 {BRAND.name}</span>
          <span>Gas on {CHAIN.name} is paid in ETH. Practice mode needs no wallet.</span>
        </div>
      </div>
    </footer>
  );
}
