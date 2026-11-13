/**
 * Classic raid on a touch device (decisions TN1-TN3): the floating thumbstick replaces the four arrows, the grid stays
 * strict (one cardinal tile per step, no diagonal, no slide), and the thumb gets the same grid-turn forgiveness the
 * open field has - a turn pressed before the corner is carried one tile and taken at the corner, a press kept through a
 * daze, a press kept through a long step. Keys and gamepad in a raid are exactly what they were. Through the REAL
 * InputManager and simulation (`AssistRig`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLOCKED_REPEAT_TICKS, BlockedMoves } from '../src/app/blockedMove';
import { bumpVector } from '../src/render/views/bumpModel';
import type { Dir } from '../src/sim';
import { AssistRig } from './assistRig';

afterEach(() => vi.unstubAllGlobals());

/** A corridor along y = 1 with a side street down at x = 6 (the same board as e2e/corner-movement.spec.ts). */
const STREET = [
  '###########',
  '#.........#', //
  '######.####',
  '######.####',
  '###########',
];

function raidRig(map: string[], start: [number, number]): AssistRig {
  const r = new AssistRig({ map, start, assist: 'on' });
  r.input.setCardinalOnly(true);
  return r;
}

describe('the thumb in a raid: strict grid, grid-turn forgiveness', () => {
  it('a thumb turning down one tile before the side street is carried to it and takes it (one tile at a time)', () => {
    const r = raidRig(STREET, [1, 1]);
    r.thumbDown();
    r.push('right');
    for (let i = 0; i < 80 && r.at[0] < 5; i++) r.step(1);
    expect(r.at[0]).toBe(5);
    r.push('down'); // the finger swings down while the street is still one tile away
    r.step(150);
    r.lift();
    r.step(20);
    expect(r.at).toEqual([6, 3]); // down the street to its end (the thumb is still held)
    r.assertCleanTrace();
    for (const m of r.movesDelivered) expect(['right', 'down']).toContain(m.move);
  });

  it('keys in a raid are unchanged: the same turn is not carried', () => {
    const r = raidRig(STREET, [1, 1]);
    r.keyDown('right');
    for (let i = 0; i < 80 && r.at[0] < 5; i++) r.step(1);
    r.keyUp('right');
    r.keyDown('down');
    r.step(150);
    r.keyUp('down');
    r.step(20);
    expect(r.at).toEqual([5, 1]);
  });

  it('the gamepad in a raid is unchanged: the same turn is not carried', () => {
    const r = raidRig(STREET, [1, 1]);
    r.pad(['right']);
    for (let i = 0; i < 80 && r.at[0] < 5; i++) r.step(1);
    r.pad(['down']);
    r.step(150);
    r.pad([]);
    r.step(20);
    expect(r.at).toEqual([5, 1]);
  });

  it('a thumb leaning diagonally into a wall never turns the corner by itself (no corner route in a raid)', () => {
    const r = raidRig(STREET, [3, 1]);
    r.thumbDown();
    r.aim(-30, 0.9); // mostly right, a lean down: the open field would route round; the raid does not
    r.step(10);
    r.lift();
    r.step(20);
    r.assertCleanTrace();
    for (const m of r.movesDelivered) expect(m.move).toBe('right');
    expect(r.at[1]).toBe(1);
  });

  it('a press made while the fighter cannot act (daze, slide) is kept and walked once they can; keys lose it', () => {
    const run = (touch: boolean): [number, number] => {
      const r = raidRig(STREET, [3, 1]);
      r.p.rootedUntil = r.state.tick + 40;
      r.step(5);
      if (touch) {
        r.thumbDown();
        r.push('right');
        r.step(2);
        r.lift();
      } else {
        r.keyDown('right');
        r.step(2);
        r.keyUp('right');
      }
      r.step(120);
      return r.at;
    };
    expect(run(true)).toEqual([4, 1]); // one tile, once the lock ended
    expect(run(false)).toEqual([3, 1]);
  });

  it('a press made early in a long step waits for the step to end (14 ticks) with a thumb, 10 with keys', () => {
    const run = (touch: boolean): [number, number] => {
      const r = raidRig(STREET, [3, 1]);
      r.p.stepRemaining = 13; // a slow step (a speed curse): ready after 12 ticks
      if (touch) {
        r.thumbDown();
        r.push('right');
        r.step(2);
        r.lift();
      } else {
        r.keyDown('right');
        r.step(2);
        r.keyUp('right');
      }
      r.step(60);
      return r.at;
    };
    expect(run(true)).toEqual([4, 1]);
    expect(run(false)).toEqual([3, 1]);
  });

  it('a thumb held against a wall stays put and never slides along it', () => {
    const r = raidRig(STREET, [3, 1]);
    r.thumbDown();
    r.push('up');
    r.step(120);
    r.lift();
    expect(r.at).toEqual([3, 1]);
    expect(r.tiles).toBe(0);
  });
});

describe('blocked-move cue (presentation of a refused request)', () => {
  const run = (
    frames: { move: Dir | null; ready?: boolean; locked?: boolean; acts?: boolean }[],
  ): number[] => {
    const b = new BlockedMoves();
    const cues: number[] = [];
    frames.forEach((f, tick) => {
      if (b.observe(tick, f.move, f.ready ?? true, f.locked ?? false, f.acts ?? false)) cues.push(tick);
    });
    return cues;
  };

  it('a refused request cues once, with its direction and a counter', () => {
    const b = new BlockedMoves();
    expect(b.cue).toBeNull();
    expect(b.observe(10, 'up', true, false, false)).toBe(true);
    expect(b.cue).toEqual({ dir: 'up', seq: 1 });
  });

  it('a request that steps or touches something never cues; neither does no request', () => {
    expect(run([{ move: 'up', acts: true }, { move: null }, { move: 'left', acts: true }])).toEqual([]);
  });

  it('nothing cues while the step is unfinished or the fighter is locked (the wall is not the reason)', () => {
    expect(
      run([
        { move: 'up', ready: false },
        { move: 'up', locked: true },
      ]),
    ).toEqual([]);
  });

  it('holding into the wall repeats calmly, not every tick', () => {
    const frames = Array.from({ length: BLOCKED_REPEAT_TICKS * 2 + 5 }, () => ({ move: 'up' as Dir }));
    expect(run(frames)).toEqual([0, BLOCKED_REPEAT_TICKS, BLOCKED_REPEAT_TICKS * 2]);
  });

  it('a new direction, or a new press after a release, cues at once', () => {
    expect(run([{ move: 'up' }, { move: 'left' }, { move: null }, { move: 'left' }])).toEqual([0, 1, 3]);
    // stepping off (an acting request) also re-arms it
    expect(run([{ move: 'up' }, { move: 'up', acts: true }, { move: 'up' }])).toEqual([0, 2]);
  });

  it('reset forgets the counter (a new match)', () => {
    const b = new BlockedMoves();
    b.observe(500, 'up', true, false, false);
    b.reset();
    expect(b.cue).toBeNull();
    expect(b.observe(3, 'up', true, false, false)).toBe(true);
    expect(b.cue!.seq).toBe(1);
  });

  it('the bump is a shove towards the obstacle on the grid axis', () => {
    expect(bumpVector('left')).toEqual({ dx: -1, dz: 0 });
    expect(bumpVector('right')).toEqual({ dx: 1, dz: 0 });
    expect(bumpVector('up')).toEqual({ dx: 0, dz: -1 });
    expect(bumpVector('down')).toEqual({ dx: 0, dz: 1 });
  });
});
