/**
 * Quick Match (Choose How to Play, "START HERE"): the safest beginner match the existing Classic Battle rules offer,
 * one human against two Rookie bots on the default standard arena. Pure data (unit-tested): it only sets the real
 * `GameSettings` a Classic match already reads, so the match is an ordinary Classic Battle with no special rules.
 * The player's fighter, audio and control preferences are never touched.
 */
import type { GameSettings } from './settings';

export const QUICK_MATCH_ARENA_ID = 'danfoBusPark';

export const QUICK_MATCH: Pick<
  GameSettings,
  'play' | 'competitors' | 'difficulty' | 'botDifficulties' | 'arenaId' | 'crowdThrows'
> = {
  play: 'classic',
  competitors: 3,
  difficulty: 'rookie',
  botDifficulties: ['rookie', 'rookie', 'rookie'],
  arenaId: QUICK_MATCH_ARENA_ID,
  crowdThrows: false,
};

export const quickMatchPatch = (): Partial<GameSettings> => ({
  ...QUICK_MATCH,
  botDifficulties: [...QUICK_MATCH.botDifficulties],
});
