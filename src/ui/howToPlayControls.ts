/**
 * The How to Play controls legend (V2 two-button scheme). Keyboard keys and gamepad buttons are read
 * from the real binding tables in `src/input`, so the legend cannot drift from what the game actually
 * listens to. Touch entries describe the on-screen controls exactly as `TouchControls` draws them.
 *
 * Every device has the same two buttons: A = Generator, B = Special (tap: melee an adjacent rival, else
 * call your vehicle; hold: Remote Detonator). Kick / punch / disarm / pass are contact abilities: walk
 * into a generator. The Training Academy (src/tutorial) names the rows it shows by `ControlId`.
 */
import { ACTION_BUTTONS, ACTION_KEYS, MOVE_KEYS, NAV_KEYS, SPECIAL_HOLD_MS } from '../input';
import type { ActionName, NavCommand } from '../input';
import type { ControlId } from '../tutorial';

export type LegendDevice = 'keyboard' | 'gamepad' | 'touch';

/** Legend ids: the tutorial's control ids plus the V2 rows (`special`, `contact`). */
export type LegendId = ControlId | 'special' | 'contact';

export interface LegendRow {
  id: LegendId;
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

const hold = (keys: string[]): string[] => keys.map((k) => `hold ${k}`);
const HOLD_SECONDS = (SPECIAL_HOLD_MS / 1000).toFixed(1);

/** The order the V2 legend lists its rows in (How to Play shows the ones a chapter asks for). */
export const LEGEND_ORDER: readonly LegendId[] = [
  'move',
  'place',
  'special',
  'detonate',
  'contact',
  'pause',
  'camera',
];

export function legendRows(): Record<LegendId, LegendRow> {
  const special: LegendRow = {
    id: 'special',
    label: 'B: Special (melee / vehicle)',
    keyboard: keysFor('special'),
    gamepad: padFor('special'),
    touch:
      'The B button above GENERATOR. Next to a rival it strikes with your skill (PUSH / DAZE / SHOVE); holding a voucher it calls your vehicle. Its label shows what it will do.',
  };
  const contact: LegendRow = {
    id: 'contact',
    label: 'Kick / punch / disarm / pass',
    keyboard: ['walk into a generator'],
    gamepad: ['walk into a generator'],
    touch:
      'No button: walk into a generator with Boots (kick), Gloves (punch), Kill Switch (disarm) or Generator Pass (walk through). The icon by your items shows which one you carry.',
  };
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
      label: 'A: Drop a generator',
      keyboard: keysFor('place'),
      gamepad: padFor('place'),
      touch: 'The big GENERATOR button (A), bottom right.',
    },
    special,
    detonate: {
      id: 'detonate',
      label: 'Hold B: set off your remote',
      keyboard: hold(keysFor('special')),
      gamepad: hold(padFor('special')),
      touch: `Hold B for ${HOLD_SECONDS} s (the ring fills, it reads HOLD: BOOM!) once you have the Remote Starter and a remote generator down. A quick tap is still your special.`,
    },
    contact,
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
