/**
 * Mobile input reliability (decisions MI1-MI5, AS4): Beginner Assist keeps a touch press through a daze and gives a
 * player standing in danger escape priority; on every style the newest direction wins over an owed corner step. The
 * keyboard and the gamepad behave exactly as they did before. (Standard touch movement and the corner rules are in
 * mobile-corner-assist.test.ts.)
 *
 * Deterministic: the REAL InputManager + stick model + simulation, wired as MatchController wires them (`AssistRig`).
 * Ticks are 1/60 s; a normal step is 10 ticks.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputTrace, inputTrace } from '../src/input';
import { MoveGate } from '../src/input/moveGate';
import type { GateAssist } from '../src/input/moveGate';
import { SWITCH_SETTLE_TICKS } from '../src/input/moveAssist';
import { Tile } from '../src/sim';
import type { Dir } from '../src/sim';
import { AssistRig } from './assistRig';
import { addGenerator } from './helpers';

afterEach(() => {
  vi.unstubAllGlobals();
  inputTrace.enabled = false;
  inputTrace.clear();
});

/** A 9 x 9 open room; `walls` / `crates` overwrite single tiles. */
function room(walls: [number, number][] = [], crates: [number, number][] = []): string[] {
  const rows = Array.from({ length: 9 }, () => [...'.........']);
  for (const [x, y] of walls) rows[y]![x] = '#';
  for (const [x, y] of crates) rows[y]![x] = 'S';
  return rows.map((r) => r.join(''));
}
const START: [number, number] = [4, 4];

describe('1. the newest direction wins over an owed corner step', () => {
  it('a tap in another direction while the second step is owed cancels it and is performed instead', () => {
    for (const style of ['standard', 'beginner'] as const) {
      const r = new AssistRig({ map: room([[4, 3]]), start: START, style }); // a wall above
      r.thumbDown();
      r.aim(135, 0.9); // up-left: up is blocked, so the corner goes left then up
      r.step(2);
      r.push('right'); // the player changes their mind (the thumb stays down)
      r.step(40);
      expect(r.trace[1], style).toEqual([3, 4]); // the first step was already under way
      expect(r.trace, style).not.toContainEqual([3, 3]); // the owed Up never happens
      expect(r.trace[2], style).toEqual([4, 4]); // the new direction is performed
    }
  });

  it("a thumb that stays on one of the route's own directions does not cancel it", () => {
    const r = new AssistRig({ map: room([[4, 3]]), start: START });
    r.thumbDown();
    r.aim(135, 0.9);
    r.step(2);
    r.push('up'); // the route's own second direction
    r.step(30);
    expect(r.trace.slice(0, 3)).toEqual([START, [3, 4], [3, 3]]);
  });
});

