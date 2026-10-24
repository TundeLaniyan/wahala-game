/**
 * The How to Play controls legend. Keyboard keys and gamepad buttons are read from the real binding
 * tables in `src/input`, so the legend cannot drift from what the game actually listens to. Touch
 * entries describe the on-screen controls exactly as `TouchControls` / `EntryPanel` draw them.
 */
import { ACTION_BUTTONS, ACTION_KEYS, MOVE_KEYS, NAV_KEYS } from '../input';
import type { ActionName, NavCommand } from '../input';
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

export const keysFor = (action: ActionName): string[] =>
  Object.entries(ACTION_KEYS)
    .filter(([, a]) => a === action)
    .map(([code]) => keyName(code));

export const navKeysFor = (command: NavCommand): string[] =>
  Object.entries(NAV_KEYS)
    .filter(([, c]) => c === command)
    .map(([code]) => keyName(code));

export const padFor = (action: ActionName): string[] =>
  Object.entries(ACTION_BUTTONS)
    .filter(([, a]) => a === action)
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
        'Floating thumbstick: put your thumb down anywhere in the lower-left of the screen and slide it up, down, left or right. Each slide is one tile; keep holding to keep walking; lift to stop.',
    },
    place: {
      id: 'place',
      label: 'Drop a generator',
      keyboard: keysFor('place'),
      gamepad: padFor('place'),
      touch: 'The big GENERATOR button, bottom right.',
    },
    action: {
      id: 'action',
      label: 'Carry / drop / punch / throw',
      keyboard: keysFor('action'),
      gamepad: padFor('action'),
      touch: 'The blue CARRY / PUNCH / DROP / THROW button. It appears once you have Grip or Gloves.',
    },
    skill: {
      id: 'skill',
      label: 'Skill (push / daze / shove)',
      keyboard: keysFor('skill'),
      gamepad: padFor('skill'),
      touch: 'The purple PUSH / DAZE / SHOVE button next to GENERATOR. It dims while recharging.',
    },
    detonate: {
      id: 'detonate',
      label: 'Remote: set off',
      keyboard: keysFor('detonate'),
      gamepad: padFor('detonate'),
      touch: 'The pink BOOM! button. It appears once you have the Remote Starter.',
    },
    vehicle: {
      id: 'vehicle',
      label: 'Call your vehicle',
      keyboard: keysFor('vehicle'),
      gamepad: padFor('vehicle'),
      touch:
        "The pulsing green button with the voucher and your vehicle's name. It appears while you hold a voucher.",
    },
    entryChoose: {
      id: 'entryChoose',
      label: 'Choose entrance / turn',
      keyboard: [...moveKeys(), 'or click an arrow'],
      gamepad: ['D-pad', 'left stick'],
      touch:
        'Tap a glowing arrow on the border (or a turn marker) to preview its route, or flick the thumbstick to step between them.',
    },
    entryConfirm: {
      id: 'entryConfirm',
      label: 'Confirm / launch',
      keyboard: [...navKeysFor('confirm'), ...keysFor('vehicle')],
      gamepad: [...padFor('place'), ...padFor('vehicle')],
      touch: "Tap the same arrow again, or press LAUNCH (NEXT for the Keke's entrance).",
    },
    entryBack: {
      id: 'entryBack',
      label: 'Back / cancel',
      keyboard: navKeysFor('cancel'),
      gamepad: padFor('skill'),
      touch: 'The BACK button under the instructions. Cancelling keeps your voucher.',
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
