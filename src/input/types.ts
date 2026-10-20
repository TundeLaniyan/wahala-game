import type { Dir } from '../sim';

/** One-shot actions a human can trigger. */
export type ActionName = 'place' | 'action' | 'skill' | 'detonate' | 'disarm' | 'vehicle';

/**
 * Menu-style commands. `cancel` (Esc) also toggles pause when no selector is open; `back` (gamepad B) only
 * steps back inside the vehicle selector because B is also the skill button.
 */
/** Menu-style commands used by the vehicle-entry selector and pause handling. */
export type NavCommand = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'back' | 'pause';

export interface InputDevice {
  /** Direction currently held, or null. */
  readonly held: Dir | null;
}

export type InputSourceName = 'keyboard' | 'touch' | 'gamepad';
