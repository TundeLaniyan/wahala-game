/**
 * The Training Academy controls legend (V2: the stick plus exactly two buttons, A and B). Keyboard keys and
 * gamepad buttons are read from the real binding tables in `src/input`, so the legend and the lesson hints
 * cannot drift from what the game actually listens to. Touch entries describe the two on-screen buttons.
 *
 * Action names looked up: `place` (A), `special` (B tap) and `detonate` (B hold). If the input layer binds
 * no key to one of them yet, the row says so instead of teaching a wrong key.
 */
import { ACTION_BUTTONS, ACTION_KEYS, MOVE_KEYS, NAV_KEYS } from '../input';
import type { NavCommand } from '../input';
import type { ControlId } from '../tutorial';

export type LegendDevice = 'keyboard' | 'gamepad' | 'touch';

export interface LegendRow {
  id: ControlId;
  label: string;
  keyboard: string[];
  gamepad: string[];
  touch: string;
}

const KEY_NAMES: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Esc',
  ShiftLeft: 'Left Shift',
};

/** "KeyE" -> "E", "ArrowUp" -> "↑" ... */
export function keyName(code: string): string {
  return KEY_NAMES[code] ?? code.replace(/^Key/, '');
}

/** Standard gamepad mapping names. */
const PAD_NAMES: Record<number, string> = { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 9: 'Start' };

/** Keys bound to an input action (by name, so new V2 actions are found as soon as they are bound). */
export const keysFor = (action: string): string[] =>
  Object.entries(ACTION_KEYS)
    .filter(([, a]) => (a as string) === action)
    .map(([code]) => keyName(code));

export const navKeysFor = (command: NavCommand): string[] =>
  Object.entries(NAV_KEYS)
    .filter(([, c]) => c === command)
    .map(([code]) => keyName(code));

export const padFor = (action: string): string[] =>
  Object.entries(ACTION_BUTTONS)
    .filter(([, a]) => (a as string) === action)
    .map(([i]) => PAD_NAMES[Number(i)] ?? `Button ${i}`);

/** The arrow keys and the letter keys, each in their usual on-keyboard order (← ↑ ↓ →, W A S D). */
const moveKeys = (): string[] => {
  const pick = (prefix: string, order: string[]): string =>
    order
      .map((dir) => Object.entries(MOVE_KEYS).find(([code, d]) => d === dir && code.startsWith(prefix))?.[0])
      .filter((c): c is string => !!c)
      .map(keyName)
      .join('');
  return [pick('Arrow', ['left', 'up', 'down', 'right']), pick('Key', ['up', 'left', 'down', 'right'])];
};

export function legendRows(): Record<ControlId, LegendRow> {
  return {
    move: {
      id: 'move',
      label: 'Move',
      keyboard: moveKeys(),
      gamepad: ['D-pad', 'left stick'],
      touch:
        'Floating stick: put your thumb down anywhere in the lower-left area of the screen and slide it up, down, left or right. Keep holding to keep walking; lift to stop.',
    },
    place: {
      id: 'place',
      label: 'A: place a generator',
      keyboard: keysFor('place'),
      gamepad: padFor('place'),
      touch: 'Button A (bottom right): drops a generator on your tile.',
    },
    special: {
      id: 'special',
      label: 'B tap: hit / vehicle',
      keyboard: keysFor('special'),
      gamepad: padFor('special'),
      touch:
        'Button B, tap: hits a rival next to you; with nobody next to you and a Vehicle Voucher, calls in your vehicle.',
    },
    detonate: {
      id: 'detonate',
      label: 'B hold: remote detonate',
      keyboard: keysFor('detonate'),
      gamepad: padFor('detonate'),
      touch: 'Button B, press and hold: sets off your remote generators (with the Remote Starter).',
    },
    pause: {
      id: 'pause',
      label: 'Pause',
      keyboard: [...navKeysFor('pause'), ...navKeysFor('cancel')],
      gamepad: ['Start'],
      touch: 'The II button at the top of the screen.',
    },
    camera: {
      id: 'camera',
      label: 'Camera: follow / whole city',
      keyboard: ['O'],
      gamepad: [],
      touch: 'The camera button at the top of the screen (City Rumble matches).',
    },
  };
}
