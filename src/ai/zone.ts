/**
 * Safe-zone field for large boards where the city closes in (City Rumble). The closing order and its
 * timing are public (`obs.crush`: every tile's landing time follows from `order` and `warnAt`), so a
 * bot may plan around it like a human looking at the minimap.
 *
 * `zone[t]` is the walking cost from tile t to the nearest tile that stays open at least ZONE_LEAD
 * ticks longer (soft blocks cost extra, concrete is impassable). Goal scoring subtracts
 * ZONE_WEIGHT * zone, which pulls bots inwards ahead of the closing ring. Standard boards never use it.
 */
import { Tile } from '../sim';
import type { CrushState, Observation } from '../sim';
import type { Ctx } from './context';

/** Score per tile of walking cost to the safe area (hunting costs 0.12-0.25 per tile). */
export const ZONE_WEIGHT = 0.8;
/** A tile closing sooner than this (ticks from now) is outside the safe area. */
export const ZONE_LEAD = 1500;
/** The field is recomputed this often (ticks). */
const ZONE_EVERY = 30;
const FAR = 999;
/** Hunting pull on a large board as a multiple of the profile's: at the opening and once the core is all that is left. */
export const HUNT_PACE_MIN = 0.3;
export const HUNT_PACE_MAX = 3;

/** Play tick at which each tile lands (Infinity = never closes), cached per crush order. */
const closeCache = new WeakMap<readonly number[], Float64Array>();

export function closeTicks(obs: Observation, crush: Readonly<CrushState>): Float64Array {
  let out = closeCache.get(crush.order);
  if (!out) {
    out = new Float64Array(obs.width * obs.height).fill(Infinity);
    const warn = obs.config.crush.warnTicks;
    for (let j = 0; j < crush.order.length; j++) out[crush.order[j]!] = crush.warnAt[j]! + warn;
    closeCache.set(crush.order, out);
  }
  return out;
}

let queue = new Int32Array(0);
let inQueue = new Uint8Array(0);

/** Updates `c.zone` when due. Leaves `c.zoneTick = -1` (no effect) until the closing is near. */
export function updateZone(c: Ctx): void {
  const { world } = c;
  const { obs, board } = world;
  const crush = obs.crush;
  if (!world.large || !crush || obs.match.phase !== 'playing') {
    c.zoneTick = -1;
    return;
  }
  if (c.zoneTick >= 0 && obs.tick - c.zoneTick < ZONE_EVERY) return;
  const close = closeTicks(obs, crush);
  const horizon = obs.match.playTicks + ZONE_LEAD;
  const first = crush.order.length > 0 ? close[crush.order[0]!]! : Infinity;
  if (first > horizon) {
    c.zoneTick = -1;
    return;
  }
  const zone = c.zone;
  const size = board.size;
  if (queue.length < size) {
    queue = new Int32Array(size * 4);
    inQueue = new Uint8Array(size);
  }
  zone.fill(FAR);
  inQueue.fill(0, 0, size);
  let tail = 0;
  for (let t = 0; t < size; t++) {
    if (obs.tiles[t] === Tile.Hard || close[t]! <= horizon) continue;
    zone[t] = 0;
    queue[tail++] = t;
    inQueue[t] = 1;
  }
  // small-integer costs: a label-correcting sweep (ring buffer) converges quickly
  for (let head = 0; head !== tail; head = (head + 1) % queue.length) {
    const u = queue[head]!;
    inQueue[u] = 0;
    for (let d = 0; d < 4; d++) {
      const v = board.neighbor[u * 4 + d]!;
      if (v < 0) continue;
      const kind = obs.tiles[v];
      if (kind === Tile.Hard) continue;
      const cost = kind === Tile.Soft ? 3 : 1;
      if (zone[u]! + cost < zone[v]!) {
        zone[v] = zone[u]! + cost;
        if (!inQueue[v]) {
          inQueue[v] = 1;
          queue[tail] = v;
          tail = (tail + 1) % queue.length;
        }
      }
    }
  }
  c.zoneTick = obs.tick;
}

/**
 * Large boards: how hard bots seek rivals out, as a multiple of their profile's hunting weight. Early
 * on they work their own district (crates, upgrades, fights that come to them); the pull reaches the
 * profile's own value when the city starts closing, then keeps growing until the ring has closed so
 * the last few in the core go for each other instead of waiting out the clock.
 */
export function largeHuntPace(obs: Observation): number {
  const cfg = obs.config;
  const closeStart = cfg.match.durationTicks - cfg.crush.startRemainingTicks;
  const coreAt = cfg.match.durationTicks - cfg.crush.coreClosedRemainingTicks;
  const t = obs.match.playTicks;
  if (t < closeStart) return HUNT_PACE_MIN + ((1 - HUNT_PACE_MIN) * t) / Math.max(1, closeStart);
  const k = Math.min(1, (t - closeStart) / Math.max(1, coreAt - closeStart));
  return 1 + (HUNT_PACE_MAX - 1) * k;
}
