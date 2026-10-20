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
import { CHARACTERS, buildRoute, listEntries, listKekeTurns, nextFloat } from '../sim';
import type { GameState, Intent, TilePos, VehicleEntry, VehicleTurn } from '../sim';
import { rivalEscape, searchRefuge } from './analysis';
import { baselineRefuges } from './goals';
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
const geometry = (c: Ctx): GameState => c.world.obs as unknown as GameState;

interface Cand {
  entry: VehicleEntry;
  turn?: VehicleTurn;
  route: TilePos[];
  cheap: number;
}

function routeCandidates(c: Ctx): Cand[] {
  const { world } = c;
  const { me, obs } = world;
  const kind = CHARACTERS[me.characterId].vehicle;
  const geom = geometry(c);
  const w = world.board.width;
  const out: Cand[] = [];
  const consider = (entry: VehicleEntry, turn?: VehicleTurn): void => {
    const route = buildRoute(geom, kind, entry, turn);
    if (!route) return;
    let hitsMe = false;
    let direct = 0;
    let near = 0;
    let first = 99;
    route.forEach((t, i) => {
      if (t.x === me.x && t.y === me.y) hitsMe = true;
      for (const r of world.rivals) {
        const d = Math.abs(r.x - t.x) + Math.abs(r.y - t.y);
        if (d === 0) {
          direct++;
          first = Math.min(first, i);
        } else if (d <= 2) near++;
      }
    });
    if (hitsMe) return;
    let softs = 0;
    for (const t of route) if (obs.tiles[t.y * w + t.x] === 2) softs++;
    const cheap = direct * 10 + near - first * 0.05 + Math.min(softs, 3) * 0.5;
    if (direct === 0 && (c.profile.vehicle !== 'strategic' || near < 3)) return;
    out.push({ entry, turn, route, cheap });
  };
  if (kind === 'keke') {
    for (const entry of listEntries(geom, 'keke'))
      for (const turn of listKekeTurns(geom, entry)) consider(entry, turn);
  } else {
    for (const entry of listEntries(geom, kind)) consider(entry);
  }
  out.sort((a, b) => b.cheap - a.cheap);
  return out;
}

/** Scores the best legal route for the current situation (null when there is none). */
function bestRoute(c: Ctx, launchTick: number): Choice | null {
  const { world, profile } = c;
  const { me, obs } = world;
  const kind = CHARACTERS[me.characterId].vehicle;
  const cands = routeCandidates(c);
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
  for (const cand of cands.slice(0, budget)) {
    c.builder.build(c.tmp, world, profile, { extraVehicles: [{ kind, route: cand.route, launchTick }] });
    // I must still be able to get clear once the vehicle is on the road
    if (!searchRefuge(c, c.tmp, world.myTile, obs.tick, ready, step)) continue;
    let score = 0;
    for (const r of world.rivals) {
      const onRoute = cand.route.some((t) => t.x === r.x && t.y === r.y);
      const near = cand.route.some((t) => Math.abs(t.x - r.x) + Math.abs(t.y - r.y) <= 2);
      if (!onRoute && !(profile.vehicle === 'strategic' && near)) continue;
      const shield = r.mounted ? 0.3 : 1;
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
