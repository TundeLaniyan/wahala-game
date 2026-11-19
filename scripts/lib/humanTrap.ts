/**
 * THE HUMAN-LIKE TRAP HARNESS (docs/CAMPAIGN_COMBAT_RELIABILITY.md, decisions RC1-RC5): can an ordinary player trap a campaign
 * enemy with one of his own generators on a REAL field mission (real board, crates, hazards, patrols, the real enemy bots at
 * the level's bot level and tactics layer)? The scripted human plays with ORDINARY intents only (walk, A = lay a generator,
 * B = punch) and a HUMAN MODEL, so a success here is something a person can repeat, not a frame-perfect script:
 *
 *   - INPUT LATENCY: every decision (a new direction, A, B) reaches the game `latency` ticks after he makes it (random
 *     6-24, seeded), so he overshoots a tile, lays a generator a beat late, leaves a beat late;
 *   - TIMING TOLERANCE: when he judges the moment right to lay a generator he is off by a seeded +-`timingTol` ticks (20);
 *   - NO INSIDE KNOWLEDGE: he reads what a player sees (positions, facing, the wind-up, the "!" and "?" glyphs, the tiles and
 *     the crates) and learns a patrol by WATCHING it for a lap or two (`RouteModel`); he never reads an enemy's mind, target,
 *     timers or perception, and never a generator he could not see;
 *   - DANGER: he walks out of a generator's blast footprint and a visible wind-up with that latency.
 *
 * Three strategies (docs/CAMPAIGN_COMBAT_RELIABILITY.md, "How to beat enemies with generators"):
 *   ambush  watch a patroller for a lap, pick a tile out of its calm view whose blast covers its lane, lay the generator so the
 *           3 s fuse ends as it walks through, and be out of the blast and out of its sight;
 *   lure    get noticed, run past a corner, lay a generator on the tile behind you and keep running;
 *   bait    stand next to a brawler, step out of its wind-up (a visible miss), lay under your own feet in its recovery,
 *           hold, and walk out late;
 * and the deliberately bad `plain`: lay it in plain view, in the lane the enemy walks, 6 tiles away, and walk off.
 * Success = the TARGET dies from the human's blast. Used by tests/campaign-reliability-traps.test.ts and
 * `scripts/trap-reliability.ts`.
 */
import { enemyMindView, canSeeTile, inViewCone, tick as simTick, observe } from '../../src/sim';
import type { CampaignLevel, Dir, GameState, Intent, SimEvent } from '../../src/sim';
import { Tile } from '../../src/sim/types';
import { inSector } from '../../src/sim/mission/sector';
import { footprintAt } from './fieldFight';
import { rig } from './readability';
import type { Rig } from './readability';

// ------------------------------------------------------------------------------------------------ the human model

export interface HumanModel {
  /** Ticks between a decision and the game receiving it (inclusive range, seeded). */
  latency: readonly [number, number];
  /** +- ticks of error when he judges the moment to lay a generator. */
  timingTol: number;
  /** How far on the screen he sees an enemy (tiles, Chebyshev). */
  screenTiles: number;
  /** Most seconds he watches a patrol before giving up on learning it. */
  watchMaxSec: number;
  /** Attempts he makes (he retries after disengaging). */
  attempts: number;
  /** Seconds he waits for the enemy to settle after a failed attempt before he tries again. */
  settleSec: number;
}

export const HUMAN_MODEL: HumanModel = {
  latency: [6, 24],
  timingTol: 20,
  screenTiles: 14,
  watchMaxSec: 40,
  attempts: 2,
  settleSec: 6,
};