describe('2. Beginner Assist: a tap while the player cannot act is kept, not discarded', () => {
  function dazed(dazeTicks: number): AssistRig {
    const r = new AssistRig({ map: room(), start: START, style: 'beginner' });
    r.thumbDown();
    r.p.dazedUntil = r.state.tick + dazeTicks;
    return r;
  }
  /** The first tick, relative to the end of the lock, at which player 0 changed tile. */
  const firstStepAfter = (r: AssistRig, lockEnd: number): number => {
    for (let i = 0; i < 160; i++) {
      r.step(1);
      if (r.tiles > 0) return r.state.tick - lockEnd;
    }
    return NaN;
  };

  it.each([
    ['early in the daze', 3],
    ['in the middle', 30],
    ['in the last ticks', 55],
  ])('a tap %s is performed as soon as the daze ends', (_name, at) => {
    const r = dazed(60);
    const end = r.p.dazedUntil;
    r.step(at);
    r.push('right');
    r.step(2);
    r.lift(); // a TAP: the finger is long off the stick when the daze ends
    expect(firstStepAfter(r, end)).toBeLessThanOrEqual(2);
    expect(r.trace[1]).toEqual([5, 4]);
    r.step(80);
    expect(r.tiles).toBe(1); // one tap, one tile
  });

  it('only the newest tap during a lock counts (newest direction wins)', () => {
    const r = dazed(60);
    r.push('left');
    r.step(2);
    r.lift();
    r.thumbDown();
    r.step(10);
    r.push('up');
    r.step(2);
    r.lift();
    r.step(120);
    expect(r.trace[1]).toEqual([4, 3]);
    expect(r.tiles).toBe(1);
  });

  it('a held thumb resumes at once when the daze ends', () => {
    const r = dazed(60);
    const end = r.p.dazedUntil;
    r.push('right');
    expect(firstStepAfter(r, end)).toBeLessThanOrEqual(1);
  });

  it('an oil slide: a tap made during the slide is performed when it ends', () => {
    const r = new AssistRig({ map: room(), start: [1, 4], style: 'beginner' });
    r.thumbDown();
    r.p.slide = { dir: 'right', remaining: 2 };
    r.step(3);
    r.push('down');
    r.step(2);
    r.lift();
    r.step(120);
    expect(r.p.slide).toBeNull();
    expect(r.trace).toContainEqual([3, 5]); // slid to x = 3, then the tap took one step down
  });

  it('the gate keeps a press through a lock (unit): teleport arrival, stumble ... the sim ignores them all the same', () => {
    const gate = new MoveGate();
    const assist = {
      level: 'full',
      touch: true,
      style: 'beginner',
      board: () => ({}),
    } as unknown as GateAssist;
    const legal = () => true;
    gate.press('left', 0, 0, true);
    for (let t = 0; t < 50; t++) {
      expect(gate.next(t, null, new Set<Dir>(), true, legal, assist, true)).toBeNull();
      expect(gate.reason).toBe('buffered-while-locked');
    }
    expect(gate.next(50, null, new Set<Dir>(), true, legal, assist, false)).toBe('left');
    expect(gate.reason).toBe('press');
  });

  it('a lock never keeps a press for ever: after LOCK_BUFFER_TICKS it is gone', () => {
    const gate = new MoveGate();
    const assist = {
      level: 'full',
      touch: true,
      style: 'beginner',
      board: () => ({}),
    } as unknown as GateAssist;
    gate.press('left', 0, 0, true);
    for (let t = 0; t < 120; t++) gate.next(t, null, new Set<Dir>(), true, () => true, assist, true);
    expect(gate.next(120, null, new Set<Dir>(), true, () => true, assist, false)).toBeNull();
  });
});

describe('3. wall contact followed by a new direction', () => {
  it('after bumping a wall the new direction starts within the settle, with no bump-guard delay', () => {
    const r = new AssistRig({ map: room(), start: [6, 4] });
    r.thumbDown();
    r.push('right');
    r.until(8, 4);
    r.step(40); // pushing into the wall: the bump guard is now active
    const t0 = r.state.tick;
    r.push('up');
    let lat = -1;
    for (let i = 0; i < 40 && lat < 0; i++) {
      r.step(1);
      if (r.p.y !== 4) lat = r.state.tick - t0;
    }
    expect(lat).toBeGreaterThanOrEqual(0);
    expect(lat).toBeLessThanOrEqual(SWITCH_SETTLE_TICKS);
  });

  it('turning back the way the player came is just as quick', () => {
    const r = new AssistRig({ map: room(), start: [6, 4] });
    r.thumbDown();
    r.push('right');
    r.until(8, 4);
    r.step(40);
    const t0 = r.state.tick;
    r.push('left');
    let lat = -1;
    for (let i = 0; i < 40 && lat < 0; i++) {
      r.step(1);
      if (r.p.x !== 8) lat = r.state.tick - t0;
    }
    expect(lat).toBeLessThanOrEqual(SWITCH_SETTLE_TICKS);
  });
});

