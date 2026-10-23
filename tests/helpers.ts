import { createGame, tick } from '../src/sim';
import type {
  CharacterId,
  DeepPartial,
  GameConfig,
  GameState,
  Generator,
  Intents,
  PickupKind,
  SimEvent,
} from '../src/sim';
import { Tile } from '../src/sim/types';

export interface SandboxOptions {
  characters?: CharacterId[];
  players?: number;
  seed?: number;
  config?: DeepPartial<GameConfig>;
  /** Keep the random soft-block layout instead of clearing it. */
  keepSoft?: boolean;
  arenaId?: string;
  /** Keep the arena's stage hazards (floor traps, traffic ...). Off by default: scenarios stay controlled. */
  stage?: boolean;
}

/**
 * A playing-phase match on the real Danfo Bus Park, with all soft blocks removed so that
 * scenarios are fully controlled. Players start in their normal spawn corners.
 */
export function sandbox(opts: SandboxOptions = {}): GameState {
  const characters =
    opts.characters ?? Array.from({ length: opts.players ?? 2 }, () => 'streetBaller' as CharacterId);
  const state = createGame({
    seed: opts.seed ?? 1,
    arenaId: opts.arenaId,
    players: characters.map((characterId, i) => ({ name: `P${i}`, characterId, isBot: false })),
    config: opts.config,
    settings: { stageHazards: opts.stage ?? false },
  });
  if (!opts.keepSoft) {
    state.tiles = state.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
    state.hidden = {};
  }
  state.match.phase = 'playing';
  state.match.countdownRemaining = 0;
  return state;
}

export function put(state: GameState, id: number, x: number, y: number): void {
  const p = state.players[id]!;
  p.x = p.stepFromX = x;
  p.y = p.stepFromY = y;
  p.stepRemaining = 0;
}

export function addSoft(state: GameState, x: number, y: number, hidden?: GameState['hidden'][number]): void {
  const i = y * state.width + x;
  state.tiles[i] = Tile.Soft;
  if (hidden) state.hidden[i] = hidden;
}

export function addGenerator(
  state: GameState,
  g: Partial<Generator> & { ownerId: number; x: number; y: number },
): Generator {
  const gen: Generator = {
    id: state.nextId++,
    stepFromX: g.x,
    stepFromY: g.y,
    range: 2,
    pierce: false,
    mode: 'timed',
    timer: state.config.generator.fuseTicks,
    carriedBy: null,
    carryBonusUsed: false,
    slide: null,
    flight: null,
    triggered: false,
    placedTick: state.tick,
    ...g,
  };
  state.generators.push(gen);
  return gen;
}

/** Runs `n` ticks, optionally with intents from a per-tick function. Returns all events produced. */
export function run(
  state: GameState,
  n: number,
  intents: Intents | ((t: number) => Partial<Intents>) = {},
): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    all.push(...tick(state, (typeof intents === 'function' ? intents(i) : intents) as Intents));
  }
  return all;
}

export function runUntil(
  state: GameState,
  done: (events: SimEvent[]) => boolean,
  max = 2000,
  intents: Intents = {},
): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < max; i++) {
    const ev = tick(state, intents);
    all.push(...ev);
    if (done(ev)) return all;
  }
  throw new Error(`condition not met within ${max} ticks`);
}

export function addPickup(state: GameState, x: number, y: number, kind: PickupKind): void {
  state.pickups.push({ id: state.nextId++, x, y, kind, safeEventId: null });
}

export const eventsOf = <T extends SimEvent['type']>(
  events: SimEvent[],
  type: T,
): Extract<SimEvent, { type: T }>[] =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

export const flameKeys = (state: GameState): string[] =>
  [...new Set(state.flames.map((f) => `${f.x},${f.y}`))].sort();

export const keys = (...pairs: [number, number][]): string[] => pairs.map(([x, y]) => `${x},${y}`).sort();
