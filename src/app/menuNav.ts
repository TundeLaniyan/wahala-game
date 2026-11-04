/**
 * Routes menu-style input (keyboard arrows / Enter / Esc and the gamepad D-pad, A, B, Start) to the menu
 * that is showing, before the match sees it. A menu registers one handler while it is mounted; returning
 * true consumes the command (e.g. Esc closes the pause menu's Settings instead of resuming the match).
 */
import type { NavCommand } from '../input';

export type MenuNavHandler = (command: NavCommand) => boolean;

let handler: MenuNavHandler | null = null;
/** A screen that needs some keys itself (the campaign story player: Enter / Space / arrows advance the lines). */
let screenHandler: MenuNavHandler | null = null;

/** Installs a screen-level handler that sees commands BEFORE the menu's focus navigation. */
export function setScreenNavHandler(h: MenuNavHandler): () => void {
  screenHandler = h;
  return () => {
    if (screenHandler === h) screenHandler = null;
  };
}

/** Installs the active menu's handler; returns the function that removes it (only if still installed). */
export function setMenuNavHandler(h: MenuNavHandler): () => void {
  handler = h;
  return () => {
    if (handler === h) handler = null;
  };
}

/** Offers a command to the active menu; true when the menu used it. */
export function routeMenuNav(command: NavCommand): boolean {
  if (screenHandler?.(command)) return true;
  return handler ? handler(command) : false;
}