describe('4. Beginner Assist: generator danger beneath the player (emergency escape)', () => {
  const generatorUnder = (r: AssistRig): void => {
    addGenerator(r.state, { ownerId: 0, x: r.p.x, y: r.p.y, timer: 150 });
  };
  /** Up is a wall; the thumb leans up-right: the corner goes right, then up. */
  const lean = (r: AssistRig): void => {
    r.thumbDown();
    r.aim(45, 0.9);
    r.step(40);
  };

  it('Beginner: a corner lean runs two whole tiles out of the footprint (the assist may cross it when already in it)', () => {
    const r = new AssistRig({ map: room([[4, 3]]), start: START, style: 'beginner' });
    generatorUnder(r);
    lean(r);
    expect(r.trace.slice(0, 3)).toEqual([START, [5, 4], [5, 3]]);
  });

  it('Standard plans only onto safe tiles: from inside a footprint it gives no corner help (the thumb can still walk)', () => {
    const r = new AssistRig({ map: room([[4, 3]]), start: START, style: 'standard' });
    generatorUnder(r);
    lean(r);
    expect(r.trace).toEqual([START]);
  });

  it('without danger both styles do exactly the same corner', () => {
    for (const style of ['standard', 'beginner'] as const) {
      const r = new AssistRig({ map: room([[4, 3]]), start: START, style });
      lean(r);
      expect(r.trace.slice(0, 3), style).toEqual([START, [5, 4], [5, 3]]);
    }
  });

  it('the emergency never moves a player who is not pressing anything', () => {
    const r = new AssistRig({ map: room(), start: START, style: 'beginner' });
    generatorUnder(r);
    r.step(100);
    expect(r.trace).toEqual([START]);
  });

  it('a direction switch skips the settle while the player is in danger (Beginner), and keeps it otherwise', () => {
    const latency = (danger: boolean, style: 'standard' | 'beginner'): number => {
      const r = new AssistRig({ map: room(), start: START, style });
      // a long-range generator behind the player: the whole row they walk along is its footprint
      if (danger) addGenerator(r.state, { ownerId: 1, x: 4, y: 4, range: 8, timer: 150 });
      r.thumbDown();
      r.push('right');
      r.step(14);
      while (r.p.stepRemaining > 0) r.step(1); // the moment the player is ready for their next step
      const t0 = r.state.tick;
      const y0 = r.p.y;
      r.push('up');
      for (let i = 0; i < 40; i++) {
        r.step(1);
        if (r.p.y !== y0) return r.state.tick - t0;
      }
      return -1;
    };
    // measured: handed over at once (1 tick to show on the board) in danger, and one tick later otherwise - the
    // settle is stamped with the previous tick, so its real cost is a single tick (about 17 ms), not a freeze
    expect(latency(true, 'beginner')).toBe(1);
    expect(latency(false, 'beginner')).toBe(2);
    expect(latency(true, 'standard')).toBe(2); // Standard has no emergency rule
    expect(SWITCH_SETTLE_TICKS).toBe(2);
  });

  it('an owed corner step is ended by the thumb leaving its directions while the player is in danger', () => {
    const r = new AssistRig({ map: room([[4, 3]]), start: START, style: 'beginner' });
    r.thumbDown();
    r.aim(45, 0.9);
    r.step(2);
    generatorUnder(r); // a generator lands under the player mid-route
    r.push('down');
    r.step(80);
    expect(r.trace).not.toContainEqual([5, 3]);
  });
});

describe('5. blocked up-then-left with a valid left-then-up', () => {
  it('the reverse order is attempted when the preferred order is blocked', () => {
    const r = new AssistRig({ map: room([[4, 3]]), start: START }); // the tile above is a wall
    r.thumbDown();
    r.aim(135, 0.9); // up-left: Up first, but Up is blocked
    r.step(30);
    expect(r.trace.slice(0, 3)).toEqual([START, [3, 4], [3, 3]]);
  });

  it('a crate in the way behaves the same', () => {
    const r = new AssistRig({ map: room([], [[4, 3]]), start: START });
    r.thumbDown();
    r.aim(135, 0.9);
    r.step(30);
    expect(r.trace.slice(0, 3)).toEqual([START, [3, 4], [3, 3]]);
  });

  it('when both orders end on a blocked tile nothing diagonal happens (no half routes)', () => {
    const r = new AssistRig({
      map: room([
        [4, 3],
        [3, 3],
      ]),
      start: START,
    });
    r.thumbDown();
    r.aim(135, 0.9);
    r.step(40);
    expect(r.trace).not.toContainEqual([3, 3]);
    expect(r.tiles).toBe(0);
    r.assertCleanTrace();
  });

  it('the second step is revalidated: a tile that turns solid after the first step is not entered', () => {
    const r = new AssistRig({
      map: room([
        [4, 3],
        [2, 3],
      ]),
      start: START,
    }); // (2,3) walled: no second route afterwards
    r.thumbDown();
    r.aim(135, 0.9);
    r.step(2);
    r.state.tiles[3 * r.state.width + 3] = Tile.Hard; // the second tile closes after the first step began
    r.step(40);
    expect(r.trace).toEqual([START, [3, 4]]);
  });
});

