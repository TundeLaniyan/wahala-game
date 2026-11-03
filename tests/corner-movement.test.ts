/**
 * Corner-turn assistance (decision MV1): early turns up to two tiles ahead on every assisted level, a tapped
 * turn remembered for a moment after release, a bump guard against pushing the same wall every step, and bend
 * following in a one-tile corridor (touch / "On" only). The grid stays a grid: every step is one orthogonal
 * tile, a short tap is exactly one tile, and the whole thing is deterministic. Real InputManager + real sim.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tile } from '../src/sim';
import { AssistRig } from './assistRig';

afterEach(() => vi.unstubAllGlobals());

/** A vertical corridor that bends right, then dead-ends: walking up from (1,5) reaches the bend at (1,1). */
const BEND = [
  '#########', //
  '#.......#',
  '#.#######',
  '#.#######',
  '#.#######',
  '#.#######',
  '#########',
];
/** An open room: its corner is NOT a corridor bend. */
const ROOM = ['#########', '#.......#', '#.......#', '#.......#', '#########'];
/** A horizontal corridor with a side street at x = 5 and crates in front of the player. */
const STREET = ['###########', '#.........#', '#####.#####', '#####.#####', '###########'];

describe('bump guard: the same wall or crate is not hit every step', () => {
  it('holding into a wall offers it to the simulation once per cooldown, not once per step (touch and keyboard)', () => {
    for (const device of ['touch', 'keyboard'] as const) {
      const r = new AssistRig({ map: ROOM, start: [3, 2], assist: device === 'touch' ? 'on' : 'auto' });
      if (device === 'touch') {
        r.thumbDown();
        r.push('up');
      } else r.keyDown('up');
      r.step(300);
      const off = new AssistRig({ map: ROOM, start: [3, 2], assist: 'off' });
      if (device === 'touch') {
        off.thumbDown();
        off.push('up');
      } else off.keyDown('up');
      off.step(300);
      const wallHits = (x: AssistRig) => x.movesDelivered.filter((m) => m.move === 'up').length;
      expect(wallHits(off)).toBeGreaterThan(20); // before: a bump every step
      expect(wallHits(r)).toBeLessThanOrEqual(14); // now: about one per half second
      expect(r.at).toEqual([3, 1]);
    }
  });

  it('a crate that disappears is walked into at once, without waiting for the cooldown', () => {
    const r = new AssistRig({ map: ROOM, start: [3, 3], assist: 'on' });
    r.state.tiles[2 * r.state.width + 3] = Tile.Soft;
    r.thumbDown();
    r.push('up');
    r.step(60); // pressed against the crate: a bump or two, then quiet
    expect(r.at).toEqual([3, 3]);
    r.state.tiles[2 * r.state.width + 3] = Tile.Empty; // the crate is blown up
    r.step(14);
    expect(r.at[1]).toBeLessThan(3); // off the old tile within one step: no cooldown wait
  });

  it('a new press is never swallowed by the guard', () => {
    const r = new AssistRig({ map: ROOM, start: [3, 1], assist: 'auto' });
    r.keyDown('up');
    r.step(40);
    r.keyUp('up');
    r.keyDown('up'); // pressed again against the same wall
    r.step(3);
    expect(r.moves.slice(-3).some((m) => m.move === 'up')).toBe(true);
  });
});

describe('bend following (touch Beginner Assist): a corridor is walked round its corner', () => {
  it('Standard touch movement stops at the corner: a straight push is a push (decision AS4)', () => {
    const r = new AssistRig({ map: BEND, start: [1, 5], assist: 'on', style: 'standard' });
    r.thumbDown();
    r.push('up');
    r.step(400);
    expect(r.at).toEqual([1, 1]);
  });

  it('holding up in a one-tile corridor turns the corner on its own and walks on to the end, never back', () => {
    const r = new AssistRig({ map: BEND, start: [1, 5], assist: 'on', style: 'beginner' });
    r.thumbDown();
    r.push('up');
    r.step(400);
    expect(r.at).toEqual([7, 1]); // up the corridor, round the bend, along to the dead end
    r.assertCleanTrace();
    expect(r.trace.some(([x, y]) => x === 1 && y === 1)).toBe(true);
    // never turned round: x only grows once it is on the top row
    const top = r.trace.filter(([, y]) => y === 1).map(([x]) => x);
    expect(top).toEqual([...top].sort((a, b) => a - b));
  });

  it('is off for the keyboard under Auto, and in an open room (a corner of a room is not a bend)', () => {
    const k = new AssistRig({ map: BEND, start: [1, 5], assist: 'auto' });
    k.keyDown('up');
    k.step(400);
    expect(k.at).toEqual([1, 1]); // reaches the corner and stops, as before
    const room = new AssistRig({ map: ROOM, start: [7, 3], assist: 'on' });
    room.thumbDown();
    room.push('up');
    room.step(300);
    expect(room.at).toEqual([7, 1]);
  });

  it('never bends round a crate: a player pushing at one is about to bomb it', () => {
    const map = ['#####', '#...#', '#.###', '#.###', '#####'];
    const r = new AssistRig({ map, start: [1, 3], assist: 'on' });
    r.state.tiles[1 * r.state.width + 1] = Tile.Soft; // a crate at the corner
    r.thumbDown();
    r.push('up');
    r.step(200);
    expect(r.at).toEqual([1, 2]);
  });
});

