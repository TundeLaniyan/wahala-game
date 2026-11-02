/**
 * Turns an arena's `CoverRect` list into a board cover (`boardCover.ts`): every rectangle is one real object built
 * by its family, fading as one group (long objects fade in sections of four columns so one fighter behind a long
 * row does not dissolve all of it). Rectangles whose kind has no family are skipped (the arena view then draws
 * ordinary pillars there), which keeps a missing family from breaking a match.
 */
import { getArena } from '../../../sim';
import type { CoverFactory } from '../boardCover';
import { createCK, toRect } from './kit';
import type { Family, Theme } from './kit';

export interface CoverSpec {
  arenaId: string;
  theme: Theme;
  families: Readonly<Record<string, Family>>;
  /** Rows north of a tile its object can hide from the camera (occlusion fade), per kind (default 2). */
  reach: Readonly<Record<string, number>>;
}

export function communityCover(spec: CoverSpec): CoverFactory {
  return (board) => {
    const arena = getArena(spec.arenaId);
    const rects = arena.cover;
    if (!rects || board.width !== arena.layout[0]!.length || board.height !== arena.layout.length)
      return null;
    const k = createCK(board.width, board.height, spec.theme);
    const counts = new Map<string, number>();
    for (const c of rects) {
      const family = spec.families[c.kind];
      if (!family) continue;
      const n = counts.get(c.kind) ?? 0;
      counts.set(c.kind, n + 1);
      const sections = new Map<number, [number, number][]>();
      for (let y = c.y; y < c.y + c.h; y++)
        for (let x = c.x; x < c.x + c.w; x++) {
          const key = Math.floor((x - c.x) / 4);
          sections.set(key, [...(sections.get(key) ?? []), [x, y]]);
        }
      const reach = spec.reach[c.kind] ?? 2;
      const ids = [...sections.values()].map((tiles) => k.b.group(tiles, reach));
      family(k, ids[0]!, toRect(k, c), n);
    }
    const t = k.atlas.texture();
    if (t) {
      k.signs.map = t;
      k.b.own(t);
    }
    return k.b.build();
  };
}
