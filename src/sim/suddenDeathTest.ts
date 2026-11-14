/**
 * The Sudden Death TEST match (decisions SD-T1..SD-T7, SD-U1..SD-U7): a temporary local playtest tool, offered from the
 * City Rumble mode screen. One human and exactly two bots on a real City Rumble stage (Ojuelegba Underbridge) start
 * straight into the sudden-death round, so the stage closing in and the travelling blasts can be played and judged in
 * about a minute instead of after a full match clock. It is ordinary sim data: the ruleset is Last Player Standing,
 * the extra rules sit behind `config.suddenDeath.lab` (absent in every other match), and nothing here is read by
 * Classic, the ordinary City Rumble, the campaign or online play.
 *
 * To remove: delete this file, `suddenDeath.lab` (config.ts), `systems/suddenDeathCollapse.ts`, `systems/suddenDeathFront.ts`,
 * their three call sites in `systems/suddenDeath.ts` / `state.ts`, the render view and the menu entry.
 */
import { ticks } from './config';
import type { DeepPartial, GameConfig } from './config';
import type { MatchSettings } from './types';

/**
 * The arena of the test match: the Ojuelegba Underbridge City Rumble stage (45 x 33). It is the smallest Rumble stage,
 * its heart is the open pier court (x 14-30, y 11-21) that the test keeps open as the contenders' area, and the
 * follow camera / whole-stage view are the real Rumble ones (decisions SD-U1, SD-U2).
 */
export const SUDDEN_DEATH_TEST_ARENA = 'rumbleOjuelegba';
/** One human plus exactly two bots. */
export const SUDDEN_DEATH_TEST_PLAYERS = 3;
/** The area that never closes: the pier court, centred on the stage (17 x 11). */
export const SUDDEN_DEATH_TEST_CORE = { w: 17, h: 11 } as const;
/** The whole stage closes in this long after the title card (decision SD-U3). */
export const SUDDEN_DEATH_TEST_COLLAPSE_TICKS = ticks(30);
/** A blast crosses the open area in about this long (decision SD-U5). */
const FRONT_CROSSING_TICKS = ticks(3);
/** Rings from the middle of the open area to its farthest tile (Chebyshev distance). */
const CORE_RINGS = Math.ceil(Math.max(SUDDEN_DEATH_TEST_CORE.w, SUDDEN_DEATH_TEST_CORE.h) / 2);

export const SUDDEN_DEATH_TEST_SETTINGS: Partial<MatchSettings> = {
  game: 'survival',
  mode: 'classic', // the ordinary closing clock stays off: the collapse is scheduled by the round (suddenDeathCollapse.ts)
  durationSec: null,
  friendlyFire: false,
  crowdThrows: false,
  // the stage's traffic, wave and floor-trap hazards would kill off the rules under test: only the ring and the blasts do
  stageHazards: false,
};

export const SUDDEN_DEATH_TEST_CONFIG: DeepPartial<GameConfig> = {
  // a long clock the round never reaches (so no endgame trap wave or timeout can interfere)
  match: { durationTicks: ticks(600) },
  crush: {
    warnTicks: ticks(1.8), // every closing tile is marked this long before it can kill
    keepCore: { w: SUDDEN_DEATH_TEST_CORE.w, h: SUDDEN_DEATH_TEST_CORE.h },
  },
  suddenDeath: {
    transitionTicks: ticks(3),
    // the stage is fully closed 30 s into the countdown; the blasts come after it, then quickly (the final one is shield-proof)
    blastDelayTicks: [ticks(36), ticks(12)],
    repeatBlastTicks: ticks(12),
    lab: {
      collapseTicks: SUDDEN_DEATH_TEST_COLLAPSE_TICKS,
      frontTicksPerRing: Math.ceil(FRONT_CROSSING_TICKS / CORE_RINGS),
    },
  },
};
