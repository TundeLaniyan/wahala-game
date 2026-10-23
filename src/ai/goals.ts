/**
 * Goal selection. Every reachable (tile, slot) state of the time-expanded search is a possible
 * destination; this module scores them (safe refuge, pickup, generator placement spot) and
 * compiles the winner into a Plan that the brain follows tick by tick.
 */
import { nextFloat } from '../sim';
import type { Dir, PickupKind } from '../sim';
import {
  blastGeometry,
  checkPlacement,
  escapeSurvivesSealing,
  vulnerableAt,
  explodeTickFor,
  extractPlan,
  myRange,
  rivalEscape,
  searchRefuge,
  slotsFor,
} from './analysis';
import type { BlastGeometry, EscapePlan } from './analysis';
import { NEVER } from './danger';
import type { Ctx } from './context';
import { manhattanTiles } from './board';
import { readyTick, stepTicksOf } from './world';

export type GoalKind = 'stay' | 'refuge' | 'pickup' | 'place' | 'last';

export interface Plan {
  kind: GoalKind;
  actions: (Dir | null)[];
  tiles: number[];
  times: number[];
  /** Place a generator when the path ends. */
  placeOnArrival: boolean;
  /** Plan crosses a lane that an enemy remote generator *could* fire: only certain hazards were avoided. */
  gamble: boolean;
  /** The generator is already in the bot's hands: put it down (action) instead of placing a new one. */
  drop: boolean;
  /** Escape verified for the placement at the time it was planned. */
  escape: EscapePlan | null;
  escapeTick: number;
  madeAt: number;
  goalTile: number;
}

interface Cand {
  kind: GoalKind;
  tile: number;
  slot: number;
  score: number;
  /** Arrival state is not safe forever: a refuge must exist from there. */
  verify: boolean;
  escape?: EscapePlan | null;
  /** A placement with no direct value, tried only because it might cut a rival's escape off. */
  speculative?: boolean;
}

const PICKUP_BASE: Record<PickupKind, number> = {
  petrol: 6,
  socket: 7,
  skates: 5,
  diesel: 3,
  boots: 3,
  gloves: 2,
  grip: 2,
  remote: 3,
  killswitch: 3,
  okada: 9,
  voucher: 8,
  curse: -50,
  sneakers: 2,
  hotfuel: 3,
  bombpass: 4,
};

/** How much this bot wants a pickup, given what it already has. 0 = worthless. */
export function pickupValue(c: Ctx, kind: PickupKind): number {
  const { me, obs } = c.world;
  const g = obs.config.generator;
  const base = PICKUP_BASE[kind];
  const have = 0.4;
  switch (kind) {
    case 'petrol':
      return me.range >= g.maxRange ? have : base;
    case 'diesel':
      return me.range >= g.dieselRange ? have : base;
    case 'socket':
      return me.capacity >= g.maxCapacity ? have : me.capacity <= 1 ? base + 2 : base;
    case 'skates':
      return me.speedLevel >= obs.config.pickups.maxSpeedLevel ? have : base;
    case 'boots':
      return me.kick ? have : base;
    case 'gloves':
      return me.punch ? have : base;
    case 'grip':
      return me.grip ? have : base;
    case 'remote':
      return me.remote ? have : base;
    case 'sneakers':
      return me.sneakers ? have : base;
    case 'hotfuel':
      return me.hotFuel ? have : base;
    case 'bombpass':
      return me.bombPass ? have : base;
    case 'killswitch':
      return me.killSwitchCharges >= obs.config.pickups.maxKillSwitchCharges ? have : base;
    case 'okada':
      return me.mounted ? have : base;
    case 'voucher':
      return me.hasVoucher ? have : base;
    case 'curse':
      return c.profile.takeCurses ? 0.5 : 0;
  }
}

function interested(c: Ctx, id: number): boolean {
  if (c.profile.pickupInterest >= 1) return true;
  let v = c.interest.get(id);
  if (v === undefined) {
    v = nextFloat(c.rng) < c.profile.pickupInterest;
    c.interest.set(id, v);
  }
  return v;
}

export function activeGenerators(c: Ctx): number {
  const { me, obs } = c.world;
  let n = 0;
  for (const g of obs.generators) if (g.ownerId === me.id && g.mode !== 'disabled') n++;
  return n;
}

export function canPlaceNow(c: Ctx): boolean {
  const { me } = c.world;
  return me.alive && me.carrying === null && me.entryUntil === null && activeGenerators(c) < me.capacity;
}

const geo: BlastGeometry = { soft: 0, rivals: 0, mountedRivals: 0, pickups: 0, chains: 0, chainRivals: 0 };

