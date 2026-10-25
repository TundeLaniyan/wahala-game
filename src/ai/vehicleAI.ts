/**
 * Vehicle Voucher usage. The bot begins entry mode only when it has already found a legal entry
 * (and, for Keke, a legal turn) that is worth using; the next tick it launches that route if it is
 * still valid, otherwise it cancels. It never drives through its own tile and requires that it can
 * still reach a safe refuge once the vehicle is on the road.
 *
 * Easy: any route through a rival. Medium: routes that leave a rival no escape (or wait, then settle
 * for pressure). Hard: also routes that cut the rival's remaining escapes down, combined with the
 * generators already ticking, and it values Okada riders correctly (they need two events).
 */
import { CHARACTERS, buildRoute, listEntries, listKekeTurns, nextFloat, straightLeg } from '../sim';
import type { EntryView, Intent, TilePos, VehicleEntry, VehicleTurn } from '../sim';
import { protectionLayers, rivalEscape, searchRefuge } from './analysis';
import { baselineRefuges } from './goals';
import { overBudget, spend } from './context';
import type { Ctx } from './context';
import { readyTick, stepTicksOf } from './world';

export interface Choice {
  entry: VehicleEntry;
  turn?: VehicleTurn;
  score: number;
}

export interface VehicleMemory {
  pending: Choice | null;
  pendingAt: number;
  haveSince: number;
  nextEval: number;
}

export const newVehicleMemory = (): VehicleMemory => ({
  pending: null,
  pendingAt: -1,
  haveSince: -1,
  nextEval: 0,
});

/** The sim's route helpers only read width / height / tiles / config, which the Observation carries. */
const geometry = (c: Ctx): EntryView => c.world.obs;

interface Cand {
  entry: VehicleEntry;
  turn?: VehicleTurn;
  route: TilePos[];
  cheap: number;
}

/** Diamond offsets at Manhattan distance 1 and 2 (rivals "near" a route tile). */
const NEAR_OFFSETS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -2],
  [1, -1],
  [2, 0],
  [1, 1],
  [0, 2],
  [-1, 1],
  [-2, 0],
  [-1, -1],
];

/**
 * Rival contact counts along a route, read from the per-tile rival counts: identical to comparing
 * every route tile with every rival, without the rival loop (City Rumble has up to 31 rivals).
 */
function contacts(
  c: Ctx,
  route: readonly TilePos[],
  out: { direct: number; near: number; first: number },
): void {
  const { world } = c;
  const { width: w, height: h } = world.board;
  out.direct = out.near = 0;
  out.first = 99;
  route.forEach((t, i) => {
    const here = world.rivalAt[t.y * w + t.x]!;
    if (here > 0) {
      out.direct += here;
      out.first = Math.min(out.first, i);
    }
    for (const [dx, dy] of NEAR_OFFSETS) {
      const x = t.x + dx;
      const y = t.y + dy;
      if (x >= 0 && y >= 0 && x < w && y < h) out.near += world.rivalAt[y * w + x]!;
    }
  });
}

/** True when some rival stands within 2 rows / columns of the straight line through `t` along `dir`. */
function laneHasRival(c: Ctx, t: TilePos, dir: VehicleEntry['dir']): boolean {
  const horizontal = dir === 'left' || dir === 'right';
  for (const r of c.world.rivals) if (Math.abs(horizontal ? r.y - t.y : r.x - t.x) <= 2) return true;
  return false;
}

const DIR_STEP = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] } as const;

function routeCandidates(c: Ctx): Cand[] {
  const { world } = c;
  const { me, obs } = world;
  const kind = CHARACTERS[me.characterId].vehicle;
  const geom = geometry(c);
  const w = world.board.width;
  const out: Cand[] = [];
  const counts = { direct: 0, near: 0, first: 99 };
  const consider = (entry: VehicleEntry, route: TilePos[], turn?: VehicleTurn): void => {
    if (route.some((t) => t.x === me.x && t.y === me.y)) return;
    contacts(c, route, counts);
    const { direct, near, first } = counts;
    let softs = 0;
    for (const t of route) if (obs.tiles[t.y * w + t.x] === 2) softs++;
    const cheap = direct * 10 + near - first * 0.05 + Math.min(softs, 3) * 0.5;
    if (direct === 0 && (c.profile.vehicle !== 'strategic' || near < 3)) return;
    out.push({ entry, turn, route, cheap });
  };
  // A route can only score if a rival stands within two tiles of one of its legs, so lanes with
  // nobody near them are skipped before any route is built (exact: such routes are rejected anyway).
  if (kind === 'keke') {
    for (const entry of listEntries(geom, 'keke')) {
      const leg = straightLeg(geom, entry);
      const legLane = laneHasRival(c, entry, entry.dir);
      for (const turn of listKekeTurns(geom, entry)) {
        const at = leg[turn.atIndex]!;
        if (!legLane && !laneHasRival(c, at, turn.dir)) continue;
        const v = DIR_STEP[turn.dir];
        // identical to buildRoute(): the first leg up to the turn, then straight on until concrete
        const second = straightLeg(geom, { x: at.x + v[0], y: at.y + v[1], dir: turn.dir });
        consider(entry, [...leg.slice(0, turn.atIndex + 1), ...second], turn);
      }
    }
  } else {
    for (const entry of listEntries(geom, kind)) {
      if (!laneHasRival(c, entry, entry.dir)) continue;
      const route = buildRoute(geom, kind, entry);
      if (route) consider(entry, route);
    }
  }
  out.sort((a, b) => b.cheap - a.cheap);
  return out;
}

