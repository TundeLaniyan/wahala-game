/**
 * Lekki Phase 1: Amarite Way (presentation only; docs/LEKKI_AMARITE_WAY.md). The founder's photographs show a divided
 * commercial road paved in interlocking concrete blocks, with a planted median edged in black-and-white kerbs, tall
 * streetlights and roadside shops. The map's commercial boulevard (the straight run of Admiralty Way, x 20-23) is the
 * road that matches, so ONLY its two straight segments are paved: Freedom Way, the expressway and both junctions
 * stay asphalt. ASSUMPTION flagged for founder review: if the founder means another road, change `AMARITE_WAY_PAVED`
 * (the one place that says which tiles) and nothing else.
 *
 * The geometry is untouched: this is floor paint only (the median is a painted strip, not an obstacle; every tile
 * stays walkable exactly as before).
 */
import { dash } from './rumbleV2Kit';
import { T } from './floorKit';
import type { Ctx } from './floorKit';
import type { TileRect } from './community/pavers';

/** The paved tiles (inclusive): the road north of Freedom Way's junction and the road south of it. */
export const AMARITE_WAY_PAVED: readonly TileRect[] = [
  { x0: 20, y0: 10, x1: 23, y1: 16 },
  { x0: 20, y0: 22, x1: 23, y1: 29 },
];

/** The painted median runs along the road's centre line (tile boundary 22) over the same rows. */
const MEDIAN_X = 22;
const MEDIAN_HALF = 0.2;

/** Lane dividers (white dashes) at the middle of each carriageway, and the median with black-and-white kerbs. */
export function paintAmariteWayDetails(g: Ctx, r: () => number): void {
  for (const rect of AMARITE_WAY_PAVED) {
    const y0 = rect.y0;
    const y1 = rect.y1 + 1;
    for (const x of [21, 23]) dash(g, x, y0, x, y1, 'rgba(238,236,224,0.8)', 5, 0.7, 0.9);
    // the planted median: grass between two kerb stripes
    const mx0 = (MEDIAN_X - MEDIAN_HALF) * T;
    const mw = MEDIAN_HALF * 2 * T;
    g.fillStyle = 'rgb(94,108,66)';
    g.fillRect(mx0, y0 * T, mw, (y1 - y0) * T);
    g.fillStyle = 'rgba(60,78,40,0.55)';
    for (let i = 0; i < (y1 - y0) * 14; i++) g.fillRect(mx0 + r() * mw, y0 * T + r() * (y1 - y0) * T, 3, 3);
    const seg = 0.5 * T;
    const kw = 0.07 * T;
    for (let i = 0, y = y0 * T; y < y1 * T; i++, y += seg) {
      const h = Math.min(seg, y1 * T - y);
      g.fillStyle = i % 2 === 0 ? 'rgb(24,24,24)' : 'rgb(236,236,230)';
      g.fillRect(mx0 - kw, y, kw, h);
      g.fillRect(mx0 + mw, y, kw, h);
    }
  }
}
