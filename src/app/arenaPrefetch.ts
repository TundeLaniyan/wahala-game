/**
 * Early arena prefetch (decision FU2-7, docs/MOBILE_PERFORMANCE.md). On-demand model loading keeps the menu light, but it
 * moved the arena's ~7 MB to the Start tap. While the player is on the arena / fighter / (Quick Start's) Choose How to Play
 * screens, the files of the ONE arena the next Start would use are warmed into the browser cache at low priority; nothing
 * else is ever fetched ahead, and the choice of arena is followed: a different arena cancels the old warm-up and starts the
 * new one, leaving the flow cancels it. The Ready screen's own decoded prefetch (session.ts) is unchanged.
 *
 * It never runs when the player or the device asked to save data: the browser's own Save-Data (`navigator.connection.saveData`,
 * which Data Saver Auto follows), the saved Data Saver set to On (the same switch as the Home shortcut, so the one setting a
 * player sets also holds back downloads they did not ask for yet) or a 2G connection. `?noprefetch` switches it off for A/B
 * measurement (scripts/arena-load-measure.mjs). Pure planner here; `session.ts` owns the effects.
 */
import { dataSaverActive } from './settings';
import type { GameSettings } from './settings';
import { matchArenaId } from './names';
import { QUICK_MATCH_ARENA_ID } from './quickMatch';
import type { MenuScreen } from './menu';

/** The menu screens on which the arena the player is heading for is known well enough to warm its files. */
export const PREFETCH_SCREENS: readonly MenuScreen[] = ['setup', 'fighter'];

export interface PrefetchEnv {
  /** `navigator.connection` (Chrome / Android) or undefined. */
  connection?: { saveData?: boolean; effectiveType?: string };
  /** `?noprefetch`. */
  disabled?: boolean;
  /** `navigator.onLine`. */
  online?: boolean;
}

/** Why nothing may be warmed now, or null. */
export function prefetchBlocked(s: GameSettings, env: PrefetchEnv): string | null {
  if (env.disabled) return 'noprefetch';
  if (env.online === false) return 'offline';
  if (env.connection?.saveData === true) return 'save-data';
  if (dataSaverActive(s.dataSaver, { connection: env.connection })) return 'data-saver';
  if (env.connection?.effectiveType === 'slow-2g' || env.connection?.effectiveType === '2g') return '2g';
  return null;
}

/**
 * The arena whose files to warm for this menu screen and settings: an arena id; `null` = warm nothing (cancel what runs);
 * `undefined` = leave things as they are (the Ready screen, where the decoded prefetch takes over and an unfinished
 * warm-up keeps feeding it). Setup and Fighter: the arena the next Start plays. Choose How to Play: only the Quick Start's
 * fixed arena, and only when `quickOnPlay` (the one choice with no Ready screen after it).
 */
export function prefetchTarget(
  screen: MenuScreen,
  s: GameSettings,
  env: PrefetchEnv,
  quickOnPlay: boolean,
): string | null | undefined {
  if (prefetchBlocked(s, env)) return null;
  if (screen === 'ready') return undefined;
  if (PREFETCH_SCREENS.includes(screen)) return matchArenaId(s);
  if (screen === 'play' && quickOnPlay) return QUICK_MATCH_ARENA_ID;
  return null;
}

/** Follows the target: one warm-up at a time, replaced when the target changes, cancelled when it becomes null. */
export class ArenaWarmer {
  private arena: string | null = null;
  private handle: { cancel(): void } | null = null;

  constructor(private readonly start: (arenaId: string) => { cancel(): void } | null) {}

  /** The arena being warmed, or null. */
  get current(): string | null {
    return this.arena;
  }

  /** Applies a new target. Returns what happened, for tests and the debug handle. */
  follow(target: string | null): 'started' | 'replaced' | 'cancelled' | 'same' | 'idle' {
    if (target === this.arena) return target === null ? 'idle' : 'same';
    this.handle?.cancel();
    this.handle = null;
    const had = this.arena !== null;
    this.arena = target;
    if (target === null) return 'cancelled';
    this.handle = this.start(target);
    return had ? 'replaced' : 'started';
  }
}
