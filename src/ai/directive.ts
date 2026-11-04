/**
 * Crew directives (campaign missions). The sim hands a crew bot an optional `Observation.directive` computed from its
 * NPC role (src/sim/mission/directives.ts). This module turns it into movement preferences for the ordinary planner:
 *
 *   guard    walk to the post and stay within `radius` of it; once a rival is inside the radius (+2), hunt that rival;
 *   block    stand on the tile;
 *   run      walk to the tile (a restock / re-arm / objective tile);
 *   escort   stay within `radius` of the tile's occupant (the boss);
 *   support  stay within `radius` of an ally;
 *   chase    hunt the rivals (the default hunt field) with at least the directive pull;
 *   flee     keep away from the rival (the exposed boss): the hunt field is inverted and capped.
 *
 * Only the hunt field, its weight and a leash penalty change; every step, placement and escape check is still the
 * normal bot's, so a directed bot obeys the same rules and sees the same observation as any other.
 */
import { Tile } from '../sim';
import { manhattanTiles } from './board';
import type { Ctx } from './context';

/** Minimum pull (score per tile of walking distance) of a directive. Wins over the Rookie's random wobble in most re-plans. */
export const DIRECTIVE_PULL = 0.5;
/** Score per tile outside the leash radius. */
export const LEASH_WEIGHT = 1;
/** Flee: how much each tile of distance from the rival is worth, and the distance beyond which more is worth nothing. */
export const FLEE_WEIGHT = 0.45;
export const FLEE_CAP = 14;
const HUNT_FAR = 999;

let queue: number[] = [];
let inQueue = new Uint8Array(0);

/** Replaces the hunt field with the walking distance to `tile` (same costs as the rival hunt field). */
function huntFromTile(c: Ctx, tile: number): void {
  const { world, hunt } = c;
  const { board, obs } = world;
  hunt.fill(HUNT_FAR);
  queue.length = 0;
  if (inQueue.length < board.size) inQueue = new Uint8Array(board.size);
  inQueue.fill(0, 0, board.size);
  hunt[tile] = 0;
  queue.push(tile);
  inQueue[tile] = 1;
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head]!;
    inQueue[u] = 0;
    for (let d = 0; d < 4; d++) {
      const v = board.neighbor[u * 4 + d]!;
      if (v < 0) continue;
      const kind = obs.tiles[v];
      if (kind === Tile.Hard) continue;
      const cost = kind === Tile.Soft ? 4 : world.genAt[v]! >= 0 ? 3 : 1;
      if (hunt[u]! + cost < hunt[v]!) {
        hunt[v] = hunt[u]! + cost;
        if (!inQueue[v]) {
          inQueue[v] = 1;
          queue.push(v);
        }
      }
    }
  }
}

/** Called by the brain right after the hunt field and its weight are set for a think. No directive = no change. */
export function applyDirective(c: Ctx): void {
  c.leash = null;
  const d = c.world.obs.directive;
  if (!d) return;
  const { world } = c;
  const { board } = world;
  if (d.x < 0 || d.y < 0 || d.x >= board.width || d.y >= board.height) return;
  const tile = d.y * board.width + d.x;
  const radius = d.radius ?? 0;
  switch (d.kind) {
    case 'chase':
      c.huntWeight = Math.max(c.huntWeight, DIRECTIVE_PULL);
      return;
    case 'flee':
      for (let i = 0; i < board.size; i++) if (c.hunt[i]! > FLEE_CAP) c.hunt[i] = FLEE_CAP;
      c.huntWeight = -FLEE_WEIGHT;
      return;
    case 'guard': {
      const intruder = world.rivals.some((r) => manhattanTiles(board, tile, r.y * board.width + r.x) <= radius + 2);
      if (!intruder) huntFromTile(c, tile);
      c.huntWeight = Math.max(c.huntWeight, DIRECTIVE_PULL);
      c.leash = { tile, radius };
      return;
    }
    case 'run':
      huntFromTile(c, tile);
      c.huntWeight = Math.max(c.huntWeight, DIRECTIVE_PULL);
      return;
    case 'block':
    case 'escort':
    case 'support':
      huntFromTile(c, tile);
      c.huntWeight = Math.max(c.huntWeight, DIRECTIVE_PULL);
      c.leash = { tile, radius };
      return;
  }
}

/** Score adjustment of a candidate tile for a directive's leash (0 without one). */
export function directiveBias(c: Ctx, tile: number): number {
  const l = c.leash;
  if (!l) return 0;
  const excess = manhattanTiles(c.world.board, tile, l.tile) - l.radius;
  return excess > 0 ? -LEASH_WEIGHT * excess : 0;
}
