import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACTION_BUTTONS, ACTION_KEYS } from '../../src/input';
import { LESSONS, TOUCH_WORDS, resolveHint } from '../../src/tutorial';
import type { HintRows } from '../../src/tutorial';
import { LEGEND_ORDER, keyName, keysFor, legendRows, navKeysFor, padFor } from '../../src/ui/howToPlayControls';

const rows = legendRows();
const bound = (name: string) =>
  Object.entries(ACTION_KEYS)
    .filter(([, a]) => (a as string) === name)
    .map(([code]) => keyName(code));

/** Every task instruction of every lesson, worded for one device. */
const instructions = (device: 'keyboard' | 'gamepad' | 'touch', r: HintRows = rows) =>
  LESSONS.flatMap((l) =>
    l.practice.tasks.map((t) => ({ id: `${l.id}/${t.id}`, text: resolveHint(t.instruction, r, device) })),
  );

/** The V1 buttons that no longer exist for a human (V2: exactly two buttons, A and B). */
const LEGACY =
  /\b(CARRY|SKILL|DISARM button|VEHICLE button|BOOM|PUSH button|DAZE button|SHOVE button|GENERATOR button|action button)\b/i;

describe('Academy controls legend (V2: the stick and two buttons)', () => {
  it('teaches the real two-button keyboard and gamepad bindings, read from the binding tables', () => {
    expect(rows.place.keyboard).toEqual(bound('place'));
    expect(rows.place.keyboard).toEqual(['Space', 'J']);
    expect(rows.special.keyboard).toEqual(bound('special'));
    expect(rows.special.keyboard).toEqual(['K', 'E', 'F', 'L', 'Left Shift']);
    expect(rows.detonate.keyboard).toEqual([...bound('place'), ...bound('special')].map((k) => `hold ${k}`));
    expect(rows.move.keyboard).toEqual(['←↑↓→', 'WASD']);
    expect(rows.pause.keyboard).toEqual(['P', 'Esc']);
    expect(rows.place.gamepad).toEqual(['A']);
    expect(rows.special.gamepad).toEqual(['B', 'X']);
    expect(rows.detonate.gamepad).toEqual(['hold A', 'hold B', 'hold X']);
    // contact abilities have no button on any device
    expect(rows.contact.keyboard).toEqual(['walk into a generator']);
    // exactly two actions exist on every device
    expect(new Set(Object.values(ACTION_KEYS))).toEqual(new Set(['place', 'special']));
    expect(new Set(Object.values(ACTION_BUTTONS))).toEqual(new Set(['place', 'special']));
    expect(keysFor('place')).toEqual(['Space', 'J']);
    expect(padFor('special')).toEqual(['B', 'X']);
    expect(navKeysFor('confirm')).toEqual(['Enter', 'Space']);
  });

  it('the touch rows describe exactly the two on-screen buttons and the floating stick', () => {
    const touchSrc = readFileSync('src/ui/TouchControls.tsx', 'utf8');
    expect(touchSrc).toContain('GENERATOR');
    expect(touchSrc).toContain('HOLD: BOOM!');
    expect(touchSrc).not.toMatch(/'CARRY'|'DROP'|'DISARM'/);
    expect(rows.place.touch).toContain('GENERATOR');
    expect(rows.detonate.touch).toContain('HOLD: BOOM!');
    expect(rows.special.touch).toMatch(/PUSH \/ DAZE \/ SHOVE/);
    expect(rows.contact.touch).toMatch(/No button/);
    expect(rows.move.touch).toMatch(/anywhere in the lower-left/);
    for (const id of LEGEND_ORDER) expect(rows[id].touch.length).toBeGreaterThan(10);
  });

  it('every control a lesson asks for has a legend row', () => {
    for (const l of LESSONS) {
      for (const id of [...l.controls, ...l.practice.tasks.flatMap((t) => t.controls ?? [])]) {
        expect(rows[id], `${l.id}: ${id}`).toBeDefined();
        expect(rows[id].touch.length).toBeGreaterThan(10);
      }
    }
  });
});

describe('task instructions per device', () => {
  it('mobile wording names only the two buttons (A / B) and the stick: no legacy buttons, no keys', () => {
    for (const { id, text } of instructions('touch')) {
      expect(text, id).not.toMatch(LEGACY);
      expect(text, id).not.toMatch(/\{|\}/); // every token filled in
      expect(text, id).not.toMatch(/\b(Space|key|keys|pad)\b/);
      const buttons = text.match(/the [A-Z] button/g) ?? [];
      for (const b of buttons) expect(['the A button', 'the B button'], id).toContain(b);
    }
    // the button tasks really say which button
    const all = instructions('touch');
    expect(all.find((i) => i.id === 'place/place')!.text).toBe(
      'Press the A button to place a generator on the marker.',
    );
    expect(all.find((i) => i.id === 'melee/hit')!.text).toBe('Tap the B button to hit the dummy.');
    expect(all.find((i) => i.id === 'remote/hold')!.text).toBe(
      `Now press and HOLD ${TOUCH_WORDS.holdB} to set it off.`,
    );
    expect(all.find((i) => i.id === 'move/marker-1')!.text).toMatch(
      /thumb down anywhere in the lower-left area/,
    );
  });

  it('keyboard wording uses the keys the game actually listens to', () => {
    const fake: HintRows = {
      place: { keyboard: ['Space'], gamepad: ['A'] },
      special: { keyboard: ['K'], gamepad: ['B'] },
      detonate: { keyboard: [], gamepad: [] },
      move: { keyboard: ['←↑↓→', 'WASD'], gamepad: ['D-pad'] },
    };
    const all = instructions('keyboard', fake);
    expect(all.find((i) => i.id === 'place/place')!.text).toBe(
      'Press Space (button A) to place a generator on the marker.',
    );
    expect(all.find((i) => i.id === 'melee/hit')!.text).toBe('Tap K (button B) to hit the dummy.');
    // B hold falls back to the B key when no separate detonate key exists
    expect(all.find((i) => i.id === 'remote/hold')!.text).toBe(
      'Now press and HOLD K (hold button B) to set it off.',
    );
    expect(all.find((i) => i.id === 'move/marker-1')!.text).toBe(
      'Walk to the glowing marker. Use ←↑↓→ or WASD.',
    );
    expect(instructions('gamepad', fake).find((i) => i.id === 'melee/hit')!.text).toBe(
      'Tap pad B to hit the dummy.',
    );
    // the live bindings: whatever key is bound to "place" is the one named
    const live = instructions('keyboard').find((i) => i.id === 'place/place')!.text;
    expect(live).toContain(rows.place.keyboard[0]!);
  });
});
