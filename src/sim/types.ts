/**
 * Core data model of the WAHALA! simulation.
 *
 * Everything here is plain, JSON-serialisable data (no classes, Maps or Sets) so a state can be
 * cloned, snapshotted, replayed or later sent over the wire by an authoritative server.
 * Time is always measured in simulation ticks (see TICK_RATE in config.ts).
 */
import type { DeepPartial, GameConfig } from './config';

// ---------------------------------------------------------------- grid primitives

export type Dir = 'up' | 'right' | 'down' | 'left';
export interface TilePos {
  x: number;
  y: number;
}

export const Tile = { Empty: 0, Hard: 1, Soft: 2 } as const;
export type TileKind = (typeof Tile)[keyof typeof Tile];

// ---------------------------------------------------------------- catalogue ids

export type CharacterId = 'streetBaller' | 'lekkiBoy' | 'campusQueen';
export type VehicleKind = 'danfo' | 'taxi' | 'keke';
export type SkillKind = 'push' | 'daze' | 'shove';
export type PickupKind =
  | 'petrol'
  | 'diesel'
  | 'socket'
  | 'skates'
  | 'boots'
  | 'gloves'
  | 'grip'
  | 'remote'
  | 'killswitch'
  | 'okada'
  | 'voucher'
  | 'curse'
  | 'sneakers'
  | 'hotfuel';
export type CurseKind = 'slow' | 'inverted' | 'weakFire';
export type GeneratorMode = 'timed' | 'remote' | 'disabled';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type MatchMode = 'classic' | 'crush';

// ---------------------------------------------------------------- entities

export interface ImmuneEntry {
  eventId: number;
  /** Tick at which this immunity lapses (Infinity-safe: use a large number for "forever"). */
  until: number;
}

export type EliminationCause =
  | { kind: 'flame'; ownerId: number; eventId: number }
  | { kind: 'vehicle'; ownerId: number; vehicleKind: VehicleKind; eventId: number }
  | { kind: 'crush'; eventId: number }
  | { kind: 'crowd'; eventId: number };

export interface Player {
  id: number;
  slot: number;
  name: string;
  characterId: CharacterId;
  isBot: boolean;

  // Position. `x,y` is the logical tile and is committed the moment a step starts; stepFrom* and
  // stepRemaining exist so the renderer can interpolate. See docs/ARCHITECTURE.md ("Movement model").
  x: number;
  y: number;
  facing: Dir;
  stepFromX: number;
  stepFromY: number;
  stepRemaining: number;
  stepTotal: number;

  alive: boolean;
  eliminatedTick: number | null;
  elimination: EliminationCause | null;

  // Upgrades (all reset every round).
  range: number;
  capacity: number;
  speedLevel: number;
  kick: boolean;
  punch: boolean;
  grip: boolean;
  remote: boolean;
  killSwitchCharges: number;
  sneakers: boolean;
  hotFuel: boolean;
  mounted: boolean; // Okada
  jumpReadyTick: number;
  hasVoucher: boolean;

  carrying: number | null; // generator id
  dazedUntil: number;
  dazeImmuneUntil: number;
  skillReadyTick: number;
  curse: { kind: CurseKind; until: number } | null;
  entryUntil: number | null; // vehicle-entry mode deadline
  immune: ImmuneEntry[];
}

export interface Generator {
  id: number;
  ownerId: number;
  x: number;
  y: number;
  stepFromX: number;
  stepFromY: number;
  /** Snapshotted from the owner when placed. */
  range: number;
  /** Hot Fuel: flames burn through the first soft block on each arm. */
  pierce: boolean;
  mode: GeneratorMode;
  /**
   * Mode-dependent countdown in ticks: timed = fuse until detonation; remote = failsafe until
   * auto-detonation; disabled = time until the dud is cleaned away.
   */
  timer: number;
  carriedBy: number | null;
  carryBonusUsed: boolean;
  slide: { dir: Dir; stepRemaining: number } | null;
  flight: { fromX: number; fromY: number; remaining: number; total: number } | null;
  /** Flagged during a tick when something has set this generator off. */
  triggered: boolean;
  placedTick: number;
}