describe('6. held movement after an obstacle disappears', () => {
  it('a crate destroyed while the thumb pushes against it: the player moves on within a tick', () => {
    const r = new AssistRig({ map: room([], [[6, 4]]), start: [5, 4] });
    r.thumbDown();
    r.push('right');
    r.step(80); // held against the crate: the bump guard is active
    expect(r.at).toEqual([5, 4]);
    const t0 = r.state.tick;
    r.state.tiles[4 * r.state.width + 6] = Tile.Empty;
    for (let i = 0; i < 30 && r.p.x === 5; i++) r.step(1);
    expect(r.at).toEqual([6, 4]);
    expect(r.state.tick - t0).toBeLessThanOrEqual(2);
  });

  it('a generator that goes off while held against it clears the way the same way', () => {
    const r = new AssistRig({ map: room(), start: [5, 4] });
    const g = addGenerator(r.state, { ownerId: 1, x: 6, y: 4, timer: 9999 });
    r.thumbDown();
    r.push('right');
    r.step(60);
    expect(r.at).toEqual([5, 4]);
    r.state.generators.splice(r.state.generators.indexOf(g), 1);
    for (let i = 0; i < 30 && r.p.x === 5; i++) r.step(1);
    expect(r.at).toEqual([6, 4]);
  });
});

describe('7. keyboard and gamepad behave exactly as before', () => {
  // the expected tick lists were recorded from the release this branch started from (8ebf3f4)
  const walk = (r: AssistRig): string => r.movesDelivered.map((m) => `${m.tick}:${m.move}`).join(' ');

  it('keyboard: a tap, a hold into a wall, a tap while dazed (still consumed, as before)', () => {
    const r = new AssistRig({ map: room(), start: [6, 4], assist: 'auto' });
    r.keyDown('right');
    r.step(2);
    r.keyUp('right');
    r.step(30);
    r.keyDown('right');
    r.step(50);
    r.keyUp('right');
    r.p.dazedUntil = r.state.tick + 40;
    r.keyDown('up');
    r.step(3);
    r.keyUp('up');
    r.step(80);
    expect(walk(r)).toBe(KEYBOARD_EXPECTED);
    expect(r.trace).toEqual(KEYBOARD_TRACE);
  });

  it('gamepad: a D-pad hold, a switch of direction, a release', () => {
    const r = new AssistRig({ map: room(), start: [2, 2], assist: 'auto' });
    r.pad(['right']);
    r.step(30);
    r.pad(['down']);
    r.step(40);
    r.pad([]);
    r.step(30);
    expect(walk(r)).toBe(PAD_EXPECTED);
    expect(r.trace).toEqual(PAD_TRACE);
  });

  it('keyboard under Assisted movement On is not a touch thumb: no buffer through a daze, no diagonal route', () => {
    const r = new AssistRig({ map: room(), start: [4, 4], assist: 'on' });
    r.p.dazedUntil = r.state.tick + 40;
    r.step(5);
    r.keyDown('up');
    r.step(3);
    r.keyUp('up');
    r.step(80);
    expect(r.tiles).toBe(0); // the key press during the daze is spent, exactly as before
  });
});

