/**
 * VEHICLE GENERATOR (decisions VG1-VG4): the 5-kill streak reward. A public vehicle (any of them, whatever the
 * fighter's character) drives a lane carrying a LIVE generator whose whole three-second fuse starts when the vehicle
 * starts driving. About two seconds in, the carrier lets go and the generator is THROWN at the selected rival
 * (a visible projectile with a landing marker, then a last short fuse on the ground). It never rams: the threat is
 * the generator. Deterministic: the route is chosen by `autoVehicle.ts`, the target by distance then id, the landing
 * tile by a fixed search order, and nothing here uses the RNG.
 *
 * Owner safety: the route never runs over the owner (`autoVehicle.ts` scores it out), the rival is never the owner
 * or a teammate, the landing prefers a tile whose blast footprint excludes the owner, and the blast's flames carry
 * `ownerSafe` so the owner is never caught by it.
 */
import { DIRS, DIR_VEC, tileAt } from '../grid';
import { Tile } from '../types';
import type { GameState, Generator, Player, SimEvent, TilePos, Vehicle } from '../types';
import { previewBlast } from './explosions';
import { groundedGeneratorAt, teammates } from './queries';

/** The rival a route is aimed at: the nearest to any tile of it (ties: lower id). Never the owner or a teammate. */
export function pickRouteTarget(state: GameState, owner: Readonly<Player>, route: readonly TilePos[]): number | null {
  let best: { id: number; d: number } | null = null;
  for (const o of state.players) {
    if (!o.alive || o.id === owner.id || teammates(owner, o)) continue;
    let d = Infinity;
    for (const t of route) d = Math.min(d, Math.abs(t.x - o.x) + Math.abs(t.y - o.y));
    if (!best || d < best.d) best = { id: o.id, d };
  }
  return best ? best.id : null;
}

/** The tile a vehicle currently occupies (its first route tile before it has moved). */
const vehicleTile = (v: Vehicle): TilePos => v.route[Math.max(0, Math.min(v.index, v.route.length - 1))]!;

/** Puts the live generator on the vehicle the moment it starts driving: the three-second fuse starts now. */
export function mountGenerator(state: GameState, v: Vehicle, events: SimEvent[]): void {
  const payload = v.payload;
  if (!payload || payload.generatorId >= 0) return;
  const owner = state.players[v.ownerId]!;
  const cfg = state.config.streaks.vehicleGenerator;
  const t = vehicleTile(v);
  const g: Generator = {
    id: state.nextId++,
    ownerId: v.ownerId,
    x: t.x,
    y: t.y,
    stepFromX: t.x,
    stepFromY: t.y,
    range: owner.range,
    pierce: false,
    square: state.config.square.radiusByTier[Math.min(owner.squareTier, state.config.square.maxTier)] ?? 0,
    fromSpectator: false,
    mode: 'timed',
    timer: cfg.fuseTicks,
    carriedBy: null,
    carryBonusUsed: true,
    slide: null,
    // "airborne" for the rest of the world: it blocks nobody, nobody can kick it, a chain cannot set it off early
    flight: { fromX: t.x, fromY: t.y, remaining: 1_000_000, total: 1_000_000 },
    triggered: false,
    placedTick: state.tick,
    vehicleBorne: true,
    mountedOn: v.id,
  };
  state.generators.push(g);
  payload.generatorId = g.id;
  payload.releaseTick = state.tick + cfg.releaseTicks;
  events.push({
    type: 'vehicleGeneratorLaunched',
    vehicleId: v.id,
    ownerId: v.ownerId,
    kind: v.kind,
    generatorId: g.id,
    targetId: payload.targetId,
  });
}

/** Keeps a carried generator on its vehicle (called each tick from the generator motion step). */
export function followVehicle(state: GameState, g: Generator): boolean {
  const v = state.vehicles.find((o) => o.id === g.mountedOn);
  if (!v) return false;
  const t = vehicleTile(v);
  const prev = v.index > 0 ? v.route[v.index - 1]! : t;
  g.stepFromX = prev.x;
  g.stepFromY = prev.y;
  g.x = t.x;
  g.y = t.y;
  return true;
}

