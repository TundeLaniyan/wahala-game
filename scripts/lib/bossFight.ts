/**
 * Boss-fight harness (docs/CAMPAIGN_SECTOR_AI.md "Bosses", decisions BX1-): a scripted human with ORDINARY intents only
 * (walk, A = lay a generator, B = punch) plays a whole campaign boss mission against the REAL boss and crew bots
 * (`createBot`, the levels `buildMissionGame` gives them, the campaign tactics layer of the chosen level). Real
 * simulation, real board (crates included: the human blasts a crate that stands on its way), stage hazards on, no
 * rendering, no clock, no Math.random. Used by `tests/mission-bosses.test.ts` and `npm run boss-audit`.
 *
 * Strategies:
 *   generator  breaks every objective node the way the district asks (a blast where a blast breaks it, standing where
 *              standing works), blasts crew in its way, then waits beside the exposed boss's anchor and lays a generator
 *              when he is committed there; it jabs an adjacent CREW member (melee as support) but never punches the boss;
 *   punch      never lays a generator (a pure melee player; a crate on its way is walked round): it stands on the nodes
 *              and punches every rival that comes next to it, the exposed boss first.
 *
 * `legacy: true` plays the verbs of the boss missions BEFORE decisions BX1- (stand to jam / hold / throw / collect /
 * switch); it is how the "before" column of the audit was measured on the earlier commit.
 */
import { createBot } from '../../src/ai';
import type { Bot } from '../../src/ai';
import {
  buildMissionGame,
  createGame,
  isLethalStageEvent,
  missionView,
  observe,
  previewBlast,
  tick,
} from '../../src/sim';
import type {
  CampaignLevel,
  Dir,
  GameState,
  Intent,
  Intents,
  MissionId,
  MissionModifierId,
  MissionNodeView,
  MissionView,
  SimEvent,
} from '../../src/sim';
import { Tile } from '../../src/sim/types';

export type BossStrategy = 'generator' | 'punch';

export interface BossRunOptions {
  id: MissionId;
  level: CampaignLevel;
  strategy: BossStrategy;
  seed: number;
  /** Stop after this many seconds of play (default: the mission's own clock decides). */
  maxSec?: number;
  modifiers?: MissionModifierId[];
  /** Play the pre-BX verbs (stand on relays, junctions, switches, ledgers). */
  legacy?: boolean;
  /** Human lives (default: the campaign's 3). */
  lives?: number;
}

export interface BossRunResult {
  id: MissionId;
  level: CampaignLevel;
  strategy: BossStrategy;
  seed: number;
  /** The mission's outcome, or 'unfinished' when `maxSec` stopped the run first. */
  result: 'won' | 'lost' | 'timeout' | 'unfinished';
  seconds: number;
  livesUsed: number;
  phasesCleared: number;
  /** Exposure windows opened, and blast hits the boss took (BX: one per window broken). */
  exposures: number;
  bossHits: number;
  /** Seconds the boss spent exposed in all. */
  exposedSec: number;
  /** Generators the human laid, punches it threw. */
  placed: number;
  punches: number;
}

const DIRS: [Dir, number, number][] = [
  ['up', 0, -1],
  ['right', 1, 0],
  ['down', 0, 1],
  ['left', -1, 0],
];

/** A telegraphed strike or train is only avoided once it is this close (a player crosses a warned lane early). */
export const WARNING_RESPECT_TICKS = 80;

/**
 * Tiles to stay off right now: telegraphed strikes and trains about to land, burning tiles, running lethal stage
 * lanes, every live generator's footprint.
 */
export function bossDangerTiles(state: GameState, view: MissionView | null): Set<number> {
  const out = new Set<number>();
  for (const w of view?.warnings ?? [])
    if (w.kind !== 'reinforce' && w.remainingTicks <= WARNING_RESPECT_TICKS)
      for (const t of w.tiles) out.add(t);
  for (const f of state.flames) out.add(f.y * state.width + f.x);
  // potholes and oil on the floor (public): they daze or slide whoever walks in (a carried ledger is dropped)
  for (const key of Object.keys(state.floorHazards)) out.add(Number(key));
  for (const e of state.stage.events) {
    if (!isLethalStageEvent(e) || e.endTick <= state.tick || e.startTick - state.tick > WARNING_RESPECT_TICKS)
      continue;
    // a sweep (traffic, a railcar) is dangerous around its front and ahead of it, not behind it
    const front = e.kind === 'sweep' ? Math.max(0, e.index) : 0;
    const tiles = e.kind === 'sweep' ? e.tiles.slice(Math.max(0, front - 2), front + 16) : e.tiles;
    for (const t of tiles) out.add(t);
  }
  for (const g of state.generators) {
    if (g.carriedBy !== null || g.flight !== null) continue;
    for (const t of previewBlast(state, g)) out.add(t);
  }
  return out;
}