/** Cheap geometric value of a generator placed on `tile` (no escape / rival simulation yet). */
export function placementGain(c: Ctx, tile: number): number {
  const { profile, world } = c;
  blastGeometry(c, tile, myRange(c), world.me.hotFuel, geo);
  const rivals = geo.rivals - geo.mountedRivals * 0.5 + (profile.chains ? 0.7 * geo.chainRivals : 0);
  return profile.softValue * geo.soft + profile.rivalValue * rivals - profile.pickupLoss * geo.pickups;
}

function nearRival(c: Ctx, tile: number, dist: number): boolean {
  const { world } = c;
  for (const r of world.rivals)
    if (manhattanTiles(world.board, tile, r.y * world.board.width + r.x) <= dist) return true;
  return false;
}

export function tileValue(c: Ctx, tile: number, prevGoal: number): number {
  const { profile, world, hunt } = c;
  let v = -profile.huntWeight * hunt[tile]!;
  if (tile === prevGoal) v += 1.2;
  if (profile.refugeMinExits > 0 && world.exits(tile) < profile.refugeMinExits) v -= 1.5;
  // do not loiter right next to a rival unless attacking
  for (const r of world.rivals) {
    if (manhattanTiles(world.board, tile, r.y * world.board.width + r.x) <= 1)
      v -= profile.difficulty === 'easy' ? 0 : 2;
  }
  return v;
}

const MAX_PLACE_SLOTS = 10;

/** The bot is carrying a live generator: find the best escapable spot to put it down. */
function chooseDrop(c: Ctx): Plan | null {
  const { world, bfs, profile } = c;
  const { obs, me } = world;
  const g = obs.generators.find((o) => o.id === me.carrying);
  if (!g) return null;
  const T = obs.tick;
  const explodeAt = T + Math.max(1, g.timer);
  const step = stepTicksOf(obs, me);
  const cands: Cand[] = [];
  for (let t = 0; t < world.board.size; t++) {
    const k = bfs.firstSlot[t]!;
    if (k < 0 || k > 12 || world.genAt[t]! >= 0) continue;
    blastGeometry(c, t, g.range, g.pierce, geo);
    const gain =
      profile.softValue * geo.soft +
      profile.rivalValue * (geo.rivals - geo.mountedRivals * 0.5) -
      profile.pickupLoss * geo.pickups;
    cands.push({ kind: 'place', tile: t, slot: k, score: gain - profile.slotCost * k, verify: true });
  }
  cands.sort((a, b) => b.score - a.score);
  for (const cand of cands.slice(0, 6)) {
    const esc = checkPlacement(c, cand.tile, bfs.tickAt(cand.slot), bfs.tickAt(cand.slot + 1), step, {
      explodeAt,
      range: g.range,
      pierce: g.pierce,
    });
    if (!esc) continue;
    cand.escape = esc;
    return compile(c, cand);
  }
  // nowhere to escape from: put it down right here if the time is nearly up
  if (explodeAt - T < 90 && world.genAt[world.myTile]! < 0) {
    return compile(c, { kind: 'place', tile: world.myTile, slot: 0, score: 0, verify: false });
  }
  return null;
}

