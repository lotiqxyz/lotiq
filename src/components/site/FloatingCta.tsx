"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* The reference's floating pill: a primary and a ghost button on a blurred dark plate, fixed at the bottom centre. It slides in once
   the hero is passed (Motion.tsx toggles .show). Home only; app pages keep the screen for the tool. */
export function FloatingCta() {
  const path = usePathname();
  if (path !== "/") return null;
  return (
    <div className="fcta" data-fcta="" data-testid="floating-cta">
      <Link href="/studio" className="btn">
        Open the studio
      </Link>
      <Link href="/token" className="btn ghost">
        Token
      </Link>
    </div>
  );
}
