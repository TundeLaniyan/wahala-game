/**
 * The BOSS RECIPE (decisions BX1-BX8, docs/CAMPAIGN_SECTOR_AI.md "Bosses"): the data a campaign boss fight is made of,
 * shared by the six district bosses and reusable by any new boss without engine code. A boss mission is
 *
 *   phase objective (the district's verb, every node broken by BLASTS)
 *     -> the boss is EXPOSED: his shield is down and he walks to his ANCHOR (his post, or the node broken last) to
 *        restore it, which takes `exposeSec[level]` (the countdown waits up to `walkGraceSec` while he walks); standing
 *        on it he is committed (rooted), so a generator laid beside him lands;
 *        his escorts are called back (`call`) and on Hard they body-block the way (`escortCover`)
 *     -> a BLAST (or any lethal event: a vehicle, a train) that reaches him costs him one hit: he reels, re-shields and
 *        the next phase starts; the last hit eliminates him (`hits`, one per phase)
 *     -> a window that runs out re-shields him and the SAME phase is rebuilt; `maxExposures` windows in all, then he
 *        gets away (the mission is lost).
 *
 * Melee never takes a hit: a punch that lands on the restoring boss INTERRUPTS the restore (the window gains
 * `interruptSec`, at most `interruptMax` times per window); a shove can push him off his anchor. Generators decide it.
 * Pure data and pure functions; the runtime (`runtime.ts`) and lethality (`rules.ts`) read it.
 */
import type { CampaignLevel } from '../campaign/levels';
import { ticks } from '../config';
import type { BossBalance } from '../config';
import type { GameState } from '../types';
import type { NpcRole } from './types';

export interface BossRecipe {
  /** Blast hits that defeat the boss: one per exposure window, so one per phase (3). The last one eliminates him. */
  hits: number;
  /** How long a window stays open once a phase's objective is broken, per campaign level (seconds). */
  exposeSec: Readonly<Record<CampaignLevel, number>>;
  /** Windows allowed in all (the hits plus the windows he may survive) before he gets away and the mission is lost. */
  maxExposures: number;
  /** Where the exposed boss restores his shield: his post, or the node the human broke last (he comes to fix it). */
  anchor: 'post' | 'lastBroken';
  /**
   * The window's countdown waits while he walks to his anchor, for at most this long (seconds): the restore time is
   * the same wherever the fight found him, and he is exposed (and blastable) on the way.
   */
  walkGraceSec: number;
  /** He restores from anywhere within this many tiles (Chebyshev) of the anchor: his booth, not one exact tile. */
  restoreRadius: number;
  /** A landed punch on the exposed boss interrupts the restore: the window gains this long ... */
  interruptSec: number;
  /** ... at most this many times per window. */
  interruptMax: number;
  /** After a hit the boss reels (dazed) this long while his shield closes (a readable beat; seconds). */
  reelSec: number;
  /** When a window opens he calls his crew: fallen seats of these roles come back after a telegraphed warning ... */
  callRoles: readonly NpcRole[];
  /** ... at most this many per window, per level. */
  callCount: Readonly<Record<CampaignLevel, number>>;
  /** Escorts body-block the line between the exposed boss and the human on these levels (else they follow him). */
  escortCover: Readonly<Record<CampaignLevel, boolean>>;
  /**
   * The boss balance this fight plays with (decisions BB1-BB6, `config.ts` `BOSS_BALANCE`): his ground while shielded,
   * the readable wind-up of every bot seat's close attack, the generators he may keep down while exposed. Null = none
   * (the fight as decided in BX1-BX8).
   */
  balance: BossBalance | null;
}