export interface Flame {
  x: number;
  y: number;
  eventId: number;
  genId: number;
  ownerId: number;
  /** Direction the flame arm travels away from its generator; null at the centre. */
  dir: Dir | null;
  tip: boolean;
  startTick: number;
  endTick: number;
}

/** One chain reaction. All its flames share an id; used for vehicle exposure and Okada grace. */
export interface BlastEvent {
  id: number;
  tiles: number[]; // unique tile indices covered by the whole chain
  endTick: number;
}

export interface Pickup {
  id: number;
  x: number;
  y: number;
  kind: PickupKind;
  /** The flame event that revealed this pickup is not allowed to burn it. */
  safeEventId: number | null;
}

export interface Vehicle {
  id: number;
  ownerId: number;
  kind: VehicleKind;
  route: TilePos[];
  phase: 'warning' | 'driving' | 'crashing';
  warnRemaining: number;
  /** Ticks left of the crash/wreck animation once the vehicle has stopped for good. */
  wreckRemaining: number;
  hitPlayerIds: number[];
  /** Index into `route` of the tile the vehicle currently occupies (committed at step start). */
  index: number;
  stepRemaining: number;
  stepTotal: number;
  /** Cumulative blast exposure in flame tiles over this vehicle's journey. */
  damage: number;
  slowUntil: number;
  softBroken: number;
  playerHits: number;
  exposedEvents: number[];
  eventId: number; // id used for Okada grace against this vehicle
  startTick: number;
}

export interface CrowdThrow {
  id: number;
  x: number;
  y: number;
  kind: 'bottle' | 'firecracker';
  landTick: number;
}

export interface MatchState {
  phase: 'countdown' | 'playing' | 'ended';
  /** Ticks of the playing phase that have elapsed. */
  playTicks: number;
  countdownRemaining: number;
  endedTick: number | null;
  result: MatchResult | null;
}

export type MatchResult =
  { kind: 'win'; winnerId: number } | { kind: 'draw'; reason: 'simultaneous' | 'timeout' };

export interface CrushState {
  /** Tile indices in the order they will close. */
  order: number[];
  next: number;
  nextAtTick: number;
  /** Tiles currently warning, with the tick they land. */
  pending: { index: number; landTick: number }[];
}

export interface CrowdState {
  nextThrowTick: number;
  throws: CrowdThrow[];
}

export interface GameState {
  tick: number;
  seed: number;
  rngState: number;
  config: GameConfig;
  settings: MatchSettings;
  arenaId: string;
  width: number;
  height: number;
  /** Row-major tile kinds (Tile.*). */
  tiles: number[];
  /** Pickup hidden under each soft block (tile index -> kind). Never exposed to bots. */
  hidden: Record<number, PickupKind>;
  /** Special floor hazards declared by the arena (tile index -> kind). */
  floorHazards: Record<number, 'pothole' | 'oil'>;
  players: Player[];
  generators: Generator[];
  flames: Flame[];
  blasts: BlastEvent[];
  pickups: Pickup[];
  vehicles: Vehicle[];
  crush: CrushState | null;
  crowd: CrowdState | null;
  nextId: number;
  nextEventId: number;
  match: MatchState;
}

// ---------------------------------------------------------------- settings

export interface PlayerSetup {
  name: string;
  characterId: CharacterId;
  isBot: boolean;
  difficulty?: Difficulty;
}

export interface MatchSettings {
  mode: MatchMode;
  crowdThrows: boolean;
  floorHazards: boolean;
}

export interface GameOptions {
  seed: number;
  arenaId?: string;
  players: PlayerSetup[];
  settings?: Partial<MatchSettings>;
  config?: DeepPartial<GameConfig>;
}

// ---------------------------------------------------------------- input

export type VehicleIntent =
  { type: 'begin' } | { type: 'cancel' } | { type: 'launch'; entry: VehicleEntry; turn?: VehicleTurn };

