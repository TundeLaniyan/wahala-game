/**
 * Line of sight on the tile grid (Tactical Trap pilot, decision TT1; docs/TACTICAL_TRAP_PILOT.md). Pure geometry, no
 * rules and nothing random: it works on tile centres only (never screen space or the camera), so what an enemy can see
 * is the same at every graphics quality and from every viewpoint.
 *
 * THE RULE (one, deterministic, tested):
 *   - a TRACE from tile A to tile B is the integer Bresenham line between their centres, without the two end tiles;
 *   - a trace is BLOCKED when one of its tiles is not open floor (concrete, a crate: both are tall, the engine has no
 *     low cover tile) or holds a living body other than the observer's (the player, another enemy);
 *   - B is SEEN from A when it is within the vision radius AND at least one of the two traces (A to B, and B to A: the
 *     two differ on lines that are not straight, which is how a body covering only half of the line leaves a gap) is
 *     clear. So a body (or a wall) exactly on a straight line conceals what is behind it; one that covers only one of
 *     the two traces does not;
 *   - a body standing ON the target tile conceals it (the observer sees the person, not what is under them).
 */
import { inBounds } from '../grid';
import type { GridView } from '../grid';
import { Tile } from '../types';
import type { Player } from '../types';

/** The read-only part of a state / Observation that sight needs. */
export type SightView = GridView & { readonly players: readonly Readonly<Player>[] };

/** The tiles (row-major index) holding a living body other than `exceptId`'s. One small allocation per call. */
export function bodyTiles(view: SightView, exceptId: number): Set<number> {
  const out = new Set<number>();
  for (const p of view.players) if (p.alive && p.id !== exceptId) out.add(p.y * view.width + p.x);
  return out;
}

/** Is the Bresenham trace from (ax, ay) to (bx, by), ends excluded, blocked by a non-floor tile or a body tile? */
export function traceBlocked(
  view: GridView,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  bodies: ReadonlySet<number>,
): boolean {
  const dx = Math.abs(bx - ax);
  const dy = Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx - dy;
  let x = ax;
  let y = ay;
  // the line has at most width + height steps; the bound only guards against a malformed call
  for (let guard = 0; guard < view.width + view.height + 2; guard++) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    if (x === bx && y === by) return false;
    if (!inBounds(view, x, y)) return true;
    const i = y * view.width + x;
    if (view.tiles[i] !== Tile.Empty || bodies.has(i)) return true;
  }
  return true;
}

/**
 * Can an observer on (ax, ay) see the tile (bx, by) within `range` tiles? `bodies` is `bodyTiles(view, observerId)`
 * (built once per decision and shared by every generator).
 */
export function canSeeTile(
  view: GridView,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  range: number,
  bodies: ReadonlySet<number>,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx * dx + dy * dy > range * range) return false;
  if (dx === 0 && dy === 0) return true;
  if (bodies.has(by * view.width + bx)) return false; // a body on the tile hides what is under it
  return !traceBlocked(view, ax, ay, bx, by, bodies) || !traceBlocked(view, bx, by, ax, ay, bodies);
}
