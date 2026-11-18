/**
 * What the renderer builds of a mission sector's district (docs/CAMPAIGN_SECTOR_AI.md, "Render cost"): the sector's
 * clip (its rects plus `viewMargin`, the most the follow camera shows) grown a little more, most to the north, where the
 * three-quarter camera sees furthest above the HUD-free band. Everything with no tile in it - cover objects, pillars,
 * crates, the living environment's traffic and crowds - is not built. Null (build everything) without a sector.
 * Presentation only.
 */
import type { GameState } from '../sim';
import type { CoverClip } from './arenas/boardCover';
import type { StageEnvironment } from './env/types';

/** Extra tiles beyond the sector clip: the far (north) side shows the most above the band, the near side the least. */
export const RENDER_PAD = { north: 6, south: 2, side: 3 };

export function renderClip(state: Pick<GameState, 'sector' | 'width' | 'height'>): CoverClip | null {
  const c = state.sector?.clip;
  if (!c) return null;
  return {
    x0: Math.max(0, c.x0 - RENDER_PAD.side),
    y0: Math.max(0, c.y0 - RENDER_PAD.north),
    x1: Math.min(state.width - 1, c.x1 + RENDER_PAD.side),
    y1: Math.min(state.height - 1, c.y1 + RENDER_PAD.south),
  };
}

/** Is tile (x, y) inside the clip (always, without one)? */
export const inClip = (clip: CoverClip | null, x: number, y: number): boolean =>
  !clip || (x >= clip.x0 && x <= clip.x1 && y >= clip.y0 && y <= clip.y1);

/**
 * The living environment of a sector match: traffic routes, crowd zones and practical lights that come nowhere near
 * the clip are dropped (they would only cost draw calls and animation off screen). Tile units, like the environment.
 */
export function clipEnvironment(env: StageEnvironment, clip: CoverClip | null): StageEnvironment {
  if (!clip) return env;
  // the environment's tile space: tile i spans [i, i + 1); a margin so a vehicle entering the view is kept
  const PAD = 2;
  const x0 = clip.x0 - PAD;
  const y0 = clip.y0 - PAD;
  const x1 = clip.x1 + 1 + PAD;
  const y1 = clip.y1 + 1 + PAD;
  const hits = (ax: number, ay: number, bx: number, by: number): boolean =>
    Math.max(ax, bx) >= x0 && Math.min(ax, bx) <= x1 && Math.max(ay, by) >= y0 && Math.min(ay, by) <= y1;
  const routeIn = (path: readonly (readonly [number, number])[]): boolean =>
    path.some((p, i) => {
      const q = path[i + 1] ?? p;
      return hits(p[0], p[1], q[0], q[1]);
    });
  return {
    ...env,
    traffic: env.traffic?.filter((r) => routeIn(r.path)),
    crowds: env.crowds?.filter((z) => hits(z.rect.x0, z.rect.y0, z.rect.x1, z.rect.y1)),
    lights: env.lights?.filter((l) => hits(l.at[0], l.at[1], l.at[0], l.at[1])),
  };
}
