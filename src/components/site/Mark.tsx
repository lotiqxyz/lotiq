/*
 * Lotiq's mark: the owner's logo (25 Nov 2026) once apply-owner-assets.mjs has run (OWNER_MARK below); otherwise the AI placeholder:
 * an L stem and foot with two rule lines, i.e. a rule book. Drawn inline in currentColor so it is crisp at any size.
 * The same geometry is rendered to favicon/app icons/OG by referensi/tools/make-assets.mjs.
 */
export const MARK_RECTS = [
  { x: 2, y: 2, w: 6, h: 20 },
  { x: 8, y: 16, w: 14, h: 6 },
  { x: 11, y: 2, w: 11, h: 4.5 },
  { x: 11, y: 9.25, w: 7, h: 4.5 },
] as const;

/** Set by referensi/tools/apply-owner-assets.mjs once the owner's logo exists. The owner's mark has two colours (cream + lime), so it is
 *  drawn as an image, not a single-colour mask; the site is dark everywhere, which both colours read on. */
export const OWNER_MARK: string | null = "/brand/mark.webp?v=d5af84da";

export function MarkGlyph({ size = 22, accent = false }: { size?: number; accent?: boolean }) {
  if (OWNER_MARK) {
     
    return <img src={OWNER_MARK} alt="" aria-hidden="true" width={size} height={size} data-testid="brand-mark" className="block shrink-0 object-contain" style={{ width: size, height: size }} />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" data-testid="brand-mark" className="block shrink-0">
      {MARK_RECTS.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={0.6} fill={accent && i === 3 ? "var(--lime)" : "currentColor"} />
      ))}
    </svg>
  );
}

/** Wordmark: the mark + the name, like the reference's logotype (mark left, name right). */
export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5" style={{ fontSize: size, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1 }}>
      <MarkGlyph size={Math.round(size * 1.35)} accent />
      <span>Lotiq</span>
    </span>
  );
}
