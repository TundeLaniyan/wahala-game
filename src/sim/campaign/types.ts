/**
 * CONTRACT (campaign expansion: field missions, classic raids, campaign health and damage, projectiles).
 * Written by the integrator (docs/CAMPAIGN_EXPANSION_PLAN.md). Each worker owns its part and may EXTEND this file
 * (optional fields, new union members) but must not rename or remove what other layers import.
 * Everything is plain JSON data like the rest of src/sim. Multiplayer / Rumble / Classic Battle never set any of
 * the optional fields below, so their one-hit rules are unchanged (tested).
 */
import type { Dir, TilePos } from '../types';

/** Two mission formats. Field = the large scrolling district mission; raid = the compact fixed-screen classic mission. */
export type MissionFormat = 'field' | 'raid';

/**
 * Bomb geometry is chosen by the RULESET, never by a menu toggle (src/sim/modes.ts `BLAST_RULE_BY_GAME`):
 *   radial = the Rumble disc (City Rumble Survival / Deathmatch / Team, and campaign field missions)
 *   cross  = the classic plus (Classic Battle, classic raids)
 */
export type BombRule = 'radial' | 'cross';

// ---------------------------------------------------------------- campaign health and damage

/** Health of a campaign player or enemy. Absent (undefined) = the multiplayer one-hit rules. */
export interface Vitals {
  hp: number;
  maxHp: number;
  /** Hits are ignored until this tick (a short recovery after taking damage; never silent: it is shown). */
  invulnUntil: number;
  /** Tick of the last damage taken (drives the HUD flash and "recently hurt" bars). */
  lastHitTick: number;
  /** Who dealt the last damage (null: the environment) - explains "why did I lose health". */
  lastHitBy: number | null;
  lastHitSource: CampaignHitSource | null;
  /** Whether the last damaging hit was `strong` (a strong hit pierces invulnerability frames only after a non-strong one). */
  lastHitStrong?: boolean;
}

export type EnemyAttackKind = 'punch' | 'bottle' | 'brick' | 'stone' | 'tool';
export type CampaignHitSource = EnemyAttackKind | 'blast' | 'vehicle' | 'hazard' | 'player' | 'trap';

/** One unit of campaign damage, resolved by `applyCampaignHit` (combat-core). */
export interface CampaignHit {
  victimId: number;
  byId: number | null;
  source: CampaignHitSource;
  /** Health points taken (0 = daze / knockback only). 1 point = one health segment. */
  damage: number;
  dazeTicks: number;
  knockback: { dir: Dir; tiles: number } | null;
  /** A strong hit (slow, telegraphed) can take a whole segment even through invulnerability frames. */
  strong?: boolean;
}

/** What actually happened to a hit (events / HUD / tests). */
export type CampaignHitResult =
  'damaged' | 'dazed' | 'blockedArmour' | 'blockedOkada' | 'invulnerable' | 'defeated';

/** Enemy kinds: durability and attack set by role (data in src/sim/data/enemies.ts, combat-core). */
export type EnemyKind = 'agbero' | 'guard' | 'thrower' | 'heavy' | 'lieutenant' | 'boss';

// ---------------------------------------------------------------- projectiles (bottles, bricks, stones, thrown tools)

/** A thrown object in flight. Readable: a launch cue, a visible path, a clear landing (projectiles.ts, combat-core). */
export interface Projectile {
  id: number;
  ownerId: number;
  kind: EnemyAttackKind;
  /** Tiles it passes over, in order (index y * width + x), the first being the first tile after the thrower. */
  path: number[];
  /** Ticks per path tile (strong projectiles are slower). */
  stepTicks: number;
  launchTick: number;
  /** Index of the tile it has reached; the projectile is removed when it hits, is blocked or the path ends. */
  index: number;
  strong: boolean;
  /**
   * Ticks of telegraph between the launch (the cue) and the first movement. The projectile reaches path tile `i` at
   * `launchTick + warnTicks + (i + 1) * stepTicks`. Absent = 0 (a projectile built by hand in a test).
   */
  warnTicks?: number;
  /** Direction of flight (the knockback direction of a hit). */
  dir?: Dir;
}

/** The four thrown kinds ('punch' is melee). */
export type ThrownKind = Exclude<EnemyAttackKind, 'punch'>;

