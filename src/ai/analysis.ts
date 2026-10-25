/**
 * What-if analysis built on the danger map and the time-expanded search: can I escape a
 * generator I am about to place, can a rival escape it, how big is a rival's safe region, and
 * the "distance to the enemy" field that keeps bots progressing instead of camping.
 */
import { DIRS, DIR_VEC, Tile, squareFootprint } from '../sim';
import type { Dir, Observation, Player } from '../sim';
import { overBudget, spend } from './context';
import type { Ctx } from './context';
import type { HypoGen } from './danger';
import { LARGE_MAX_SLOTS, LARGE_RIVAL_SLOTS } from './scale';
import { stepTicksOf, readyTick } from './world';

export interface EscapePlan {
  /** Per-transition actions (`null` = wait). */
  actions: (Dir | null)[];
  /** tiles[i] = tile after i transitions. */
  tiles: number[];
  /** Tick at which each transition executes. */
  times: number[];
  /** Tick from which the walker stands on tiles[0]. */
  a0: number;
}

export function slotsFor(horizonTicks: number, step: number): number {
  return Math.ceil(horizonTicks / step) + 2;
}

/** Step slots for a search from this bot's point of view: capped on large boards (scale.ts). */
export function searchSlots(c: Ctx, horizonTicks: number, step: number, cap = LARGE_MAX_SLOTS): number {
  const n = slotsFor(horizonTicks, step);
  return c.world.large ? Math.min(n, cap) : n;
}

/** Blast range my next generator would have (Bad Fuel can shrink it). */
export function myRange(c: Ctx): number {
  const { me, obs } = c.world;
  const weak = me.curse?.kind === 'weakFire' && obs.tick < me.curse.until;
  return weak ? Math.min(me.range, obs.config.generator.weakFireRange) : me.range;
}

/** Tick at which a generator placed by me on `placeTick` would explode (remote ones use their failsafe). */
export function explodeTickFor(c: Ctx, placeTick: number): number {
  const cfg = c.world.obs.config.generator;
  return placeTick + (c.world.me.remote ? cfg.remoteFailsafeTicks : cfg.fuseTicks) - 1;
}

/** Square Blast radius a player's next generator would have (0 = plain plus). */
export function squareRadius(obs: Observation, p: Readonly<Player>): number {
  const sq = obs.config.square;
  return sq.radiusByTier[Math.min(p.squareTier, sq.maxTier)] ?? 0;
}

/** Square Blast radius of my next generator. */
export function mySquare(c: Ctx): number {
  return squareRadius(c.world.obs, c.world.me);
}

/** Lethal hits a player can still absorb: Okada + Armour plates (V2 protection layers). */
export function protectionLayers(p: Readonly<Player>): number {
  return (p.mounted ? 1 : 0) + p.armour;
}

/**
 * If I stand on tile `u` from tick `a0` (able to step again from `a1`) and place a generator there,
 * is there a path to a tile that is safe forever? Returns the escape path or null.
 */
export interface PlacementOptions {
  /** Absolute explosion tick (a carried generator keeps counting down while it is carried). */
  explodeAt?: number;
  range?: number;
  pierce?: boolean;
  square?: number;
}

export function checkPlacement(
  c: Ctx,
  u: number,
  a0: number,
  a1: number,
  step: number,
  opts: PlacementOptions = {},
): EscapePlan | null {
  const { world, profile } = c;
  const placeTick = Math.max(world.tick + 1, a0 + 1);
  const hypo: HypoGen = {
    x: world.xOf(u),
    y: world.yOf(u),
    range: opts.range ?? myRange(c),
    pierce: opts.pierce ?? world.me.hotFuel,
    square: opts.square ?? mySquare(c),
    explodeAt: opts.explodeAt ?? explodeTickFor(c, placeTick),
  };
  c.builder.build(c.tmp, world, profile, { extraGens: [hypo] });
  spend(c);
  const plan = searchRefuge(c, c.tmp, u, a0, a1, step, u);
  // Team Rumble with friendly fire: every teammate near the spot must still be able to get clear too
  if (!plan || !world.friendlyFire) return plan;
  for (const f of world.friends) {
    if (Math.abs(f.x - hypo.x) + Math.abs(f.y - hypo.y) > hypo.range + 2) continue;
    if (rivalEscape(c, c.tmp, f, FRIEND_REACTION_TICKS, false, u).refuges === 0) return null;
  }
  return plan;
}

/** Reaction time granted to a teammate who must get clear of a placement (friendly fire on). */
const FRIEND_REACTION_TICKS = 6;