/** Breadth-first first step from (sx, sy) to a tile `goal` accepts; crates are walls unless `throughSoft`. */
export function route(
  state: GameState,
  sx: number,
  sy: number,
  goal: (x: number, y: number) => boolean,
  avoid: ReadonlySet<number>,
  throughSoft = false,
  limit = 4000,
): { dir: Dir; next: number; dist: number } | null {
  const w = state.width;
  const start = sy * w + sx;
  const prev = new Map<number, number>([[start, -1]]);
  const dist = new Map<number, number>([[start, 0]]);
  const queue = [start];
  const gens = new Set(state.generators.map((g) => g.y * w + g.x));
  for (let q = 0; q < queue.length && q < limit; q++) {
    const t = queue[q]!;
    const x = t % w;
    const y = Math.floor(t / w);
    if (t !== start && goal(x, y)) {
      let cur = t;
      while (prev.get(cur) !== start) cur = prev.get(cur)!;
      const dx = (cur % w) - sx;
      const dy = Math.floor(cur / w) - sy;
      return { dir: DIRS.find(([, a, b]) => a === dx && b === dy)![0], next: cur, dist: dist.get(t)! };
    }
    for (const [, dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= state.height) continue;
      const i = ny * w + nx;
      if (prev.has(i) || avoid.has(i) || gens.has(i)) continue;
      const tile = state.tiles[i];
      if (tile !== Tile.Empty && !(throughSoft && tile === Tile.Soft)) continue;
      prev.set(i, t);
      dist.set(i, dist.get(t)! + 1);
      queue.push(i);
    }
  }
  return null;
}

const genAt = (state: GameState, x: number, y: number): boolean =>
  state.generators.some((g) => g.x === x && g.y === y);

/** Chebyshev distance. */
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Is there a tile 3+ tiles (Chebyshev) from (x, y), off danger, reachable in at most `steps` steps (not via (x, y))? */
function canFlee(state: GameState, x: number, y: number, danger: ReadonlySet<number>, steps = 12): boolean {
  const avoid = new Set(danger);
  avoid.delete(y * state.width + x);
  const r = route(
    state,
    x,
    y,
    (tx, ty) => cheb({ x: tx, y: ty }, { x, y }) >= 3 && !danger.has(ty * state.width + tx),
    new Set<number>(),
    false,
    600,
  );
  return r !== null && r.dist <= steps;
}

/** Is `b` within `reach` tiles of `a` along a row or column with open floor between (a blast's line)? */
function inLine(
  state: GameState,
  a: { x: number; y: number },
  b: { x: number; y: number },
  reach: number,
): boolean {
  if (a.x !== b.x && a.y !== b.y) return false;
  const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  if (d > reach) return false;
  const sx = Math.sign(b.x - a.x);
  const sy = Math.sign(b.y - a.y);
  for (let k = 1; k < d; k++)
    if (state.tiles[(a.y + sy * k) * state.width + a.x + sx * k] !== Tile.Empty) return false;
  return true;
}

/** How a node is completed under the verbs in play. */
type Verb = 'blast' | 'stand' | 'wait';

function verbFor(view: MissionView, node: MissionNodeView, legacy: boolean): Verb {
  const o = view.objective;
  if (node.state === 'done') return 'blast'; // a runner restocking a broken node
  if (o === 'supplyRoutes') return 'blast';
  if (legacy) return 'stand';
  if (o === 'evidenceRun') return node.state === 'locked' ? 'blast' : 'stand';
  if (o === 'dispatchWindows') return node.state === 'live' ? 'blast' : 'wait';
  return 'blast';
}

/** Living rivals (boss and crew) within `r` tiles (Chebyshev) of (x, y). */
function rivalsNear(state: GameState, x: number, y: number, r: number): number {
  return state.players.filter((p) => p.alive && p.id !== 0 && cheb(p, { x, y }) <= r).length;
}

/**
 * The node the human should work on now (or the press when carrying a ledger): the nearest, with a penalty for every
 * rival camped near it and for a node it has been failing at (it tries another one for a while).
 */
