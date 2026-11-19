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
const HAZARD_COST = 5;

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
  const anchors: number[] = [];
  for (const m of Object.values(s.territory!.minds))
    for (const a of m.spec.anchors) anchors.push(idx(s, a.x, a.y));
  for (const p of s.players) if (p.id !== 0) anchors.push(idx(s, p.x, p.y));
  // distance from the nearest anchor of ANY enemy, by walking
  const best = new Int16Array(s.width * s.height).fill(32000);
  for (const a of anchors) {
    const w = walkFrom(s, a % s.width, Math.floor(a / s.width));
    for (let i = 0; i < best.length; i++) if (w.dist[i]! >= 0 && w.dist[i]! < best[i]!) best[i] = w.dist[i]!;
  }
  const t = s.players[target]!;
  const mind = s.territory!.minds[target]!;
  const home = mind.spec.anchors[0]!;
  const reach = walkFrom(s, s.players[0]!.x, s.players[0]!.y);
  let pick: { x: number; y: number } | null = null;
  let pickScore = -1e9;
  for (let i = 0; i < best.length; i++) {
    if (reach.dist[i] === -1 && i !== idx(s, s.players[0]!.x, s.players[0]!.y)) continue;
    const x = i % s.width;
    const y = Math.floor(i / s.width);
    if (!walkable(s, x, y)) continue;
    const d = Math.min(best[i]!, 12);
    if (d < 8 || cheb({ x, y }, home) > 11 || cheb({ x, y }, t) > 12) continue;
    // far enough to be unseen, as near the target's lane as that allows
    const score = d * 2 - manh({ x, y }, home);
    if (score > pickScore) {
      pickScore = score;
      pick = { x, y };
    }
  }
  if (pick) return pick;
  // a crowded sector: the tile farthest from every enemy
  let far = -1;
  for (let i = 0; i < best.length; i++) {
    if (reach.dist[i] === -1 || !walkable(s, i % s.width, Math.floor(i / s.width))) continue;
    if (best[i]! > far && cheb({ x: i % s.width, y: Math.floor(i / s.width) }, home) <= 14) {
      far = best[i]!;
      pick = { x: i % s.width, y: Math.floor(i / s.width) };
    }
  }
  return pick ?? { x: s.players[0]!.x, y: s.players[0]!.y };
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
    for (let P = 120; P <= Math.min(1200, n - 100); P += 2) {
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
    if (best !== null) {
      let bestScore = -1;
      for (let P = best - 24; P <= best + 24; P++) {
        if (P < 100 || P > n - 60) continue;
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
    }
    this.cachedPeriod = best;
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
/** How far he assumes an enemy notices a person (tiles), how far it notices a generator, and the glimpses he accepts (samples of 4 ticks). */
const NOTICE_RANGE = 8;
const GENERATOR_RANGE = 4;
/** A generator it first sees fewer ticks than this before it goes off is seen too late to be walked away from. */
const SEEN_TOO_LATE = 60;
/** He aims to be standing at the generator tile this long before he means to lay (latency, an overshoot, a step back). */
const ARRIVE_EARLY = 70;
/** The view time (ticks of sight, as it builds up and drains) he will not risk: noticing takes 20 on Normal. */
const NOTICE_METER = 14;
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
    if (Math.abs((t % s.width) - x) + Math.abs(Math.floor(t / s.width) - y) <= HEARING_MARGIN) return true;
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
    if (d < 0 || d > 18) continue;
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
        if (plan) best.push({ plan, score: plan.width * 2 - plan.walkTicks * 0.3 - (centre - now) * 0.01 });
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
  const start = s.tick;
  const watchStart = s.tick;
  while (s.match.phase !== 'ended' && s.tick - start < 60 * 120) {
    const t = s.tick;
    const v = targetView(c);
    if (v && phase !== 'done') learned.record(t, v);
    if (v) {
      recent.push({ x: v.x, y: v.y, f: v.facing });
      if (recent.length > 60) recent.shift();
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
        'lay at',
        plan.tLay + shift + eps,
        'settled',
        c.pilot.settled(),
      );
    let want: Intent = {};
    // never stand in a blast (a visible footprint) or a flame
    const out = phase === 'watch' || phase === 'wait' ? dangerMove(c, 0) : null;
    if (out) want = { move: out };
    else if (phase === 'watch') {
      const P = learned.period();
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
      const w = walkFrom(s, me.x, me.y);
      const p = pathOf(w, plan!.g);
      if (!p || p.length === 0) phase = 'lay';
      else if (p.length > 1 || c.pilot.settled()) want = { move: dirTo(s, me, p[0]!) }; // lets go a tile early: his press reaches the game late
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
      const w = walkFrom(s, me.x, me.y);
      // away from the target, towards the stage
      const p = pathOf(w, idx(s, stage.x, stage.y));
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
      phase = 'flee';
      fleeUntil = s.tick + 60 * 6;
      c.pilot.flush();
      log(c, 'noticed: flee');
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
    else r = { killed: false, laid: false, noticed: false, selfHit: false, why: 'todo' };
    attempts.push(r);
    if (r.killed || sc.s.match.phase === 'ended') break;
    // disengage and settle: back to the stage, let the enemy return to its route
    for (let i = 0; i < model.settleSec * 60; i++) {
      const me = sc.s.players[0]!;
      let want: Intent = {};
      const w = walkFrom(sc.s, me.x, me.y);
      const p = pathOf(w, idx(sc.s, stage.x, stage.y));
      if (p && p.length > 0) want = { move: dirTo(sc.s, me, p[0]!) };
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
