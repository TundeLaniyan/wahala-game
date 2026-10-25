import type { Dir } from '../sim';

/**
 * V2 two-button controls. Every device maps to the same two buttons:
 *  - `place`   = button A (Generator);
 *  - `special` = button B: a tap is the context special (melee / vehicle, `Intent.special`); HOLDING it
 *                while a remote generator is live is the Remote Detonator (`Intent.detonate`). The tap /
 *                hold split is decided once, in `InputManager` (see `specialHold.ts`).
 */
export type ActionName = 'place' | 'special';

/**
 * Menu-style commands. `cancel` (Esc) also toggles pause when no selector is open; `back` (gamepad B) only
 * steps back inside a (tutorial) vehicle selector because B is also the special button.
 */
export type NavCommand = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'back' | 'pause';

export interface InputDevice {
  /** Direction currently held, or null. */
  readonly held: Dir | null;
}

export type InputSourceName = 'keyboard' | 'touch' | 'gamepad';
