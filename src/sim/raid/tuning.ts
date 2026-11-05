/**
 * Raid numbers that are not authored per raid (docs/CLASSIC_RAIDS.md, decisions CR1-CR12). Ticks are 60 per second.
 * Per-raid numbers (lives, clock, par, hp of cargo, shipments) live in the raid's `RaidDef`.
 */
import { ticks } from '../config';

export const RAID_TUNING = {
  /** The human returns to the entrance this long after falling (while lives last). */
  respawnDelayTicks: ticks(1.5),
  /** A wave is announced this long before its enemies appear (the spawn spots are shown). */
  spawnWarnTicks: ticks(1.5),
  /** A spot that stays blocked (a flame, a generator, a player) this long is used anyway or shifted to the nearest floor. */
  spawnRetryTicks: ticks(3),
  /** Spawn protection of a freshly appeared enemy (it cannot be one-shot by a blast that is already burning). */
  enemyAppearProtectTicks: 30,
  /** A destroyed barrel explodes after this delay (so a row of barrels chains tile by tile, readable). */
  barrelFuseTicks: 6,
  /** Reach of a barrel blast: the plus, this many tiles per arm, stopped by walls and crates. */
  barrelReach: 1,
  /** How long barrel flames burn. */
  barrelFlameTicks: 30,
  /** A shipment is never launched with less telegraph than this (1.25 s), validated on every raid. */
  minShipmentWarnTicks: ticks(1.25),
  /** A shipment that reached the end of its belt rests this long, then is gone. */
  shipmentRestTicks: ticks(0.7),
  /** Every belt tile is within this many steps of floor that is not a belt (a shipment can always be sidestepped). */
  maxDodgeSteps: 2,
  /** Game rule: how many health segments one heal bonus gives. */
  healBonus: 1,
  /** Stars: completed = 1; no life lost +1; within par +1; a star token room +1 (capped at 3). */
  maxStars: 3,
  /** The countdown before a raid starts. */
  countdownTicks: ticks(1.5),
} as const;
