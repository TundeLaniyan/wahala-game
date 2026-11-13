/**
 * The Sudden Death TEST match (decisions SD-T1..SD-T7): a temporary local playtest tool, offered from the main menu.
 * One human and three bots on a standard arena start straight into the sudden-death round, so the closing ring and
 * the travelling blasts can be played and judged in about a minute instead of after a full match clock. It is ordinary
 * sim data: the ruleset is Last Player Standing, the extra rules sit behind `config.suddenDeath.lab` (absent in every
 * other match), and nothing here is read by Classic, City Rumble, the campaign or online play.
 *
 * To remove: delete this file, `suddenDeath.lab` (config.ts), `systems/suddenDeathCollapse.ts`, `systems/suddenDeathFront.ts`,
 * their three call sites in `systems/suddenDeath.ts` / `state.ts`, the render view and the menu entry.
 */
import { ticks } from './config';
import type { DeepPartial, GameConfig } from './config';
import type { MatchSettings } from './types';

/** The arena of the test match (a standard 15 x 11 board). */
export const SUDDEN_DEATH_TEST_ARENA = 'danfoBusPark';
/** One human plus exactly three bots. */
export const SUDDEN_DEATH_TEST_PLAYERS = 4;

export const SUDDEN_DEATH_TEST_SETTINGS: Partial<MatchSettings> = {
  game: 'survival',
  mode: 'classic', // the ordinary closing clock stays off: the collapse is scheduled by the round (suddenDeathCollapse.ts)
  durationSec: null,
  friendlyFire: false,
  crowdThrows: false,
};

export const SUDDEN_DEATH_TEST_CONFIG: DeepPartial<GameConfig> = {
  // a long clock the round never reaches (so no endgame trap wave or timeout can interfere)
  match: { durationTicks: ticks(600) },
  crush: {
    warnTicks: ticks(1.8), // every closing tile is marked this long before it can kill
    keepCore: { w: 7, h: 5 }, // the middle of the 15 x 11 board never closes: the contenders' area
  },
  suddenDeath: {
    transitionTicks: ticks(3),
    // the ring is fully closed 30 s into the countdown; the blasts come after it, then quickly (the final one is shield-proof)
    blastDelayTicks: [ticks(36), ticks(12)],
    repeatBlastTicks: ticks(12),
    lab: { collapseTicks: ticks(30), frontTicksPerRing: 14 },
  },
};
