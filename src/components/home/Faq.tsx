"use client";

import { useState } from "react";
import { FAQ } from "@/lib/faq";
import { BRAND } from "@/config/brand";

/* The reference's FAQ: sticky lead on the left, accordion on the right (grid-template-rows 0fr -> 1fr, chevron turns). */
export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="pt-28 md:pt-40" aria-labelledby="faq-t">
      <div className="wrap grid gap-10 md:grid-cols-2 md:gap-6">
        <div>
          <div className="md:sticky md:top-[140px]" data-reveal="">
            <h2 id="faq-t" className="d2">
              Questions
              <br />
              <span className="lime">&amp; Answers</span>
            </h2>
            <a href={BRAND.x} target="_blank" rel="noreferrer" className="ul mt-8 inline-block text-muted">
              {BRAND.xHandle} on X
            </a>
          </div>
        </div>
        <div data-reveal="">
          {FAQ.map((f, i) => (
            <div key={f.q} className="faq-item">
              <button type="button" className="faq-q" aria-expanded={open === i} aria-controls={`faq-${i}`} onClick={() => setOpen(open === i ? null : i)}>
                {f.q}
                <svg className="chev" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" fill="none" />
                </svg>
              </button>
              <div id={`faq-${i}`} className={`faq-a ${open === i ? "open" : ""}`}>
                <div>
                  <p className="pb-6 pr-6 text-muted">{f.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
