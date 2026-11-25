import { Suspense } from "react";
import { PageHead, StatusBadge } from "@/components/site/PageHead";
import { Studio } from "@/components/studio/Studio";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/studio",
  title: "Studio: write, check, test and approve agent rules | Lotiq",
  description: "Write a stock-token buying strategy, answer the parser's questions, check every rule line with its source, run test orders in the scenario lab and approve an exact version.",
});

export default function StudioPage() {
  return (
    <>
      <PageHead title="Rule studio" accent="Write. Check. Test. Approve.">
        <p>
          One buy strategy for one stock token becomes a rule set an agent must follow. Nothing is guessed: unclear words become questions. <StatusBadge status="Prototype" />
        </p>
      </PageHead>
      <div className="wrap pb-10">
        <Suspense fallback={<div className="panel text-muted">Loading the studio…</div>}>
          <Studio />
        </Suspense>
      </div>
    </>
  );
}
