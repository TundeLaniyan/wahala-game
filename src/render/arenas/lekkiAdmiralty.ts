/**
 * Lekki Phase 1: Admiralty Way (presentation only; docs/LEKKI_ADMIRALTY_WAY.md). The founder's photographs show a
 * divided commercial road paved in interlocking concrete blocks, with a planted median edged in black-and-white kerbs,
 * tall streetlights and roadside shops. ("Amarite Way" in the first brief was a transcription error for Admiralty Way,
 * confirmed by the founder.) The map's Admiralty Way is the N-S boulevard at x 20-23 from the plaza (y 10) to the
 * expressway (y 29): its WHOLE carriageway, both directions, is paved, including the two approach rows next to Freedom
 * Way. Freedom Way's own lanes (y 18-20, the crossing included) and the expressway stay asphalt, and each place where
 * the paving meets asphalt has a concrete edge restraint, a soldier course of blocks and a stop line on the lane that
 * approaches the junction, as a real block road ends.
 *
 * The geometry is untouched: this is floor paint only (the median is a painted strip, not an obstacle; every tile
 * stays walkable exactly as before; no mesh, no collision, no draw call).
 */
import { dash } from './rumbleV2Kit';
import { T } from './floorKit';
import type { Ctx } from './floorKit';
import { ADMIRALTY_PAVERS } from './community/pavers';
import type { TileRect } from './community/pavers';

/** The paved tiles (inclusive): Admiralty Way's carriageway north and south of the Freedom Way crossing. */
export const ADMIRALTY_WAY_PAVED: readonly TileRect[] = [
  { x0: 20, y0: 10, x1: 23, y1: 17 },
  { x0: 20, y0: 21, x1: 23, y1: 29 },
];

/** The painted median runs along the road's centre line (tile boundary 22) and stops short of each junction. */
const MEDIAN_X = 22;
const MEDIAN_HALF = 0.2;
/** Median runs (tile rows, boundaries): the plaza to Freedom Way, Freedom Way to the expressway. */
const MEDIANS: readonly [number, number][] = [
  [10, 17.25],
  [21.75, 29.45],
];

/** Where the paving meets an asphalt road: the boundary row, which side is paved (+1 = paved below), the approach lane. */
const WEST_LANES: [number, number] = [20.08, 22 - MEDIAN_HALF - 0.1];
const EAST_LANES: [number, number] = [22 + MEDIAN_HALF + 0.1, 23.92];
const EDGES: readonly { y: number; paved: 1 | -1; stopX: [number, number] }[] = [
  // the north segment meets Freedom Way at y 18: southbound traffic (west carriageway, drive on the right) stops here
  { y: 18, paved: -1, stopX: WEST_LANES },
  // the south segment meets Freedom Way at y 21: northbound traffic (east carriageway) stops here
  { y: 21, paved: 1, stopX: EAST_LANES },
  // the south segment meets the expressway at y 30: southbound traffic stops here
  { y: 30, paved: -1, stopX: WEST_LANES },
];

const KERB_DARK = 'rgb(24,24,24)';
const KERB_LIGHT = 'rgb(236,236,230)';