/**
 * Enemy attack bookkeeping (src/sim/systems/enemyActions.ts, projectiles.ts). ABSENT in every normal match; created on
 * the first enemy throw / call. Plain JSON, ticks only.
 */
export interface EnemyFireState {
  /** Next tick each enemy may throw again (per-enemy cooldown), by player id. */
  nextThrowTick: Record<number, number>;
  /** Next tick each enemy may start a punch again, by player id. */
  nextPunchTick: Record<number, number>;
  /** Throws made so far by each enemy (picks the thrown kind in a fixed rotation: no RNG). */
  throwCount: Record<number, number>;
  /** Next tick any enemy of a group (team id) may throw: the group's rate limit. */
  groupNextThrowTick: Record<number, number>;
  /** Next tick any enemy of a group (team id) may START a punch: punches of one group are staggered. */
  groupNextPunchTick: Record<number, number>;
  /** No enemy hit lands on this victim before this tick (stun + free window): movement is never impossible. */
  victimSafeUntil: Record<number, number>;
  /** Reinforcement calls made so far by each caller, and the next tick it may call again. */
  callsMade: Record<number, number>;
  nextCallTick: Record<number, number>;
  /** Calls still waiting to be answered (the mission / raid runtime answers them; they lapse at `untilTick`). */
  calls: ReinforcementCall[];
  /** Tile indices a runtime marks as route chokepoints for `block` tactics (optional, set by the field / raid runtime). */
  chokepoints?: number[];
}

/** A lieutenant or boss asking for help. The runtime decides what answers it; this sim never spawns players. */
export interface ReinforcementCall {
  id: number;
  callerId: number;
  /** Team (group) id of the caller; reinforcements join this group. */
  team: number;
  x: number;
  y: number;
  /** How many fighters the caller asks for (config). */
  count: number;
  tick: number;
  untilTick: number;
}

// ---------------------------------------------------------------- field <-> raid transition (sim-level, no UI)

export type RaidId =
  | 'warehouseDispatchDepot' // Oshodi vertical slice: marked cargo, wave, projectiles, optional rooms
  | 'partsStoreroom'
  | 'junctionToolShed'
  | 'railYardGoods'
  | 'recordsVault'
  | 'standbyPlant';

/** A door in a field mission that opens a classic raid; stepping on it (hold) raises a request the app handles. */
export interface RaidRequest {
  doorId: string;
  raidId: RaidId;
  /** Where the player stands in the field map when the raid ends (the tile in front of the door). */
  returnTile: TilePos;
}

export type RaidResultKind = 'completed' | 'failed' | 'abandoned';

/** What a raid hands back to the field mission / campaign (pure data, built by the raid runtime). */
export interface RaidOutcome {
  raidId: RaidId;
  result: RaidResultKind;
  seconds: number;
  /** Optional rooms opened / completed (each gives a bonus, never required). */
  optionalRoomsOpened: number;
  optionalRoomsTotal: number;
  cargoDestroyed: number;
  cargoTotal: number;
  /** Campaign health the player leaves with (carried back to the field). */
  hpLeft: number;
  livesUsed: number;
  stars: 0 | 1 | 2 | 3;
  /** Why a `failed` raid failed (absent otherwise): every life spent, or the clock ran out. */
  failedBy?: 'lives' | 'time';
}

// ---------------------------------------------------------------- territories (decision SA6, docs/CAMPAIGN_SECTOR_AI.md)

/**
 * A campaign enemy's TERRITORY, as authored on a field seat (`FieldEnemyDef.territory`). Every field is optional: the
 * level (`config.campaignTactics.territory`) and the seat's variant personality fill the rest (`resolveTerritory`).
 * Tiles are [x, y] open floor of the arena.
 */
export interface TerritoryDef {
  /** Patrol waypoints walked as a loop (absent, empty or one tile = it holds its post and watches). */
  patrol?: readonly (readonly [number, number])[];
  /** Guard area centre (default: the post) and radius in tiles (default 2). */
  centre?: readonly [number, number];
  radius?: number;
  /** Investigations stay within this many tiles of the territory. */
  investigateRadius?: number;
  /** It pursues a seen human while he is within this many tiles (Chebyshev) of the territory. */
  pursuitTiles?: number;
  /** After giving up: 'watch' (face him for a while, ranged ones keep throwing, then walk back) or 'walk' (at once). */
  onReturn?: 'watch' | 'walk';
  /** Alerts allies within this many tiles when it spots the human (0 = never; default: its variant's). */
  alertAllies?: number;
  /** Escaping a known generator: 'free' (any refuge) or 'territory' (prefers refuges inside its area). */
  escape?: 'free' | 'territory';
}

