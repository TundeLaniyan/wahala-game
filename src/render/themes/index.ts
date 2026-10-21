import { BUS_PARK_THEME } from './busPark';
import { MARKET_THEME } from './market';
import type { ArenaTheme } from './types';

export type { ArenaTheme, DebrisKind, DressContext, Placement } from './types';

/** Visual theme per simulation arena id. */
export const THEMES: Readonly<Record<string, ArenaTheme>> = {
  [BUS_PARK_THEME.id]: BUS_PARK_THEME,
  [MARKET_THEME.id]: MARKET_THEME,
};

/** Theme for an arena; unknown arenas get the bus park look rather than failing. */
export function themeFor(arenaId: string): ArenaTheme {
  return THEMES[arenaId] ?? BUS_PARK_THEME;
}
