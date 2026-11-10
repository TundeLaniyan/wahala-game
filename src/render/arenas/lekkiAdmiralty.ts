/**
 * Lekki Phase 1: Admiralty Way's road furniture (presentation only; docs/LEKKI_ADMIRALTY_WAY.md). Admiralty Way is the ONLY
 * interlocking-paved road of Lekki Phase 1 (decision LI7; `lekkiRoads.ts`, `paving/material.ts`), through its own crossing
 * with Freedom Way; this module paints what sits on it: the planted median between black-and-white kerbs (founder
 * photographs), white lane dashes in each carriageway, stop lines on the lanes approaching Freedom Way and the
 * expressway, and a cast-concrete edge restraint wherever the block road meets asphalt: across the road at the
 * expressway, and down each side of the crossing box where Freedom Way's asphalt lanes meet it.
 *
 * The geometry is untouched: this is floor paint only (the median is a painted strip, not an obstacle; every tile
 * stays walkable exactly as before; no mesh, no collision, no draw call).
 */
import { dash } from './rumbleV2Kit';
import { T } from './floorKit';
import type { Ctx } from './floorKit';

/** Admiralty Way's carriageway (inclusive tiles): from the plaza to the expressway, across the Freedom Way crossing. */
export const ADMIRALTY_WAY = { x0: 20, y0: 10, x1: 23, y1: 29 } as const;

/** Admiralty Way's intersection box with Freedom Way (inclusive rows): paved, like the rest of Admiralty Way. */
export const CROSSING = { y0: 18, y1: 20 } as const;

/** Lane dashes run between the junctions (tile rows): the plaza to Freedom Way, Freedom Way to the expressway. */
const DASH_RUNS: readonly [number, number][] = [
  [10, 17.4],
  [21.6, 29.4],
];

/** The painted median runs along the road's centre line (tile boundary 22) and stops short of each junction. */
const MEDIAN_X = 22;
const MEDIAN_HALF = 0.2;
/** Median runs (tile rows, boundaries): the plaza to Freedom Way, Freedom Way to the expressway. */
const MEDIANS: readonly [number, number][] = [
  [10, 17.25],
  [21.75, 29.45],
];

const WEST_LANES: [number, number] = [20.08, 22 - MEDIAN_HALF - 0.1];
const EAST_LANES: [number, number] = [22 + MEDIAN_HALF + 0.1, 23.92];
/** Stop lines on the lanes approaching a junction (drive on the right): the boundary row and which side the lane is on. */
const STOPS: readonly { y: number; from: 1 | -1; x: [number, number] }[] = [
  { y: 18, from: -1, x: WEST_LANES }, // southbound, at Freedom Way
  { y: 21, from: 1, x: EAST_LANES }, // northbound, at Freedom Way
  { y: 30, from: -1, x: WEST_LANES }, // southbound, at the expressway
];

const KERB_DARK = 'rgb(24,24,24)';
const KERB_LIGHT = 'rgb(236,236,230)';

/** The stop line, a little back from the junction edge. */
function paintStop(g: Ctx, s: (typeof STOPS)[number]): void {
  const ys = s.from === 1 ? s.y * T + 0.22 * T : s.y * T - 0.22 * T - 0.1 * T;
  g.fillStyle = 'rgba(244,242,232,0.92)';
  g.fillRect(s.x[0] * T, ys, (s.x[1] - s.x[0]) * T, 0.1 * T);
}

/** Where the block road meets asphalt, a cast-concrete edge strip (paler than the blocks, a dark joint on the asphalt side). */
function paintRestraintStrip(
  g: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  joint: 'n' | 's' | 'e' | 'w',
): void {
  g.fillStyle = 'rgb(176,174,166)';
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(40,40,40,0.5)';
  if (joint === 's') g.fillRect(x, y + h - 3, w, 3);
  else if (joint === 'n') g.fillRect(x, y, w, 3);
  else if (joint === 'w') g.fillRect(x, y, 3, h);
  else g.fillRect(x + w - 3, y, 3, h);
}

/**
 * The edge restraints: across Admiralty Way at the expressway, and down the west and east sides of the crossing box
 * (rows 18-20) where Freedom Way's asphalt carriageways meet the paved crossing (decision LI7).
 */
function paintRestraint(g: Ctx): void {
  const x0 = ADMIRALTY_WAY.x0 * T;
  const x1 = (ADMIRALTY_WAY.x1 + 1) * T;
  const band = 0.12 * T;
  paintRestraintStrip(g, x0, (ADMIRALTY_WAY.y1 + 1) * T - band, x1 - x0, band, 's');
  const y0 = CROSSING.y0 * T;
  const h = (CROSSING.y1 + 1 - CROSSING.y0) * T;
  paintRestraintStrip(g, x0, y0, band, h, 'w');
  paintRestraintStrip(g, x1 - band, y0, band, h, 'e');
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

/** Lane dividers (white dashes) in each carriageway, the median, the stop lines and the edge restraint. */
export function paintAdmiraltyWayDetails(g: Ctx, r: () => number): void {
  for (const [y0, y1] of DASH_RUNS)
    for (const x of [21, 23]) dash(g, x, y0, x, y1, 'rgba(238,236,224,0.8)', 5, 0.7, 0.9);
  for (const [ya, yb] of MEDIANS) paintMedian(g, r, ya, yb);
  for (const st of STOPS) paintStop(g, st);
  paintRestraint(g);
}