function targetNode(
  state: GameState,
  view: MissionView,
  legacy: boolean,
  skip: ReadonlyMap<string, number>,
): MissionNodeView | null {
  const me = state.players[0]!;
  const press = view.nodes.find((n) => n.id === 'press');
  if (view.objective === 'evidenceRun' && press && press.state !== 'idle') return press; // carrying
  // a crew member standing on a broken relay / stack is restoring it: blast it there
  const restocking = view.nodes.filter(
    (n) =>
      n.state === 'done' &&
      n.id !== 'press' &&
      state.players.some(
        (p) => p.alive && p.id !== 0 && p.id !== view.boss.playerId && p.x === n.x && p.y === n.y,
      ),
  );
  let nodes = view.nodes.filter((n) => n.state !== 'done' && n.id !== 'press');
  if (
    restocking.length > 0 &&
    !legacy &&
    (view.objective === 'dispatchRelays' || view.objective === 'supplyRoutes')
  )
    nodes = [...restocking, ...nodes];
  if (view.objective === 'contingencyGrid') nodes = nodes.filter((n) => n.state === 'live');
  if (view.objective === 'dispatchWindows' && !legacy) {
    const live = nodes.filter((n) => n.state === 'live');
    if (live.length > 0) nodes = live;
  }
  const open = nodes.filter((n) => (skip.get(n.id) ?? -1) < state.tick);
  if (open.length > 0) nodes = open;
  let best: MissionNodeView | null = null;
  let bestD = Infinity;
  for (const n of nodes) {
    // an evidence run weighs the carry too: the cabinet nearest the press counts double its walk
    const carry = press ? Math.abs(n.x - press.x) + Math.abs(n.y - press.y) : 0;
    const d = Math.abs(n.x - me.x) + Math.abs(n.y - me.y) + carry + 10 * rivalsNear(state, n.x, n.y, 3);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

export class BossAgent {
  placed = 0;
  punches = 0;
  private stuck = 0;
  private lastPos = -1;
  /** The node being worked on, since when, and nodes given up on until a tick. */
  private current: string | null = null;
  private since = 0;
  private readonly skip = new Map<string, number>();
  private lastCrewTry = -1e9;

  constructor(
    private readonly strategy: BossStrategy,
    private readonly legacy = false,
  ) {}

  decide(state: GameState): Intent {
    const me = state.players[0]!;
    if (!me.alive) return {};
    const view = missionView(state);
    if (!view || view.outcome) return {};
    const w = state.width;
    const here = me.y * w + me.x;
    this.stuck = here === this.lastPos ? this.stuck + 1 : 0;
    this.lastPos = here;
    const danger = bossDangerTiles(state, view);
    const mine = state.generators.some((g) => g.ownerId === 0);

    // 1. never stand in danger
    if (danger.has(here)) {
      const out = route(state, me.x, me.y, (x, y) => !danger.has(y * w + x), new Set<number>());
      return out ? { move: out.dir } : {};
    }
    // 2. punch: the punch strategy hits every adjacent rival; the generator strategy jabs an adjacent crew member (a
    //    stagger stops it dazing the human), never the boss - its hits on him are blasts only
    {
      const adjacent = state.players.some(
        (p) =>
          p.alive &&
          p.id !== 0 &&
          (this.strategy === 'punch' || p.id !== view.boss.playerId) &&
          Math.abs(p.x - me.x) + Math.abs(p.y - me.y) === 1,
      );
      if (adjacent && state.tick >= me.skillReadyTick && me.attack === null) {
        this.punches++;
        return { special: true };
      }
    }
    // 3. our generators: a second one only when the loadout allows it (`canPlace`); otherwise carry on with the plan
    const me2 = me;
    const canPlace = !mine || state.generators.filter((g) => g.ownerId === 0).length < me2.capacity;
    if (!canPlace && view.phaseState !== 'exposed') return {};

    if (view.phaseState === 'exposed') return this.hunt(state, view, danger);

    // a crew member in blast reach: a generator player takes it out (the crew are one-hit generator bots); at most one
    // try every 5 s, and never while standing on a node it is working
    const working = view.nodes.some((n) => n.x === me.x && n.y === me.y && n.state !== 'done');
    const carrying = view.nodes.some((n) => n.id === 'press' && n.state !== 'idle');
    if (this.strategy === 'generator' && !working && state.tick - this.lastCrewTry > (carrying ? 90 : 300)) {
      const foe = state.players.find(
        (p) => p.alive && p.id !== 0 && p.id !== view.boss.playerId && inLine(state, me, p, 2),
      );
      if (foe && canPlace && canFlee(state, me.x, me.y, danger)) {
        this.placed++;
        this.lastCrewTry = state.tick;
        return { place: true };
      }
    }

    const node = targetNode(state, view, this.legacy, this.skip);
    if (!node) return {};
    if (node.id !== this.current) {
      this.current = node.id;
      this.since = state.tick;
    } else if (state.tick - this.since > 900 && node.id !== 'press') {
      this.skip.set(node.id, state.tick + 900); // 15 s without finishing it: try another one for 15 s
      this.current = null;
    }
    const verb =
      this.strategy === 'punch' && verbFor(view, node, this.legacy) === 'blast'
        ? 'stand'
        : verbFor(view, node, this.legacy);
    const onIt = me.x === node.x && me.y === node.y;
    if (onIt) {
      if (verb === 'blast' && canPlace && !genAt(state, me.x, me.y) && canFlee(state, me.x, me.y, danger)) {
        this.placed++;
        return { place: true };
      }
      return {};
    }
    return this.walkTo(state, (x, y) => x === node.x && y === node.y, danger);
  }

  /** Walks towards the goal; a crate in the way is blasted (the generator strategy) or walked round (punch). */
  private walkTo(
    state: GameState,
    goal: (x: number, y: number) => boolean,
    danger: ReadonlySet<number>,
  ): Intent {
    const me = state.players[0]!;
    const step = route(state, me.x, me.y, goal, danger);
    if (step) return { move: step.dir };
    const rough = route(state, me.x, me.y, goal, danger, true);
    if (!rough) return {};
    if (state.tiles[rough.next] === Tile.Soft) {
      if (this.strategy === 'generator' && canFlee(state, me.x, me.y, danger)) {
        this.placed++;
        return { place: true };
      }
      return {};
    }
    return { move: rough.dir };
  }

  /** The boss is exposed: blast him (generator) or punch him (punch). */
  private hunt(state: GameState, view: MissionView, danger: ReadonlySet<number>): Intent {
    const me = state.players[0]!;
    const boss = state.players[view.boss.playerId]!;
    if (!boss.alive) return {};
    if (this.strategy === 'punch') {
      return this.walkTo(state, (x, y) => Math.abs(x - boss.x) + Math.abs(y - boss.y) === 1, danger);
    }
    // the boss walks to his anchor and is committed there: wait for him beside it (in blast reach of the anchor) and
    // lay the generator once he is restoring; with no anchor (legacy) chase him
    const anchor = view.boss.anchor ?? null;
    const spot = anchor ?? boss;
    const inReach = (x: number, y: number): boolean =>
      inLine(state, { x, y }, spot, 2) && !(x === spot.x && y === spot.y);
    const ready = anchor === null || view.boss.restoring === true;
    if (
      ready &&
      inLine(state, me, boss, 2) &&
      !genAt(state, me.x, me.y) &&
      canFlee(state, me.x, me.y, danger)
    ) {
      this.placed++;
      return { place: true };
    }
    if (ready) return this.walkTo(state, (x, y) => inLine(state, { x, y }, boss, 2), danger);
    if (inReach(me.x, me.y)) return {};
    return this.walkTo(state, inReach, danger);
  }

  /** Ticks without moving (diagnostics). */
  get stuckTicks(): number {
    return this.stuck;
  }
}

/** Plays one boss mission to its end (or `maxSec`) and reports what happened. */
export function runBossFight(o: BossRunOptions): BossRunResult {
  const options = buildMissionGame({
    spec: { id: o.id, modifiers: o.modifiers ?? [], lives: o.lives ?? 3 },
    humanCharacter: 'streetBaller',
    seed: o.seed,
    level: o.level,
  });
  const state = createGame(options);
  const bots: Record<number, Bot> = {};
  options.players.forEach((p, i) => {
    if (p.isBot)
      bots[i] = createBot({ difficulty: p.difficulty ?? 'rookie', seed: o.seed * 7919 + i, playerId: i });
  });
  const agent = new BossAgent(o.strategy, o.legacy);
  const maxTicks = (o.maxSec ?? 100000) * 60;
  let exposures = 0;
  let bossHits = 0;
  let exposedTicks = 0;
  for (let i = 0; i < maxTicks && state.match.phase !== 'ended'; i++) {
    const intents: Intents = {};
    for (const [id, bot] of Object.entries(bots)) {
      const n = Number(id);
      if (state.players[n]!.alive) intents[n] = bot.decide(observe(state, n));
    }
    if (state.match.phase === 'playing') intents[0] = agent.decide(state);
    const events: SimEvent[] = tick(state, intents);
    for (const e of events) {
      const type = (e as { type: string }).type;
      if (type === 'bossExposed') exposures++;
      if (type === 'bossHit') bossHits++;
    }
    if (state.mission?.phaseState === 'exposed') exposedTicks++;
  }
  const m = state.mission!;
  if (m.boss.defeated) bossHits++; // the finishing blast
  return {
    id: o.id,
    level: o.level,
    strategy: o.strategy,
    seed: o.seed,
    result: m.outcome?.result ?? 'unfinished',
    seconds: Math.round(state.match.playTicks / 60),
    livesUsed: m.livesUsed,
    phasesCleared: m.phasesCleared,
    exposures,
    bossHits,
    exposedSec: Math.round(exposedTicks / 60),
    placed: agent.placed,
    punches: agent.punches,
  };
}
