/**
 * Main-menu navigation: which menu screen is showing and how Back / Continue move between them. Pure
 * (unit-tested); the UI renders `currentScreen(menu)` and the session's commands apply these functions to
 * `UiState.menu`. The match settings themselves stay in `GameSettings` (every screen edits the real
 * settings directly, so a choice always reaches the next match).
 *
 * New-player flow: home -> mode -> setup -> fighter -> ready -> play. The arena screen is a detour opened
 * from setup or ready and returns there. Any screen opened from Ready to edit one choice returns to Ready
 * on Continue, so changing one decision never restarts the whole setup.
 */

export type MenuScreen = 'home' | 'mode' | 'setup' | 'fighter' | 'arena' | 'ready' | 'settings' | 'academy';

export interface MenuState {
  /** Screens from the home screen (always first) to the one showing (last). */
  readonly stack: readonly MenuScreen[];
}

export const MENU_HOME: MenuState = { stack: ['home'] };

/** The step after each flow screen when it is continued (arena returns to where it was opened from). */
const NEXT: Partial<Record<MenuScreen, MenuScreen>> = {
  mode: 'setup',
  setup: 'fighter',
  fighter: 'ready',
};

/** The numbered steps of the play flow (the step indicator). */
export const FLOW_STEPS: readonly MenuScreen[] = ['mode', 'setup', 'fighter', 'ready'];

export const currentScreen = (m: MenuState): MenuScreen => m.stack[m.stack.length - 1] ?? 'home';

/** A menu at `path` below home (e.g. ['mode', 'setup']). */
export function menuAt(path: readonly MenuScreen[]): MenuState {
  return { stack: ['home', ...path.filter((s) => s !== 'home')] };
}

/** Opens `screen` on top of the current one; a screen already on the stack is returned to instead. */
export function openScreen(m: MenuState, screen: MenuScreen): MenuState {
  if (screen === 'home') return MENU_HOME;
  // inside an edit detour from Ready, only screens above Ready count (so Ready is never lost)
  const ready = m.stack.lastIndexOf('ready');
  const from = ready >= 0 && ready < m.stack.length - 1 ? ready : 0;
  const at = m.stack.indexOf(screen, from);
  if (at >= 0) return { stack: m.stack.slice(0, at + 1) };
  return { stack: [...m.stack, screen] };
}

/**
 * Edit one choice from Ready: `screen` opens on top of Ready (even if it is earlier in the stack), so
 * Continue or Back on it returns to Ready instead of walking the whole setup again.
 */
export function editScreen(m: MenuState, screen: MenuScreen): MenuState {
  if (currentScreen(m) !== 'ready' || screen === 'home') return openScreen(m, screen);
  return { stack: [...m.stack, screen] };
}

/** Back / Close / Cancel: the previous screen (never below home). */
export function back(m: MenuState): MenuState {
  return m.stack.length > 1 ? { stack: m.stack.slice(0, -1) } : MENU_HOME;
}

/**
 * Continue / Confirm on the current screen: the next step of the flow, or straight back to Ready when
 * the screen was opened from Ready to edit one choice. The arena screen always returns to its opener.
 */
export function advance(m: MenuState): MenuState {
  const here = currentScreen(m);
  const below = m.stack.slice(0, -1);
  if (here === 'arena') return back(m);
  if (below.includes('ready')) return openScreen(m, 'ready');
  const next = NEXT[here];
  return next ? openScreen(m, next) : m;
}

/** Sanitises an untrusted menu state (keeps the app usable whatever was patched in). */
export function validMenu(m: MenuState | null | undefined): MenuState {
  const known: readonly MenuScreen[] = ['home', 'mode', 'setup', 'fighter', 'arena', 'ready', 'settings', 'academy'];
  const stack = (m?.stack ?? []).filter((s) => known.includes(s));
  return stack[0] === 'home' ? { stack } : menuAt(stack);
}
