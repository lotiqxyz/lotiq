import { PageHead } from "@/components/site/PageHead";
import { Dashboard } from "@/components/studio/Dashboard";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/dashboard",
  title: "Dashboard: versions, approvals and scenario results | Lotiq",
  description: "The history of a rule book: every version with its diff, every approval, pause and revoke, saved scenario lab runs, and on-chain rule books rebuilt from contract events.",
});

export default function DashboardPage() {
  return (
    <>
      <PageHead title="Dashboard" accent="Everything that changed, in order.">
        <p>Versions with their diffs, approvals, scenario runs and the change log. The practice book lives in this browser; on-chain books are read from the contract&apos;s events.</p>
      </PageHead>
      <div className="wrap pb-10">
        <Dashboard />
      </div>
    </>
  );
}
