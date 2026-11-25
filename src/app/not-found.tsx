import Link from "next/link";
import { PageHead } from "@/components/site/PageHead";

export default function NotFound() {
  return (
    <>
      <PageHead title="This page is not" accent="in the rule book.">
        <p>The address does not exist. The studio does.</p>
      </PageHead>
      <div className="wrap flex flex-wrap gap-3 pb-16">
        <Link href="/studio" className="btn brand">
          Open the studio
        </Link>
        <Link href="/" className="btn line">
          Home
        </Link>
      </div>
    </>
  );
}