/** A small seeded generator (mulberry32): the harness never uses the clock or Math.random. */
export function seeded(seed: number): () => number {
  let a = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRV: Record<Dir, readonly [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
const DIR_LIST: readonly Dir[] = ['up', 'down', 'left', 'right'];

/** Decisions reach the game late: a held move stays until the next one arrives; A and B arrive as single presses. */
export class Pilot {
  private readonly queue: { release: number; intent: Intent; key: string }[] = [];
  private lastKey = 'idle';
  private held: Intent = {};

  constructor(
    private readonly rnd: () => number,
    private readonly model: HumanModel,
  ) {}

  latency(): number {
    const [lo, hi] = this.model.latency;
    return lo + Math.floor(this.rnd() * (hi - lo + 1));
  }

  /** What the game receives this tick, given what the human wants this tick. */
  drive(desired: Intent, tick: number): Intent {
    const key = desired.place
      ? 'place'
      : desired.special
        ? 'special'
        : desired.move
          ? `move:${desired.move}`
          : 'idle';
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.queue.push({ release: tick + this.latency(), intent: desired, key });
    }
    let pulse: Intent | null = null;
    while (this.queue.length > 0 && this.queue[0]!.release <= tick) {
      const q = this.queue.shift()!;
      if (q.intent.place || q.intent.special) pulse = q.intent;
      else this.held = q.intent;
    }
    return pulse ? { ...this.held, ...pulse } : { ...this.held };
  }

  /** Nothing is on its way to the game and nothing is held: he is standing still as far as the game knows. */
  settled(): boolean {
    return this.queue.length === 0 && !this.held.move;
  }

  /** He sees the press land: the presses still on their way are not made (a person does not press A twice). */
  cancelPresses(): void {
    for (let i = this.queue.length - 1; i >= 0; i--)
      if (this.queue[i]!.intent.place || this.queue[i]!.intent.special) this.queue.splice(i, 1);
  }

  /** A panic stop: forget everything queued (the human sees danger and stops pressing). */
  flush(): void {
    this.queue.length = 0;
    this.held = {};
    this.lastKey = 'idle';
  }
}

// ------------------------------------------------------------------------------------------------ the board

const W = (s: GameState): number => s.width;
const idx = (s: GameState, x: number, y: number): number => y * s.width + x;
const inB = (s: GameState, x: number, y: number): boolean => x >= 0 && y >= 0 && x < s.width && y < s.height;
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const manh = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Open floor with no generator on it (a floor trap is walkable, at a price: see `HAZARD_COST`). */
function walkable(s: GameState, x: number, y: number, extra?: ReadonlySet<number>): boolean {
  if (!inB(s, x, y)) return false;
  const i = idx(s, x, y);
  if (s.tiles[i] !== Tile.Empty || extra?.has(i)) return false;
  return !s.generators.some((g) => g.carriedBy === null && g.x === x && g.y === y);
}

/** A pothole or an oil slick is walked round when there is a way round (this many extra tiles) and over otherwise. */
const HAZARD_COST = 15;

interface Walk {
  dist: Int16Array;
  prev: Int32Array;
}

/** Walking costs from (x, y) (a floor trap counts `HAZARD_COST` extra); `avoid` tiles are not entered. */
function walkFrom(s: GameState, x: number, y: number, avoid?: ReadonlySet<number>): Walk {
  const dist = new Int16Array(s.width * s.height).fill(-1);
  const prev = new Int32Array(s.width * s.height).fill(-1);
  const buckets: number[][] = [[idx(s, x, y)]];
  dist[buckets[0]![0]!] = 0;
  for (let cost = 0; cost < buckets.length; cost++) {
    const q = buckets[cost];
    if (!q) continue;
    for (let h = 0; h < q.length; h++) {
      const u = q[h]!;
      if (dist[u] !== cost) continue;
      const ux = u % s.width;
      const uy = Math.floor(u / s.width);
      for (const d of DIR_LIST) {
        const nx = ux + DIRV[d][0];
        const ny = uy + DIRV[d][1];
        if (!walkable(s, nx, ny, avoid)) continue;
        const v = idx(s, nx, ny);
        const nc = cost + 1 + (s.floorHazards[v] ? HAZARD_COST : 0);
        if (dist[v] !== -1 && dist[v]! <= nc) continue;
        dist[v] = nc;
        prev[v] = u;
        (buckets[nc] ??= []).push(v);
      }
    }
  }
  return { dist, prev };
}

/** The tiles of the shortest walk to `goal` (the start excluded), or null. */
function pathOf(w: Walk, goal: number): number[] | null {
  if (w.dist[goal] === -1) return null;
  const out: number[] = [];
  for (let c = goal; c !== -1 && w.prev[c] !== -1; c = w.prev[c]!) out.push(c);
  return out.reverse();
}

function dirTo(s: GameState, from: { x: number; y: number }, tile: number): Dir {
  const tx = tile % s.width;
  const ty = Math.floor(tile / s.width);
  if (tx > from.x) return 'right';
  if (tx < from.x) return 'left';
  return ty > from.y ? 'down' : 'up';
}

// ------------------------------------------------------------------------------------------------ the scene

export interface TrapScene {
  r: Rig;
  s: GameState;
  target: number;
  /** Everything he can see happens through these (the screen, the glyphs): no enemy internals. */
  events: SimEvent[];
}

/** Builds the mission as the campaign starts it and lets the enemies settle for `settleTicks` of patrol. */
export function trapScene(
  fieldId: string,
  level: CampaignLevel,
  seed: number,
  target: number,
  settleTicks = 120,
): TrapScene {
  const r = rig(fieldId, level, seed);
  const sc: TrapScene = { r, s: r.state, target, events: [] };
  for (let i = 0; i < settleTicks; i++) tickScene(sc, {});
  return sc;
}

/** One tick of the whole game (every enemy bot decides from its own observation); returns this tick's events. */
export function tickScene(sc: TrapScene, human: Intent): SimEvent[] {
  const intents: Record<number, Intent> = {};
  for (const [id, bot] of Object.entries(sc.r.bots)) {
    const n = Number(id);
    if (sc.s.players[n]!.alive) intents[n] = bot.decide(observe(sc.s, n));
  }
  intents[0] = human;
  const ev = simTick(sc.s, intents);
  sc.events = ev;
  return ev;
}

/** Where the human stages: far from every enemy's route (he is not seen), close enough to watch the target. */
export function stageTile(s: GameState, target: number): { x: number; y: number } {
  // every tile any enemy walks (the paths between its waypoints, closed) and stands on
  const route = new Set<number>();
  for (const [id, m] of Object.entries(s.territory!.minds)) {
    const pts = m.spec.patrol.length >= 2 ? m.spec.patrol : [m.spec.centre];
    route.add(idx(s, s.players[Number(id)]!.x, s.players[Number(id)]!.y));
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k]!;
      const b = pts[(k + 1) % pts.length]!;
      const w = walkFrom(s, a.x, a.y);
      for (const t of pathOf(w, idx(s, b.x, b.y)) ?? []) route.add(t);
      route.add(idx(s, a.x, a.y));
    }
  }
  const routeList = [...route];
  // a stage in a walled-in pocket is no stage: it must be on the same walkable ground as the target's route
  const homeWalk = walkFrom(
    s,
    s.territory!.minds[target]!.spec.anchors[0]!.x,
    s.territory!.minds[target]!.spec.anchors[0]!.y,
  );
  const connected = (i: number): boolean => homeWalk.dist[i]! >= 0;
  const home = s.territory!.minds[target]!.spec.anchors[0]!;
  let pick: { x: number; y: number } | null = null;
  let pickScore = -1e9;
  for (let i = 0; i < s.width * s.height; i++) {
    const x = i % s.width;
    const y = Math.floor(i / s.width);
    if (!walkable(s, x, y) || route.has(i) || !s.sector || !inSectorTile(s, x, y)) continue;
    if (cheb({ x, y }, home) > 13 || !connected(i)) continue;
    // out of sight of every tile an enemy walks (a wall or a crate in between), and no nearer than 4 tiles to one
    let seen = 0;
    let near = 99;
    for (const r of routeList) {
      const rx = r % s.width;
      const ry = Math.floor(r / s.width);
      near = Math.min(near, Math.abs(rx - x) + Math.abs(ry - y));
      if (canSeeTile(s, rx, ry, x, y, 9, NO_BODIES)) seen++;
    }
    if (near < 5) continue;
    // hidden first, then as close to its lane as that allows (a short hop to the generator tile, still unseen)
    const score = -seen * 10 - (near - 5);
    if (score > pickScore) {
      pickScore = score;
      pick = { x, y };
    }
  }
  return pick ?? { x: s.players[0]!.x, y: s.players[0]!.y };
}

/** Where the fighting strategies start: well clear of the target (he walks up to it), out of its sight. */
function stageNear(sc: TrapScene): { x: number; y: number } {
  return stageTile(sc.s, sc.target);
}

/** Is the tile inside the mission's sector (the part of the district map that is the play area)? */
function inSectorTile(s: GameState, x: number, y: number): boolean {
  return inSector(s, x, y);
}

function teleportHuman(s: GameState, x: number, y: number): void {
  const me = s.players[0]!;
  me.x = me.stepFromX = x;
  me.y = me.stepFromY = y;
  me.stepRemaining = 0;
}

// ------------------------------------------------------------------------------------------------ learning a route

interface Sample {
  x: number;
  y: number;
  f: Dir;
}

/** What the human has watched of one enemy: where it was and which way it faced at every tick he saw it. */
export class RouteModel {
  private readonly at = new Map<number, Sample>();
  private first = Infinity;
  private last = -Infinity;
  private cachedPeriod: number | null | undefined;
  /** Tiles ANY enemy walked on while he watched (a generator on one would be kicked): never laid on. */
  readonly traffic = new Set<number>();
  /** The same for the OTHER enemies (the target's own lane excluded): a generator laid within earshot of one calls it over. */
  readonly others = new Set<number>();

  clear(): void {
    this.at.clear();
    this.first = Infinity;
    this.last = -Infinity;
    this.cachedPeriod = undefined;
    this.traffic.clear();
    this.others.clear();
  }

  record(tick: number, p: { x: number; y: number; facing: Dir }): void {
    this.at.set(tick, { x: p.x, y: p.y, f: p.facing });
    this.first = Math.min(this.first, tick);
    this.last = Math.max(this.last, tick);
    this.cachedPeriod = undefined;
  }

  get span(): number {
    return this.last - this.first;
  }

  /**
   * The lap time he has seen repeat: the shortest delay after which it is again (nearly) where it was, over the stretch he
   * has watched. Null while he has not seen a lap repeat.
   */
  period(): number | null {
    if (this.cachedPeriod !== undefined) return this.cachedPeriod;
    const ratios: [number, number][] = [];
    const n = this.span;
    for (let P = 200; P <= Math.min(1200, n - 100); P += 2) {
      let match = 0;
      let total = 0;
      for (let t = this.first; t + P <= this.last; t += 3) {
        const a = this.at.get(t);
        const b = this.at.get(t + P);
        if (!a || !b) continue;
        total++;
        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1) match++;
      }
      if (total >= 40) ratios.push([P, match / total]);
    }
    const top = Math.max(0, ...ratios.map((r) => r[1]));
    // the first lap length that is nearly as good as the best one (a lap repeats, a half lap does not) ...
    const hit = top >= 0.72 ? ratios.find((r) => r[1] >= top - 0.05) : undefined;
    let best = hit ? hit[0] : null;
    // ... then the exact lap time: the delay at which it is on the very same tile most often (steps are 14 ticks long)
    let exact = 0;
    if (best !== null) {
      let bestScore = -1;
      for (let P = best - 24; P <= best + 24; P++) {
        if (P < 200 || P > n - 60) continue;
        let match = 0;
        let total = 0;
        for (let t = this.first; t + P <= this.last; t += 2) {
          const a = this.at.get(t);
          const b = this.at.get(t + P);
          if (!a || !b) continue;
          total++;
          if (a.x === b.x && a.y === b.y) match++;
        }
        const score = total >= 40 ? match / total : -1;
        if (score > bestScore + 1e-9) {
          bestScore = score;
          best = P;
        }
      }
      exact = bestScore;
    }
    // a lap goes somewhere: an enemy that stands still (or shuffles) for a while has no lap to learn
    const tiles = new Set<number>();
    for (const smp of this.at.values()) tiles.add(smp.y * 4096 + smp.x);
    this.cachedPeriod = best !== null && exact >= 0.6 && tiles.size >= 6 ? best : null;
    return this.cachedPeriod;
  }

  /** The last lap he watched, as a table of where it was at each tick of it (null before a lap has repeated). */
  lap(): Lap | null {
    const P = this.period();
    if (P === null) return null;
    const cells: Sample[] = [];
    let prev: Sample | undefined;
    for (let i = 0; i < P; i++) {
      const c = this.at.get(this.last - P + 1 + i) ?? prev;
      if (!c) return null;
      cells.push(c);
      prev = c;
    }
    return new Lap(cells);
  }
}

