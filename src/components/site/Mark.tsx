/*
 * Lotiq's mark (AI placeholder until the owner's files arrive; referensi/tools/apply-owner-assets.mjs swaps it in):
 * an L stem and foot with two rule lines, i.e. a rule book. Drawn inline in currentColor so it is crisp at any size.
 * The same geometry is rendered to favicon/app icons/OG by referensi/tools/make-assets.mjs.
 */
export const MARK_RECTS = [
  { x: 2, y: 2, w: 6, h: 20 },
  { x: 8, y: 16, w: 14, h: 6 },
  { x: 11, y: 2, w: 11, h: 4.5 },
  { x: 11, y: 9.25, w: 7, h: 4.5 },
] as const;

/** Set by referensi/tools/apply-owner-assets.mjs once the owner's logo exists (drawn as a CSS mask in currentColor). */
export const OWNER_MARK: string | null = null;

export function MarkGlyph({ size = 22, accent = false }: { size?: number; accent?: boolean }) {
  if (OWNER_MARK) {
    const mask = `url(${OWNER_MARK}) center / contain no-repeat`;
    return <span aria-hidden="true" data-testid="brand-mark" className="block shrink-0 bg-current" style={{ width: size, height: size, WebkitMask: mask, mask }} />;
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
