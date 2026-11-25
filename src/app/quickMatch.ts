/**
 * Quick Start (Home, first and most prominent button): an offline CITY RUMBLE match drawn at random in one tap (founder
 * instruction 2026-11-25, decision QS1; it replaced the fixed 16-fighter Ojuelegba Free-for-All of decision FU2-1). Never a
 * Junction Blast match. One draw (`rollQuickPlan`) decides everything when the button is pressed:
 *   - the stage: one of the seven real City Rumble stages (`RUMBLE_ARENA_IDS`), equal chance;
 *   - the ruleset: Free-for-All or Team Deathmatch, 50 / 50 (teams are split in halves by spawn position: `assignTeams`);
 *   - the roster: 24 fighters (30 %) or 32 (70 %), the human included;
 *   - fixed: the middle bot level (`standard`, shown as "Standard"), the three-minute clock, no mixed roster, no friendly fire.
 * The plan is a pure function of a seed (unit-tested with fixed seeds); `session.ts` draws the seed (`?seed=N` makes it
 * repeatable for tests) and keeps the plan until the match is over, so the loading screen, the match and a retry all use the
 * one draw, and the arena's files are fetched only after the draw, for that stage alone.
 *
 * The player's fighter, audio, controls (movement, touch layout, camera, shake) and graphics-quality preferences are never
 * touched, and neither are their saved match preferences: the values below are TEMPORARY (decision SX11, kept). `session.ts`
 * holds them over the saved settings only until the player is back at the menu, and never writes them to storage
 * (`splitQuickWrite` keeps them out of every save made meanwhile). The regular City Rumble setup is unchanged.
 */
import { RUMBLE_ARENA_IDS, createRng, getArena, nextFloat } from '../sim';
import { RUMBLE_SIZES } from './settings';
import type { GameSettings, RumbleModeSetting } from './settings';

/** Share of Quick Starts with 24 fighters; the rest have 32. */
export const QUICK_SMALL_ROSTER_SHARE = 0.3;
export const QUICK_ROSTERS = [24, 32] as const;
export type QuickRoster = (typeof QUICK_ROSTERS)[number];
/** Share of Quick Starts that are Team Deathmatch; the rest are Free-for-All. */
export const QUICK_TEAM_SHARE = 0.5;
/** The match length in minutes (fixed). */
export const QUICK_MATCH_MINUTES = 3;
/** The bot level (fixed): the middle of the seven, labelled "Standard" in the menus. */
export const QUICK_MATCH_DIFFICULTY = 'standard' as const;

/** Everything one Quick Start draws. */
export interface QuickPlan {
  /** The seed the plan was drawn from (kept for tests and the debug handle). */
  seed: number;
  arenaId: string;
  /** The sim's ruleset id: `deathmatch` is the player-facing Free-for-All. */
  mode: Extract<RumbleModeSetting, 'deathmatch' | 'team'>;
  /** Total fighters including the human (24 or 32 from a real draw; a test override may name any City Rumble size). */
  fighters: GameSettings['rumbleCompetitors'];
}

/** The stages a Quick Start can draw: the real City Rumble stages, in registry order. */
export const quickArenaIds = (): readonly string[] => RUMBLE_ARENA_IDS;

/** Draws a plan. Same seed, same plan; the order of the draws is fixed (stage, ruleset, roster). */
export function rollQuickPlan(seed: number): QuickPlan {
  const rng = createRng(seed);
  const arenas = quickArenaIds();
  const arenaId = arenas[Math.min(arenas.length - 1, Math.floor(nextFloat(rng) * arenas.length))]!;
  const mode = nextFloat(rng) < QUICK_TEAM_SHARE ? 'team' : 'deathmatch';
  const fighters: GameSettings['rumbleCompetitors'] = nextFloat(rng) < QUICK_SMALL_ROSTER_SHARE ? 24 : 32;
  return { seed, arenaId, mode, fighters };
}

/**
 * Test hook (`?debug&quickplan=<stage>:<deathmatch|team>:<fighters>`, e.g. `rumbleOjuelegba:team:8`): the Quick Start plays
 * exactly that plan instead of drawing one, so lifecycle specs (loading, pause, rapid taps) need not run a 32-fighter match
 * on a software renderer. It exists only with `?debug`, never changes what the real draw does, and a malformed value is
 * ignored (null). The real draw is what players get and what the draw tests cover.
 */
export function parseQuickPlanOverride(search: string): QuickPlan | null {
  const q = new URLSearchParams(search);
  const raw = q.get('quickplan');
  if (!q.has('debug') || !raw) return null;
  const [arenaId, mode, n] = raw.split(':');
  const fighters = Number(n) as GameSettings['rumbleCompetitors'];
  if (!arenaId || !quickArenaIds().includes(arenaId)) return null;
  if (mode !== 'deathmatch' && mode !== 'team') return null;
  if (!(RUMBLE_SIZES as readonly number[]).includes(fighters)) return null;
  return { seed: 0, arenaId, mode, fighters };
}

/** The settings keys a Quick Start overrides for its own match only. */
export type QuickKey =
  | 'play'
  | 'rumbleMode'
  | 'rumbleCompetitors'
  | 'rumbleMinutes'
  | 'difficulty'
  | 'rumbleMixed'
  | 'rumbleArenaId'
  | 'friendlyFire';

export const QUICK_MATCH_KEYS: readonly QuickKey[] = [
  'play',
  'rumbleMode',
  'rumbleCompetitors',
  'rumbleMinutes',
  'difficulty',
  'rumbleMixed',
  'rumbleArenaId',
  'friendlyFire',
];

/** The real `GameSettings` an ordinary City Rumble match of this plan reads. */
export const quickMatchPatch = (plan: QuickPlan): Pick<GameSettings, QuickKey> => ({
  play: 'rumble',
  rumbleMode: plan.mode,
  rumbleCompetitors: plan.fighters,
  rumbleMinutes: QUICK_MATCH_MINUTES,
  difficulty: QUICK_MATCH_DIFFICULTY,
  rumbleMixed: false, // every bot at one level, never a spread around it
  rumbleArenaId: plan.arenaId,
  friendlyFire: false,
});

/** The compact launch summary shown on the loading screen: stage, ruleset, roster, bot level. */
export function quickSummary(plan: QuickPlan): string {
  const stage = getArena(plan.arenaId).name.replace(/^WAHALA! /, '');
  const half = plan.fighters / 2;
  return [
    stage,
    plan.mode === 'team' ? 'Team Deathmatch' : 'Free-for-All',
    plan.mode === 'team' ? `${plan.fighters} fighters (${half} v ${half})` : `${plan.fighters} fighters`,
    'Standard (Normal) bots',
  ].join(' · ');
}

/**
 * A settings write made while a Quick Start is on: `live` is what the running game shows (everything asked for), `saved`
 * is what may reach the player's saved preferences (the same without the Quick Start's own keys, so those keep the
 * player's own values; anything else, such as sound or camera, is saved as usual).
 */
export function splitQuickWrite(patch: Partial<GameSettings>): {
  live: Partial<GameSettings>;
  saved: Partial<GameSettings>;
} {
  const saved: Partial<GameSettings> = { ...patch };
  for (const k of QUICK_MATCH_KEYS) delete saved[k];
  return { live: patch, saved };
}
