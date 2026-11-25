"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/*
 * Site-wide motion, reproducing the UI reference's behaviour in our own code (referensi/recon-ui/MOTION.txt):
 *   [data-reveal]     fades up 32 px once in view, 0.7 s ease (adds .in); --delay staggers siblings
 *   .hd               header slides away on scroll down, back on scroll up (0.35 s)
 *   [data-fcta]       floating CTA slides in once the hero is passed (.show)
 *   .cf .ch           per-character scroll fade of display titles: as a title rises past the top, later characters dim first
 *   [data-parallax]   hero text drifts up at a fraction of the scroll
 *   [data-hscale]     hero product panel scales 0.8 -> 1 as it comes into view
 *   .stack-card       sticky step cards scale 0.75 -> 1 while rising, and back down while the next card covers them
 *   [data-fan]        template folders rise and grow in sequence as their row enters
 * Everything is visible by default: hidden start states apply only under html.motion (MOTION_BOOT, removed again if this script never
 * starts). With prefers-reduced-motion nothing moves. A hidden tab shows every reveal at once.
 */

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export function Motion() {
  const path = usePathname();

  useEffect(() => {
    (window as unknown as { __lqMotion?: boolean }).__lqMotion = true;
    const root = document.documentElement;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.classList.remove("motion");
      return;
    }
    root.classList.add("motion");
    const vh = () => window.innerHeight || 800;

    // ---- reveals
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          e.target.classList.add("in");
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
    );
    const SEL = "[data-reveal]";
    const watched = new WeakSet<Element>();
    const observe = (scope: ParentNode) =>
      scope.querySelectorAll<HTMLElement>(SEL).forEach((el) => {
        if (watched.has(el)) return;
        watched.add(el);
        if (el.getBoundingClientRect().top < vh()) requestAnimationFrame(() => el.classList.add("in"));
        else io.observe(el);
      });
    observe(document);
    const mo = new MutationObserver((list) => {
      for (const m of list)
        m.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement) {
            if (n.matches(SEL) && !watched.has(n)) {
              watched.add(n);
              io.observe(n);
            }
            observe(n);
          }
        });
    });
    mo.observe(document.body, { childList: true, subtree: true });
    const onHide = () => {
      if (document.visibilityState === "hidden") document.querySelectorAll<HTMLElement>(SEL).forEach((el) => el.classList.add("in"));
    };
    document.addEventListener("visibilitychange", onHide);
    onHide();

    // ---- scroll-linked layer
    const header = document.querySelector<HTMLElement>(".hd");
    let lastY = window.scrollY;
    let ticking = false;
    const frame = () => {
      ticking = false;
      const y = window.scrollY;
      const h = vh();
      const wide = window.innerWidth > 900;
      if (header) {
        const menuOpen = !!document.querySelector(".hd-menu");
        if (!menuOpen && y > 140 && y > lastY + 4) header.classList.add("hide");
        else if (y < lastY - 4 || y <= 140) header.classList.remove("hide");
      }
      lastY = y;
      // A jump (anchor link, fast fling) can skip an element without an intersection callback: anything above the fold's bottom shows.
      document.querySelectorAll<HTMLElement>("[data-reveal]:not(.in)").forEach((el) => {
        if (el.getBoundingClientRect().top < h) el.classList.add("in");
      });
      document.querySelectorAll<HTMLElement>("[data-fcta]").forEach((el) => el.classList.toggle("show", y > h * 0.75));
      document.querySelectorAll<HTMLElement>("[data-parallax]").forEach((el) => {
        el.style.transform = `translate3d(0, ${(-y * Number(el.dataset.parallax || 0.08)).toFixed(1)}px, 0)`;
      });
      document.querySelectorAll<HTMLElement>("[data-hscale]").forEach((el) => {
        const top = el.getBoundingClientRect().top;
        el.style.setProperty("--hs", (0.8 + 0.2 * clamp((h - top) / (h * 0.75))).toFixed(4));
      });
      document.querySelectorAll<HTMLElement>(".cf").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < -50 || r.top > h) return;
        const p = clamp((h * 0.32 - r.top) / (h * 0.5));
        const chars = el.querySelectorAll<HTMLElement>(".ch");
        const n = chars.length;
        chars.forEach((c, i) => {
          // later characters fade first; at p = 1 the whole line is at 0.15
          const o = 1 - 0.85 * clamp(p * 1.6 - ((n - 1 - i) / Math.max(1, n)) * 0.6);
          c.style.setProperty("--o", o.toFixed(3));
        });
      });
      const cards = [...document.querySelectorAll<HTMLElement>(".stack-card")];
      cards.forEach((el, i) => {
        if (!wide) {
          el.style.removeProperty("--s");
          return;
        }
        const top = el.getBoundingClientRect().top;
        const enter = clamp((h - top) / (h - 110));
        let s = 0.75 + 0.25 * enter;
        const next = cards[i + 1];
        if (next) s -= 0.2 * clamp((h - next.getBoundingClientRect().top) / (h - 110));
        el.style.setProperty("--s", Math.max(0.75, s).toFixed(4));
      });
      document.querySelectorAll<HTMLElement>("[data-fan-row]").forEach((row) => {
        const p = clamp((h - row.getBoundingClientRect().top) / (h * 0.6));
        const items = row.querySelectorAll<HTMLElement>("[data-fan]");
        items.forEach((it, i) => {
          const local = clamp(p * 1.8 - (i / Math.max(1, items.length)) * 0.8);
          it.style.setProperty("--fs", (0.6 + 0.4 * local).toFixed(3));
          it.style.setProperty("--fy", `${((1 - local) * 28).toFixed(1)}px`);
        });
      });
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(frame);
      }
    };
    frame();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      header?.classList.remove("hide");
    };
  }, [path]);

  return null;
}

/** A display line split into characters for the scroll fade (words stay unbroken; screen readers get the plain text). */
export function CharFade({ text, className = "" }: { text: string; className?: string }) {
  const words = text.split(" ");
  return (
    <span className={`cf ${className}`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((w, wi) => (
          <span key={wi}>
            <span className="inline-block whitespace-nowrap">
              {[...w].map((c, ci) => (
                <span key={ci} className="ch">
                  {c}
                </span>
              ))}
            </span>
            {wi < words.length - 1 ? " " : null}
          </span>
        ))}
      </span>
    </span>
  );
}