export interface VehicleEntry {
  x: number;
  y: number;
  /** Direction of travel away from the border. */
  dir: Dir;
}
export interface VehicleTurn {
  /** Index within the straight leg at which the Keke turns. */
  atIndex: number;
  dir: Dir;
}

/**
 * One player's input for one tick. `move` is level-triggered (held); every other field is an
 * edge-triggered one-shot that the input layer sets for exactly one tick.
 */
export interface Intent {
  move?: Dir | null;
  place?: boolean;
  /** Context action: pick up / drop (Grip), punch (Gloves). */
  action?: boolean;
  disarm?: boolean;
  skill?: boolean;
  detonate?: boolean;
  vehicle?: VehicleIntent;
}

export type Intents = Record<number, Intent>;

// ---------------------------------------------------------------- events (for FX, audio, UI)

export type SimEvent =
  | { type: 'matchStarted' }
  | { type: 'matchEnded'; result: MatchResult }
  | { type: 'generatorPlaced'; generatorId: number; ownerId: number; x: number; y: number }
  | { type: 'generatorExploded'; generatorId: number; ownerId: number; x: number; y: number; eventId: number }
  | { type: 'generatorKicked'; generatorId: number }
  | { type: 'generatorCarried'; generatorId: number; playerId: number; bonus: boolean }
  | { type: 'generatorDropped'; generatorId: number; playerId: number }
  | { type: 'generatorThrown'; generatorId: number; playerId: number; toX: number; toY: number }
  | { type: 'generatorDisarmed'; generatorId: number; playerId: number }
  | { type: 'generatorDudCleaned'; generatorId: number; x: number; y: number }
  | { type: 'blockDestroyed'; x: number; y: number; by: 'flame' | 'vehicle' | 'crush' }
  | { type: 'pickupRevealed'; pickupId: number; x: number; y: number; kind: PickupKind }
  | { type: 'pickupCollected'; pickupId: number; playerId: number; kind: PickupKind; wasted: boolean }
  | { type: 'pickupBurned'; pickupId: number; x: number; y: number }
  | { type: 'pickupDropped'; pickupId: number; x: number; y: number; kind: PickupKind }
  | { type: 'playerEliminated'; playerId: number; cause: EliminationCause; x: number; y: number }
  | { type: 'playerJumped'; playerId: number }
  | { type: 'okadaMounted'; playerId: number }
  | { type: 'okadaBroken'; playerId: number; x: number; y: number }
  | { type: 'skillUsed'; playerId: number; skill: SkillKind; targetId: number | null }
  | { type: 'playerPushed'; playerId: number; byId: number; fromX: number; fromY: number }
  | { type: 'playerDazed'; playerId: number; byId: number | null }
  | { type: 'cursed'; playerId: number; curse: CurseKind }
  | { type: 'vehicleEntryBegan'; playerId: number }
  | { type: 'vehicleEntryCancelled'; playerId: number; reason: 'cancel' | 'timeout' }
  | { type: 'vehicleWarning'; vehicleId: number; kind: VehicleKind; ownerId: number; entry: TilePos }
  | { type: 'vehicleLaunched'; vehicleId: number; kind: VehicleKind; ownerId: number }
  | { type: 'vehicleHitPlayer'; vehicleId: number; playerId: number }
  | { type: 'vehicleHitGenerator'; vehicleId: number; generatorId: number }
  | { type: 'vehicleDamaged'; vehicleId: number; damage: number; total: number; resistance: number }
  | { type: 'vehicleDestroyed'; vehicleId: number; x: number; y: number; reason: 'blast' | 'crash' }
  | { type: 'vehicleExited'; vehicleId: number }
  | { type: 'crushWarning'; x: number; y: number; landTick: number }
  | { type: 'crushLanded'; x: number; y: number }
  | {
      type: 'crowdWarning';
      throwId: number;
      x: number;
      y: number;
      kind: 'bottle' | 'firecracker';
      landTick: number;
    }
  | { type: 'crowdLanded'; throwId: number; x: number; y: number; kind: 'bottle' | 'firecracker' }
  | { type: 'hazardTriggered'; playerId: number; kind: 'pothole' | 'oil' };
