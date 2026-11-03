/**
 * Touchscreen corner assistance (decisions MV3, AS4). The thumb walks the four cardinal directions; a diagonal
 * lean only matters when the direction the thumb mainly points is BLOCKED (a wall, a crate, an obstacle). Then the two
 * legal orders of the two-step corner are tried and the first valid one wins - and only while the thumb is still
 * down. There is no staircase in open space, nothing moves the player without a current directional input, and
 * keyboard, gamepad and "Assisted movement: Off" are untouched.
 *
 * The REAL InputManager + stick model + simulation, wired as MatchController wires them (`AssistRig`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MoveBoard } from '../src/input';
import { MoveGate } from '../src/input/moveGate';
import type { GateAssist } from '../src/input/moveGate';
import { planDiagonal } from '../src/input/moveAssist';
import { DIR_VEC, Tile } from '../src/sim';
import type { Dir } from '../src/sim';
import { AssistRig } from './assistRig';
import { addGenerator } from './helpers';

afterEach(() => vi.unstubAllGlobals());

/** A 9 x 9 open room; `walls` / `crates` overwrite single tiles. */
function room(walls: [number, number][] = [], crates: [number, number][] = []): string[] {
  const rows = Array.from({ length: 9 }, () => [...'.........']);
  for (const [x, y] of walls) rows[y]![x] = '#';
  for (const [x, y] of crates) rows[y]![x] = 'S';
  return rows.map((r) => r.join(''));
}

const START: [number, number] = [4, 4];

interface Diag {
  name: string;
  /** Thumb angle (0 = right, 90 = up): the vertical axis is the main one. */
  vertical: number;
  /** Thumb angle with the horizontal axis the main one. */
  horizontal: number;
  v: Dir;
  h: Dir;
  /** Offsets of the vertical / horizontal neighbours. */
  vo: [number, number];
  ho: [number, number];
}

const DIAGONALS: Diag[] = [
  { name: 'up-left', vertical: 130, horizontal: 140, v: 'up', h: 'left', vo: [0, -1], ho: [-1, 0] },
  { name: 'up-right', vertical: 50, horizontal: 40, v: 'up', h: 'right', vo: [0, -1], ho: [1, 0] },
  { name: 'down-left', vertical: 230, horizontal: 220, v: 'down', h: 'left', vo: [0, 1], ho: [-1, 0] },
  { name: 'down-right', vertical: -50, horizontal: -40, v: 'down', h: 'right', vo: [0, 1], ho: [1, 0] },
];
const at = (o: [number, number]): [number, number] => [START[0] + o[0], START[1] + o[1]];
const corner = (d: Diag): [number, number] => [START[0] + d.vo[0] + d.ho[0], START[1] + d.vo[1] + d.ho[1]];

/** The thumb goes down and leans towards `deg`; nothing else. */
function lean(r: AssistRig, deg: number): void {
  r.thumbDown();
  r.aim(deg, 0.9);
}

const dirsOf = (r: AssistRig): Dir[] => r.movesDelivered.map((m) => m.move);

describe('1. open space is cardinal: no staircase, no diagonal route', () => {
  it.each(DIAGONALS)('$name: a held diagonal is a straight line along its main axis', (d) => {
    for (const [deg, main] of [
      [d.vertical, d.v],
      [d.horizontal, d.h],
    ] as const) {
      const r = new AssistRig({ map: room(), start: [4, 4] });
      lean(r, deg);
      r.step(40);
      r.lift();
      const axis = main === 'up' || main === 'down' ? 0 : 1; // the coordinate that must never change
      expect(r.tiles).toBeGreaterThan(0);
      expect(r.trace.every((t) => t[axis] === START[axis])).toBe(true);
      r.assertCleanTrace();
    }
  });

  it('a diagonal flick is one tile on the main axis, not a two-step route', () => {
    for (const d of DIAGONALS) {
      const r = new AssistRig({ map: room(), start: START });
      lean(r, d.vertical);
      r.step(3);
      r.lift();
      r.step(120);
      expect(r.trace).toEqual([START, at(d.vo)]);
    }
  });

  it('a diagonal next to an obstacle that does NOT block the main direction is still the main direction', () => {
    // a wall to the left of the player; the thumb pushes up-left with up dominant and up free
    const r = new AssistRig({ map: room([[3, 4]]), start: START });
    lean(r, 130);
    r.step(20);
    expect(r.trace.slice(0, 2)).toEqual([START, [4, 3]]);
    expect(dirsOf(r).every((m) => m === 'up')).toBe(true);
  });

  it('cardinal taps are exactly one tile (also 20 degrees off the axis)', () => {
    for (const [dir, to, off] of [
      ['up', [4, 3], 110],
      ['down', [4, 5], -70],
      ['left', [3, 4], 200],
      ['right', [5, 4], 20],
    ] as [Dir, [number, number], number][]) {
      const r = new AssistRig({ map: room(), start: START });
      r.thumbDown();
      r.aim(off, 0.9);
      r.step(3);
      r.lift();
      r.step(120);
      expect(r.trace, dir).toEqual([START, to]);
    }
  });
});

