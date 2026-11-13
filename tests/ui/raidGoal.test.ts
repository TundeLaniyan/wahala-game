/**
 * The raid's "what now" guidance (decision TN4): the objective line, the arrow and distance to the nearest target, and
 * the short notes, from the real depot raid. Pure model plus the HUD snapshot; nothing here is drawn over the board.
 */
import { describe, expect, it } from 'vitest';
import { raidCue, raidGuidance, WAVE_NOTE_TICKS } from '../../src/app/raidHud';
import { buildHud } from '../../src/app/hud';
import { raidView } from '../../src/sim';
import { sandbox } from '../helpers';
import { newRaid } from '../raid-helpers';

describe('raidCue: eight-way arrow and distance in tiles', () => {
  const from = { x: 5, y: 5 };
  const cases: [number, number, string, string][] = [
    [8, 5, '→', 'RIGHT'],
    [8, 8, '↘', 'DOWN-RIGHT'],
    [5, 8, '↓', 'DOWN'],
    [2, 8, '↙', 'DOWN-LEFT'],
    [2, 5, '←', 'LEFT'],
    [2, 2, '↖', 'UP-LEFT'],
    [5, 2, '↑', 'UP'],
    [8, 2, '↗', 'UP-RIGHT'],
  ];
  for (const [x, y, arrow, word] of cases)
    it(`${word}`, () => {
      const c = raidCue(from, { x, y });
      expect(c.arrow).toBe(arrow);
      expect(c.word).toBe(word);
      expect(c.tiles).toBe(Math.abs(x - 5) + Math.abs(y - 5));
    });

  it('a far target is the nearest compass point; one tile is singular; on it is HERE', () => {
    expect(raidCue(from, { x: 12, y: 6 }).arrow).toBe('→'); // 7 right, 1 down: right
    expect(raidCue(from, { x: 6, y: 5 }).text).toBe('→ 1 TILE');
    expect(raidCue(from, { x: 7, y: 5 }).text).toBe('→ 2 TILES');
    expect(raidCue(from, from)).toMatchObject({ word: 'HERE', tiles: 0, text: 'HERE' });
  });
});

describe('raidGuidance on the dispatch depot', () => {
  it('the cargo stage: destroy the marked cargo, with the count and the way to the nearest one', () => {
    const state = newRaid('warehouseDispatchDepot');
    const view = raidView(state)!;
    const me = state.players[0]!;
    const g = raidGuidance(view, me)!;
    const marked = view.cargo.filter((c) => c.marked);
    expect(g.verb).toBe('destroy');
    expect(g.tag).toBe('DESTROY');
    expect(g.target).toBe('MARKED CARGO');
    expect(g.step).toBe(`0 OF ${marked.length} DOWN`);
    const nearest = Math.min(...marked.map((c) => Math.abs(c.x - me.x) + Math.abs(c.y - me.y)));
    expect(g.cue!.tiles).toBe(nearest);
    expect(g.notes.length).toBeLessThanOrEqual(2);
  });

  it('the cue follows the player and the cargo that is still standing', () => {
    const state = newRaid('warehouseDispatchDepot');
    const view = raidView(state)!;
    const marked = view.cargo.filter((c) => c.marked);
    const first = marked[0]!;
    const next = marked[1]!;
    const near = raidGuidance(view, { x: first.x, y: first.y + 1 })!;
    expect(near.cue!.tiles).toBe(1);
    // that one goes down: the cue moves to the next one
    state.raid!.cargo.find((c) => c.id === first.id)!.destroyed = true;
    const after = raidGuidance(raidView(state), { x: first.x, y: first.y + 1 })!;
    expect(after.step).toBe(`1 OF ${marked.length} DOWN`);
    expect(after.cue!.tiles).toBe(Math.abs(next.x - first.x) + Math.abs(next.y - (first.y + 1)));
  });

  it('a locked main door and the enemies on the board are the notes (at most two)', () => {
    const state = newRaid('warehouseDispatchDepot');
    const view = raidView(state)!;
    const door = view.doors.find((d) => d.locked && !d.optionalRoom);
    const g = raidGuidance(view, state.players[0]!)!;
    expect(door, 'the depot has a locked main door (the bay door)').toBeDefined();
    expect(g.notes.join('|')).toContain(`DOOR LOCKED: ${door!.opensWhen.toUpperCase()}`);
    const busy = raidGuidance(
      { ...view, wave: { ...view.wave, enemiesAlive: 3, nextInTicks: 5 * 60 } },
      state.players[0]!,
    )!;
    expect(busy.notes[0]).toBe(`WAVE ${view.wave.index + 1} IN 5s`);
    expect(busy.notes[1]).toBe('3 ENEMIES ON THE BOARD');
    expect(busy.notes).toHaveLength(2);
    const far = raidGuidance(
      { ...view, wave: { ...view.wave, enemiesAlive: 1, nextInTicks: WAVE_NOTE_TICKS + 60 } },
      state.players[0]!,
    )!;
    expect(far.notes.join('|')).not.toContain('WAVE');
    expect(far.notes[0]).toBe('1 ENEMY ON THE BOARD');
  });

  it('once the marked cargo is down: reach the exit, with the way to it', () => {
    const state = newRaid('warehouseDispatchDepot');
    for (const c of state.raid!.cargo) if (c.marked) c.destroyed = true;
    state.raid!.stage = 'extract';
    state.raid!.extraction.open = true;
    const view = raidView(state)!;
    const me = state.players[0]!;
    const g = raidGuidance(view, me)!;
    expect(g.verb).toBe('exit');
    expect(g.tag).toBe('EXIT');
    expect(g.target).toBe('REACH THE EXIT');
    expect(g.step).toBeNull();
    expect(g.cue!.tiles).toBe(Math.abs(view.extraction.x - me.x) + Math.abs(view.extraction.y - me.y));
    expect(raidGuidance(view, { x: view.extraction.x, y: view.extraction.y })!.cue!.text).toBe('HERE');
  });

  it('nothing once the raid is over, or outside a raid', () => {
    const state = newRaid('warehouseDispatchDepot');
    state.raid!.stage = 'done';
    expect(raidGuidance(raidView(state), state.players[0]!)).toBeNull();
    state.raid!.stage = 'failed';
    expect(raidGuidance(raidView(state), state.players[0]!)).toBeNull();
    expect(raidGuidance(null, { x: 1, y: 1 })).toBeNull();
  });

  it('is the same from the same state (deterministic)', () => {
    const a = newRaid('warehouseDispatchDepot');
    const b = newRaid('warehouseDispatchDepot');
    expect(raidGuidance(raidView(a), a.players[0]!)).toEqual(raidGuidance(raidView(b), b.players[0]!));
  });
});

describe('the HUD snapshot', () => {
  it('carries the guidance in a raid and nothing in a normal match', () => {
    const raid = newRaid('warehouseDispatchDepot');
    expect(buildHud(raid, 0, null).raid?.tag).toBe('DESTROY');
    expect(buildHud(sandbox(), 0, null).raid).toBeNull();
  });
});
