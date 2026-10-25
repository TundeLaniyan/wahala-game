/**
 * Large-board limits (City Rumble: 41 x 31 tiles, up to 32 competitors).
 *
 * On a standard 15 x 11 board every bot reasons about the whole arena and every rival; nothing here
 * applies there, so the standard 2-4 player game is unchanged bit for bit. On a large board each bot
 * reasons about a LOCAL WINDOW around itself:
 *
 * - only objects inside the window can trigger a danger-map rebuild / reaction re-plan;
 * - the expensive rival simulations (sealing, trapping, vulnerability) consider only the nearest few
 *   rivals inside the window;
 * - the time-expanded search is capped to fewer step slots (the long-range direction comes from the
 *   cheap whole-board hunt and safe-zone fields instead);
 * - every think has a deterministic work budget (counted danger builds + searches, never wall-clock),
 *   after which optional analyses are skipped conservatively.
 */
import type { AiTier } from './profiles';
import type { Board } from './board';

/** Boards with more tiles than this use the large-board limits (standard boards have 165). */
export const LARGE_BOARD_TILES = 400;

export const isLargeBoard = (board: Board): boolean => board.size > LARGE_BOARD_TILES;

/** Half-size (Chebyshev, tiles) of the window whose changes make a bot rebuild its danger map. */
export const WATCH_RADIUS = 11;
/** Generators further out than this cannot reach the watch window except through chains of others. */
export const GEN_WATCH_RADIUS = WATCH_RADIUS + 8;
/** Rivals within this Manhattan distance are "near" (candidates for rival simulations). */
export const NEAR_RADIUS = 12;
/** At most this many near rivals are simulated (nearest first). */
export const NEAR_MAX = 5;
/** Step slots of the main time-expanded search (standard: up to 40). */
export const LARGE_MAX_SLOTS = 18;
/** Step slots of a full rival-escape analysis on a large board. */
export const LARGE_RIVAL_SLOTS = 14;

/**
 * Work units (danger-map builds + time-expanded searches) one think may spend on a large board before
 * optional analyses (extra placement checks, sealing / vulnerability checks) are skipped.
 */
export const LARGE_WORK_BUDGET: Readonly<Record<AiTier, number>> = { easy: 8, medium: 14, hard: 26 };

/** Full rival-escape simulations per think on a large board (standard: the profile's 0 / 2 / 8). */
export const LARGE_RIVAL_SIMS: Readonly<Record<AiTier, number>> = { easy: 0, medium: 2, hard: 4 };

/** Minimum ticks between two full re-plans on a large board (standard boards use the profile only). */
export const LARGE_MIN_THINK: Readonly<Record<AiTier, number>> = { easy: 20, medium: 14, hard: 6 };

/**
 * Routine (non-urgent) re-plans allowed per tick across ALL bots of a large match. Urgent re-plans
 * (no plan, knocked off the plan, a lethal step vetoed) are never deferred.
 */
export const LARGE_THINKS_PER_TICK = 4;

/** Large boards: with this many rivals or fewer left, every placement's escape is verified. */
export const LARGE_CAREFUL_RIVALS = 3;