/** A territory resolved for one seat (plain JSON in `GameState.territory`). */
export interface TerritorySpec {
  /** Centre and patrol waypoints: the leash and the investigation radius are measured from these, never the post alone. */
  anchors: TilePos[];
  patrol: TilePos[];
  centre: TilePos;
  radius: number;
  investigateRadius: number;
  pursuitTiles: number;
  /** Gives up when the human is farther than this from every anchor (`pursuitTiles` + the level's slack). */
  leashTiles: number;
  /** Watches this long after giving up (0 = walks back at once). */
  watchTicks: number;
  alertAllies: number;
  escape: 'free' | 'territory';
  usesCover: boolean;
  /** Keeps its distance to throw (a ranged variant), at this many tiles. 0 = a brawler. */
  preferredRange: number;
  /** Notice time of the human, in ticks (the level's, scaled by the variant). */
  noticeTicks: number;
  /** Notice radius of the human (tiles). */
  noticeTiles: number;
  /** The same while it is calm (decision RC4). */
  calmNoticeTiles: number;
  /** Hearing radius (Manhattan) of a generator being laid. */
  hearingTiles: number;
}

/**
 * The ONE territorial state machine's states (shared by every variant; decision SA6). The sim stores these; the
 * readable overlay states (wind-up / attack / recovery, stagger, defeat) come from the sim state itself and the AI's
 * generator evasion from the planner (`enemyMindView`).
 */
export type MindState = 'patrol' | 'watch' | 'investigate' | 'alert' | 'pursue' | 'return';

export interface EnemyMind {
  spec: TerritorySpec;
  state: MindState;
  /** Tick the state was entered. */
  since: number;
  /** Patrol: the waypoint it walks to, the direction it walks the loop, laps done, and its pause at a waypoint. */
  waypoint: number;
  dirSign: 1 | -1;
  lap: number;
  pauseUntil: number;
  /** Investigate: the coarse spot it walks to (never the hidden source tile). Return: the anchor it walks back to. */
  target: TilePos | null;
  /** The human's tile when this enemy (or an ally that alerted it) last SAW him, and when. */
  lastSeen: TilePos | null;
  lastSeenTick: number;
  /** Accumulated sight of the human (ticks) towards `spec.noticeTicks`. */
  notice: number;
  /** The watch after giving up lasts until this tick. */
  watchUntil: number;
  /** Health at the last update: a drop is a hit, which re-engages it at once. */
  hpSeen: number;
  /** A cover-using variant stays behind cover until this tick after its attack (then pursues again). */
  coverUntil: number;
  /** The end tick of the last own attack already seen (to notice a new one). */
  attackSeen: number;
  /** After a hit it chases with no leash until this tick. */
  hitChaseUntil: number;
  /** Decision RC3: the tick the current chase started (or last landed a hit on the human: the max-chase clock). */
  chaseSince: number;
  /** Decision RC3: the tick the human first got farther than the break-off gap (-1 = he is within it), and its last check. */
  farSince: number;
  gapCheckedTick: number;
  /** Decision RC3: the human's health when last seen by this mind (a drop while it pursues is a hit it landed). */
  humanHpSeen: number;
  /** Decision RC3: after breaking off it does not notice the human by sight before this tick (close / a hit still do). */
  noticeBlockedUntil: number;
  /**
   * Decision RA6 (Classic raids only; absent elsewhere): a wave the player's own action called in (a crate, a door) wakes
   * alerted to where he was, and until this tick it hunts him with no leash, walking-gap or maximum-chase break-off
   * (losing sight of him still sends it to search).
   */
  calledUntil?: number;
  /**
   * Decision PI7 (Classic raids only): the facing last seen on this seat (to notice a turn), and the tick until which a
   * turn that REVEALED the human holds the instant arm's-length notice back (`revealGraceTicks`).
   */
  facingSeen?: Dir;
  graceUntil?: number;
}

/** Runtime of the territorial state machine (systems/territory.ts). ABSENT outside campaign tactics matches. */
export interface TerritoryState {
  minds: Record<number, EnemyMind>;
  /** Noises already heard: generators and blasts with an id up to these were processed. */
  heardGeneratorId: number;
  heardBlastId: number;
}