export function chooseGoal(c: Ctx, prevGoal: number): Plan | null {
  const { world, bfs, danger, profile } = c;
  const { obs } = world;
  if (world.me.carrying !== null) return chooseDrop(c);
  const T = obs.tick;
  const myTile = world.myTile;
  const cands: Cand[] = [];
  const step = stepTicksOf(obs, world.me);
  c.mark.fill(0);

  if (danger.safeFrom(myTile, T)) {
    cands.push({
      kind: 'stay',
      tile: myTile,
      slot: 0,
      score: tileValue(c, myTile, prevGoal) + profile.wander * nextFloat(c.rng),
      verify: false,
    });
    c.mark[myTile] = 1;
  }
  for (let i = 0; i < bfs.refugeTile.length; i++) {
    const t = bfs.refugeTile[i]!;
    if (c.mark[t] === 1) continue;
    c.mark[t] = 1;
    const k = bfs.refugeSlot[i]!;
    cands.push({
      kind: 'refuge',
      tile: t,
      slot: k,
      score: tileValue(c, t, prevGoal) - profile.moveCost * k + profile.wander * nextFloat(c.rng),
      verify: false,
    });
  }
  for (const u of obs.pickups) {
    if (!interested(c, u.id)) continue;
    const val = pickupValue(c, u.kind);
    if (val <= 0) continue;
    const t = u.y * world.board.width + u.x;
    const k = bfs.firstSlot[t]!;
    if (k < 0 || k > profile.pickupMaxSlots) continue;
    const verify = !danger.safeFrom(t, bfs.tickAt(k));
    cands.push({
      kind: 'pickup',
      tile: t,
      slot: k,
      score: val + tileValue(c, t, prevGoal) * 0.5 - profile.slotCost * k,
      verify,
    });
  }

  // ---- generator placement spots: cheap geometry first, then verify the best few
  const placeCands: Cand[] = [];
  if (canPlaceNow(c)) {
    for (let t = 0; t < world.board.size; t++) {
      const k = bfs.firstSlot[t]!;
      if (k < 0 || k > MAX_PLACE_SLOTS || world.blocked[t] === 1) continue;
      if (world.pickupAt[t]! >= 0) continue;
      const gain = placementGain(c, t);
      if (gain < profile.placeMinGain) {
        // Hard also looks for pure cut-off placements: no direct hit, but a rival's way out may close
        if (profile.trap === 'shrink' && nearRival(c, t, 4)) {
          placeCands.push({
            kind: 'place',
            tile: t,
            slot: k,
            score: gain - 0.5 * k,
            verify: true,
            speculative: true,
          });
        }
        continue;
      }
      const score =
        gain - profile.slotCost * k - profile.huntWeight * c.hunt[t]! * 0.5 + (t === prevGoal ? 1.2 : 0);
      placeCands.push({ kind: 'place', tile: t, slot: k, score, verify: true });
    }
    placeCands.sort((a, b) => b.score - a.score);
    const verifyBudget = profile.difficulty === 'hard' ? 8 : profile.difficulty === 'medium' ? 4 : 2;
    let verified = 0;
    for (const cand of placeCands) {
      if (verified >= verifyBudget) break;
      const a0 = bfs.tickAt(cand.slot);
      const a1 = bfs.tickAt(cand.slot + 1);
      const doVerify = nextFloat(c.rng) < profile.placeVerify;
      verified++;
      if (doVerify) {
        const esc = checkPlacement(c, cand.tile, a0, a1, step);
        if (!esc) continue;
        if (profile.robustEscape && !robust(c, cand.tile, a0, a1, step, esc)) continue;
        cand.escape = esc;
        const bonus = trapBonus(c, cand, esc);
        if (cand.speculative && bonus < 15) continue;
        cand.score += bonus;
      }
      cands.push(cand);
    }
  }

  cands.sort((a, b) => b.score - a.score);
  if (profile.robustEscape) penaliseVulnerable(c, cands, step);
  let skip = nextFloat(c.rng) < profile.mistake ? 1 : 0;
  const threatened = profile.robustEscape && !danger.safeFrom(myTile, T);
  let fallback: Plan | null = null;
  let sealChecks = 0;
  for (const cand of cands) {
    if (cand.kind === 'pickup' && cand.verify) {
      const esc = searchRefuge(
        c,
        c.danger,
        cand.tile,
        bfs.tickAt(cand.slot),
        bfs.tickAt(cand.slot + 1),
        step,
      );
      if (!esc) continue;
    }
    if (skip > 0 && cand.kind !== 'stay') {
      skip--;
      continue;
    }
    const plan = compile(c, cand);
    // fleeing past a rival that could wall me in is how most deaths happen: prefer a sealing-proof route,
    // but a route that might be walled in still beats standing in the blast
    if (threatened && cand.kind !== 'place' && sealChecks < 6) {
      sealChecks++;
      if (!routeSurvivesSealing(c, plan, step)) {
        fallback ??= plan;
        continue;
      }
    }
    return plan;
  }
  return fallback;
}

/** Re-ranks the best few non-placement goals by whether a rival could kill me on arrival with one generator. */
function penaliseVulnerable(c: Ctx, cands: Cand[], step: number): void {
  const { bfs } = c;
  let checked = 0;
  for (const cand of cands) {
    if (checked >= 6) break;
    if (cand.kind === 'place' || cand.kind === 'last') continue;
    checked++;
    if (vulnerableAt(c, cand.tile, bfs.tickAt(cand.slot), bfs.tickAt(cand.slot + 1), step)) cand.score -= 10;
  }
  cands.sort((a, b) => b.score - a.score);
}

function routeSurvivesSealing(c: Ctx, plan: Plan, step: number): boolean {
  if (plan.tiles.length < 2) return true;
  const { world } = c;
  const esc: EscapePlan = { actions: plan.actions, tiles: plan.tiles, times: plan.times, a0: world.tick };
  return escapeSurvivesSealing(c, world.myTile, world.tick, readyTick(world.obs, world.me), step, esc, null);
}