/** Scores the best legal route for the current situation (null when there is none). */
function bestRoute(c: Ctx, launchTick: number): Choice | null {
  const { world, profile } = c;
  const { me, obs } = world;
  const kind = CHARACTERS[me.characterId].vehicle;
  // Team Rumble with friendly fire: never drive through a teammate (with it off, the vehicle passes them)
  const cands = world.friendlyFire
    ? routeCandidates(c).filter((cand) => !cand.route.some((t) => world.friendAt[t.y * world.board.width + t.x]! > 0))
    : routeCandidates(c);
  if (cands.length === 0) return null;
  if (profile.vehicle === 'naive') {
    const pick = cands[Math.min(cands.length - 1, Math.floor(nextFloat(c.rng) * Math.min(3, cands.length)))]!;
    return { entry: pick.entry, turn: pick.turn, score: pick.cheap };
  }
  const step = stepTicksOf(obs, me);
  const ready = readyTick(obs, me);
  const budget = profile.vehicle === 'strategic' ? 8 : 5;
  const w = world.board.width;
  let best: Choice | null = null;
  c.work = 0; // the vehicle check runs between thinks: it gets its own (large-board) budget
  for (const cand of cands.slice(0, budget)) {
    if (overBudget(c)) break;
    c.builder.build(c.tmp, world, profile, { extraVehicles: [{ kind, route: cand.route, launchTick }] });
    spend(c);
    // I must still be able to get clear once the vehicle is on the road
    if (!searchRefuge(c, c.tmp, world.myTile, obs.tick, ready, step)) continue;
    let score = 0;
    for (const r of world.rivals) {
      const onRoute = cand.route.some((t) => t.x === r.x && t.y === r.y);
      const near = cand.route.some((t) => Math.abs(t.x - r.x) + Math.abs(t.y - r.y) <= 2);
      if (!onRoute && !(profile.vehicle === 'strategic' && near)) continue;
      if (overBudget(c)) break;
      const layers = protectionLayers(r); // Okada / Armour: a hit only costs them a layer
      const shield = layers > 0 ? 0.3 / layers : 1;
      const e = rivalEscape(c, c.tmp, r, 6, profile.vehicle === 'strategic', undefined);
      if (e.refuges === 0) {
        score += 100 * shield;
        continue;
      }
      if (profile.vehicle === 'strategic') {
        const before = baselineRefuges(c, r.id);
        const ratio = before > 0 ? e.refuges / before : 1;
        score += 30 * (1 - ratio) * shield;
      }
      if (onRoute) score += 6 * shield;
    }
    let softs = 0;
    for (const t of cand.route) if (obs.tiles[t.y * w + t.x] === 2) softs++;
    score += Math.min(softs, 4) * 0.5;
    if (!best || score > best.score) best = { entry: cand.entry, turn: cand.turn, score };
  }
  return best;
}

/** How good a route must be before the voucher is spent. */
function threshold(c: Ctx, heldFor: number): number {
  const { profile, world } = c;
  const late = world.obs.match.playTicks > 75 * 60;
  const patient = profile.vehicle === 'strategic' ? 25 * 60 : 18 * 60;
  if (late || heldFor > patient) return 6;
  return profile.vehicle === 'strategic' ? 28 : 60;
}

export function vehicleTactic(c: Ctx, mem: VehicleMemory, intent: Intent, safeHere: boolean): void {
  const { world, profile } = c;
  const { obs, me } = world;
  const T = obs.tick;
  if (!me.hasVoucher) {
    mem.pending = null;
    mem.haveSince = -1;
    return;
  }
  if (mem.haveSince < 0) mem.haveSince = T;
  const warn = obs.config.vehicles.entryWarnTicks;

  if (me.entryUntil !== null) {
    // In entry mode the bot cannot walk: launch now if the route still stands, else look again, else cancel.
    delete intent.move;
    let choice = mem.pending;
    const kind = CHARACTERS[me.characterId].vehicle;
    const stillLegal =
      choice !== null &&
      buildRoute(geometry(c), kind, choice.entry, choice.turn) !== null &&
      !buildRoute(geometry(c), kind, choice.entry, choice.turn)!.some((t) => t.x === me.x && t.y === me.y);
    if (!stillLegal) choice = bestRoute(c, T + 1 + warn);
    if (choice && (profile.vehicle === 'naive' || choice.score >= 6 || mem.pending === null)) {
      intent.vehicle = { type: 'launch', entry: choice.entry, turn: choice.turn };
      mem.pending = null;
      mem.haveSince = -1;
    } else if (T > me.entryUntil - 20 || !choice) {
      intent.vehicle = { type: 'cancel' };
      mem.pending = null;
    }
    return;
  }
  if (mem.pending !== null && T - mem.pendingAt > 6) mem.pending = null;
  if (T < mem.nextEval || !safeHere || me.carrying !== null || T < me.dazedUntil) return;
  if (obs.vehicles.some((v) => v.ownerId === me.id)) return;
  mem.nextEval = T + (profile.vehicle === 'naive' ? 45 : profile.vehicle === 'purposeful' ? 20 : 12);
  if (profile.vehicle === 'naive' && nextFloat(c.rng) > 0.5) return;
  const choice = bestRoute(c, T + 2 + warn);
  if (!choice || choice.score < threshold(c, T - mem.haveSince)) return;
  mem.pending = choice;
  mem.pendingAt = T;
  intent.vehicle = { type: 'begin' };
  delete intent.move;
  delete intent.place;
}