describe('2. the corner: the main direction is blocked and the thumb leans round it', () => {
  describe.each(DIAGONALS)('$name', (d) => {
    it('goes round a wall in the main direction: the order that is legal wins (side first, then on)', () => {
      const r = new AssistRig({ map: room([at(d.vo)]), start: START });
      lean(r, d.vertical);
      r.step(30);
      expect(r.trace.slice(0, 3)).toEqual([START, at(d.ho), corner(d)]);
      expect(dirsOf(r).slice(0, 2)).toEqual([d.h, d.v]);
      r.assertCleanTrace();
    });

    it('a crate in the main direction is an obstacle too: the lean goes round it, the crate stays', () => {
      const r = new AssistRig({ map: room([], [at(d.vo)]), start: START });
      lean(r, d.vertical);
      r.step(30);
      expect(r.trace.slice(0, 3)).toEqual([START, at(d.ho), corner(d)]);
      expect(r.state.tiles[at(d.vo)[1] * r.state.width + at(d.vo)[0]]).toBe(Tile.Soft);
    });

    it('with the horizontal axis dominant it works the same way', () => {
      const r = new AssistRig({ map: room([at(d.ho)]), start: START });
      lean(r, d.horizontal);
      r.step(30);
      expect(r.trace.slice(0, 3)).toEqual([START, at(d.vo), corner(d)]);
    });

    it('does nothing when the way round is blocked as well (a corner of walls)', () => {
      const r = new AssistRig({ map: room([at(d.vo), at(d.ho)]), start: START });
      lean(r, d.vertical);
      r.step(30);
      expect(r.trace).toEqual([START]);
    });

    it('does nothing when the diagonal tile itself is blocked, and never half a route', () => {
      const r = new AssistRig({ map: room([at(d.vo), corner(d)]), start: START });
      lean(r, d.vertical);
      r.step(30);
      expect(r.trace.every((t) => t[0] !== corner(d)[0] || t[1] !== corner(d)[1])).toBe(true);
      expect(r.tiles).toBe(0);
    });

    it('never routes through a generator or its blast', () => {
      const [wx, wy] = at(d.vo);
      const r = new AssistRig({ map: room([[wx, wy]]), start: START });
      const [gx, gy] = at(d.ho);
      addGenerator(r.state, { ownerId: 1, x: gx, y: gy, timer: 100000, range: 0 });
      lean(r, d.vertical);
      r.step(30);
      expect(r.trace.every(([x, y]) => !(x === gx && y === gy))).toBe(true);
      expect(r.tiles).toBe(0);
    });
  });

  it('a push straight at the wall (no lean) does not slide sideways in open ground', () => {
    const r = new AssistRig({ map: room([[4, 3]]), start: START });
    r.thumbDown();
    r.push('up', 0.9);
    r.step(40);
    expect(r.trace).toEqual([START]);
  });
});

describe('3. no current directional input, no step', () => {
  it('a corner route is not finished once the thumb has lifted', () => {
    const r = new AssistRig({ map: room([[4, 3]]), start: START });
    lean(r, 130);
    r.step(3); // the first (sideways) step is handed over
    r.lift(); // ...and the thumb leaves
    r.step(120);
    expect(r.trace).toEqual([START, [3, 4]]); // one tile, no autopilot second step
    expect(dirsOf(r)).toEqual(['left']);
  });

  it('a newer direction cancels the owed second step and is performed instead', () => {
    const r = new AssistRig({ map: room([[4, 3]]), start: START });
    lean(r, 130);
    r.step(3);
    r.push('down', 0.9); // changed their mind
    r.step(40);
    expect(r.trace[1]).toEqual([3, 4]);
    expect(r.trace[2]).toEqual([3, 5]); // down, not up
  });

  it('with no thumb and no key down, nothing ever moves the player - not even away from a generator under them', () => {
    const r = new AssistRig({ map: room(), start: START });
    addGenerator(r.state, { ownerId: 1, x: 4, y: 4, timer: 100000, range: 3 });
    r.step(90);
    expect(r.trace).toEqual([START]);
    expect(dirsOf(r)).toEqual([]);
  });

  it('a lifted thumb leaves nothing queued, whichever style', () => {
    for (const style of ['standard', 'beginner'] as const) {
      const r = new AssistRig({ map: room(), start: START, style });
      lean(r, 130);
      r.step(2);
      r.lift();
      r.step(120);
      expect(r.tiles, style).toBe(1);
    }
  });
});

