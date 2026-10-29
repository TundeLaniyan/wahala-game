/**
 * Pure logic behind DifficultyPicker.tsx (testable without React): level names and one-line descriptions,
 * tap-to-cycle, the "all bots" preset and the settings patches the picker sends.
 */
import { DIFFICULTIES } from '../sim';
import type { Difficulty } from '../sim';
import type { GameSettings } from '../app/settings';
import { MIXED_SPREAD } from '../app/names';

/** Words for the two ends of the scale, shown under the slider. */
export const SCALE_ENDS = { low: 'Very easy', high: 'Extremely hard' } as const;

export const LEVEL_COUNT = DIFFICULTIES.length;

/** Position of a level on the scale (0 = easiest). */
export const levelIndex = (d: Difficulty): number => DIFFICULTIES.indexOf(d);

/** The level at a scale position (clamped, so a slider value can never produce an unknown level). */
export const levelAt = (i: number): Difficulty =>
  DIFFICULTIES[Math.max(0, Math.min(DIFFICULTIES.length - 1, Math.round(Number.isFinite(i) ? i : 0)))]!;

/** The easiest and hardest level a mixed roster centred on `d` can contain (same spread as the match uses). */
export function mixedRange(d: Difficulty): { lo: Difficulty; hi: Difficulty } {
  const at = levelIndex(d);
  return { lo: levelAt(at + Math.min(...MIXED_SPREAD)), hi: levelAt(at + Math.max(...MIXED_SPREAD)) };
}

export const LEVEL_LABEL: Readonly<Record<Difficulty, string>> = {
  rookie: 'Rookie',
  beginner: 'Beginner',
  casual: 'Casual',
  standard: 'Standard',
  skilled: 'Skilled',
  expert: 'Expert',
  nightmare: 'Nightmare',
};

/** One line per level: what a player will notice about it (matches ai/profiles.ts). */
export const LEVEL_HINT: Readonly<Record<Difficulty, string>> = {
  rookie: 'First match: slow, hesitant, never boxes you in',
  beginner: 'Still learning: careless, rarely hunts you',
  casual: 'Plays the board, reacts late, no traps',
  standard: 'Hunts you with sensible escapes and basic traps',
  skilled: 'Quick, reads chain reactions, traps your way out',
  expert: 'Patient and hard to corner; strategic vehicles',
  nightmare: 'Expert with no slips - same rules, no cheating',
};

/** The next level when a slot is tapped (wraps from Nightmare back to Rookie). */
export function cycleLevel(d: Difficulty, step = 1): Difficulty {
  const n = DIFFICULTIES.length;
  return DIFFICULTIES[(((DIFFICULTIES.indexOf(d) + step) % n) + n) % n]!;
}

/** Bot slots shown for Classic Battle (competitors minus the human). */
export const botSlots = (s: Pick<GameSettings, 'competitors'>): number => s.competitors - 1;

/** The level of Classic bot slot `i` (0-based). */
export const slotLevel = (s: Pick<GameSettings, 'botDifficulties' | 'difficulty'>, i: number): Difficulty =>
  s.botDifficulties[i] ?? s.difficulty;

/** "All bots": one level everywhere (also the City Rumble preset). */
export function allBotsPatch(d: Difficulty): Partial<GameSettings> {
  return { difficulty: d, botDifficulties: [d, d, d] };
}

/** One Classic bot slot changes; the other slots keep their levels. */
export function slotPatch(s: Pick<GameSettings, 'botDifficulties' | 'difficulty'>, i: number, d: Difficulty): Partial<GameSettings> {
  const next = [0, 1, 2].map((k) => slotLevel(s, k));
  next[i] = d;
  return { botDifficulties: next };
}

/** The level shared by every shown slot, or null when they differ ("mixed"). */
export function sharedLevel(s: Pick<GameSettings, 'botDifficulties' | 'difficulty' | 'competitors'>): Difficulty | null {
  const first = slotLevel(s, 0);
  for (let i = 1; i < botSlots(s); i++) if (slotLevel(s, i) !== first) return null;
  return first;
}