/** One watched lap, replayed: where the enemy is at each phase of its circuit. */
export class Lap {
  readonly P: number;
  constructor(readonly cells: readonly Sample[]) {
    this.P = cells.length;
  }

  at(phase: number): Sample {
    const i = ((Math.round(phase) % this.P) + this.P) % this.P;
    return this.cells[i]!;
  }

  /**
   * Where on its circuit the enemy is NOW, from the last stretch of its walk he has watched (`recent`, oldest first, one
   * sample per tick, the last one is now): the phase whose past matches it best (nearest `hint` on a tie).
   */
  phaseOf(recent: readonly Sample[], hint: number): number {
    let best = -1;
    let bestScore = -1;
    let bestDist = 1e9;
    for (let p = 0; p < this.P; p++) {
      let score = 0;
      for (let j = 0; j < recent.length; j += 2) {
        const r = recent[recent.length - 1 - j]!;
        const c = this.at(p - j);
        if (c.x === r.x && c.y === r.y) score++;
      }
      const d = Math.min(Math.abs(p - hint), this.P - Math.abs(p - hint));
      if (score > bestScore || (score === bestScore && d < bestDist)) {
        best = p;
        bestScore = score;
        bestDist = d;
      }
    }
    return best;
  }
}

// ------------------------------------------------------------------------------------------------ what it can see

/** Would a calm enemy at `e` (facing `e.f`) see tile (tx, ty) within `range`: in the cone ahead, in line of sight? */
function calmSees(s: GameState, e: Sample, tx: number, ty: number, range: number): boolean {
  if (!inViewCone({ x: e.x, y: e.y, facing: e.f }, tx, ty)) return false;
  return canSeeTile(s, e.x, e.y, tx, ty, range, NO_BODIES);
}
const NO_BODIES: ReadonlySet<number> = new Set();

// ------------------------------------------------------------------------------------------------ the result

export type Strategy = 'ambush' | 'lure' | 'bait' | 'plain';

export interface AttemptResult {
  /** The target died from the human's blast. */
  killed: boolean;
  /** The human's generator exploded at all. */
  laid: boolean;
  /** The target noticed him (an "!" glyph) before the blast. */
  noticed: boolean;
  /** The human took a hit from his own blast. */
  selfHit: boolean;
  /** Why it ended: 'killed' | 'missed' (the blast went off without the target in it) | 'noticed' | 'noPlan' | 'timeout'. */
  why: string;
}

export interface TrapRunResult {
  fieldId: string;
  level: CampaignLevel;
  seed: number;
  strategy: Strategy;
  target: string;
  attempts: AttemptResult[];
  /** Killed on the first attempt / within `attempts`. */
  first: boolean;
  within: boolean;
  seconds: number;
}

export interface TrapRunOptions {
  fieldId: string;
  level: CampaignLevel;
  seed: number;
  strategy: Strategy;
  /** The enemy seat to trap (default: the first ordinary roamer with a route). */
  target?: number;
  model?: Partial<HumanModel>;
  /** Trace to stdout. */
  trace?: boolean;
}

const FUSE = 180;
/** He lays no generator within this many tiles (walking, Manhattan) of the enemy: it is noisy (a player knows enemies hear it). */
const HEARING_MARGIN = 5;
/** Within this many tiles of another enemy's route he lays nothing (it would come to look). */
const OTHERS_MARGIN = 3;
/** How far he assumes an enemy notices a person (tiles), how far it notices a generator, and the glimpses he accepts (samples of 4 ticks). */
const NOTICE_RANGE = 6;
const GENERATOR_RANGE = 3;
/** A generator it first sees fewer ticks than this before it goes off is seen too late to be walked away from. */
const SEEN_TOO_LATE = 60;
/** He aims to be standing at the generator tile this long before he means to lay (latency, an overshoot, a step back). */
const ARRIVE_EARLY = 70;
/** It comes within this many tiles of him before he has laid: he gives the approach up. */
const ABORT_TILES = 4;
/** The view time (ticks of sight, as it builds up and drains) he will not risk: noticing takes 20 on Normal. */
const NOTICE_METER = 16;
/** Why candidates were rejected (a debugging aid for the planner). */
export const DBG = {
  cands: 0,
  widest: 0,
  windows: 0,
  early: 0,
  noRefuge: 0,
  hearing: 0,
  seesHuman: 0,
  seesGen: 0,
  noPred: 0,
  ok: 0,
};

// ------------------------------------------------------------------------------------------------ the ambush

interface AmbushPlan {
  g: number;
  /** Tiles from where he stands to G, and from G to his refuge. */
  path: number[];
  retreat: number[];
  /** Absolute tick at which he decides to lay (his own judgement of the moment, before the tolerance error). */
  tLay: number;
  tBlast: number;
  width: number;
  walkTicks: number;
  /** The tick he leaves the stage (early enough to wait at G out of its sight). */
  tDepart: number;
  /** The lap he watched, and the phase of it at which the blast should catch the enemy. */
  lap: Lap;
  phaseBlast: number;
}

/** Is (x, y) within earshot of another enemy's route? */
function nearOthers(s: GameState, model: RouteModel, x: number, y: number): boolean {
  for (const t of model.others)
    if (Math.abs((t % s.width) - x) + Math.abs(Math.floor(t / s.width) - y) <= OTHERS_MARGIN) return true;
  return false;
}

/** Plans an ambush from what has been watched; null when no tile is out of its sight and covers its lane. */
function planAmbush(
  sc: TrapScene,
  model: RouteModel,
  now: number,
  here: { x: number; y: number },
  latencyMean: number,
  minWidth: number,
): AmbushPlan | null {
  const s = sc.s;
  const lap = model.lap();
  if (lap === null) return null;
  const P = lap.P;
  // where it will be at tick t: the lap he watched, replayed from this moment
  const pred = (t: number): Sample => lap.at(P - 1 + (t - now));
  const from = walkFrom(s, here.x, here.y);
  const best: { plan: AmbushPlan; score: number }[] = [];
  const footprints = new Map<number, Set<number>>();
  for (let g = 0; g < from.dist.length; g++) {
    const d = from.dist[g]!;
    if (d < 0 || d > 24) continue;
    const gx = g % s.width;
    const gy = Math.floor(g / s.width);
    if (!walkable(s, gx, gy) || model.traffic.has(g) || model.others.has(g)) continue;
    if (nearOthers(s, model, gx, gy)) continue;
    const fp = footprintAt(s, gx, gy);
    footprints.set(g, fp);
    DBG.cands++;
    // blast times at which the predicted enemy is inside the footprint: each run of them is a window
    const walk = d * 10;
    const earliest = now + walk + 40 + FUSE; // arrive, a beat of latency, lay, fuse
    let runStart = -1;
    for (let t = earliest; t <= earliest + P + 2; t += 2) {
      const e = t <= earliest + P ? pred(t) : null;
      const inside = e !== null && fp.has(idx(s, e.x, e.y));
      if (inside && runStart < 0) runStart = t;
      if (!inside && runStart >= 0) {
        const end = t - 2;
        const width = end - runStart;
        DBG.widest = Math.max(DBG.widest, width);
        const centre = Math.round((runStart + end) / 2);
        runStart = -1;
        if (width < minWidth) continue;
        const plan = evaluate(
          sc,
          model,
          lap,
          pred,
          g,
          fp,
          from,
          now,
          centre - FUSE - latencyMean,
          centre,
          width,
          latencyMean,
        );
        if (plan) best.push({ plan, score: plan.width - plan.walkTicks * 1.5 - (centre - now) * 0.01 });
      }
    }
  }
  best.sort((a, b) => b.score - a.score);
  return best[0]?.plan ?? null;
}

