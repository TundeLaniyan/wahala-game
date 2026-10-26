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
  | 'hotfuel'
  | 'bombpass'
  /** V2: absorbs one lethal hit (stacks with an Okada: separate layers). */
  | 'armour'
  /** V2: Square Blast tier up (3 x 3, then 5 x 5) on top of the normal plus. */
  | 'square';
export type CurseKind = 'slow' | 'inverted' | 'weakFire';
export type GeneratorMode = 'timed' | 'remote' | 'disabled';

/**
 * V2: generator-contact abilities. Mutually exclusive: the last one acquired replaces the previous one.
 * They act when the player tries to MOVE into a tile holding a grounded generator (no button).
 */
export type ContactAbility = 'kick' | 'punch' | 'disarm' | 'pass';
export const CONTACT_ABILITIES: readonly ContactAbility[] = ['kick', 'punch', 'disarm', 'pass'];

/** V2: seven bot levels, easiest first. Rookie is the default for a new player. */
export type Difficulty = 'rookie' | 'beginner' | 'casual' | 'standard' | 'skilled' | 'expert' | 'nightmare';
export const DIFFICULTIES: readonly Difficulty[] = [
  'rookie',
  'beginner',
  'casual',
  'standard',
  'skilled',
  'expert',
  'nightmare',
];

/** Whether Wahala Crush closes the arena (standard matches: always 'crush'; 'classic' only for tutorials/tests). */
export type MatchMode = 'classic' | 'crush';

/**
 * V2: the match ruleset. `classic` = the 2-4 player standard match (last standing, mandatory Wahala Crush);
 * the three City Rumble modes share the same simulation with different rules (src/sim/modes.ts).
 */
export type GameKind = 'classic' | 'survival' | 'deathmatch' | 'team';

/** V2: no team (free-for-all). */
export const NO_TEAM = -1;

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
  | { kind: 'crowd'; eventId: number }
  | { kind: 'hazard'; style: StageHazardStyle; eventId: number }
  /** V2: a generator thrown in by an eliminated sideline spectator (never credited to anyone). */
  | { kind: 'spectator'; ownerId: number; eventId: number };

/** V2: per-player match statistics (scoreboards, Deathmatch / Team ranking, Rumble progression). */
export interface PlayerStats {
  /** Credited eliminations (see systems/attribution.ts). */
  kills: number;
  deaths: number;
  assists: number;
  /** Tick of the latest credited elimination (tie-break: whoever reached the score first). */
  lastKillTick: number;
  /**
   * V2 (workstream C): credited eliminations in the current life (= `kills` in survival; reset on every
   * elimination). The Rumble reward ladder is indexed by it, so respawn modes restart the ladder per life.
   */
  streak: number;
}

/** V2: a recent non-lethal attack on a player (melee push/daze), kept for elimination credit. */
export interface HitRecord {
  byId: number;
  tick: number;
}