describe('8. the 2-tick direction-switch settle', () => {
  it('a swing straight through a third direction leaks no stray step (the reason the settle exists)', () => {
    const r = new AssistRig({ map: room(), start: START });
    r.thumbDown();
    r.push('right');
    r.step(40);
    r.until(r.p.x, r.p.y);
    r.aim(90, 0.9); // the thumb passes Up for a single tick ...
    r.step(1);
    r.aim(180, 0.9); // ... on its way to Left
    r.step(60);
    expect(r.trace.slice(-1)[0]![1]).toBe(4); // y never changed: no stray Up
  });

  it('a settle of 1 tick blocks a 1-tick pass but not a 2-tick pass; 2 ticks cover both (so 2 is the shortest safe value)', () => {
    const pass = (settle: number, ticks: number): boolean => {
      const gate = new MoveGate();
      const held = new Set<Dir>();
      gate.press('right', 0);
      gate.next(0, 'right', new Set<Dir>(['right']), true);
      gate.press('up', 20, settle);
      let leaked = false;
      for (let t = 20; t < 20 + ticks; t++) {
        if (gate.next(t, 'up', new Set<Dir>(['up']), true) === 'up') leaked = true;
        if (t === 20 + ticks - 1) gate.press('left', t + 1, settle); // the thumb moves on to Left
      }
      void held;
      return leaked;
    };
    expect(pass(0, 1)).toBe(true);
    expect(pass(1, 1)).toBe(false);
    expect(pass(1, 2)).toBe(true);
    expect(pass(2, 1)).toBe(false);
    expect(pass(2, 2)).toBe(false);
  });

  it('settle is only ever applied to a switch: a flick from rest and a diagonal are not delayed', () => {
    const r = new AssistRig({ map: room(), start: START });
    r.thumbDown();
    r.aim(45, 0.9);
    r.step(1);
    expect(r.movesDelivered[0]!.tick).toBe(0);
  });
});

describe('9. the input trace (touch event -> direction -> gate -> simulation)', () => {
  it('records the quantised direction and the gate decision with its reason, only while enabled', () => {
    const r = new AssistRig({ map: room(), start: START });
    r.thumbDown();
    r.push('right');
    r.step(15);
    expect(inputTrace.events.length).toBe(0); // off by default: nothing is recorded
    inputTrace.enabled = true;
    r.push('up');
    r.step(15);
    const kinds = inputTrace.events.map((e) => e.k);
    expect(kinds).toContain('dir');
    expect(kinds).toContain('gate');
    const gate = inputTrace.events.filter((e) => e.k === 'gate');
    expect(gate.some((e) => e.k === 'gate' && e.move === 'up' && e.reason.length > 0)).toBe(true);
  });

  it('names why a press was held back or dropped', () => {
    inputTrace.enabled = true;
    const r = new AssistRig({ map: room(), start: START, style: 'beginner' });
    r.thumbDown();
    r.p.dazedUntil = r.state.tick + 30;
    r.push('right');
    r.step(40);
    const reasons = new Set(inputTrace.events.flatMap((e) => (e.k === 'gate' ? [e.reason] : [])));
    expect(reasons.has('buffered-while-locked') || reasons.has('locked')).toBe(true);
  });

  it('is a bounded ring', () => {
    const t = new InputTrace(10);
    t.enabled = true;
    for (let i = 0; i < 50; i++) t.record({ k: 'gate', tick: i, move: null, reason: 'x' });
    expect(t.events.length).toBe(10);
    expect((t.events[0] as { tick: number }).tick).toBe(40);
    expect(JSON.parse(t.dump())).toHaveLength(10);
  });
});

// recorded from the release this branch started from (8ebf3f4); see section 7
const KEYBOARD_EXPECTED = '0:right 32:right 43:right 67:right 82:up';
const KEYBOARD_TRACE: [number, number][] = [
  [6, 4],
  [7, 4],
  [8, 4],
];
const PAD_EXPECTED =
  '0:right 12:right 13:right 14:right 15:right 16:right 17:right 18:right 19:right 20:right 21:right 22:right 23:right 24:right 25:right 26:right 27:right 28:right 29:right 32:down 41:down 42:down 43:down 44:down 45:down 46:down 47:down 48:down 49:down 50:down 51:down 52:down 53:down 54:down 55:down 56:down 57:down 58:down 59:down 60:down 61:down 62:down 63:down 64:down 65:down 66:down 67:down 68:down 69:down';
const PAD_TRACE: [number, number][] = [
  [2, 2],
  [3, 2],
  [4, 2],
  [5, 2],
  [5, 3],
  [5, 4],
  [5, 5],
  [5, 6],
];