describe('4. Standard vs Beginner Assist', () => {
  /** A dazed player (the simulation ignores a move until `dazedUntil`). */
  function dazed(style: 'standard' | 'beginner'): AssistRig {
    const r = new AssistRig({ map: room(), start: START, style });
    r.p.dazedUntil = r.state.tick + 30;
    return r;
  }

  it('Beginner keeps a tap made while dazed and performs it as soon as the daze ends', () => {
    const r = dazed('beginner');
    r.thumbDown();
    r.push('right', 0.9);
    r.step(4);
    r.lift();
    r.step(80);
    expect(r.trace).toEqual([START, [5, 4]]);
  });

  it('Standard spends that tap on the daze, like the keyboard does: nothing is performed afterwards', () => {
    const r = dazed('standard');
    r.thumbDown();
    r.push('right', 0.9);
    r.step(4);
    r.lift();
    r.step(80);
    expect(r.trace).toEqual([START]);
  });

  it('even Beginner never moves a player who is not pressing anything', () => {
    const r = dazed('beginner');
    r.step(100);
    expect(r.trace).toEqual([START]);
  });
});

describe('5. keyboard movement is unchanged', () => {
  it.each(['auto', 'on'] as const)('a key tap is one tile and a held key a straight line (%s)', (assist) => {
    const tap = new AssistRig({ map: room(), start: START, assist });
    tap.keyDown('up');
    tap.step(3);
    tap.keyUp('up');
    tap.step(60);
    expect(tap.trace).toEqual([START, [4, 3]]);

    const hold = new AssistRig({ map: room(), start: START, assist });
    hold.keyDown('left');
    hold.step(80);
    hold.keyUp('left');
    expect(hold.at).toEqual([0, 4]);
    expect(hold.trace.every(([, y]) => y === 4)).toBe(true);
  });

  it('the style setting changes nothing for a key', () => {
    for (const style of ['standard', 'beginner'] as const) {
      const r = new AssistRig({ map: room(), start: START, assist: 'on', style });
      r.keyDown('up');
      r.keyDown('left');
      r.step(3);
      r.keyUp('up');
      r.keyUp('left');
      r.step(80);
      expect(r.tiles, style).toBe(1); // the latest press wins, one tile
    }
  });

  it('a stale diagonal on the stick does not turn a key press into a route', () => {
    const r = new AssistRig({ map: room([[4, 3]]), start: START, assist: 'on' });
    r.thumbDown();
    r.aim(130, 0.9);
    r.keyDown('left');
    r.step(3);
    r.keyUp('left');
    expect(dirsOf(r)).toEqual(['left']);
    expect(r.trace).toEqual([START, [3, 4]]);
  });
});

describe('6. gamepad movement is unchanged', () => {
  it.each(['auto', 'on'] as const)(
    'a D-pad tap is one tile and a held D-pad a straight line (%s)',
    (assist) => {
      const tap = new AssistRig({ map: room(), start: START, assist });
      tap.pad(['down']);
      tap.step(3);
      tap.pad([]);
      tap.step(60);
      expect(tap.trace).toEqual([START, [4, 5]]);

      const hold = new AssistRig({ map: room(), start: START, assist });
      hold.pad(['right']);
      hold.step(80);
      expect(hold.at).toEqual([8, 4]);
      expect(hold.trace.every(([, y]) => y === 4)).toBe(true);
    },
  );

  it('a stale diagonal on the stick does not turn a D-pad press into a route', () => {
    const r = new AssistRig({ map: room([[4, 3]]), start: START, assist: 'on' });
    r.thumbDown();
    r.aim(130, 0.9);
    r.pad(['left']);
    r.step(8);
    expect(dirsOf(r)).toEqual(['left']);
    expect(r.trace).toEqual([START, [3, 4]]);
  });
});

