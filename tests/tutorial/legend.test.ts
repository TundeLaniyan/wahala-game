import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '../../src/tutorial';
import { keysFor, legendRows, navKeysFor, padFor } from '../../src/ui/howToPlayControls';

const rows = legendRows();
const touchSrc = readFileSync('src/ui/TouchControls.tsx', 'utf8');
const entrySrc = readFileSync('src/ui/EntryPanel.tsx', 'utf8');
const hudSrc = readFileSync('src/ui/Hud.tsx', 'utf8');

describe('How to Play controls legend', () => {
  it('teaches the real keyboard and gamepad bindings', () => {
    expect(rows.place.keyboard).toEqual(['Space', 'J']);
    expect(rows.action.keyboard).toEqual(['E', 'K', 'Left Shift']);
    expect(rows.skill.keyboard).toEqual(['F', 'L']);
    expect(rows.detonate.keyboard).toEqual(['Q', 'R']);
    expect(rows.vehicle.keyboard).toEqual(['V', 'C']);
    expect(rows.move.keyboard).toEqual(['←↑↓→', 'WASD']);
    expect(rows.pause.keyboard).toEqual(['P', 'Esc']);
    expect(rows.entryConfirm.keyboard).toEqual(['Enter', 'Space', 'V', 'C']);
    expect(rows.entryBack.keyboard).toEqual(['Esc']);
    expect(rows.place.gamepad).toEqual(['A']);
    expect(rows.action.gamepad).toEqual(['X']);
    expect(rows.skill.gamepad).toEqual(['B']);
    expect(rows.vehicle.gamepad).toEqual(['Y']);
    expect(rows.detonate.gamepad).toEqual(['RB']);
    // derived, not hand-copied
    expect(keysFor('disarm')).toEqual(['X']);
    expect(padFor('disarm')).toEqual(['LB']);
    expect(navKeysFor('confirm')).toEqual(['Enter', 'Space']);
  });

  it('describes the on-screen buttons by the labels they really show', () => {
    expect(touchSrc).toContain('GENERATOR');
    expect(touchSrc).toContain('BOOM!');
    for (const label of ['THROW', 'DROP', 'CARRY', 'PUNCH']) expect(touchSrc).toContain(`'${label}'`);
    expect(rows.place.touch).toContain('GENERATOR');
    expect(rows.detonate.touch).toContain('BOOM!');
    expect(rows.skill.touch).toMatch(/PUSH \/ DAZE \/ SHOVE/);
    expect(touchSrc).toContain('skill.toUpperCase()');
    expect(entrySrc).toContain("'Launch'");
    expect(entrySrc).toContain("'Next'");
    expect(entrySrc).toContain('Back');
    expect(rows.entryConfirm.touch).toMatch(/LAUNCH/);
    expect(rows.entryBack.touch).toMatch(/BACK/);
    expect(hudSrc).toContain("'II'");
    expect(rows.pause.touch).toContain('II');
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