describe('early turns and the turn memory', () => {
  it('a keyboard tap two tiles before the corner is carried and taken (desktop)', () => {
    const r = new AssistRig({ map: STREET, start: [1, 1], assist: 'auto' });
    r.keyDown('right');
    r.until(3, 1);
    r.keyUp('right');
    r.keyDown('down');
    r.keyUp('down'); // a tap, released before the corner
    r.step(120);
    expect(r.at).toEqual([5, 2]); // along the row to the opening, one tile down: a tap is one tile
    r.assertCleanTrace();
  });

  it('a gamepad D-pad tap behaves the same', () => {
    const r = new AssistRig({ map: STREET, start: [1, 1], assist: 'auto' });
    r.pad(['right']);
    r.until(3, 1);
    r.pad(['down']);
    r.step(2);
    r.pad([]);
    r.step(120);
    expect(r.at).toEqual([5, 2]);
  });

  it('a turn tapped three tiles early is not remembered', () => {
    const r = new AssistRig({ map: STREET, start: [1, 1], assist: 'auto' });
    r.keyDown('right');
    r.until(2, 1);
    r.keyUp('right');
    r.keyDown('down');
    r.keyUp('down');
    r.step(120);
    expect(r.at[1]).toBe(1);
  });

  it('turn memory never carries into a danger that appears meanwhile', () => {
    const r = new AssistRig({ map: STREET, start: [1, 1], assist: 'auto' });
    r.keyDown('right');
    r.until(3, 1);
    r.keyUp('right');
    r.keyDown('down');
    r.keyUp('down');
    r.state.flames.push({ x: 4, y: 1, startTick: 0, endTick: 1e9, ownerId: 1, eventId: 99 } as never);
    r.step(120);
    expect(r.at).toEqual([3, 1]); // the carried tile is on fire: nothing is carried
  });
});

describe('the grid stays a grid', () => {
  it('a short tap moves exactly one tile on every device, in open floor and next to walls', () => {
    for (const map of [ROOM, STREET]) {
      for (const device of ['key', 'pad', 'thumb'] as const) {
        const r = new AssistRig({ map, start: [2, 1], assist: 'on' });
        if (device === 'key') {
          r.keyDown('right');
          r.step(3);
          r.keyUp('right');
        } else if (device === 'pad') {
          r.pad(['right']);
          r.step(3);
          r.pad([]);
        } else {
          r.thumbDown();
          r.push('right');
          r.step(3);
          r.lift();
        }
        r.step(60);
        expect(r.at, `${device}`).toEqual([3, 1]);
      }
    }
  });

  it('is deterministic: the same inputs give the same path every time', () => {
    const play = () => {
      const r = new AssistRig({ map: BEND, start: [1, 5], assist: 'on' });
      r.thumbDown();
      r.push('up');
      r.step(150);
      r.lift();
      r.thumbDown();
      r.push('right');
      r.step(100);
      return JSON.stringify([r.trace, r.stepTicks]);
    };
    expect(play()).toBe(play());
  });

  it('never skips a tile or moves diagonally across a long wandering session', () => {
    const r = new AssistRig({ map: BEND, start: [1, 5], assist: 'on' });
    r.thumbDown();
    for (let i = 0; i < 400; i++) {
      r.aim(([90, 0, 45, 180, -90, 20] as const)[Math.floor(i / 20) % 6]! + (i % 2 ? 4 : -4));
      r.step(1);
    }
    r.assertCleanTrace();
  });
});