/** Checks one candidate (a tile G, a lay time) for exposure to the predicted enemy; returns the plan with a refuge. */
function evaluate(
  sc: TrapScene,
  model: RouteModel,
  lap: Lap,
  pred: (t: number) => Sample,
  g: number,
  fp: ReadonlySet<number>,
  from: Walk,
  now: number,
  tLay: number,
  tBlast: number,
  width: number,
  latencyMean: number,
): AmbushPlan | null {
  const s = sc.s;
  const gx = g % s.width;
  const gy = Math.floor(g / s.width);
  const path = pathOf(from, g) ?? [];
  const walkTicks = path.length * 10;
  DBG.windows++;
  if (tLay - walkTicks - ARRIVE_EARLY < now) return (DBG.early++, null);
  // refuges: outside the blast, reachable well before the fuse ends, never on the way the enemy walks; nearest first
  const out = walkFrom(s, gx, gy);
  const refuges: number[][] = [];
  const order: number[] = [];
  for (let r = 0; r < out.dist.length; r++) {
    const steps = out.dist[r]!;
    if (steps < 3 || steps > 9 || fp.has(r) || !walkable(s, r % s.width, Math.floor(r / s.width))) continue;
    if (model.traffic.has(r) || model.others.has(r)) continue;
    order.push(r);
  }
  order.sort((a, b) => out.dist[a]! - out.dist[b]!);
  for (const r of order.slice(0, 40)) refuges.push(pathOf(out, r)!);
  if (refuges.length === 0) return (DBG.noRefuge++, null);
  // the enemy's hearing: nowhere near it while the generator goes down
  const eLay = pred(tLay);
  if (manh(eLay, { x: gx, y: gy }) <= HEARING_MARGIN) return (DBG.hearing++, null);
  // exposure: he, the generator and the walk, against where it will be (and a beat either side: the model is not exact).
  // He may leave the stage early and wait at G, out of sight, for the moment: the latest departure that is unseen wins.
  const timeline = (t: number, tDepart: number, refuge: number[]): number => {
    if (t < tDepart) return -1; // still hidden at the stage
    const k = Math.floor((t - tDepart) / 10);
    if (k < path.length && t < tLay) return path[k] ?? g;
    if (t < tLay + latencyMean) return g;
    const r = Math.floor((t - tLay - latencyMean) / 10);
    return refuge[Math.min(refuge.length - 1, r)] ?? g;
  };
  const exposed = (tDepart: number, refuge: number[]): 'ok' | 'human' | 'generator' => {
    // sight builds up while he is in its view and drains faster when he is not: a glimpse is nothing, a stare is noticed
    const meter = [0, 0, 0];
    for (let t = tDepart; t <= tBlast + 10; t += 4) {
      const h = timeline(t, tDepart, refuge);
      for (let k = 0; k < 3; k++) {
        const e = pred(t + (k - 1) * 10);
        // within two tiles it feels him whichever way it faces (a margin on top: the model is not exact)
        if (h >= 0 && manh(e, { x: h % s.width, y: Math.floor(h / s.width) }) <= 5) return 'human';
        const seen = h >= 0 && calmSees(s, e, h % s.width, Math.floor(h / s.width), NOTICE_RANGE);
        meter[k] = Math.max(0, meter[k]! + (seen ? 4 : -8));
        if (meter[k]! >= NOTICE_METER) return 'human';
        // the generator seen early enough to walk out of its blast is a failed ambush; seen in the last beat, it is not
        if (t >= tLay && t < tBlast - SEEN_TOO_LATE && calmSees(s, e, gx, gy, GENERATOR_RANGE))
          return 'generator';
      }
    }
    return 'ok';
  };
  const latest = tLay - walkTicks - ARRIVE_EARLY;
  let why: 'human' | 'generator' = 'human';
  for (const refuge of refuges) {
    // the refuge must not be on the lane at the time of the blast either
    const rt = refuge[refuge.length - 1]!;
    let onLane = false;
    for (let t = tBlast - 60; t <= tBlast + 60 && !onLane; t += 6) {
      const e = pred(t);
      if (idx(s, e.x, e.y) === rt) onLane = true;
    }
    if (onLane) continue;
    for (let tDepart = latest; tDepart >= Math.max(now, latest - 700); tDepart -= 10) {
      const x = exposed(tDepart, refuge);
      if (x === 'ok') {
        DBG.ok++;
        return {
          g,
          path,
          retreat: refuge,
          tLay,
          tBlast,
          width,
          walkTicks,
          tDepart,
          lap,
          phaseBlast: lap.P - 1 + (tBlast - now),
        };
      }
      why = x;
      if (x === 'generator') {
        DBG.seesGen++;
        return null; // no refuge or departure helps: the generator itself is in its view
      }
    }
  }
  if (why === 'generator') DBG.seesGen++;
  else DBG.seesHuman++;
  return null;
}

// ------------------------------------------------------------------------------------------------ one attempt

type Phase = 'stage' | 'watch' | 'wait' | 'go' | 'lay' | 'retreat' | 'done' | 'flee';

interface Ctx {
  sc: TrapScene;
  model: HumanModel;
  rnd: () => number;
  pilot: Pilot;
  trace: boolean;
}

const log = (c: Ctx, ...a: unknown[]): void => {
  if (c.trace) console.log(`[${c.sc.s.tick}]`, ...a);
};

/** The human's view of the target this tick (null when it is off his screen or dead). */
function targetView(c: Ctx): { x: number; y: number; facing: Dir } | null {
  const s = c.sc.s;
  const e = s.players[c.sc.target]!;
  if (!e.alive || cheb(e, s.players[0]!) > c.model.screenTiles) return null;
  return { x: e.x, y: e.y, facing: e.facing };
}

/** Did the target kill-blast event happen in these events? */
function scoreEvents(ev: SimEvent[], target: number, res: AttemptResult): void {
  for (const e of ev) {
    if (e.type === 'campaignDefeated' && e.victimId === target && e.source === 'blast') res.killed = true;
    if (e.type === 'campaignHit' && e.victimId === 0 && e.source === 'blast') res.selfHit = true;
    if (e.type === 'enemyCue' && e.cue === 'alert' && e.playerId === target) res.noticed = true;
  }
}

/** The tile to run to from the target: the one it is farthest from (by walking) that he reaches first. */
function fleeTile(sc: TrapScene): number {
  const s = sc.s;
  const me = s.players[0]!;
  const e = s.players[sc.target]!;
  const dm = walkFrom(s, me.x, me.y);
  const de = walkFrom(s, e.x, e.y);
  let best = -1;
  let bestV = -1;
  for (let i = 0; i < dm.dist.length; i++) {
    if (dm.dist[i]! <= 0 || dm.dist[i]! > 40 || de.dist[i]! <= dm.dist[i]!) continue;
    if (de.dist[i]! > bestV) {
      bestV = de.dist[i]!;
      best = i;
    }
  }
  return best;
}

