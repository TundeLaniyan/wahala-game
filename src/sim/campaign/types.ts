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
