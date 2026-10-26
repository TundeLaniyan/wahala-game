/**
 * The look of a Danfo DEPARTURE (a stage-hazard sweep flagged `depart`, RE-E3): a parked Danfo on its
 * bay, warning with horn, blinkers and reversing lamps, rolling back a hand's breadth and then pulling
 * out and accelerating along the departure lane to the board edge.
 *
 * Pure helpers (no three.js) so the picture is unit-tested. The SIMULATION keeps its uniform
 * `stepTicks` per tile (the bots' danger windows read it, so it must stay exact); the pull-out is eased
 * in the picture only. The drawn vehicle never runs AHEAD of the lethal tile and lags it by at most
 * `DEPART_LAG` tiles once it is up to speed.
 */
import { stepProgress } from './motion';

/** Tiles over which the vehicle accelerates from rest to cruising speed. */
export const DEPART_RAMP = 1.6;
/** How far the drawn vehicle trails the sim's position once at speed (tiles). */
export const DEPART_LAG = DEPART_RAMP / 2;
/** The roll back before the launch, in tiles. */
export const ROLLBACK_TILES = 0.14;
/** Share of the warning (0..1) after which the vehicle starts to roll back with its reversing lamps on. */
export const ROLLBACK_FROM = 0.78;

const smooth = (t: number): number => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

/**
 * How far along the route (in tiles, from the bay) the SIMULATION says the vehicle is. Index -1 (still
 * warning) and index 0 (the first step, the dwell on the bay) are both 0; from index j >= 1 the vehicle
 * moves from tile j-1 to tile j.
 */
export function departDistance(
  index: number,
  stepRemaining: number,
  stepTicks: number,
  alpha: number,
): number {
  if (index <= 0) return 0;
  return index - 1 + stepProgress(stepRemaining, stepTicks, alpha);
}

/** Eased distance: from rest, speeding up over `DEPART_RAMP` tiles, then cruising `DEPART_LAG` tiles behind the sim. */
export function easeDepart(u: number): number {
  if (u <= 0) return 0;
  return u < DEPART_RAMP ? (u * u) / (2 * DEPART_RAMP) : u - DEPART_LAG;
}

/** Speed as a share of cruising speed (wheel spin, exhaust): 0 parked, 1 at speed. */
export function departSpeed(u: number): number {
  return u <= 0 ? 0 : Math.min(1, u / DEPART_RAMP);
}

/**
 * The roll back in tiles (positive = backwards): grows during the last part of the warning, holds through
 * the dwell and eases away over the first half tile of the launch.
 */
export function departRollback(warnProgress: number, u: number): number {
  if (u > 0) return ROLLBACK_TILES * (1 - smooth(u / 0.5));
  return ROLLBACK_TILES * smooth((warnProgress - ROLLBACK_FROM) / (1 - ROLLBACK_FROM));
}

export interface RoutePoint {
  /** Tile coordinates (continuous; tile centres are integers). */
  x: number;
  y: number;
  /** Unit direction of the segment the point lies on. */
  dx: number;
  dy: number;
}

/**
 * The point `u` tiles along a route of tile indices on a board `width` tiles wide. Before the first tile
 * (u < 0, the roll back) it extends backwards along the first segment; beyond the last it extends
 * forwards along the last.
 */
export function routePoint(tiles: readonly number[], u: number, width: number): RoutePoint {
  const at = (i: number): { x: number; y: number } => ({
    x: tiles[i]! % width,
    y: Math.floor(tiles[i]! / width),
  });
  const dir = (i: number): { dx: number; dy: number } => {
    const a = at(i);
    const b = at(i + 1);
    return { dx: Math.sign(b.x - a.x), dy: Math.sign(b.y - a.y) };
  };
  if (tiles.length < 2) return { ...at(0), dx: 1, dy: 0 };
  if (u <= 0) {
    const p = at(0);
    const d = dir(0);
    return { x: p.x + d.dx * u, y: p.y + d.dy * u, ...d };
  }
  const last = tiles.length - 1;
  if (u >= last) {
    const p = at(last);
    const d = dir(last - 1);
    return { x: p.x + d.dx * (u - last), y: p.y + d.dy * (u - last), ...d };
  }
  const i = Math.floor(u);
  const a = at(i);
  const d = dir(i);
  const f = u - i;
  return { x: a.x + d.dx * f, y: a.y + d.dy * f, ...d };
}

/** Blinker state at time `t`: on/off, flashing faster as the departure nears (`warnProgress` 0..1). */
export function blinkerOn(t: number, warnProgress: number): boolean {
  return Math.floor(t * (3 + 6 * warnProgress)) % 2 === 0;
}

/** Horn pulse 0..1 (a ring growing off the vehicle): two short blasts, near the start and the middle of the warning. */
export function hornPulse(warnProgress: number): number {
  for (const [from, to] of [
    [0.02, 0.16],
    [0.46, 0.6],
  ] as const)
    if (warnProgress >= from && warnProgress < to) return (warnProgress - from) / (to - from);
  return -1;
}