/** Shortest safe path from (`start` at `a0`) to any tile that stays safe forever, or null. */
export function searchRefuge(
  c: Ctx,
  map: Ctx['tmp'],
  start: number,
  a0: number,
  a1: number,
  step: number,
  extraBlocked?: number,
  blocked?: Uint8Array,
): EscapePlan | null {
  const { aux, world, profile } = c;
  spend(c);
  aux.run({
    start,
    a0,
    a1: Math.max(a1, a0 + 1),
    step,
    slots: searchSlots(c, profile.horizonTicks, step),
    danger: map,
    blocked: blocked ?? world.walk,
    extraBlocked,
    stopAtRefuge: true,
  });
  if (aux.foundSlot < 0) return null;
  return extractPlan(aux, aux.foundTile, aux.foundSlot);
}

export function extractPlan(bfs: Ctx['aux'], tile: number, slot: number): EscapePlan {
  const actions = bfs.pathTo(tile, slot, []);
  const tiles = bfs.tilesTo(tile, slot, []);
  const times: number[] = [];
  for (let i = 0; i < slot; i++) times.push(bfs.tickAt(i + 1));
  return { actions, tiles, times, a0: bfs.tickAt(0) };
}

const seenRefuges = new Set<number>();

export interface RivalEscape {
  /** Distinct tiles from which the rival is safe forever and which it can reach in time. */
  refuges: number;
  /** Slot of the nearest refuge (-1 none). */
  nearest: number;
}

/**
 * How well can `rival` get away from the hazards in `map`? `delay` models its reaction time.
 * `full` counts every refuge (shrink analysis); otherwise it stops at the first one.
 */
export function rivalEscape(
  c: Ctx,
  map: Ctx['tmp'],
  rival: Readonly<Player>,
  delay: number,
  full: boolean,
  extraBlocked?: number,
): RivalEscape {
  const { aux, world, profile } = c;
  const { obs } = world;
  const step = stepTicksOf(obs, rival);
  const start = rival.y * world.board.width + rival.x;
  const ready = readyTick(obs, rival) + delay;
  aux.run({
    start,
    a0: obs.tick,
    a1: Math.max(ready, obs.tick + 1),
    step,
    slots: searchSlots(c, Math.min(profile.horizonTicks, 240), step, LARGE_RIVAL_SLOTS),
    danger: map,
    blocked: world.blocked,
    extraBlocked,
    stopAtRefuge: !full,
  });
  c.rivalSims++;
  spend(c);
  if (!full) return { refuges: aux.foundSlot < 0 ? 0 : 1, nearest: aux.foundSlot };
  let distinct = 0;
  let nearest = -1;
  const seen = seenRefuges;
  seen.clear();
  for (let i = 0; i < aux.refugeTile.length; i++) {
    const t = aux.refugeTile[i]!;
    if (seen.has(t)) continue;
    seen.add(t);
    distinct++;
    if (nearest < 0) nearest = aux.refugeSlot[i]!;
  }
  return { refuges: distinct, nearest };
}

// ------------------------------------------------------------------ geometry of a blast

export interface BlastGeometry {
  soft: number;
  rivals: number;
  /**
   * How much of `rivals` protection takes away: a rival with L layers (Okada, Armour) needs L + 1 hits,
   * so it counts 1 / (L + 1) of a kill (an Okada rider: half, as before V2).
   */
  mountedRivals: number;
  pickups: number;
  /** Other generators the flames would reach (chain reactions). */
  chains: number;
  /** Rivals standing in the flames of those chained generators (one level deep). */
  chainRivals: number;
}

/** Team Rumble, friendly fire on: a teammate in the blast outweighs this many opponents. */
const FRIEND_IN_BLAST = 8;

