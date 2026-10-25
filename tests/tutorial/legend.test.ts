import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '../../src/tutorial';
import { ACTION_BUTTONS, ACTION_KEYS } from '../../src/input';
import { LEGEND_ORDER, keysFor, legendRows, navKeysFor, padFor } from '../../src/ui/howToPlayControls';

const rows = legendRows();
const touchSrc = readFileSync('src/ui/TouchControls.tsx', 'utf8');
const hudSrc = readFileSync('src/ui/Hud.tsx', 'utf8');

describe('How to Play controls legend', () => {
  it('teaches the real two-button keyboard and gamepad bindings', () => {
    expect(rows.place.keyboard).toEqual(['Space', 'J']);
    expect(rows.special.keyboard).toEqual(['K', 'E', 'F', 'L', 'Left Shift']);
    expect(rows.detonate.keyboard).toEqual(['hold K', 'hold E', 'hold F', 'hold L', 'hold Left Shift']);
    expect(rows.vehicle.keyboard).toEqual(rows.special.keyboard);
    expect(rows.skill.keyboard).toEqual(rows.special.keyboard);
    expect(rows.move.keyboard).toEqual(['←↑↓→', 'WASD']);
    expect(rows.pause.keyboard).toEqual(['P', 'Esc']);
    expect(rows.place.gamepad).toEqual(['A']);
    expect(rows.special.gamepad).toEqual(['B', 'X']);
    expect(rows.detonate.gamepad).toEqual(['hold B', 'hold X']);
    // contact abilities have no button on any device
    expect(rows.contact.keyboard).toEqual(['walk into a generator']);
    expect(rows.action.gamepad).toEqual(['walk into a generator']);
    // derived, not hand-copied: exactly two actions exist
    expect(new Set(Object.values(ACTION_KEYS))).toEqual(new Set(['place', 'special']));
    expect(new Set(Object.values(ACTION_BUTTONS))).toEqual(new Set(['place', 'special']));
    expect(keysFor('place')).toEqual(['Space', 'J']);
    expect(padFor('special')).toEqual(['B', 'X']);
    expect(navKeysFor('confirm')).toEqual(['Enter', 'Space']);
  });

  it('describes the two on-screen buttons by the labels they really show', () => {
    expect(touchSrc).toContain('GENERATOR');
    expect(touchSrc).toContain('HOLD: BOOM!');
    expect(touchSrc).toContain('skill.toUpperCase()');
    expect(touchSrc).not.toMatch(/'CARRY'|'DROP'|'DISARM'/);
    expect(rows.place.touch).toContain('GENERATOR');
    expect(rows.detonate.touch).toContain('HOLD: BOOM!');
    expect(rows.special.touch).toMatch(/PUSH \/ DAZE \/ SHOVE/);
    expect(rows.contact.touch).toMatch(/No button/);
    expect(hudSrc).toContain("'II'");
    expect(rows.pause.touch).toContain('II');
    for (const id of LEGEND_ORDER) expect(rows[id].touch.length).toBeGreaterThan(10);
  });

  it('every control a chapter asks for has a legend row on every device', () => {
    for (const c of CHAPTERS) {
      for (const id of c.controls) {
        const row = rows[id];
        expect(row, `${c.id}: ${id}`).toBeDefined();
        expect(row.touch.length).toBeGreaterThan(10);
        expect(row.keyboard.length).toBeGreaterThan(0);
      }
    }
  });
});