/** Hard only: the escape must survive a rival sealing it (see escapeSurvivesSealing). */
export function robust(c: Ctx, tile: number, a0: number, a1: number, step: number, esc: EscapePlan): boolean {
  const placeTick = Math.max(c.world.tick + 1, a0 + 1);
  return escapeSurvivesSealing(c, tile, a0, a1, step, esc, {
    x: c.world.xOf(tile),
    y: c.world.yOf(tile),
    range: myRange(c),
    pierce: c.world.me.hotFuel,
    explodeAt: explodeTickFor(c, placeTick),
  });
}

/** Extra score for rival-trapping value of a verified placement. */
function trapBonus(c: Ctx, cand: Cand, esc: EscapePlan): number {
  void esc;
  const { profile, world } = c;
  if (profile.trap === 'none') return 0;
  const w = world.board.width;
  let bonus = 0;
  const range = myRange(c);
  for (const r of world.rivals) {
    if (c.rivalSims >= profile.maxRivalSims) break;
    const rt = r.y * w + r.x;
    if (manhattanTiles(world.board, cand.tile, rt) > range + 3) continue;
    const e = rivalEscape(c, c.tmp, r, 6, profile.trap === 'shrink', cand.tile);
    const soft = r.mounted ? 0.3 : 1;
    if (e.refuges === 0) {
      bonus += 60 * soft;
      continue;
    }
    if (profile.trap === 'shrink') {
      const before = baselineRefuges(c, r.id);
      const ratio = before > 0 ? e.refuges / before : 1;
      if (ratio < 0.5 || e.refuges <= 2) bonus += 20 * (1 - ratio) * soft;
    }
  }
  return bonus;
}

/** Rival refuge count under the real (not hypothetical) danger map, cached per think. */
export function baselineRefuges(c: Ctx, rivalId: number): number {
  let v = c.baseline.get(rivalId);
  if (v === undefined) {
    // c.tmp holds the hypothetical map under evaluation, so the baseline uses the real map
    v = rivalEscape(c, c.danger, c.world.obs.players[rivalId]!, 6, true).refuges;
    c.baseline.set(rivalId, v);
  }
  return v;
}

function compile(c: Ctx, cand: Cand): Plan {
  const { bfs, world } = c;
  const actions = bfs.pathTo(cand.tile, cand.slot, []);
  const tiles = bfs.tilesTo(cand.tile, cand.slot, []);
  const times: number[] = [];
  for (let i = 0; i < cand.slot; i++) times.push(bfs.tickAt(i + 1));
  return {
    kind: cand.kind,
    actions,
    tiles,
    times,
    placeOnArrival: cand.kind === 'place',
    gamble: false,
    drop: world.me.carrying !== null && cand.kind === 'place',
    escape: cand.escape ?? null,
    escapeTick: world.tick,
    madeAt: world.tick,
    goalTile: cand.tile,
  };
}

/**
 * Every way out crosses a lane an enemy Remote Starter owner could fire at any moment. That is a
 * gamble rather than a certainty, so take the quickest route to a tile outside all such lanes.
 * (`bfs` was run on the certain-hazard map with refuge tests against the strict map.)
 */
export function chooseGamble(c: Ctx, prevGoal: number): Plan | null {
  const { bfs, profile } = c;
  let best: Cand | null = null;
  for (let i = 0; i < bfs.refugeTile.length; i++) {
    const t = bfs.refugeTile[i]!;
    const k = bfs.refugeSlot[i]!;
    const score = tileValue(c, t, prevGoal) - profile.slotCost * k * 3;
    if (!best || score > best.score) best = { kind: 'refuge', tile: t, slot: k, score, verify: false };
  }
  if (!best) return null;
  const plan = compile(c, best);
  plan.gamble = true;
  return plan;
}

/** No refuge exists at all: postpone death as long as possible (maybe an Okada or a lucky chain saves us). */
export function lastResort(c: Ctx, danger = c.danger): Plan {
  const { bfs, world, profile } = c;
  let best = world.myTile;
  let bestSlot = 0;
  let bestScore = -Infinity;
  for (let t = 0; t < world.board.size; t++) {
    const k = bfs.firstSlot[t]!;
    if (k < 0) continue;
    const arrive = bfs.tickAt(k);
    const hit = danger.firstHit(t, arrive);
    const score = Math.min(hit, arrive + 400) - arrive - profile.slotCost * k * 4;
    if (score > bestScore) {
      bestScore = score;
      best = t;
      bestSlot = k;
    }
  }
  return compile(c, { kind: 'last', tile: best, slot: bestSlot, score: bestScore, verify: false });
}

export { NEVER, extractPlan, slotsFor };
