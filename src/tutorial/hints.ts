/**
 * Device-specific wording of a task instruction. Instructions use tokens (`{A}`, `{B}`, `{holdB}`,
 * `{move}`) that are filled in from the real control bindings the UI reads at runtime (the How to Play
 * legend, which reads the input binding tables), so a keyboard player is told the actual key, a gamepad
 * player the pad button and a touch player one of the TWO on-screen buttons, A or B. Pure.
 */
import type { ControlId } from './types';

export type HintDevice = 'keyboard' | 'gamepad' | 'touch';

/** The parts of a legend row the hints need. */
export interface HintRow {
  keyboard: readonly string[];
  gamepad: readonly string[];
}

export type HintRows = Partial<Record<ControlId, HintRow>>;

/** On-screen names of the two touch buttons (the V2 contract: exactly A and B) and the stick. */
export const TOUCH_WORDS = {
  A: 'the A button',
  B: 'the B button',
  holdB: 'the B button (press and hold)',
  move: 'Put your thumb down anywhere in the lower-left area of the screen and slide it.',
} as const;

const keys = (list: readonly string[] | undefined): string =>
  (list ?? []).filter((k) => !k.startsWith('or ')).join(' or ');

function word(token: 'A' | 'B' | 'holdB' | 'move', rows: HintRows, device: HintDevice): string {
  if (device === 'touch') return TOUCH_WORDS[token];
  const pick = (id: ControlId) => (device === 'keyboard' ? rows[id]?.keyboard : rows[id]?.gamepad);
  switch (token) {
    case 'A': {
      const k = keys(pick('place'));
      return device === 'keyboard' ? (k ? `${k} (button A)` : 'button A') : k ? `pad ${k}` : 'button A';
    }
    case 'B': {
      const k = keys(pick('special'));
      return device === 'keyboard' ? (k ? `${k} (button B)` : 'button B') : k ? `pad ${k}` : 'button B';
    }
    case 'holdB': {
      const k = keys(pick('detonate')) || keys(pick('special'));
      return k ? `${k} (hold button B)` : 'button B (hold)';
    }
    case 'move': {
      const k = keys(pick('move'));
      return device === 'keyboard' ? `Use ${k || 'the arrow keys'}.` : `Use ${k || 'the D-pad'}.`;
    }
  }
}

/** Fills the tokens of an instruction for one device. */
export function resolveHint(text: string, rows: HintRows, device: HintDevice): string {
  return text
    .replace(/\{(A|B|holdB|move)\}/g, (_m, t: 'A' | 'B' | 'holdB' | 'move') => word(t, rows, device))
    .trim();
}
