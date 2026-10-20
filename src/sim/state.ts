import { DEFAULT_CONFIG, mergeConfig } from './config';
import type { GameConfig } from './config';
import { CHARACTERS } from './data/characters';
import { DEFAULT_ARENA_ID, getArena } from './arenas';
import type { ArenaDef } from './arenas';
import { tileIndex } from './grid';
import { nextFloat, seedToState, weightedPick } from './rng';
import { Tile } from './types';
import type { GameOptions, GameState, MatchSettings, PickupKind, Player, PlayerSetup } from './types';

export const DEFAULT_SETTINGS: MatchSettings = { mode: 'classic', crowdThrows: false, floorHazards: false };

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 4;

export function createPlayer(id: number, setup: PlayerSetup, arena: ArenaDef, config: GameConfig): Player {
  const spawn = arena.spawns[id]!;
  const facing = spawn.x < arena.layout[0]!.length / 2 ? 'right' : 'left';
  return {
    id,
    slot: id,
    name: setup.name,
    characterId: setup.characterId in CHARACTERS ? setup.characterId : 'streetBaller',
    isBot: setup.isBot,
    x: spawn.x,
    y: spawn.y,
    facing,
    stepFromX: spawn.x,
    stepFromY: spawn.y,
    stepRemaining: 0,
    stepTotal: config.movement.stepTicksBySpeedLevel[0]!,
    alive: true,
    eliminatedTick: null,
    elimination: null,
    range: config.generator.baseRange,
    capacity: config.generator.baseCapacity,
    speedLevel: 0,
    kick: false,
    punch: false,
    grip: false,
    remote: false,
    killSwitchCharges: 0,
    sneakers: false,
    hotFuel: false,
    mounted: false,
    jumpReadyTick: 0,
    hasVoucher: false,
    carrying: null,
    dazedUntil: 0,
    dazeImmuneUntil: 0,
    skillReadyTick: 0,
    curse: null,
    entryUntil: null,
    immune: [],
  };
}

/** Builds a fresh match. Same options + seed always produce an identical state. */
export function createGame(options: GameOptions): GameState {
  if (options.players.length < MIN_PLAYERS || options.players.length > MAX_PLAYERS) {
    throw new Error(`WAHALA! supports ${MIN_PLAYERS}-${MAX_PLAYERS} competitors`);
  }
  const arena = getArena(options.arenaId ?? DEFAULT_ARENA_ID);
  const config = mergeConfig(DEFAULT_CONFIG, options.config);
  const settings: MatchSettings = { ...DEFAULT_SETTINGS, ...options.settings };
  const width = arena.layout[0]!.length;
  const height = arena.layout.length;

  const state: GameState = {
    tick: 0,
    seed: options.seed,
    rngState: seedToState(options.seed),
    config,
    settings,
    arenaId: arena.id,
    width,
    height,
    tiles: new Array<number>(width * height).fill(Tile.Empty),
    hidden: {},
    floorHazards: {},
    players: options.players.map((setup, id) => createPlayer(id, setup, arena, config)),
    generators: [],
    flames: [],
    blasts: [],
    pickups: [],
    vehicles: [],
    crush: null,
    crowd: null,
    nextId: 1,
    nextEventId: 1,
    match: {
      phase: 'countdown',
      playTicks: 0,
      countdownRemaining: config.match.countdownTicks,
      endedTick: null,
      result: null,
    },
  };

  buildTiles(state, arena);
  assignHiddenPickups(state);
  return state;
}

function buildTiles(state: GameState, arena: ArenaDef): void {
  const { width, height, config } = state;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (arena.layout[y]![x] === '#') state.tiles[tileIndex(state, x, y)] = Tile.Hard;
    }
  }

  const clear = new Set<number>();
  for (const spawn of arena.spawns) {
    const sx = spawn.x < width / 2 ? 1 : -1;
    const sy = spawn.y < height / 2 ? 1 : -1;
    for (const o of arena.spawnClearance) clear.add(tileIndex(state, spawn.x + o.x * sx, spawn.y + o.y * sy));
  }

  const place = (x: number, y: number, soft: boolean): void => {
    const i = tileIndex(state, x, y);
    if (state.tiles[i] === Tile.Hard || clear.has(i)) return;
    if (soft) state.tiles[i] = Tile.Soft;
  };

  const halfW = Math.ceil(width / 2);
  const halfH = Math.ceil(height / 2);
  for (let y = 0; y < halfH; y++) {
    for (let x = 0; x < halfW; x++) {
      if (state.tiles[tileIndex(state, x, y)] === Tile.Hard) continue;
      const soft = nextFloat(state) < config.arena.softDensity;
      if (arena.mirrorSoftBlocks) {
        place(x, y, soft);
        place(width - 1 - x, y, soft);
        place(x, height - 1 - y, soft);
        place(width - 1 - x, height - 1 - y, soft);
      } else {
        place(x, y, soft);
      }
    }
  }
}

function assignHiddenPickups(state: GameState): void {
  const { config } = state;
  for (let i = 0; i < state.tiles.length; i++) {
    if (state.tiles[i] !== Tile.Soft) continue;
    if (nextFloat(state) < config.pickups.hiddenChance) {
      state.hidden[i] = weightedPick<PickupKind>(state, config.pickups.weights);
    }
  }
}
