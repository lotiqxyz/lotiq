import Link from "next/link";
import { BRAND } from "@/config/brand";
import { JsonLd } from "@/components/JsonLd";
import { StudioMini } from "@/components/home/StudioMini";
import { LiveRow } from "@/components/home/LiveRow";
import { LimitPicker } from "@/components/home/LimitPicker";
import { Faq } from "@/components/home/Faq";
import { OnChain, Plans, Records, Steps, Templates } from "@/components/home/Sections";
import { FAQ } from "@/lib/faq";
import { HOME_DESCRIPTION, HOME_TITLE, appLd, faqLd, pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ path: "/", title: HOME_TITLE, description: HOME_DESCRIPTION });

const d = (ms: number) => ({ "--delay": `${ms}ms` }) as React.CSSProperties;

export default function Home() {
  return (
    <>
      <JsonLd data={[appLd, faqLd(FAQ.map((f) => ({ q: f.q, a: f.a })))]} />
      {/* Hero: centred display title, cream lines + a lime last line, subtitle, one button; the product panel sits on an orange field. */}
      <section className="pt-[150px] text-center md:pt-[200px]" aria-labelledby="hero-t">
        <div className="wrap" data-parallax="0.02">
          <div data-parallax="0.06">
            <h1 id="hero-t" className="d1 mx-auto max-w-[1200px]" data-reveal="">
              Stock-token agent studio
              <br />
              <span className="lime">for Robinhood Chain.</span>
            </h1>
            <p className="sub mx-auto mt-8 max-w-[640px]" data-reveal="" style={d(120)}>
              {BRAND.tagline} Write a buying strategy in plain words, see the exact rules an agent must follow, test orders against them, then approve
              the version you reviewed.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3" data-reveal="" style={d(220)}>
              <Link href="/studio" className="btn" data-testid="hero-cta">
                Open the studio
              </Link>
              <Link href="/studio?step=lab" className="btn ghost">
                Scenario lab <span className="tag">NEW</span>
              </Link>
            </div>
            <p className="mt-5 text-[13px] text-muted" data-reveal="" style={d(300)}>
              Practice mode needs no wallet and no token. Prototype on {BRAND.chainName}.
            </p>
          </div>
        </div>
        <div className="wrap mt-20 md:mt-28">
          <div className="hero-media" data-hscale="" data-reveal="" style={d(200)}>
            <div className="field f-orange rounded-[6px] px-4 py-10 md:px-16 md:py-20">
              <StudioMini />
            </div>
          </div>
          <LiveRow />
        </div>
      </section>
      <Steps />
      <Records />
      <LimitPicker />
      <Templates />
      <OnChain />
      <Plans />
      <Faq />
    </>
  );
}