/**
 * The carrier lets go: the generator is thrown at the rival (or dropped / fizzled when there is nowhere sensible).
 * Called at the release tick, and at once when the carrier leaves the board, crashes or is destroyed first.
 */
export function releaseGenerator(state: GameState, v: Vehicle, events: SimEvent[]): void {
  const payload = v.payload;
  if (!payload || payload.released) return;
  payload.released = true;
  const g = state.generators.find((o) => o.id === payload.generatorId);
  if (!g) return;
  delete g.mountedOn;
  const owner = state.players[v.ownerId]!;
  const from = vehicleTile(v);
  const target = pickTarget(state, owner, payload.targetId, from);
  const landing = chooseLanding(state, owner, g, target, from);
  if (!landing) {
    // nowhere safe to put it: it never goes off (a dud that is cleaned away)
    g.flight = null;
    g.x = from.x;
    g.y = from.y;
    state.generators.splice(state.generators.indexOf(g), 1);
    events.push({ type: 'generatorDudCleaned', generatorId: g.id, x: from.x, y: from.y });
    return;
  }
  const total = state.config.streaks.vehicleGenerator.throwTicks;
  g.stepFromX = from.x;
  g.stepFromY = from.y;
  g.x = landing.x;
  g.y = landing.y;
  g.flight = { fromX: from.x, fromY: from.y, remaining: total, total };
  events.push({
    type: 'vehicleGeneratorReleased',
    vehicleId: v.id,
    ownerId: v.ownerId,
    generatorId: g.id,
    fromX: from.x,
    fromY: from.y,
    toX: landing.x,
    toY: landing.y,
    targetId: target ? target.id : null,
    landTick: state.tick + total,
    boomTick: state.tick + Math.max(total, g.timer),
  });
}

function pickTarget(state: GameState, owner: Player, aimed: number | null, from: TilePos): Player | null {
  const ok = (o: Player | undefined): o is Player =>
    !!o && o.alive && o.id !== owner.id && !teammates(owner, o);
  const first = aimed === null ? undefined : state.players[aimed];
  if (ok(first)) return first;
  let best: { p: Player; d: number } | null = null;
  for (const o of state.players) {
    if (!ok(o)) continue;
    const d = Math.abs(o.x - from.x) + Math.abs(o.y - from.y);
    if (!best || d < best.d) best = { p: o, d };
  }
  return best ? best.p : null;
}

/** Candidate landing tiles: the rival's own tile, its four neighbours, then the ring two tiles out (fixed order). */
function candidates(target: TilePos): TilePos[] {
  const out: TilePos[] = [{ x: target.x, y: target.y }];
  for (const d of DIRS) out.push({ x: target.x + DIR_VEC[d].dx, y: target.y + DIR_VEC[d].dy });
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++)
      if (Math.abs(dx) + Math.abs(dy) === 2) out.push({ x: target.x + dx, y: target.y + dy });
  return out;
}

function chooseLanding(
  state: GameState,
  owner: Player,
  g: Generator,
  target: Player | null,
  from: TilePos,
): TilePos | null {
  const free = (t: TilePos): boolean =>
    tileAt(state, t.x, t.y) === Tile.Empty &&
    !groundedGeneratorAt(state, t.x, t.y) &&
    !state.generators.some((o) => o !== g && o.flight !== null && o.x === t.x && o.y === t.y);
  const spots = candidates(target ?? from).filter(free);
  if (spots.length === 0) return null;
  const ownerIdx = owner.y * state.width + owner.x;
  const savedX = g.x;
  const savedY = g.y;
  try {
    for (const s of spots) {
      g.x = s.x;
      g.y = s.y;
      // the blast must not reach the owner's tile (the flames are also ownerSafe, so this is a second guard)
      if (!previewBlast(state, g).has(ownerIdx)) return s;
    }
  } finally {
    g.x = savedX;
    g.y = savedY;
  }
  return spots[0]!;
}