/** Danger he walks out of: the blast footprint of any generator on the board (his own included) near its end. */
function dangerMove(c: Ctx, fuseMargin: number): Dir | null {
  const s = c.sc.s;
  const me = s.players[0]!;
  const bad = new Set<number>();
  for (const g of s.generators) {
    if (g.carriedBy !== null || g.timer > FUSE) continue;
    if (g.timer > FUSE + 10) continue;
    for (const t of footprintAt(s, g.x, g.y)) bad.add(t);
  }
  for (const f of s.flames) bad.add(idx(s, f.x, f.y));
  if (!bad.has(idx(s, me.x, me.y))) return null;
  void fuseMargin;
  const w = walkFrom(s, me.x, me.y);
  let bestT = -1;
  let bestD = 1e9;
  for (let i = 0; i < w.dist.length; i++) {
    if (w.dist[i]! <= 0 || bad.has(i)) continue;
    if (w.dist[i]! < bestD) {
      bestD = w.dist[i]!;
      bestT = i;
    }
  }
  if (bestT < 0) return null;
  const p = pathOf(w, bestT);
  return p && p.length > 0 ? dirTo(s, me, p[0]!) : null;
}

export function runAmbushAttempt(
  c: Ctx,
  stage: { x: number; y: number },
  learned: RouteModel,
): AttemptResult {
  const { sc } = c;
  const s = sc.s;
  const me = s.players[0]!;
  const res: AttemptResult = { killed: false, laid: false, noticed: false, selfHit: false, why: 'timeout' };
  // a life lost on the way back puts him at the mission start: the scenario returns him to his stage
  if (me.x !== stage.x || me.y !== stage.y) teleportHuman(s, stage.x, stage.y);
  const latMean = (c.model.latency[0] + c.model.latency[1]) / 2;
  const minWidth = 36;
  let phase: Phase = 'watch';
  let plan: AmbushPlan | null = null;
  // judgement error of this attempt, and how far the enemy has drifted from the lap he watched (re-read as he watches)
  const eps = Math.round((c.rnd() * 2 - 1) * c.model.timingTol);
  let shift = 0;
  let phaseHint = 0;
  const recent: Sample[] = [];
  let laidAt = -1;
  let fleeUntil = -1;
  let fleeTo = -1;
  let walkPath: number[] = [];
  const start = s.tick;
  const watchStart = s.tick;
  while (s.match.phase !== 'ended' && s.tick - start < 60 * 120) {
    const t = s.tick;
    const v = targetView(c);
    if (v && phase !== 'done') learned.record(t, v);
    if (v) {
      recent.push({ x: v.x, y: v.y, f: v.facing });
      if (recent.length > 120) recent.shift();
    }
    // closed loop: where is the enemy on its circuit NOW? the moment the blast should land moves with it
    if (
      plan &&
      v &&
      (phase === 'wait' || phase === 'go' || phase === 'lay') &&
      t % 6 === 0 &&
      recent.length >= 40
    ) {
      const P = plan.lap.P;
      const ph = plan.lap.phaseOf(recent, phaseHint);
      phaseHint = ph;
      let d = (((plan.phaseBlast - ph) % P) + P) % P; // ticks until the blast phase comes round
      d = t + d - plan.tBlast; // the plan's blast tick, moved
      if (d > P / 2) d -= P;
      if (d < -P / 2) d += P;
      shift = d;
    }
    if (phase === 'watch')
      for (const p of s.players)
        if (p.id !== 0 && p.alive && cheb(p, me) <= c.model.screenTiles)
          learned.traffic.add(idx(s, p.x, p.y));
    if (c.trace && plan && t % 30 === 0 && (phase === 'wait' || phase === 'go' || phase === 'lay'))
      log(
        c,
        phase,
        'H',
        me.x,
        me.y,
        'E',
        v?.x,
        v?.y,
        'shift',
        shift,
        'mind',
        enemyMindView(s, sc.target),
        JSON.stringify({ ...s.territory!.minds[sc.target]!, spec: undefined }).slice(0, 260),
        'gens',
        s.generators.map((o) => `${o.x},${o.y}:${o.ownerId}:${o.timer}`).join(';'),
        'dir',
        JSON.stringify(observe(s, sc.target).directive),
        'intent',
        JSON.stringify(sc.r.bots[sc.target]!.decide(observe(s, sc.target))),
        'step',
        s.players[sc.target]!.stepRemaining,
        'root',
        s.players[sc.target]!.rootedUntil - t,
        'dazed',
        s.players[sc.target]!.dazedUntil - t,
        'players',
        s.players
          .filter((q) => q.alive)
          .map((q) => `${q.id}@${q.x},${q.y}`)
          .join(' '),
        'pickups',
        s.pickups
          .filter((q) => Math.abs(q.x - 52) < 8 && Math.abs(q.y - 31) < 3)
          .map((q) => `${q.x},${q.y}:${q.kind}`)
          .join(';'),
        'lay at',
        plan.tLay + shift + eps,
        'settled',
        c.pilot.settled(),
      );
    // he sees it coming at him before it has noticed him: he backs off and tries again (not a failed generator, a failed approach)
    if (
      v &&
      (phase === 'go' || phase === 'lay' || phase === 'wait') &&
      manh(v, me) <= ABORT_TILES &&
      !res.noticed
    ) {
      log(
        c,
        'abort',
        phase,
        'H',
        me.x,
        me.y,
        'E',
        JSON.stringify(v),
        'G',
        plan ? [plan.g % s.width, Math.floor(plan.g / s.width)] : null,
        'shift',
        shift,
        'tLay',
        plan?.tLay,
        'tDepart',
        plan?.tDepart,
        'walk',
        plan?.walkTicks,
      );
      res.why = 'aborted';
      return res;
    }
    let want: Intent = {};
    // never stand in a blast (a visible footprint) or a flame
    const out = phase === 'watch' || phase === 'wait' ? dangerMove(c, 0) : null;
    if (out) want = { move: out };
    else if (phase === 'watch') {
      const P = (t - watchStart) % 30 === 0 ? learned.period() : null;
      if (c.trace && (t - watchStart) % 240 === 0)
        log(
          c,
          'watch span',
          learned.span,
          'period',
          P,
          'target view',
          JSON.stringify(v),
          'me',
          me.x,
          me.y,
          enemyMindView(s, sc.target),
        );
      if (P !== null && learned.span >= P + 60) {
        plan = planAmbush(sc, learned, t, me, latMean, minWidth);
        if (!plan) {
          log(c, 'no plan', JSON.stringify(DBG), 'period', P);
          res.why = 'noPlan';
          return res;
        }
        phaseHint = plan.lap.P - 1;
        phase = 'wait';
        log(
          c,
          'plan',
          JSON.stringify({
            g: [plan.g % s.width, Math.floor(plan.g / s.width)],
            tLay: plan.tLay,
            width: plan.width,
            walk: plan.walkTicks,
          }),
          'period',
          P,
        );
      } else if (t - watchStart > c.model.watchMaxSec * 60) {
        res.why = 'noPlan';
        return res;
      }
    } else if (phase === 'wait') {
      if (t >= plan!.tDepart + shift) phase = 'go';
    }
    if (phase === 'go') {
      // he keeps to his route: the planned path, re-made only when he is off it (a person does not dither at forks)
      const here = idx(s, me.x, me.y);
      let k = walkPath.indexOf(here);
      if (k < 0) {
        const w = walkFrom(s, me.x, me.y);
        walkPath = [here, ...(pathOf(w, plan!.g) ?? [])];
        k = 0;
      }
      const rest = walkPath.length - 1 - k;
      if (rest <= 0) phase = 'lay';
      else if (rest > 1 || c.pilot.settled()) want = { move: dirTo(s, me, walkPath[k + 1]!) }; // lets go a tile early: his press reaches the game late
    }
    if (phase === 'lay') {
      // there: lay it when his own judgement says the moment has come
      if (me.x !== plan!.g % s.width || me.y !== Math.floor(plan!.g / s.width)) phase = 'go';
      else if (t >= plan!.tLay + shift + eps && c.pilot.settled() && me.stepRemaining === 0)
        want = { place: true };
    }
    if (phase === 'retreat') {
      const g = s.generators.find((o) => o.ownerId === 0);
      if (!g) phase = 'done';
      else {
        // walk to the refuge chosen with the plan and stand there
        const r = plan!.retreat[plan!.retreat.length - 1]!;
        const w = walkFrom(s, me.x, me.y);
        const p = pathOf(w, r);
        if (p && p.length > 0) want = { move: dirTo(s, me, p[0]!) };
      }
    }
    if (phase === 'flee') {
      // run from the enemy: to the tile it is farthest from that he reaches first, kept until he gets there
      if (fleeTo < 0 || idx(s, me.x, me.y) === fleeTo) fleeTo = fleeTile(sc);
      const w = walkFrom(s, me.x, me.y);
      const p = fleeTo >= 0 ? pathOf(w, fleeTo) : null;
      if (p && p.length > 0) want = { move: dirTo(s, me, p[0]!) };
      if (t > fleeUntil) {
        res.why = 'noticed';
        return res;
      }
    }
    const exec = c.pilot.drive(want, t);
    if (c.trace && laidAt >= 0 && t < laidAt + 25 && (exec.place || want.place))
      log(c, 'PLACE want', JSON.stringify(want), 'exec', JSON.stringify(exec), 'gens', s.generators.length);
    if (c.trace && laidAt >= 0 && t % 10 === 0 && t < laidAt + 260)
      log(
        c,
        phase,
        'H',
        me.x,
        me.y,
        'E',
        s.players[sc.target]!.x,
        s.players[sc.target]!.y,
        enemyMindView(s, sc.target),
        'gen',
        s.generators.find((o) => o.ownerId === 0)?.timer ?? '-',
        'want',
        JSON.stringify(want),
        'exec',
        JSON.stringify(exec),
        'hp',
        me.vitals?.hp,
      );
    const ev = tickScene(sc, exec);
    if (c.trace && ev.some((e) => e.type === 'generatorExploded'))
      log(
        c,
        'BOOM flames',
        s.flames.map((f) => `${f.x},${f.y}`).join(' '),
        'players',
        s.players
          .filter((p) => p.alive)
          .map((p) => `${p.id}@${p.x},${p.y}${p.stepRemaining ? '~' + p.stepFromX + ',' + p.stepFromY : ''}`)
          .join(' '),
      );
    if (c.trace && laidAt >= 0 && t > laidAt + 100 && ev.length)
      log(
        c,
        'events',
        ev
          .map(
            (e) =>
              e.type +
              ('playerId' in e ? ':' + (e as { playerId: number }).playerId : '') +
              ('victimId' in e ? ':v' + (e as { victimId: number }).victimId : ''),
          )
          .join(','),
      );
    scoreEvents(ev, sc.target, res);
    if (phase === 'lay' && s.generators.some((o) => o.ownerId === 0)) {
      phase = 'retreat';
      res.laid = true;
      laidAt = s.tick;
      c.pilot.cancelPresses();
      log(c, 'laid at', me.x, me.y, 'enemy', JSON.stringify(v));
    }
    if (
      res.noticed &&
      phase !== 'flee' &&
      phase !== 'done' &&
      !res.killed &&
      s.generators.every((o) => o.ownerId !== 0)
    ) {
      const before = phase;
      phase = 'flee';
      fleeUntil = s.tick + 60 * 6;
      c.pilot.flush();
      log(
        c,
        'noticed: flee',
        'H',
        me.x,
        me.y,
        'E',
        JSON.stringify(targetView(c)),
        'phase before',
        before,
        'enemy mind',
        enemyMindView(s, sc.target),
      );
    }
    if (laidAt >= 0 && !s.generators.some((o) => o.ownerId === 0) && s.tick > laidAt + 30) {
      // the blast went off: a short look at the aftermath, then the verdict
      for (let k = 0; k < 40; k++) scoreEvents(tickScene(sc, {}), sc.target, res);
      res.why = res.killed ? 'killed' : res.noticed ? 'noticed' : 'missed';
      return res;
    }
  }
  return res;
}