/** V2: an eliminated standard-match player on the sideline lane (systems/spectators.ts). */
export interface SpectatorState {
  /** Lane position: index into `spectatorLane(state)` (tiles just outside the board). */
  pos: number;
  /** First tick the next throw is allowed. */
  readyTick: number;
  /** Ticks until the next lane step is allowed (lane movement is grid-stepped like walking). */
  stepRemaining: number;
}

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
  /** V2: who got the credit for this player's latest elimination (null = nobody). */
  eliminatedBy: number | null;

  /** V2: team index (0 = Green, 1 = White) or NO_TEAM (-1) in free-for-all. */
  team: number;
  stats: PlayerStats;
  /** V2: recent melee attackers (pruned to `config.credit.assistWindowTicks`). */
  recentHits: HitRecord[];
  /** V2 respawn modes: tick at which this (eliminated) player re-enters, else null. */
  respawnAt: number | null;
  /** V2: lethal hits are ignored before this tick (spawn protection). */
  protectedUntil: number;
  /** V2: standard-match sideline spectator state once eliminated (null otherwise). */
  spectator: SpectatorState | null;

  // Upgrades (all reset every round).
  range: number;
  capacity: number;
  speedLevel: number;
  /** V2: the equipped generator-contact ability (kick / punch / disarm / pass), or none. */
  contact: ContactAbility | null;
  /** V2: first tick another contact action may fire (anti double-fire). */
  contactReadyTick: number;
  /** LEGACY (removed from normal play in V2): carry a generator. Never granted by the normal pickup pool. */
  grip: boolean;
  remote: boolean;
  /** Disarm (Kill Switch) charges; used by the `disarm` contact ability. */
  killSwitchCharges: number;
  sneakers: boolean;
  hotFuel: boolean;
  /** V2: Armour layers (each absorbs one separate lethal hit). */
  armour: number;
  /** V2: Square Blast tier: 0 none, 1 = 3 x 3, 2 = 5 x 5 (radius from config.square.radiusByTier). */
  squareTier: number;
  mounted: boolean; // Okada
  jumpReadyTick: number;
  /** Oil slick: forced automatic steps in `dir`. */
  slide: { dir: Dir; remaining: number } | null;
  hasVoucher: boolean;

  carrying: number | null; // generator id
  dazedUntil: number;
  dazeImmuneUntil: number;
  skillReadyTick: number;
  curse: { kind: CurseKind; until: number } | null;
  entryUntil: number | null; // vehicle-entry mode deadline
  immune: ImmuneEntry[];
  /** Manholes: the first tick this player may be carried through a trapdoor again. */
  teleportReadyTick: number;
  /** Manholes: set when a step onto a trapdoor began; resolved when that step completes. */
  teleportPending: { toX: number; toY: number } | null;
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
  /** V2 Square Blast: radius of the extra square footprint (0 = plain plus, 1 = 3 x 3, 2 = 5 x 5). */
  square: number;
  /** V2: thrown in by a sideline spectator (no elimination credit, no capacity use). */
  fromSpectator: boolean;
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
  /**
   * V2 elimination credit: the last OTHER player who set this generator in motion or off without owning it
   * (kicked / punched it, or rammed it with their vehicle). Optional: absent = nobody.
   */
  touchedBy?: number;
}

export interface Flame {
  x: number;
  y: number;
  eventId: number;
  genId: number;
  ownerId: number;
  /** Direction the flame arm travels away from its generator; null at the centre (and Square Blast tiles). */
  dir: Dir | null;
  /** V2: from a sideline spectator's generator (credited to nobody). */
  fromSpectator?: boolean;
  /** V2: a Square Blast tile (outside the plus arms) - drawn distinctly. */
  square?: boolean;
  /** City Rumble radial blast: a tile off the generator's row and column (systems/blastShape.ts). */
  radial?: boolean;
  tip: boolean;
  startTick: number;
  endTick: number;
}

