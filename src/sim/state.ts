import { DEFAULT_CONFIG, mergeConfig } from './config';
import type { GameConfig } from './config';
import { CHARACTERS } from './data/characters';
import { DEFAULT_ARENA_ID, getArena } from './arenas';
import type { ArenaDef } from './arenas';
import { tileIndex } from './grid';
import { nextFloat, seedToState, weightedPick } from './rng';
import { Tile } from './types';
import type {
  CrushState,
  EndgameTrapState,
  GameOptions,
  GameState,
  MatchSettings,
  PickupKind,
  Player,
  PlayerSetup,
  TrapTile,
} from './types';

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
    slide: null,
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
    endgameTraps: { waves: [], liveAt: [], warned: 0, live: 0, warnings: [] },
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
  if (settings.floorHazards) buildFloorHazards(state, arena);
  if (settings.mode === 'crush') state.crush = createCrush(state);
  state.endgameTraps = createEndgameTraps(state, arena);
  if (settings.crowdThrows) state.crowd = { nextThrowTick: config.crowd.firstThrowTicks, throws: [] };
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

function buildFloorHazards(state: GameState, arena: ArenaDef): void {
  arena.hazardLayout?.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      const i = tileIndex(state, x, y);
      if (state.tiles[i] === Tile.Hard) continue;
      if (c === 'o') state.floorHazards[i] = 'pothole';
      else if (c === '~') state.floorHazards[i] = 'oil';
    }
  });
}

/**
 * The mandatory endgame trap waves. Always built (no setting turns them off). Fairness: never on a
 * concrete pillar, and in Wahala Crush never on the final safe tile or the tiles next to it, so the
 * last stand is decided by the players, not by a trap.
 */
function createEndgameTraps(state: GameState, arena: ArenaDef): EndgameTrapState {
  const { width, height, config } = state;
  const excluded = new Set<number>();
  if (state.crush && state.crush.order.length > 0) {
    const last = state.crush.order[state.crush.order.length - 1]!;
    const lx = last % width;
    const ly = Math.floor(last / width);
    excluded.add(last);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = lx + dx;
      const y = ly + dy;
      if (x >= 0 && y >= 0 && x < width && y < height) excluded.add(tileIndex(state, x, y));
    }
  }
  const waves = arena.endgameTraps.map((rows) => {
    const tiles: TrapTile[] = [];
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        if (c !== 'o' && c !== '~') continue;
        const index = tileIndex(state, x, y);
        if (state.tiles[index] === Tile.Hard || excluded.has(index)) continue;
        tiles.push({ index, kind: c === 'o' ? 'pothole' : 'oil' });
      }
    });
    return tiles;
  });
  const { durationTicks } = config.match;
  const liveAt = waves.map((_, n) => {
    const remaining = config.hazards.endgameWaveRemainingTicks[n] ?? 0;
    return Math.max(0, durationTicks - Math.min(remaining, durationTicks));
  });
  return { waves, liveAt, warned: 0, live: 0, warnings: [] };
}

/** Wahala Crush closes the arena from the outside in, in a clockwise spiral of ring tiles. */
function createCrush(state: GameState): CrushState {
  const { width: w, height: h } = state;
  const order: number[] = [];
  const rings = Math.ceil(Math.min(w, h) / 2);
  for (let r = 0; r < rings; r++) {
    const x0 = r;
    const y0 = r;
    const x1 = w - 1 - r;
    const y1 = h - 1 - r;
    const ring: [number, number][] = [];
    for (let x = x0; x <= x1; x++) ring.push([x, y0]);
    for (let y = y0 + 1; y <= y1; y++) ring.push([x1, y]);
    if (y1 > y0) for (let x = x1 - 1; x >= x0; x--) ring.push([x, y1]);
    if (x1 > x0) for (let y = y1 - 1; y > y0; y--) ring.push([x0, y]);
    for (const [x, y] of ring) {
      const i = tileIndex(state, x, y);
      if (state.tiles[i] !== Tile.Hard) order.push(i);
    }
  }
  const warnAt = crushSchedule(order.length, state.config);
  return { order, next: 0, warnAt, nextAtTick: warnAt[0] ?? Infinity, pending: [] };
}

/**
 * Play tick at which each of `count` tiles is telegraphed. Paced from the real tile count so the
 * arena is fully open until `startRemainingTicks` is left, every tile except the last has landed
 * `finalTileLeadTicks` before the end, and the final tile lands exactly at the full-time tick.
 */
export function crushSchedule(count: number, config: GameConfig): number[] {
  if (count === 0) return [];
  const { durationTicks } = config.match;
  const { startRemainingTicks, finalTileLeadTicks, warnTicks } = config.crush;
  const first = Math.max(0, durationTicks - Math.min(startRemainingTicks, durationTicks));
  const finalWarn = Math.max(first, durationTicks - warnTicks);
  const lastOfRest = Math.min(Math.max(first, durationTicks - finalTileLeadTicks - warnTicks), finalWarn);
  const rest = count - 1;
  const warnAt: number[] = [];
  for (let j = 0; j < rest; j++) {
    warnAt.push(first + (rest > 1 ? Math.round(((lastOfRest - first) * j) / (rest - 1)) : 0));
  }
  warnAt.push(finalWarn);
  return warnAt;
}
