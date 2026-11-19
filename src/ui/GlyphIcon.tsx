import { GLYPHS } from '../render/objectiveGlyphs';
import type { GlyphId } from '../render/objectiveGlyphs';

/**
 * One objective glyph (render/objectiveGlyphs.ts) as inline SVG: the same shape the briefing card, the HUD rail and the
 * world pins use, in the current text colour. Decorative unless `title` is given.
 */
export function GlyphIcon({
  id,
  size = 18,
  title,
  className,
}: {
  id: GlyphId;
  size?: number;
  title?: string;
  className?: string;
}) {
  const g = GLYPHS[id];
  return (
    <svg
      className={`glyph glyph-${id}${className ? ` ${className}` : ''}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      data-glyph={id}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {g.parts.map((p, i) =>
        p.fill ? (
          <path key={i} d={p.d} fill="currentColor" />
        ) : (
          <path
            key={i}
            d={p.d}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      )}
    </svg>
  );
}
