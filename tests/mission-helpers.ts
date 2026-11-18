import { buildMissionGame, createGame, missionView, tick } from '../src/sim';
import type { Dir, GameState, Intents, MissionSpec, SimEvent } from '../src/sim';
import { Tile } from '../src/sim/types';
import { isLethalStageEvent } from '../src/sim';
import { createBot } from '../src/ai';
import type { Bot } from '../src/ai';
import { observe } from '../src/sim';
import { makeCtx } from '../src/sim/mission/ctx';
import type { MissionCtx } from '../src/sim/mission/ctx';
import { OBJECTIVES } from '../src/sim/mission/objectives';
import { BossAgent } from '../scripts/lib/bossFight';
import { addGenerator } from './helpers';

/** FNV-1a over the JSON of any value (a state hash for determinism checks). */
export function hashOf(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}:${text.length}`;
}

/** The mission context of a state (for calling strikes / objectives directly). */
export function ctxOf(state: GameState, events: SimEvent[] = []): MissionCtx {
  return makeCtx(state, events);
}

/** Jumps a fresh mission to phase `n` (0-2) the way a cleared phase does: new nodes, timers from now. */
export function jumpToPhase(state: GameState, n: 0 | 1 | 2): void {
  const m = state.mission!;
  m.phase = n;
  m.phaseStartTick = state.tick;
  OBJECTIVES[m.objective].setup(makeCtx(state, []));
}

/** Every number in a value is a number (Infinity is allowed: it marks "never"); no NaN anywhere. */
export function hasNaN(value: unknown): boolean {
  if (typeof value === 'number') return Number.isNaN(value);
  if (Array.isArray(value)) return value.some(hasNaN);
  if (value !== null && typeof value === 'object')
    return Object.values(value as Record<string, unknown>).some(hasNaN);
  return false;
}

export interface MissionRig {
  state: GameState;
  events: SimEvent[];
}

export interface NewMissionOptions {
  seed?: number;
  /** Arena stage hazards (traffic, trains ...). Off by default: scenarios stay controlled. */
  stage?: boolean;
  /** Keep the random crates (default: cleared so a scripted walker is never boxed in). */
  keepSoft?: boolean;
  /** Skip the countdown. */
  playing?: boolean;
}

/** A mission match ready to play: the real arena, the real seats; crates cleared and stage off unless asked. */
export function newMission(spec: MissionSpec, o: NewMissionOptions = {}): GameState {
  const options = buildMissionGame({ spec, humanCharacter: 'streetBaller', seed: o.seed ?? 3 });
  options.settings = { ...options.settings, stageHazards: o.stage ?? false };
  const state = createGame(options);
  if (!o.keepSoft) {
    state.tiles = state.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
    state.hidden = {};
  }
  if (o.playing ?? true) {
    state.match.phase = 'playing';
    state.match.countdownRemaining = 0;
  }
  return state;
}

export function put(state: GameState, id: number, x: number, y: number): void {
  const p = state.players[id]!;
  p.x = p.stepFromX = x;
  p.y = p.stepFromY = y;
  p.stepRemaining = 0;
}

/** Runs `n` ticks with the same intents each tick (or from a function of the tick index). */
export function advance(
  state: GameState,
  n: number,
  intents: Intents | ((i: number) => Intents) = {},
  sink: SimEvent[] = [],
): SimEvent[] {
  for (let i = 0; i < n; i++) {
    sink.push(...tick(state, typeof intents === 'function' ? intents(i) : intents));
    if (state.match.phase === 'ended') break;
  }
  return sink;
}

/** Puts the human on (x, y) and holds them there for `n` ticks (no intents). */
export function standOn(
  state: GameState,
  x: number,
  y: number,
  n: number,
  sink: SimEvent[] = [],
): SimEvent[] {
  put(state, 0, x, y);
  return advance(state, n, {}, sink);
}

export const of = <T extends SimEvent['type']>(
  events: SimEvent[],
  type: T,
): Extract<SimEvent, { type: T }>[] =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

export function makeBots(
  state: GameState,
  levels: 'standard' | 'rookie' = 'standard',
  seed = 11,
): Record<number, Bot> {
  const bots: Record<number, Bot> = {};
  state.players.forEach((p) => {
    if (p.isBot) bots[p.id] = createBot({ difficulty: levels, seed: seed * 31 + p.id, playerId: p.id });
  });
  return bots;
}

/** One tick of every bot's decision (players the human controls are skipped). */
export function botIntents(state: GameState, bots: Record<number, Bot>): Intents {
  const intents: Intents = {};
  for (const [id, bot] of Object.entries(bots)) {
    const n = Number(id);
    if (state.players[n]!.alive) intents[n] = bot.decide(observe(state, n));
  }
  return intents;
}

// ------------------------------------------------------------------ a scripted human

const DIRS: [Dir, number, number][] = [
  ['up', 0, -1],
  ['right', 1, 0],
  ['down', 0, 1],
  ['left', -1, 0],
];

/** First step of a shortest walk from (sx, sy) to any tile accepted by `goal`, over floor not in `avoid`. */
export function firstStep(
  state: GameState,
  sx: number,
  sy: number,
  goal: (x: number, y: number) => boolean,
  avoid: ReadonlySet<number>,
): Dir | null {
  const w = state.width;
  const prev = new Map<number, number>();
  const start = sy * w + sx;
  prev.set(start, -1);
  const queue = [start];
  for (let q = 0; q < queue.length; q++) {
    const t = queue[q]!;
    const x = t % w;
    const y = Math.floor(t / w);
    if (t !== start && goal(x, y)) {
      let cur = t;
      while (prev.get(cur) !== start) cur = prev.get(cur)!;
      const dx = (cur % w) - sx;
      const dy = Math.floor(cur / w) - sy;
      return DIRS.find(([, ddx, ddy]) => ddx === dx && ddy === dy)![0];
    }
    for (const [, dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= state.height) continue;
      const i = ny * w + nx;
      if (prev.has(i) || state.tiles[i] !== Tile.Empty || avoid.has(i)) continue;
      if (state.generators.some((g) => g.x === nx && g.y === ny)) continue;
      prev.set(i, t);
      queue.push(i);
    }
  }
  return null;
}

/** Tiles a careful player stays off: every telegraphed mission strike, every burning tile, lethal stage lanes. */
export function dangerTiles(state: GameState): Set<number> {
  const out = new Set<number>();
  const v = missionView(state);
  for (const wv of v?.warnings ?? []) if (wv.kind !== 'reinforce') for (const t of wv.tiles) out.add(t);
  for (const f of state.flames) out.add(f.y * state.width + f.x);
  // telegraphed and running lethal stage hazards (traffic lanes ...): a careful player reads the warning
  for (const e of state.stage.events)
    if (isLethalStageEvent(e) && e.endTick > state.tick) for (const t of e.tiles) out.add(t);
  for (const g of state.generators) {
    // a live generator: its own cross and disc is not worth modelling, stay a few tiles away
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) out.add((g.y + dy) * state.width + g.x + dx);
  }
  return out;
}

/**
 * A scripted human for the boss missions: the generator-first player of `scripts/lib/bossFight.ts` (decisions BX1-BX8).
 * It breaks every objective node with blasts, waits beside the boss's anchor once he is exposed and lays a generator
 * when he is restoring; ordinary intents only.
 */
export class ScriptedHuman extends BossAgent {
  constructor() {
    super('generator');
  }
}

/**
 * A blast of the human's (a generator with a one-tick fuse) on (x, y), the human standing well away at (hx, hy) while it
 * burns out. Returns the events.
 */
export function blastAt(
  state: GameState,
  x: number,
  y: number,
  away: { x: number; y: number },
  sink: SimEvent[] = [],
  ownerId = 0,
): SimEvent[] {
  put(state, 0, away.x, away.y);
  addGenerator(state, { ownerId, x, y, timer: 1 });
  return advance(state, 45, {}, sink);
}

/** Breaks the exposed boss's guard with a blast on his tile (the human well away): the next phase starts (BX2). */
export function hitBoss(state: GameState, away: { x: number; y: number }, sink: SimEvent[] = []): SimEvent[] {
  const boss = state.players[state.mission!.bossId]!;
  return blastAt(state, boss.x, boss.y, away, sink);
}