export function blastGeometry(
  c: Ctx,
  tile: number,
  range: number,
  pierce: boolean,
  out: BlastGeometry,
  square = 0,
): void {
  const { world } = c;
  const { obs, board } = world;
  const w = board.width;
  out.soft = out.rivals = out.mountedRivals = out.pickups = out.chains = out.chainRivals = 0;
  let hit0 = -1;
  let hit1 = -1;
  let hit2 = -1;
  const x0 = tile % w;
  const y0 = Math.floor(tile / w);
  const note = (t: number): void => {
    if (world.rivalAt[t]! > 0) {
      out.rivals += world.rivalAt[t]!;
      for (const r of world.rivals) {
        if (r.y * w + r.x !== t) continue;
        const layers = protectionLayers(r);
        if (layers > 0) out.mountedRivals += 1 - 1 / (layers + 1);
      }
    }
    // Team Rumble with friendly fire: a teammate in the blast counts heavily against the placement
    if (world.friendlyFire && world.friendAt[t]! > 0) out.rivals -= FRIEND_IN_BLAST * world.friendAt[t]!;
    if (world.pickupAt[t]! >= 0) out.pickups++;
  };
  note(tile);
  for (const d of DIRS) {
    const v = DIR_VEC[d];
    let pierced = false;
    for (let i = 1; i <= range; i++) {
      const x = x0 + v.dx * i;
      const y = y0 + v.dy * i;
      if (x < 0 || y < 0 || x >= w || y >= board.height) break;
      const t = y * w + x;
      const kind = obs.tiles[t];
      if (kind === Tile.Hard) break;
      note(t);
      if (kind === Tile.Soft) {
        out.soft++;
        if (pierce && !pierced) {
          pierced = true;
          continue;
        }
        break;
      }
      if (world.genAt[t]! >= 0) {
        out.chains++;
        const gi = world.genAt[t]!;
        if (hit0 < 0) hit0 = gi;
        else if (hit1 < 0) hit1 = gi;
        else hit2 = gi;
        break;
      }
    }
  }
  if (square > 0) {
    // V2 Square Blast: the square tiles off the centre row / column (the plus above covers those)
    const blocks = (x: number, y: number): boolean => world.genAt[y * w + x]! >= 0;
    for (const p of squareFootprint(obs, x0, y0, square, blocks)) {
      if (p.x === x0 || p.y === y0) continue;
      const t = p.y * w + p.x;
      note(t);
      if (obs.tiles[t] === Tile.Soft) out.soft++;
      else if (world.genAt[t]! >= 0) {
        out.chains++;
        const gi = world.genAt[t]!;
        if (hit0 < 0) hit0 = gi;
        else if (hit1 < 0) hit1 = gi;
        else if (hit2 < 0) hit2 = gi;
      }
    }
  }
  for (const gi of [hit0, hit1, hit2]) {
    if (gi < 0) continue;
    out.chainRivals += rivalsInBlast(c, obs.generators[gi]!);
    // friendly fire: a teammate caught by the chain counts against the placement like one in the blast
    if (world.friendlyFire) out.rivals -= FRIEND_IN_BLAST * rivalsInBlast(c, obs.generators[gi]!, world.friendAt);
  }
}

/** Rivals standing in a generator's flames (concrete and the first soft block stop each arm). */
function rivalsInBlast(
  c: Ctx,
  g: Readonly<{ x: number; y: number; range: number; pierce: boolean }>,
  at: Uint8Array = c.world.rivalAt,
): number {
  const { world } = c;
  const { board, obs } = world;
  const w = board.width;
  let n = at[g.y * w + g.x]!;
  for (const d of DIRS) {
    const v = DIR_VEC[d];
    let pierced = false;
    for (let i = 1; i <= g.range; i++) {
      const x = g.x + v.dx * i;
      const y = g.y + v.dy * i;
      if (x < 0 || y < 0 || x >= w || y >= board.height) break;
      const t = y * w + x;
      const kind = obs.tiles[t];
      if (kind === Tile.Hard) break;
      n += at[t]!;
      if (kind === Tile.Soft) {
        if (g.pierce && !pierced) {
          pierced = true;
          continue;
        }
        break;
      }
      if (world.genAt[t]! >= 0) break;
    }
  }
  return n;
}

// ------------------------------------------------------------------ hunting field

const HUNT_FAR = 999;

/**
 * Cost-distance from the nearest rival to every tile. Soft blocks and generators can be passed at
 * extra cost, so the field points through the walls the bot would have to blast.
 */
const huntQueue: number[] = [];
let huntInQueue = new Uint8Array(0);