/** The six district bosses share these numbers; a boss overrides what makes it different (`MissionDef.recipe`). */
export const DEFAULT_BOSS_RECIPE: BossRecipe = {
  hits: 3,
  exposeSec: { easy: 26, normal: 20, hard: 15 },
  maxExposures: 5,
  anchor: 'post',
  walkGraceSec: 12,
  restoreRadius: 1,
  interruptSec: 1.5,
  interruptMax: 2,
  reelSec: 1.5,
  callRoles: ['escort', 'meleeGuard', 'runner'],
  callCount: { easy: 0, normal: 1, hard: 2 },
  escortCover: { easy: false, normal: false, hard: true },
  balance: null,
};

/** A recipe with a boss's own overrides. */
export function bossRecipe(over: Partial<BossRecipe> = {}): BossRecipe {
  return { ...DEFAULT_BOSS_RECIPE, ...over };
}

/** Everything a recipe means at one campaign level, in ticks (what `MissionTuning.boss` carries). */
export interface BossTuning {
  level: CampaignLevel;
  hits: number;
  exposeTicks: number;
  maxExposures: number;
  anchor: BossRecipe['anchor'];
  walkGraceTicks: number;
  restoreRadius: number;
  interruptTicks: number;
  interruptMax: number;
  reelTicks: number;
  callRoles: NpcRole[];
  callCount: number;
  escortCover: boolean;
  /*
   * The boss balance at this level (decisions BB1-BB6), present only when the recipe names one (so the other bosses'
   * state is exactly as before): BB1 his ground while shielded (Manhattan tiles from his post); BB2 the shortest
   * close-attack wind-up of the mission's bot seats (ticks); BB3 generators the exposed boss may have down at once;
   * BB5 a crew / boss generator the player's blast sets off burns the exposed boss as the player's fire.
   */
  groundTiles?: number;
  meleeWindupTicks?: number;
  exposedGenerators?: number;
  chainCarriesFire?: boolean;
  /** PI8: backup fighters that defend the live relays while the boss is shielded (absent = none: Easy and every other boss). */
  relayGuards?: number;
  relayGuardRadius?: number;
}

export function resolveBossRecipe(r: BossRecipe, level: CampaignLevel): BossTuning {
  return {
    level,
    hits: Math.max(1, Math.floor(r.hits)),
    exposeTicks: ticks(r.exposeSec[level]),
    maxExposures: Math.max(r.hits, r.maxExposures),
    anchor: r.anchor,
    walkGraceTicks: ticks(r.walkGraceSec),
    restoreRadius: Math.max(0, Math.floor(r.restoreRadius)),
    interruptTicks: ticks(r.interruptSec),
    interruptMax: r.interruptMax,
    reelTicks: ticks(r.reelSec),
    callRoles: [...r.callRoles],
    callCount: r.callCount[level],
    escortCover: r.escortCover[level],
    ...(r.balance
      ? {
          groundTiles: r.balance.groundTiles[level],
          meleeWindupTicks: r.balance.meleeWindupTicks[level],
          exposedGenerators: r.balance.exposedGenerators[level],
          chainCarriesFire: r.balance.chainCarriesFire,
          // (nothing is stored at 0, so a level without relay guards keeps its state exactly as it was)
          ...(r.balance.relayGuards[level] > 0
            ? { relayGuards: r.balance.relayGuards[level], relayGuardRadius: r.balance.relayGuardRadius }
            : {}),
        }
      : {}),
  };
}

/**
 * Is the boss restoring: on (or stepping onto) a tile within the recipe's radius of his anchor? A step under way is
 * finished first (movement.ts honours a root only between steps), then he stays.
 */
export function onBossAnchor(
  p: { x: number; y: number; alive: boolean },
  anchor: { x: number; y: number } | null | undefined,
  radius: number,
): boolean {
  return !!anchor && p.alive && Math.max(Math.abs(p.x - anchor.x), Math.abs(p.y - anchor.y)) <= radius;
}

/** The campaign level a match plays at (the tactics layer carries it; the archived pilot replay is Normal). */
export function matchLevel(state: Pick<GameState, 'config'>): CampaignLevel {
  return state.config.campaignTactics?.level ?? 'normal';
}
