/**
 * Scenario building blocks: a real `createGame` match, then programmatic setup (clear the crates,
 * place people, crates, pickups and generators). Only plain state writes that a match could reach
 * by itself; no rule is changed.
 */
import { createGame, ticks } from '../sim';
import type {
  CharacterId,
  DeepPartial,
  Dir,
  GameConfig,
  GameState,
  Generator,
  PickupKind,
  Player,
} from '../sim';
import { Tile } from '../sim';

export interface Actor {
  name: string;
  characterId: CharacterId;
  /** Where the actor stands (default: the arena spawn of its slot). */
  at?: [number, number];
  facing?: Dir;
}

export interface ScenarioOptions {
  arenaId?: string;
  actors: Actor[];
  seed?: number;
  config?: DeepPartial<GameConfig>;
  /** The arena's own stage hazards (off unless the chapter is about them). */
  stage?: boolean;
  /** Keep the random crate layout (default: an empty arena the chapter fills itself). */
  keepCrates?: boolean;
}

/** Practices get a long clock so nobody runs out of time while learning (the endgame chapter uses the real one). */
export const PRACTICE_CONFIG: DeepPartial<GameConfig> = { match: { durationTicks: ticks(300) } };

/** A running (post-countdown) match prepared for a lesson. Player 0 is the demo hero / the human. */
export function scenario(opts: ScenarioOptions): GameState {
  const state = createGame({
    seed: opts.seed ?? 11,
    arenaId: opts.arenaId ?? 'danfoBusPark',
    players: opts.actors.map((a, i) => ({ name: a.name, characterId: a.characterId, isBot: i !== 0 })),
    settings: { stageHazards: opts.stage ?? false },
    config: opts.config,
  });
  if (!opts.keepCrates) {
    state.tiles = state.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
    state.hidden = {};
  }
  opts.actors.forEach((a, i) => {
    if (a.at) put(state, i, a.at[0], a.at[1], a.facing);
    else if (a.facing) state.players[i]!.facing = a.facing;
  });
  state.match.phase = 'playing';
  state.match.countdownRemaining = 0;
  return state;
}

export function put(state: GameState, id: number, x: number, y: number, facing?: Dir): void {
  const p = state.players[id]!;
  p.x = p.stepFromX = x;
  p.y = p.stepFromY = y;
  p.stepRemaining = 0;
  if (facing) p.facing = facing;
}

/** Grants upgrades as if the pickups had been collected. */
export function grant(state: GameState, id: number, patch: Partial<Player>): void {
  Object.assign(state.players[id]!, patch);
}

export function crate(state: GameState, x: number, y: number, hidden?: PickupKind): void {
  const i = y * state.width + x;
  if (state.tiles[i] === Tile.Hard) throw new Error(`crate on concrete at ${x},${y}`);
  state.tiles[i] = Tile.Soft;
  if (hidden) state.hidden[i] = hidden;
  else delete state.hidden[i];
}

export function pickup(state: GameState, x: number, y: number, kind: PickupKind): void {
  if (state.tiles[y * state.width + x] !== Tile.Empty) throw new Error(`pickup off the floor at ${x},${y}`);
  state.pickups.push({ id: state.nextId++, x, y, kind, safeEventId: null });
}

/** A generator already on the floor (e.g. a rival's remote generator). */
export function generator(
  state: GameState,
  g: Partial<Generator> & { ownerId: number; x: number; y: number },
): Generator {
  const cfg = state.config.generator;
  const mode = g.mode ?? 'timed';
  const gen: Generator = {
    id: state.nextId++,
    stepFromX: g.x,
    stepFromY: g.y,
    range: state.players[g.ownerId]?.range ?? cfg.baseRange,
    square: 0,
    fromSpectator: false,
    pierce: false,
    mode,
    timer: mode === 'remote' ? cfg.remoteFailsafeTicks : cfg.fuseTicks,
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

/** Seconds on the match clock -> the play tick at which that much time is left. */
export function playTickAtRemaining(state: GameState, seconds: number): number {
  return Math.max(0, state.config.match.durationTicks - ticks(seconds));
}