describe('7. Assisted movement Off keeps the previous precise touch behaviour', () => {
  it.each(DIAGONALS)('$name: a diagonal flick is its main axis, one tile, even beside a wall', (d) => {
    const r = new AssistRig({ map: room([at(d.vo)]), start: START, assist: 'off' });
    lean(r, d.vertical);
    r.step(3);
    r.lift();
    r.step(120);
    expect(r.tiles).toBe(0); // blocked: Off never goes round it
  });

  it('Auto after the keyboard was used does not use the corner route until the touchscreen is touched again', () => {
    const r = new AssistRig({ map: room([[4, 3]]), start: START, assist: 'auto' });
    r.keyDown('up');
    r.keyUp('up');
    r.step(40);
    expect(r.tiles).toBe(0); // up is a wall
    r.thumbDown(); // touching the stick switches the device back to touch
    r.aim(130, 0.9);
    r.step(30);
    expect(r.trace.slice(0, 3)).toEqual([START, [3, 4], [3, 3]]);
  });
});

describe('the planner and the gate, directly', () => {
  const board = (blocked: string[]): MoveBoard => ({
    x: 5,
    y: 5,
    open: (x, y) => !blocked.includes(`${x},${y}`),
    soft: () => false,
    safe: () => true,
    vec: (d) => DIR_VEC[d],
  });

  it('plans the vertical-first route when both are valid, falls back to the reverse, and to nothing when neither is whole', () => {
    expect(planDiagonal(board([]), { primary: 'up', secondary: 'left' })).toEqual(['up', 'left']);
    expect(planDiagonal(board(['5,4']), { primary: 'up', secondary: 'left' })).toEqual(['left', 'up']);
    expect(planDiagonal(board(['4,5']), { primary: 'up', secondary: 'left' })).toEqual(['up', 'left']);
    expect(planDiagonal(board(['4,4']), { primary: 'up', secondary: 'left' })).toBeNull();
    expect(planDiagonal(board(['5,4', '4,5']), { primary: 'up', secondary: 'left' })).toBeNull();
    expect(planDiagonal(board([]), { primary: 'up', secondary: 'down' })).toBeNull();
  });

  const assistFor = (
    blocked: string[],
    style: 'standard' | 'beginner' = 'standard',
    x = 5,
    y = 5,
  ): GateAssist => ({
    level: 'full',
    touch: true,
    style,
    board: () => ({ ...board(blocked), x, y }),
    diagonal: { primary: 'up', secondary: 'left' },
  });

  it('the gate plans no route while the main direction is legal (open space)', () => {
    const gate = new MoveGate();
    const active = new Set<Dir>(['up']);
    gate.press('up', 0);
    expect(gate.next(0, 'up', active, true, () => true, assistFor([]))).toBe('up');
    // the second step is never owed: with the thumb lifted nothing comes
    expect(gate.next(10, null, new Set<Dir>(), true, () => true, assistFor([], 'standard', 5, 4))).toBeNull();
  });

  it('the gate hands over the first step of a corner route and the second only while the thumb is still down', () => {
    const blockedUp = (d: Dir): boolean => d !== 'up';
    const gate = new MoveGate();
    const active = new Set<Dir>(['up']);
    gate.press('up', 0);
    expect(gate.next(0, 'up', active, true, blockedUp, assistFor(['5,4']))).toBe('left');
    // on (4,5) with the thumb still on up: the owed step is 'up'
    expect(gate.next(10, 'up', active, true, () => true, assistFor(['5,4'], 'standard', 4, 5))).toBe('up');

    const lifted = new MoveGate();
    lifted.press('up', 0);
    expect(lifted.next(0, 'up', active, true, blockedUp, assistFor(['5,4']))).toBe('left');
    expect(
      lifted.next(10, null, new Set<Dir>(), true, () => true, assistFor(['5,4'], 'standard', 4, 5)),
    ).toBeNull();
  });

  it('the gate drops the second step when the player is not where the route put them', () => {
    const gate = new MoveGate();
    const active = new Set<Dir>(['up']);
    gate.press('up', 0);
    expect(gate.next(0, 'up', active, true, (d) => d !== 'up', assistFor(['5,4']))).toBe('left');
    // still on (5,5): the first step did not happen (stunned, teleported ...)
    expect(gate.next(10, 'up', active, true, (d) => d !== 'up', assistFor(['5,4']))).not.toBe('up');
  });

  it('without a diagonal on the assist (keyboard, gamepad, Off) the gate never plans a route', () => {
    const gate = new MoveGate();
    const assist: GateAssist = { level: 'full', board: () => board([]), diagonal: null };
    gate.press('up', 0);
    expect(gate.next(0, 'up', new Set<Dir>(['up']), true, () => true, assist)).toBe('up');
    expect(gate.next(10, null, new Set<Dir>(), true, () => true, assist)).toBeNull();
  });
});
