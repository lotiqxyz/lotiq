"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NAV } from "@/config/nav";
import { Wordmark } from "@/components/site/Mark";
import { NavWallet } from "@/components/wallet/WalletButton";
import { CaBox } from "@/components/site/CaCopy";
import { useFocusTrap } from "@/components/site/useFocusTrap";

/* The reference's header: logo left, centred text links (one with a small lime "NEW" tag), one cream button right. Fixed; it slides
   away on scroll down and back on scroll up (components/site/Motion.tsx). The right button is the wallet (Valtora pattern). */
export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="hd" data-testid="site-header">
        <div className="wrap">
          <div className="hd-bar">
            <Link href="/" aria-label="Lotiq home" className="shrink-0">
              <Wordmark size={24} />
            </Link>
            <nav aria-label="Main" className="hd-nav">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}>
                  {n.label}
                  {n.tag ? <span className="tag">{n.tag}</span> : null}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex min-w-0 items-center gap-2 lg:ml-0">
              <NavWallet label="Connect wallet" />
              <button type="button" className="burger lg:hidden" aria-label="Open the menu" aria-expanded={open} onClick={() => setOpen(true)} data-testid="menu-open">
                <span>
                  <span />
                  <span />
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>
      {open ? <MobileMenu onClose={() => setOpen(false)} path={path} /> : null}
    </>
  );
}

function MobileMenu({ onClose, path }: { onClose: () => void; path: string }) {
  const trap = useRef<HTMLDivElement>(null);
  useFocusTrap(trap, true, onClose);
  return createPortal(
    <div className="hd-menu" role="dialog" aria-modal="true" aria-label="Menu" ref={trap} data-testid="menu">
      <div className="wrap flex h-[88px] items-center justify-between">
        <Wordmark size={24} />
        <button type="button" className="burger" aria-label="Close the menu" aria-expanded="true" onClick={onClose}>
          <span>
            <span />
            <span />
          </span>
        </button>
      </div>
      <nav className="wrap mt-2" aria-label="Main">
        {[{ href: "/", label: "Home", tag: null }, ...NAV].map((n) => (
          <Link key={n.href} href={n.href} onClick={onClose} className="big" aria-current={path === n.href ? "page" : undefined}>
            {n.label} {n.tag ? <span className="tag align-middle">{n.tag}</span> : null}
          </Link>
        ))}
      </nav>
      <div className="wrap mt-8 grid gap-3 pb-10">
        <Link href="/studio" className="btn brand w-full" onClick={onClose}>
          Open the studio
        </Link>
        <CaBox testid="menu-ca" />
      </div>
    </div>,
    document.body,
  );
}