/** One chain reaction. All its flames share an id; used for vehicle exposure and Okada grace. */
export interface BlastEvent {
  id: number;
  tiles: number[]; // unique tile indices covered by the whole chain
  /** V2: owner of the generator that started this chain (elimination credit for chained own blasts). */
  seedOwnerId: number;
  /**
   * V2: who set the chain off: the seed generator's `touchedBy` (kicker / puncher / vehicle owner) when
   * present, else its owner (systems/attribution.ts).
   */
  instigatorId: number;
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
  | { kind: 'win'; winnerId: number }
  | { kind: 'draw'; reason: 'simultaneous' | 'timeout' | 'tie' }
  /** V2 Team Rumble. */
  | { kind: 'teamWin'; team: number };

export interface CrushState {
  /** Tile indices in the order they will close. */
  order: number[];
  next: number;
  /** Play tick at which each tile of `order` is telegraphed; its landing is `warnTicks` later. */
  warnAt: number[];
  /** Play tick at which `order[next]` is telegraphed (derived from `warnAt`). */
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
  /**
   * City Rumble Evolution: tile indices of the arena's marked supply crates (`$` in the layout) that still
   * stand. Public: everyone sees the marking (a basic upgrade inside), not which one. An entry is live only
   * while its tile is a soft block.
   */
  supplies: number[];
  /** Live floor traps (tile index -> kind): early traps plus the endgame waves that have gone live. */
  floorHazards: Record<number, 'pothole' | 'oil'>;
  /** The mandatory endgame trap waves (always present in a standard match). */
  endgameTraps: EndgameTrapState;
  players: Player[];
  generators: Generator[];
  flames: Flame[];
  blasts: BlastEvent[];
  pickups: Pickup[];
  vehicles: Vehicle[];
  crush: CrushState | null;
  crowd: CrowdState | null;
  /** The arena's own environmental hazards (traffic, debris, gusts, manholes ...). Public. */
  stage: StageState;
  nextId: number;
  nextEventId: number;
  match: MatchState;
  /** V2 respawn modes: tick each arena spawn was last used for a respawn (anti spawn-camping). */
  spawnUsedAt: number[];
}

export interface TrapTile {
  index: number;
  kind: FloorHazardKind;
}

export type FloorHazardKind = 'pothole' | 'oil';

export interface EndgameTrapState {
  /** Planned tiles of each wave, from the arena data. */
  waves: TrapTile[][];
  /** Play tick each wave goes live (its warning starts `endgameWarnTicks` earlier). */
  liveAt: number[];
  /** Waves whose warning has been shown / that have gone live. */
  warned: number;
  live: number;
  /** Tiles currently telegraphed (public: drawn on the floor and seen by bots). */
  warnings: (TrapTile & { liveTick: number })[];
}

// ---------------------------------------------------------------- stage hazards

/** What a stage hazard looks like / is called (presentation and elimination credit). */
export type StageHazardStyle =
  | 'danfo' // a Danfo pulling into / reversing out of a bay (sweep)
  | 'traffic' // a bus or keke crossing a road lane (sweep)
  | 'checkpoint' // a car rushing through the checkpoint lane (sweep)
  | 'debris' // construction debris falling from the crane (strike)
  | 'power' // electrified floor zone (strike)
  | 'gust' // a wind gust on the bridge (push)
  | 'wash' // lagoon water washing over the jetty (push + douse)
  | 'merch' // market goods tumbling onto the floor (drop: new crates)
  | 'manhole' // connected trapdoors (teleport)
  | 'cargo' // V2 Apapa: a container lowered by a quay crane onto a marked zone (strike)
  | 'goods' // V2 Lagos Island: bales and cartons tumbling off a shopfront onto a marked zone (strike)
  | 'truck'; // V2 Apapa: an articulated container truck racing a port road (sweep)

export type StageHazardKind = 'sweep' | 'strike' | 'push' | 'drop';

/** One telegraphed (then active) stage hazard event. */
export interface StageEvent {
  id: number;
  /** Index of the hazard definition in the arena's `stageHazards`. */
  hazard: number;
  kind: StageHazardKind;
  style: StageHazardStyle;
  /** Tiles affected (sweep: the whole route in order; push: the zone; strike/drop: the target tiles). */
  tiles: number[];
  /** Push direction / sweep travel direction of the first leg. */
  dir: Dir | null;
  /** Tick the warning started and the tick the hazard becomes real. */
  warnTick: number;
  startTick: number;
  /** Tick the event is over (sweep: updated as it drives). */
  endTick: number;
  /** Event id for elimination credit and Okada grace (lethal kinds only, else 0). */
  eventId: number;
  /** Sweep progress: index into `tiles` of the tile the vehicle occupies (-1 before it enters). */
  index: number;
  stepRemaining: number;
  stepTicks: number;
}

export interface StageState {
  /** Next play tick each hazard definition fires (Infinity = never / finished). */
  nextAt: number[];
  /** Events currently warning or active. */
  events: StageEvent[];
  /** Whether ordinary stage hazards run in this match (always true in real matches; off only in tutorials/tests). */
  enabled: boolean;
}

// ---------------------------------------------------------------- settings

export interface PlayerSetup {
  name: string;
  characterId: CharacterId;
  isBot: boolean;
  difficulty?: Difficulty;
  /** V2 Team Rumble: team index; omitted = assigned by the ruleset (modes.ts). */
  team?: number;
}

export interface MatchSettings {
  /** V2 ruleset (see src/sim/modes.ts). Default 'classic'. */
  game: GameKind;
  /** Team Rumble: teammates can hurt each other (self-damage is ALWAYS on). Default false. */
  friendlyFire: boolean;
  /** Team Rumble: number of teams (2 = Green v White). */
  teamCount: number;
  /** Deathmatch / Team Rumble length in seconds (300 or 600); null = the arena / ruleset default. */
  durationSec: number | null;
  /**
   * Whether Wahala Crush runs. Standard matches always use 'crush' (the menus offer no switch);
   * 'classic' (no closing) exists only for tutorials and test scenarios.
   */
  mode: MatchMode;
  crowdThrows: boolean;
  /**
   * The arena's own environmental hazards (its stage identity). Always on in real matches - the menus
   * offer no switch; only tutorials and test scenarios turn them off. The mandatory endgame trap waves
   * are separate and can never be disabled.
   */
  stageHazards: boolean;
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
  | { type: 'begin' }
  | { type: 'cancel' }
  | { type: 'launch'; entry: VehicleEntry; turn?: VehicleTurn }
  /** V2 one-press launch: the simulation picks the route (systems/autoVehicle.ts). */
  | { type: 'auto' };

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
  /** Button A: place a generator (sideline spectator: throw one in). */
  place?: boolean;
  /**
   * V2 button B (tap): ONE deterministic context action (systems/actions.ts): melee an adjacent
   * opponent, else launch the signature vehicle (voucher), else nothing. Never two things at once.
   */
  special?: boolean;
  /** Context action: pick up / drop (Grip), punch (Gloves). */
  action?: boolean;
  disarm?: boolean;
  skill?: boolean;
  /** Button B (hold): Remote Detonator. */
  detonate?: boolean;
  vehicle?: VehicleIntent;
}

export type Intents = Record<number, Intent>;

// ---------------------------------------------------------------- events (for FX, audio, UI)

export type SimEvent =
  | { type: 'matchStarted' }
  | { type: 'matchEnded'; result: MatchResult }
  | { type: 'generatorPlaced'; generatorId: number; ownerId: number; x: number; y: number }
  | {
      type: 'generatorExploded';
      generatorId: number;
      ownerId: number;
      x: number;
      y: number;
      eventId: number;
      range: number;
      /** V2 Square Blast radius of this generator (0 / absent = plain plus). */
      square?: number;
      /** City Rumble: the blast was radial (systems/blastShape.ts); `range` is then its radius. */
      radial?: boolean;
    }
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
  | {
      type: 'playerEliminated';
      playerId: number;
      cause: EliminationCause;
      x: number;
      y: number;
      /** V2: credited eliminator (null = nobody: own blast, environment, teammate ...). */
      creditId: number | null;
      assistIds: number[];
    }
  /** V2: a generator-contact ability acted (kick, punch, disarm, pass-through). */
  | { type: 'contactUsed'; playerId: number; ability: ContactAbility; generatorId: number }
  /** V2: a contact ability was picked up / replaced the previous one. */
  | { type: 'contactEquipped'; playerId: number; ability: ContactAbility; replaced: ContactAbility | null }
  /** V2: button B resolved to this action. */
  | { type: 'specialUsed'; playerId: number; action: 'melee' | 'vehicle' }
  /** V2: a protection layer absorbed a lethal hit (Okada also emits okadaBroken). */
  | { type: 'protectionBroken'; playerId: number; layer: 'okada' | 'armour'; x: number; y: number }
  /** V2 City Rumble: an elimination reward was granted to the credited eliminator. */
  | { type: 'rewardGranted'; playerId: number; kind: PickupKind; kills: number }
  /** V2 respawn modes. */
  | { type: 'playerRespawned'; playerId: number; x: number; y: number }
  /** V2 sideline spectator throw: lands (as a live generator) at toX/toY on landTick. */
  | {
      type: 'spectatorThrow';
      playerId: number;
      generatorId: number;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      landTick: number;
    }
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
  | { type: 'hazardTriggered'; playerId: number; kind: 'pothole' | 'oil' }
  /** A stage hazard is telegraphed (warning starts now, it becomes real at `startTick`). */
  | { type: 'stageWarning'; event: StageEvent }
  /** A stage hazard becomes real (sweep enters, strike lands, push blows, drop lands). */
  | { type: 'stageStarted'; event: StageEvent }
  | { type: 'stageEnded'; eventId: number; id: number }
  /** A sweep vehicle moved onto a tile. */
  | { type: 'stageSweepStep'; id: number; x: number; y: number }
  | { type: 'stageBlockDropped'; x: number; y: number; style: StageHazardStyle }
  | { type: 'playerTeleported'; playerId: number; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'generatorDoused'; generatorId: number }
  /** An endgame trap wave is telegraphed (wave 0 = the start of the final-30-seconds escalation). */
  | { type: 'trapsWarning'; wave: number; tiles: TrapTile[]; liveTick: number }
  /** An endgame trap wave is live. */
  | { type: 'trapsActivated'; wave: number; tiles: TrapTile[] };