export function computeHuntField(c: Ctx): void {
  const { world, hunt } = c;
  const { board, obs } = world;
  hunt.fill(HUNT_FAR);
  // scratch buffers are shared (bots think one after another) and reset here: no per-think garbage
  const queue = huntQueue;
  queue.length = 0;
  if (huntInQueue.length < board.size) huntInQueue = new Uint8Array(board.size);
  const inQueue = huntInQueue;
  inQueue.fill(0, 0, board.size);
  for (const r of world.rivals) {
    const t = r.y * board.width + r.x;
    hunt[t] = 0;
    queue.push(t);
    inQueue[t] = 1;
  }
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

// ------------------------------------------------------------------ robustness against sealing

let walkQueue = new Int16Array(0);

/**
 * Walking distance (in tiles) from a tile over walkable terrain; 999 when unreachable or further
 * than `maxD` (callers treat both the same way, so the bound changes no decision).
 */
function walkDistances(c: Ctx, from: number, out: Int16Array, maxD = 998): void {
  const { world } = c;
  const size = world.board.size;
  out.fill(999, 0, size);
  out[from] = 0;
  if (walkQueue.length < size) walkQueue = new Int16Array(size);
  const queue = walkQueue;
  let tail = 0;
  queue[tail++] = from;
  for (let head = 0; head < tail; head++) {
    const u = queue[head]!;
    if (out[u]! >= maxD) continue;
    for (let d = 0; d < 4; d++) {
      const v = world.board.neighbor[u * 4 + d]!;
      if (v < 0 || world.blocked[v] === 1 || out[v]! < 999) continue;
      out[v] = out[u]! + 1;
      queue[tail++] = v;
    }
  }
}

const rivalDist = new Int16Array(4096);

/**
 * Would my escape still work if a nearby rival dropped a generator on one of the tiles I am about
 * to run through (a block, and for Remote Starter owners a lane that can fire at any moment)?
 * `mine` is the hypothetical generator being placed at `u`.
 */
export function escapeSurvivesSealing(
  c: Ctx,
  u: number,
  a0: number,
  a1: number,
  step: number,
  esc: EscapePlan,
  mine: HypoGen | null,
): boolean {
  const { world, profile } = c;
  const { obs } = world;
  const w = world.board.width;
  const dist = rivalDist.length >= world.board.size ? rivalDist : new Int16Array(world.board.size);
  const fuse = obs.config.generator.fuseTicks;
  const lastPass = esc.times.length > 0 ? esc.times[esc.times.length - 1]! : obs.tick;
  for (const r of world.near) {
    let active = 0;
    for (const g of obs.generators) if (g.ownerId === r.id && g.mode !== 'disabled') active++;
    if (active >= r.capacity || r.carrying !== null) continue;
    const rt = r.y * w + r.x;
    const rstep = stepTicksOf(obs, r);
    const rready = readyTick(obs, r);
    // a rival further than this cannot reach any escape tile in time (see `arrives` below)
    const maxD = Math.max(1, Math.floor((lastPass + 6 - rready - 1) / rstep) + 2);
    walkDistances(c, rt, dist, maxD);
    for (let i = 1; i < esc.tiles.length; i++) {
      const q = esc.tiles[i]!;
      const d = dist[q]!;
      if (d >= 999) continue;
      const arrives = d === 0 ? obs.tick + 1 : rready + (d - 1) * rstep + 1;
      const iPass = esc.times[i - 1]!;
      if (arrives > iPass + 6) continue; // I am through before he can get there
      const remote = r.remote;
      const hypo: HypoGen = {
        x: q % w,
        y: Math.floor(q / w),
        range: r.range,
        pierce: false,
        square: squareRadius(obs, r),
        explodeAt: remote ? arrives : arrives + fuse - 1,
        hold: remote,
        ownerId: r.id,
      };
      // out of budget (large boards only): treat the escape as not proven
      if (overBudget(c)) return false;
      c.builder.build(c.tmp, world, profile, { extraGens: mine ? [mine, hypo] : [hypo] });
      spend(c);
      c.scratch.set(world.walk);
      c.scratch[q] = 1;
      if (mine) c.scratch[u] = 1; // my own generator stays in the way behind me
      // I am committed to this route: the way out must exist from where I am when the seal appears,
      // not from the start with hindsight (that let a bot run into a dead end a rival then closed)
      let k = 0;
      while (k < esc.times.length && esc.times[k]! <= arrives) k++;
      const from = esc.tiles[k]!;
      const fromA0 = k === 0 ? a0 : Math.max(a0, arrives);
      const fromA1 = k === 0 ? a1 : Math.max(arrives + 1, esc.times[k - 1]! + step);
      if (!searchRefuge(c, c.tmp, from, fromA0, fromA1, step, undefined, c.scratch)) return false;
    }
  }
  return true;
}

/**
 * Could the nearest rival kill me where I plan to stand by dropping a generator right now? True when
 * its generator, placed on the tile it occupies today, would leave me with no way out.
 */
export function vulnerableAt(c: Ctx, tile: number, a0: number, a1: number, step: number): boolean {
  const { world, profile } = c;
  const { obs } = world;
  const w = world.board.width;
  const fuse = obs.config.generator.fuseTicks;
  for (const r of world.near) {
    if (Math.abs(r.x - (tile % w)) + Math.abs(r.y - Math.floor(tile / w)) > 7) continue;
    let active = 0;
    for (const g of obs.generators) if (g.ownerId === r.id && g.mode !== 'disabled') active++;
    if (active >= r.capacity || r.carrying !== null || r.entryUntil !== null) continue;
    const at = Math.max(obs.tick + 1, readyTick(obs, r));
    const hypo: HypoGen = {
      x: r.x,
      y: r.y,
      range: r.range,
      pierce: r.hotFuel,
      square: squareRadius(obs, r),
      explodeAt: r.remote ? at : at + fuse - 1,
      hold: r.remote,
      ownerId: r.id,
    };
    if (overBudget(c)) return false;
    c.builder.build(c.tmp, world, profile, { extraGens: [hypo] });
    spend(c);
    c.scratch.set(world.walk);
    c.scratch[r.y * w + r.x] = 1;
    if (tile === r.y * w + r.x) continue;
    if (!searchRefuge(c, c.tmp, tile, a0, a1, step, undefined, c.scratch)) return true;
  }
  return false;
}
