import type { Dir } from '../sim';

/** One-shot actions a human can trigger. */
export type ActionName = 'place' | 'action' | 'skill' | 'detonate' | 'disarm' | 'vehicle';

/** Menu-style commands used by the vehicle-entry selector and pause handling. */
export type NavCommand = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'pause';

export interface InputDevice {
  /** Direction currently held, or null. */
  readonly held: Dir | null;
}

export type InputSourceName = 'keyboard' | 'touch' | 'gamepad';
