import { PageHead } from "@/components/site/PageHead";
import { Account } from "@/components/holder/Account";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/account",
  title: "Account: holder check and hosted rule books | Lotiq",
  description: "Sign in with one wallet signature, see your tier read from chain (holder = 0.1 % of the token supply), save rule books and run the scenario lab on the server.",
});

export default function AccountPage() {
  return (
    <>
      <PageHead title="Account" accent="One signature, your tier from chain.">
        <p>Practice mode never needs this page. Sign in to keep rule books on the server and run the scenario lab there; holders of 0.1 % of the token supply get larger quotas.</p>
      </PageHead>
      <div className="wrap pb-10">
        <Account />
      </div>
    </>
  );
}