/** The concrete edge restraint and a soldier course (blocks laid across the road) where the paving ends. */
function paintEdge(g: Ctx, r: () => number, e: (typeof EDGES)[number]): void {
  const x0 = 20 * T;
  const x1 = 24 * T;
  const band = 0.13 * T;
  const s = ADMIRALTY_PAVERS;
  // the soldier course: plain rectangular blocks, long side across the direction of the rows
  const course = s.length * 0.62;
  const yc = e.paved === 1 ? e.y * T + band : e.y * T - band - course;
  g.fillStyle = s.joint;
  g.fillRect(x0, yc, x1 - x0, course);
  g.lineWidth = s.jointWidth;
  g.strokeStyle = s.joint;
  for (let x = x0; x < x1; x += s.height) {
    const v = (r() - 0.5) * 2 * s.variation;
    g.fillStyle = `rgb(${Math.round(s.tone[0] - 6 + v)},${Math.round(s.tone[1] - 6 + v)},${Math.round(s.tone[2] - 7 + v)})`;
    const w = Math.min(s.height, x1 - x);
    g.fillRect(x, yc, w, course);
    g.strokeRect(x, yc, w, course);
  }
  // the restraint: a cast concrete strip, paler than the blocks, with a dark joint on the asphalt side
  const yb = e.paved === 1 ? e.y * T : e.y * T - band;
  g.fillStyle = 'rgb(188,186,178)';
  g.fillRect(x0, yb, x1 - x0, band);
  g.fillStyle = 'rgba(40,40,40,0.55)';
  g.fillRect(x0, e.paved === 1 ? yb : yb + band - 3, x1 - x0, 3);
  // the stop line on the lane that approaches the junction, just inside the soldier course
  const ys = e.paved === 1 ? yc + course + 0.05 * T : yc - 0.05 * T - 0.1 * T;
  g.fillStyle = 'rgba(244,242,232,0.92)';
  g.fillRect(e.stopX[0] * T, ys, (e.stopX[1] - e.stopX[0]) * T, 0.1 * T);
}

/** The planted median between two black-and-white kerbs, with a rounded nose at each end. */
function paintMedian(g: Ctx, r: () => number, ya: number, yb: number): void {
  const mx0 = (MEDIAN_X - MEDIAN_HALF) * T;
  const mw = MEDIAN_HALF * 2 * T;
  const kw = 0.07 * T;
  const rad = MEDIAN_HALF * T + kw;
  const top = ya * T + rad;
  const bot = yb * T - rad;
  // kerb first (a rounded outline one kerb wider than the grass), then the grass inside it
  g.fillStyle = KERB_LIGHT;
  roundedStrip(g, MEDIAN_X * T, top, bot, rad);
  const seg = 0.5 * T;
  for (let i = 0, y = top; y < bot; i++, y += seg) {
    if (i % 2 !== 0) continue;
    g.fillStyle = KERB_DARK;
    const h = Math.min(seg, bot - y);
    g.fillRect(mx0 - kw, y, kw, h);
    g.fillRect(mx0 + mw, y, kw, h);
  }
  g.fillStyle = KERB_DARK; // the noses are painted dark, the warning end of a kerb
  g.beginPath();
  g.arc(MEDIAN_X * T, top, rad, Math.PI, 0);
  g.arc(MEDIAN_X * T, bot, rad, 0, Math.PI);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgb(94,108,66)';
  roundedStrip(g, MEDIAN_X * T, top, bot, MEDIAN_HALF * T);
  g.fillStyle = 'rgba(60,78,40,0.55)';
  const n = Math.round((yb - ya) * 14);
  for (let i = 0; i < n; i++) g.fillRect(mx0 + r() * (mw - 3), top + r() * (bot - top), 3, 3);
}

/** A vertical strip with half-round ends: centre x, the two end-circle centres and the radius. */
function roundedStrip(g: Ctx, cx: number, top: number, bot: number, rad: number): void {
  g.beginPath();
  g.arc(cx, top, rad, Math.PI, 0);
  g.lineTo(cx + rad, bot);
  g.arc(cx, bot, rad, 0, Math.PI);
  g.closePath();
  g.fill();
}

/** Lane dividers (white dashes) at the middle of each carriageway, the median, and the ends of the paving. */
export function paintAdmiraltyWayDetails(g: Ctx, r: () => number): void {
  for (const rect of ADMIRALTY_WAY_PAVED) {
    const y0 = rect.y0 + (rect.y0 === 21 ? 0.6 : 0);
    const y1 = rect.y1 + 1 - (rect.y1 === 17 || rect.y1 === 29 ? 0.6 : 0);
    for (const x of [21, 23]) dash(g, x, y0, x, y1, 'rgba(238,236,224,0.8)', 5, 0.7, 0.9);
  }
  for (const [ya, yb] of MEDIANS) paintMedian(g, r, ya, yb);
  for (const e of EDGES) paintEdge(g, r, e);
}