// ------------------------------------------------------------------------------------------------ the other strategies

/** The state of the target as the human reads it off the screen (glyphs and poses): never its mind's internals. */
type Pose = ReturnType<typeof enemyMindView>;

/** The neighbour tile of `from` that is farthest from `e` and free (a step away from danger), or null. */
function stepAway(s: GameState, from: { x: number; y: number }, e: { x: number; y: number }): Dir | null {
  const lines = thrownTiles(s);
  const swingers = s.players.filter(
    (p) => p.id !== 0 && p.alive && ATTACKING.has(enemyMindView(s, p.id)) && manh(p, from) <= 3,
  );
  let best: Dir | null = null;
  let bestD = -1e9;
  for (const d of DIR_LIST) {
    const x = from.x + DIRV[d][0];
    const y = from.y + DIRV[d][1];
    if (!walkable(s, x, y) || s.players.some((p) => p.alive && p.x === x && p.y === y)) continue;
    // away from the one it is about (and from every other swinging enemy), and never onto a thrown object's line
    let dist = Math.abs(x - e.x) + Math.abs(y - e.y);
    for (const q of swingers) dist = Math.min(dist, Math.abs(x - q.x) + Math.abs(y - q.y) + 1);
    if (lines.has(idx(s, x, y))) dist -= 5;
    if (dist > bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best;
}

/** The tiles a thrown object is about to cross (the marked path on the ground): a person steps off them. */
function thrownTiles(s: GameState): Set<number> {
  const out = new Set<number>();
  for (const pr of s.projectiles ?? []) for (const t of pr.path.slice(pr.index)) out.add(t);
  return out;
}

/** Runs the shared attempt loop for the fighting strategies: `decide` returns the human's wish for this tick. */
function fightAttempt(
  c: Ctx,
  stage: { x: number; y: number },
  limitSec: number,
  decide: (st: FightState) => Intent,
): AttemptResult {
  const { sc } = c;
  const s = sc.s;
  const me = s.players[0]!;
  const res: AttemptResult = { killed: false, laid: false, noticed: false, selfHit: false, why: 'timeout' };
  if (me.x !== stage.x || me.y !== stage.y) teleportHuman(s, stage.x, stage.y);
  const st: FightState = {
    c,
    res,
    laidAt: -1,
    phase: 'approach',
    anchor: null,
    exit: null,
    note: 0,
    dodged: new Set(),
  };
  const start = s.tick;
  while (s.match.phase !== 'ended' && s.tick - start < limitSec * 60) {
    const t = s.tick;
    if (c.trace && st.laidAt < 0 && t % 60 === 0)
      log(
        c,
        'fight',
        st.phase,
        'H',
        me.x,
        me.y,
        'E',
        s.players[sc.target]!.x,
        s.players[sc.target]!.y,
        enemyMindView(s, sc.target),
        'hp',
        me.vitals?.hp,
        'root',
        s.players[sc.target]!.rootedUntil - t,
      );
    let want = decide(st);
    // never stand in a blast it is too late to be in: out of any footprint with little fuse left
    const d = dangerMove(c, 0);
    if (d && st.phase !== 'hold' && st.phase !== 'lay') want = { move: d };
    const exec = c.pilot.drive(want, t);
    if (c.trace && st.laidAt >= 0 && t % 6 === 0 && t < st.laidAt + 220)
      log(
        c,
        st.phase,
        'H',
        me.x,
        me.y,
        'E',
        s.players[sc.target]!.x,
        s.players[sc.target]!.y,
        enemyMindView(s, sc.target),
        'gen',
        s.generators.find((o) => o.ownerId === 0)?.timer ?? '-',
        'want',
        JSON.stringify(want),
        'hp',
        me.vitals?.hp,
      );
    const ev = tickScene(sc, exec);
    scoreEvents(ev, sc.target, res);
    if (st.laidAt < 0 && s.generators.some((o) => o.ownerId === 0)) {
      st.laidAt = s.tick;
      res.laid = true;
      c.pilot.cancelPresses();
      log(c, 'laid', me.x, me.y);
    }
    if (st.laidAt >= 0 && !s.generators.some((o) => o.ownerId === 0) && s.tick > st.laidAt + 20) {
      for (let k = 0; k < 40; k++) scoreEvents(tickScene(sc, {}), sc.target, res);
      res.why = res.killed ? 'killed' : 'missed';
      return res;
    }
    if (!s.players[sc.target]!.alive) {
      res.why = res.killed ? 'killed' : 'missed';
      return res;
    }
  }
  return res;
}

interface FightState {
  c: Ctx;
  res: AttemptResult;
  laidAt: number;
  phase: string;
  anchor: { x: number; y: number } | null;
  exit: { x: number; y: number } | null;
  note: number;
  /** The wind-ups he has already stepped out of (one step each: he does not run off). */
  dodged: Set<number>;
}

const ATTACKING = new Set<Pose>(['windup', 'attack']);

/**
 * bait: let it swing at the air, lay under his own feet in its recovery, hold (his body hides the generator), and walk out
 * late. Needs a brawler that commits to a wind-up (every ordinary kind does).
 */
function baitDecide(st: FightState): Intent {
  const { c, res } = st;
  const s = c.sc.s;
  const me = s.players[0]!;
  const e = s.players[c.sc.target]!;
  const pose = enemyMindView(s, c.sc.target);
  const adjacent = manh(me, e) === 1;
  const g = s.generators.find((o) => o.ownerId === 0);
  if (g && st.phase !== 'leave' && st.phase !== 'hold') st.phase = 'hold';
  switch (st.phase) {
    case 'approach': {
      // walk up until it has noticed him and is on him
      if (
        manh(me, e) > 2 ||
        !(pose === 'alert' || pose === 'pursue' || ATTACKING.has(pose) || pose === 'recovery')
      ) {
        const w = walkFrom(s, me.x, me.y, new Set([idx(s, e.x, e.y)]));
        const near = pathOf(w, nearestTo(s, w, e));
        if (near && near.length > 0 && manh(me, e) > 2) return { move: dirTo(s, me, near[0]!) };
        return {};
      }
      st.phase = 'dance';
      return {};
    }
    case 'dance': {
      const anySwing = s.players.some(
        (p) => p.id !== 0 && p.alive && ATTACKING.has(enemyMindView(s, p.id)) && manh(p, me) <= 2,
      );
      if (thrownTiles(s).has(idx(s, me.x, me.y)) && me.stepRemaining === 0) {
        const d = stepAway(s, me, e);
        if (d) return { move: d };
      }
      if ((ATTACKING.has(pose) && manh(me, e) <= 2) || anySwing) {
        // a wind-up on him: ONE step out of reach (the swing then hits the air and it is planted); he does not run off
        const key =
          e.attack?.resolveTick ?? s.players.find((p) => p.id !== 0 && p.attack)?.attack?.resolveTick ?? -1;
        if (st.dodged.has(key)) return {};
        if (!st.anchor) st.anchor = { x: me.x, y: me.y };
        const d = stepAway(s, me, e);
        if (d && me.stepRemaining === 0 && c.pilot.settled()) {
          st.dodged.add(key);
          return { move: d };
        }
        return d && me.stepRemaining === 0 ? { move: d } : {};
      }
      if (pose === 'recovery') {
        // planted: back in beside it, and lay at its feet
        if (adjacent && c.pilot.settled() && me.stepRemaining === 0) {
          st.phase = 'lay';
          return { place: true };
        }
        const w = walkFrom(s, me.x, me.y, new Set([idx(s, e.x, e.y)]));
        const p = pathOf(w, nearestTo(s, w, e));
        return p && p.length > 0 && !adjacent ? { move: dirTo(s, me, p[0]!) } : {};
      }
      return {};
    }
    case 'lay':
      return adjacent && c.pilot.settled() ? { place: true } : {};
    case 'hold': {
      if (!g) return {};
      // he stands on it (it is hidden under him) and leaves when about 0.75 s of fuse is left
      const leaveAt = 60 + Math.round((c.rnd() * 2 - 1) * c.model.timingTol * 0.5);
      st.note = st.note || leaveAt;
      if (g.timer <= st.note) {
        st.phase = 'leave';
        res.laid = true;
      }
      // out of reach of a wind-up that lands on him
      if (ATTACKING.has(pose) && adjacent && g.timer > st.note + 40) {
        const d = stepAway(s, me, e);
        if (d && me.stepRemaining === 0) return { move: d };
      }
      return {};
    }
    case 'leave': {
      const gen = g ?? s.generators.find((o) => o.ownerId === 0);
      if (!gen) return {};
      if (!st.exit) {
        // out of the blast, on the far side of the generator from the enemy: to reach him it has to walk through the footprint
        // (a pursuer follows him, so he picks the way that makes it cross the blast zone), chosen once: no dithering
        const fp = footprintAt(s, gen.x, gen.y);
        const w = walkFrom(s, me.x, me.y);
        const we = walkFrom(s, e.x, e.y);
        let best = -1;
        let bestScore = -1e9;
        for (let i = 0; i < w.dist.length; i++) {
          if (w.dist[i]! < 2 || w.dist[i]! > 6 || fp.has(i)) continue;
          const path = pathOf(we, i);
          if (!path) continue;
          const inside = path.filter((t) => fp.has(t)).length;
          const score = inside * 10 + we.dist[i]! - w.dist[i]!;
          if (score > bestScore) {
            bestScore = score;
            best = i;
          }
        }
        st.exit = best >= 0 ? { x: best % s.width, y: Math.floor(best / s.width) } : { x: me.x, y: me.y };
      }
      const w = walkFrom(s, me.x, me.y);
      const p = pathOf(w, idx(s, st.exit.x, st.exit.y));
      return p && p.length > 0 ? { move: dirTo(s, me, p[0]!) } : {};
    }
  }
  return {};
}

/** The tile next to `target` that the walk `w` reaches first (null-safe: -1 when none). */
function nearestTo(s: GameState, w: Walk, target: { x: number; y: number }): number {
  let best = -1;
  let bestD = 1e9;
  for (const d of DIR_LIST) {
    const x = target.x + DIRV[d][0];
    const y = target.y + DIRV[d][1];
    if (!inB(s, x, y)) continue;
    const i = idx(s, x, y);
    if (w.dist[i]! >= 0 && w.dist[i]! < bestD) {
      bestD = w.dist[i]!;
      best = i;
    }
  }
  return best;
}

/**
 * lure: get noticed, run past a corner and lay a generator on the tile behind you without stopping, keep running. A pursuer
 * that follows through the blast zone dies (the lane it follows is the one the generator stands in).
 */
function lureDecide(st: FightState): Intent {
  const { c } = st;
  const s = c.sc.s;
  const me = s.players[0]!;
  const e = s.players[c.sc.target]!;
  const pose = enemyMindView(s, c.sc.target);
  const hunting =
    pose === 'alert' || pose === 'pursue' || pose === 'windup' || pose === 'attack' || pose === 'recovery';
  const g = s.generators.find((o) => o.ownerId === 0);
  if (st.phase === 'approach') {
    if (hunting) {
      st.phase = 'run';
      return {};
    }
    const w = walkFrom(s, me.x, me.y, new Set([idx(s, e.x, e.y)]));
    const p = pathOf(w, nearestTo(s, w, e));
    return p && p.length > 0 && manh(me, e) > 5 ? { move: dirTo(s, me, p[0]!) } : {};
  }
  // run to the tile it is farthest from, kept until reached
  const here = idx(s, me.x, me.y);
  if (st.note <= 0 || here === st.note - 1) st.note = fleeTile(c.sc) + 1;
  const w = walkFrom(s, me.x, me.y);
  const path = st.note > 0 ? pathOf(w, st.note - 1) : null;
  const gap = walkFrom(s, e.x, e.y).dist[here]!;
  // in a lane (two ways only), with it a few tiles behind: lay on this tile and go on
  const exits = DIR_LIST.filter((d) => walkable(s, me.x + DIRV[d][0], me.y + DIRV[d][1])).length;
  if (
    !g &&
    st.laidAt < 0 &&
    exits <= 2 &&
    gap >= 3 &&
    gap <= 5 &&
    hunting &&
    me.stepRemaining <= 2 &&
    c.pilot.settled() === false
  )
    return { place: true, ...(path && path.length > 0 ? { move: dirTo(s, me, path[0]!) } : {}) };
  return path && path.length > 0 ? { move: dirTo(s, me, path[0]!) } : {};
}

/** plain: the deliberately bad setup - laid under his feet in plain sight in the lane it walks, 6 tiles from it, then off. */
function plainDecide(st: FightState): Intent {
  const { c } = st;
  const s = c.sc.s;
  const me = s.players[0]!;
  const e = s.players[c.sc.target]!;
  const g = s.generators.find((o) => o.ownerId === 0);
  if (!g && st.laidAt < 0) return c.pilot.settled() ? { place: true } : {};
  // off, directly away from it
  const d = stepAway(s, me, e);
  return d ? { move: d } : {};
}

/** Puts the human 6 walking tiles from the target, in the line it faces (the "bad setup" geometry), when it has one. */
function plainStage(sc: TrapScene): { x: number; y: number } | null {
  const s = sc.s;
  const e = s.players[sc.target]!;
  const w = walkFrom(s, e.x, e.y);
  for (let i = 0; i < w.dist.length; i++) {
    if (w.dist[i] !== 6) continue;
    const x = i % s.width;
    const y = Math.floor(i / s.width);
    if ((x === e.x || y === e.y) && inViewCone(e, x, y) && canSeeTile(s, e.x, e.y, x, y, 8, NO_BODIES))
      return { x, y };
  }
  return null;
}

/**
 * One bait attempt on the target from where the human stands now (no staging): used by the Oshodi flow test, which then goes on
 * with the mission. Returns the attempt result and the pilot (his input latency carries on into the rest of the play).
 */
export function baitFromHere(
  sc: TrapScene,
  seed: number,
  model: Partial<HumanModel> = {},
  limitSec = 60,
): { result: AttemptResult; pilot: Pilot; rnd: () => number; model: HumanModel } {
  const m: HumanModel = { ...HUMAN_MODEL, ...model };
  const rnd = seeded(seed * 1009 + 17);
  const pilot = new Pilot(rnd, m);
  const c: Ctx = { sc, model: m, rnd, pilot, trace: false };
  const me = sc.s.players[0]!;
  return { result: fightAttempt(c, { x: me.x, y: me.y }, limitSec, baitDecide), pilot, rnd, model: m };
}

/** The full run of one strategy: staging, the attempt, and the retry after disengaging. */
export function runTrap(o: TrapRunOptions): TrapRunResult {
  const model: HumanModel = { ...HUMAN_MODEL, ...(o.model ?? {}) };
  const rnd = seeded(o.seed * 1009 + 17);
  const probe = rig(o.fieldId, o.level, o.seed).state;
  const target = o.target ?? defaultTarget(probe);
  const sc = trapScene(o.fieldId, o.level, o.seed, target);
  const stage = stageTile(sc.s, target);
  teleportHuman(sc.s, stage.x, stage.y); // the scenario starts with the human at the stage (the mission's own start is elsewhere)
  const pilot = new Pilot(rnd, model);
  const c: Ctx = { sc, model, rnd, pilot, trace: !!o.trace };
  const attempts: AttemptResult[] = [];
  const learned = new RouteModel();
  const t0 = sc.s.tick;
  for (let a = 0; a < model.attempts; a++) {
    learned.clear();
    let r: AttemptResult;
    if (o.strategy === 'ambush') r = runAmbushAttempt(c, stage, learned);
    else if (o.strategy === 'bait') r = fightAttempt(c, stageNear(sc), 70, baitDecide);
    else if (o.strategy === 'lure') r = fightAttempt(c, stageNear(sc), 70, lureDecide);
    else {
      // wait for the geometry: a straight lane, the enemy walking along it, facing the spot 6 tiles ahead
      let st = plainStage(sc);
      for (let i = 0; i < 60 * 90 && !st && sc.s.match.phase !== 'ended'; i++) {
        tickScene(sc, {});
        st = plainStage(sc);
      }
      r = st
        ? fightAttempt(c, st, 25, plainDecide)
        : { killed: false, laid: false, noticed: false, selfHit: false, why: 'noSetup' };
    }
    attempts.push(r);
    if (r.killed || sc.s.match.phase === 'ended') break;
    if (o.trace)
      console.log(
        'attempt ended',
        r.why,
        'human',
        sc.s.players[0]!.x,
        sc.s.players[0]!.y,
        'alive',
        sc.s.players[0]!.alive,
        'hp',
        sc.s.players[0]!.vitals?.hp,
        'stage',
        stage.x,
        stage.y,
        'tick',
        sc.s.tick,
        'phase',
        sc.s.match.phase,
      );
    // disengage and settle: run if it is after him, go back to the stage (out of its sight), and give it a moment to settle
    let calm = 0;
    let fleeTo = -1;
    for (let i = 0; i < 60 * 60 && calm < model.settleSec * 60; i++) {
      const me = sc.s.players[0]!;
      let want: Intent = {};
      const mind = enemyMindView(sc.s, target);
      const hunting =
        mind === 'alert' ||
        mind === 'pursue' ||
        mind === 'windup' ||
        mind === 'attack' ||
        mind === 'recovery';
      const w = walkFrom(sc.s, me.x, me.y);
      if (hunting) {
        calm = 0;
        if (fleeTo < 0 || idx(sc.s, me.x, me.y) === fleeTo) fleeTo = fleeTile(sc);
        const p = fleeTo >= 0 ? pathOf(w, fleeTo) : null;
        if (p && p.length > 0) want = { move: dirTo(sc.s, me, p[0]!) };
      } else {
        fleeTo = -1;
        const p = pathOf(w, idx(sc.s, stage.x, stage.y));
        if (p && p.length > 0) {
          want = { move: dirTo(sc.s, me, p[0]!) };
          calm = 0;
        } else if (w.dist[idx(sc.s, stage.x, stage.y)] === -1)
          teleportHuman(sc.s, stage.x, stage.y); // a life lost: the scenario puts him back
        else calm++;
      }
      tickScene(sc, pilot.drive(want, sc.s.tick));
    }
  }
  const name = sc.s.players[target]!;
  return {
    fieldId: o.fieldId,
    level: o.level,
    seed: o.seed,
    strategy: o.strategy,
    target: `${name.enemyVariant ?? name.enemyKind}#${target}`,
    attempts,
    first: attempts[0]?.killed ?? false,
    within: attempts.some((x) => x.killed),
    seconds: Math.round((sc.s.tick - t0) / 60),
  };
}

/** The first ordinary roaming enemy with a patrol route (the one a player would trap first). */
export function defaultTarget(s: GameState): number {
  const roamers = new Set(['agbero', 'areaBoy', 'marketEnforcer', 'routeMarshal', 'ringSecurity']);
  for (const p of s.players) {
    if (p.id === 0 || !roamers.has(p.enemyVariant ?? '')) continue;
    const m = s.territory?.minds[p.id];
    if (m && m.spec.patrol.length >= 3) return p.id;
  }
  for (const p of s.players) {
    if (p.id === 0 || !roamers.has(p.enemyVariant ?? '')) continue;
    if (s.territory?.minds[p.id]?.spec.patrol.length) return p.id;
  }
  return 1;
}

export { enemyMindView };
void W;
