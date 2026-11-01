/**
 * Touchscreen diagonal corner movement (decision MV3): a diagonal thumb is TWO cardinal grid moves, the
 * vertical one first, the reverse order only when that route is blocked, and a route is only ever performed
 * whole. Keyboard, gamepad and "Assisted movement: Off" keep the movement they always had.
 *
 * The REAL InputManager + stick model + simulation, wired as MatchController wires them (`AssistRig`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MoveBoard } from '../src/input';
import { MoveGate } from '../src/input/moveGate';
import type { GateAssist } from '../src/input/moveGate';
import { planDiagonal } from '../src/input/moveAssist';
import { DIR_VEC, Tile } from '../src/sim';
import type { Dir, Flame, GameState } from '../src/sim';
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
  /** Thumb angles (0 = right, 90 = up): one with the vertical axis dominant, one with the horizontal axis. */
  angles: [number, number];
  /** Preferred order. */
  first: Dir;
  second: Dir;
  /** Offsets of the vertical / horizontal neighbours and of the diagonal tile. */
  v: [number, number];
  h: [number, number];
}

const DIAGONALS: Diag[] = [
  { name: 'up-left', angles: [130, 140], first: 'up', second: 'left', v: [0, -1], h: [-1, 0] },
  { name: 'up-right', angles: [50, 40], first: 'up', second: 'right', v: [0, -1], h: [1, 0] },
  { name: 'down-left', angles: [230, 220], first: 'down', second: 'left', v: [0, 1], h: [-1, 0] },
  { name: 'down-right', angles: [-50, -40], first: 'down', second: 'right', v: [0, 1], h: [1, 0] },
];
const at = (o: [number, number]): [number, number] => [START[0] + o[0], START[1] + o[1]];
const corner = (d: Diag): [number, number] => [START[0] + d.v[0] + d.h[0], START[1] + d.v[1] + d.h[1]];

/** A short flick of the thumb towards `deg`, then the finger lifts: nothing is held, so only the tap itself acts. */
function flick(r: AssistRig, deg: number): void {
  r.thumbDown();
  r.aim(deg, 0.9);
  r.step(3);
  r.lift();
  r.step(120);
}

const dirsOf = (r: AssistRig): Dir[] => r.movesDelivered.map((m) => m.move);

describe('1. the vertical step comes first when both routes are valid', () => {
  it('up-left chooses Up -> Left', () => {
    const r = new AssistRig({ map: room(), start: START });
    flick(r, 130);
    expect(r.trace).toEqual([START, [4, 3], [3, 3]]);
    expect(dirsOf(r)).toEqual(['up', 'left']);
    r.assertCleanTrace();
  });
});

describe.each(DIAGONALS)('$name', (d) => {
  describe.each(d.angles)('thumb at %i degrees', (deg) => {
    it('3. takes the preferred route, vertical then horizontal, when both are valid', () => {
      const r = new AssistRig({ map: room(), start: START });
      flick(r, deg);
      expect(r.trace).toEqual([START, at(d.v), corner(d)]);
      expect(dirsOf(r)).toEqual([d.first, d.second]);
      r.assertCleanTrace();
    });

    it('2/3. falls back to horizontal then vertical when the vertical neighbour is blocked', () => {
      const [wx, wy] = at(d.v);
      const r = new AssistRig({ map: room([[wx, wy]]), start: START });
      flick(r, deg);
      expect(r.trace).toEqual([START, at(d.h), corner(d)]);
      expect(dirsOf(r)).toEqual([d.second, d.first]);
      r.assertCleanTrace();
    });

    it('falls back the same way when that neighbour is a crate (crates are never walked through)', () => {
      const r = new AssistRig({ map: room([], [at(d.v)]), start: START });
      flick(r, deg);
      expect(r.trace).toEqual([START, at(d.h), corner(d)]);
      expect(r.state.tiles[at(d.v)[1] * r.state.width + at(d.v)[0]]).toBe(Tile.Soft);
    });

    it('takes the preferred route when only the horizontal neighbour is blocked', () => {
      const r = new AssistRig({ map: room([at(d.h)]), start: START });
      flick(r, deg);
      expect(r.trace).toEqual([START, at(d.v), corner(d)]);
    });

    it('4. performs no diagonal move when both neighbours are blocked (a corner of walls and crates)', () => {
      const r = new AssistRig({ map: room([at(d.v)], [at(d.h)]), start: START });
      flick(r, deg);
      expect(r.trace).toEqual([START]);
      expect(r.at).toEqual(START);
    });

    it('4. performs no diagonal move when the diagonal tile itself is blocked, and never half of one', () => {
      const r = new AssistRig({ map: room([corner(d)]), start: START });
      flick(r, deg);
      // neither route is valid: the thumb's plain cardinal behaviour is all that is left (one tile, its main axis)
      expect(r.tiles).toBeLessThanOrEqual(1);
      expect(r.trace.every(([x, y]) => x !== corner(d)[0] || y !== corner(d)[1])).toBe(true);
      const main = deg === d.angles[0] ? d.v : d.h;
      expect(r.at).toEqual(at(main));
    });

    it('does not enter a generator tile or its blast: no route through a generator on the intermediate tile', () => {
      const r = new AssistRig({ map: room(), start: START });
      const [gx, gy] = at(d.v);
      addGenerator(r.state, { ownerId: 1, x: gx, y: gy, timer: 100000, range: 0 });
      flick(r, deg);
      // Up -> Left is blocked by the generator; Left -> Up would end on its tile's neighbour... the route that
      // does not touch the generator's tile is taken in full, or nothing is
      expect(r.trace.every(([x, y]) => !(x === gx && y === gy))).toBe(true);
      expect(r.tiles === 0 || r.tiles === 2).toBe(true);
    });
  });
});

describe('5. cardinal taps still move exactly one tile', () => {
  const CARDINALS: [Dir, [number, number]][] = [
    ['up', [4, 3]],
    ['down', [4, 5]],
    ['left', [3, 4]],
    ['right', [5, 4]],
  ];
  it.each(CARDINALS)('a %s tap in open floor is one tile, and 20 degrees off the axis too', (dir, to) => {
    const exact = new AssistRig({ map: room(), start: START });
    exact.thumbDown();
    exact.push(dir, 0.9);
    exact.step(3);
    exact.lift();
    exact.step(120);
    expect(exact.trace).toEqual([START, to]);

    const off = new AssistRig({ map: room(), start: START });
    off.thumbDown();
    off.aim({ right: 20, up: 110, left: 200, down: -70 }[dir], 0.9);
    off.step(3);
    off.lift();
    off.step(120);
    expect(off.trace).toEqual([START, to]);
  });

  it.each(CARDINALS)('a %s tap beside walls is still one tile', (dir, to) => {
    // walls on both sides of the corridor the tap runs along
    const r = new AssistRig({
      map: room([
        [3, 3],
        [5, 3],
        [3, 5],
        [5, 5],
      ]),
      start: START,
    });
    r.thumbDown();
    r.push(dir, 0.9);
    r.step(3);
    r.lift();
    r.step(120);
    expect(r.trace).toEqual([START, to]);
  });

  it('a held cardinal still walks a straight line at the step cadence', () => {
    const r = new AssistRig({ map: room(), start: [0, 4] });
    r.thumbDown();
    r.push('right', 0.9);
    r.step(150);
    expect(r.at).toEqual([8, 4]);
    expect(r.trace.every(([, y]) => y === 4)).toBe(true);
  });
});

describe('6. keyboard movement is unchanged', () => {
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

  it('two keys together are never read as a diagonal route', () => {
    const r = new AssistRig({ map: room(), start: START, assist: 'on' });
    r.keyDown('up');
    r.keyDown('left');
    r.step(3);
    r.keyUp('up');
    r.keyUp('left');
    r.step(80);
    // the latest press wins, one tile - exactly what the gate has always done
    expect(r.tiles).toBe(1);
  });

  it('a stale diagonal on the stick does not turn a key press into a route', () => {
    const r = new AssistRig({ map: room(), start: START, assist: 'on' });
    r.thumbDown();
    r.aim(130, 0.9); // the thumb rests on a diagonal...
    r.keyDown('left'); // ...but the player now uses the keyboard
    r.step(3);
    r.keyUp('left');
    expect(dirsOf(r)).toEqual(['left']);
    expect(r.trace).toEqual([START, [3, 4]]);
  });
});

describe('7. gamepad movement is unchanged', () => {
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
    const r = new AssistRig({ map: room(), start: START, assist: 'on' });
    r.thumbDown();
    r.aim(130, 0.9);
    r.pad(['left']);
    r.step(8);
    expect(dirsOf(r)).toEqual(['left']);
    expect(r.trace).toEqual([START, [3, 4]]);
  });
});

describe('8. Assisted movement Off keeps the previous precise touch behaviour', () => {
  it.each(DIAGONALS)('$name: a diagonal flick is its main axis, one tile', (d) => {
    for (const deg of d.angles) {
      const r = new AssistRig({ map: room(), start: START, assist: 'off' });
      flick(r, deg);
      expect(r.tiles).toBe(1);
      expect(r.at).toEqual(at(deg === d.angles[0] ? d.v : d.h));
    }
  });

  it('a held diagonal is a straight line along the main axis, never a staircase', () => {
    const r = new AssistRig({ map: room(), start: [0, 0], assist: 'off' });
    r.thumbDown();
    r.aim(-40, 0.9); // right, leaning down
    r.step(200);
    expect(r.at).toEqual([8, 0]);
    expect(r.trace.every(([, y]) => y === 0)).toBe(true);
  });

  it('is the gate without any assistance: no diagonal key can reach it', () => {
    const gate = new MoveGate();
    gate.press('up', 0);
    expect(gate.next(0, 'up', new Set<Dir>(['up']), true)).toBe('up');
    expect(gate.next(10, 'up', new Set<Dir>(['up']), true)).toBeNull();
  });

  it('Auto on touch and On both use the diagonal (they resolve to full assistance)', () => {
    for (const assist of ['auto', 'on'] as const) {
      const r = new AssistRig({ map: room(), start: START, assist });
      flick(r, 130);
      expect(r.tiles).toBe(2);
    }
  });

  it('Auto after the keyboard was used does not use the diagonal until the touchscreen is touched again', () => {
    const r = new AssistRig({ map: room(), start: START, assist: 'auto' });
    r.keyDown('up');
    r.keyUp('up');
    r.step(40);
    expect(r.tiles).toBe(1);
    r.thumbDown(); // touching the stick switches the device back to touch
    r.aim(130, 0.9);
    r.step(3);
    r.lift();
    r.step(120);
    expect(r.tiles).toBe(3); // the earlier key tap + one two-step route
  });
});

describe('9. a held diagonal repeats predictably, never as a stray zig-zag', () => {
  /** Alternation of the vertical and horizontal axis in the delivered trace. */
  function axes(r: AssistRig): string {
    return r.trace
      .slice(1)
      .map(([x], i) => (x !== r.trace[i]![0] ? 'h' : 'v'))
      .join('');
  }

  it('a held up-left walks whole routes: up, left, up, left ... and stops at the wall', () => {
    const r = new AssistRig({ map: room(), start: [6, 6] });
    r.thumbDown();
    r.aim(130, 0.9);
    r.step(300);
    r.assertCleanTrace();
    // the first six tiles are three complete Up -> Left routes
    expect(axes(r).slice(0, 6)).toBe('vhvhvh');
    expect(r.trace.slice(0, 7)).toEqual([
      [6, 6],
      [6, 5],
      [5, 5],
      [5, 4],
      [4, 4],
      [4, 3],
      [3, 3],
    ]);
    // never moves away from the diagonal it was told
    for (let i = 1; i < r.trace.length; i++) {
      expect(r.trace[i]![0]).toBeLessThanOrEqual(r.trace[i - 1]![0]);
      expect(r.trace[i]![1]).toBeLessThanOrEqual(r.trace[i - 1]![1]);
    }
  });

  it('is identical every time it is run (deterministic)', () => {
    const run = (): string => {
      const r = new AssistRig({ map: room(), start: [6, 6] });
      r.thumbDown();
      r.aim(-40, 0.9);
      r.step(120);
      r.aim(130, 0.9);
      r.step(120);
      return JSON.stringify([r.trace, r.moves]);
    };
    expect(run()).toBe(run());
  });

  it("steps follow each other at the player's own cadence: no two tiles inside one step, no queue of routes", () => {
    const r = new AssistRig({ map: room(), start: [6, 6] });
    r.thumbDown();
    r.aim(130, 0.9);
    r.step(200);
    r.assertCleanTrace();
    expect(r.stepTicks.length).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < r.stepTicks.length; i++)
      expect(r.stepTicks[i]! - r.stepTicks[i - 1]!).toBeGreaterThanOrEqual(10); // base step = 10 ticks
  });

  it('a wobbling diagonal thumb only ever goes up and left, one clean tile at a time', () => {
    const r = new AssistRig({ map: room(), start: [8, 8] });
    r.thumbDown();
    for (let i = 0; i < 300; i++) {
      r.aim(135 + (i % 2 ? 7 : -7), 0.9);
      r.step(1);
    }
    r.lift();
    r.assertCleanTrace();
    for (let i = 1; i < r.trace.length; i++) {
      expect(r.trace[i]![0]).toBeLessThanOrEqual(r.trace[i - 1]![0]);
      expect(r.trace[i]![1]).toBeLessThanOrEqual(r.trace[i - 1]![1]);
    }
  });

  it('lifting the thumb between two steps finishes the route, then nothing more happens', () => {
    const r = new AssistRig({ map: room(), start: START });
    r.thumbDown();
    r.aim(130, 0.9);
    r.step(1);
    r.lift();
    r.step(200);
    expect(r.trace).toEqual([START, [4, 3], [3, 3]]);
  });

  it('a route is never left half done by the thumb: a new press mid-route does not drop its second step', () => {
    const r = new AssistRig({ map: room(), start: START });
    r.thumbDown();
    r.aim(130, 0.9);
    r.step(2);
    r.push('down', 0.9); // the thumb swings away before the second step is due
    r.step(1);
    r.lift();
    r.step(200);
    expect(r.trace[1]).toEqual([4, 3]);
    expect(r.trace[2]).toEqual([3, 3]);
  });

  it('a second step that has become dangerous is not taken; the player simply stands on the intermediate tile', () => {
    const r = new AssistRig({ map: room(), start: START });
    r.thumbDown();
    r.aim(130, 0.9);
    r.step(1);
    r.lift();
    const f: Flame = {
      x: 3,
      y: 3,
      eventId: 900,
      genId: 900,
      ownerId: 1,
      dir: null,
      tip: false,
      startTick: r.state.tick,
      endTick: r.state.tick + 600,
    };
    r.state.flames.push(f);
    r.step(80);
    expect(r.trace).toEqual([START, [4, 3]]);
  });

  it('a route is planned whole from the start tile: a danger on its second tile means it never starts', () => {
    const r = new AssistRig({ map: room(), start: START });
    r.state.flames.push({
      x: 3,
      y: 3,
      eventId: 901,
      genId: 901,
      ownerId: 1,
      dir: null,
      tip: false,
      startTick: 0,
      endTick: 600,
    } satisfies Flame);
    flick(r, 130);
    // the flame sits on the shared diagonal tile: neither order is valid, so no half route is made
    expect(r.trace.some(([x, y]) => x === 3 && y === 3)).toBe(false);
    expect(r.tiles).toBeLessThanOrEqual(1);
  });
});

describe('10. ordinary wall, crate and one-tile corridor corners', () => {
  it('a wall block on the diagonal tile makes no route: the thumb keeps its plain main-axis step', () => {
    const r = new AssistRig({ map: room([[4, 3]]), start: [5, 4] });
    flick(r, 130); // up-left: the diagonal tile (4,3) is the wall
    expect(r.trace).toEqual([
      [5, 4],
      [5, 3],
    ]);
  });

  it('turns the corner of a one-tile corridor in the order the walls allow', () => {
    const map = ['######', '#..###', '##.###', '######'];
    // (1,1) down-right: Down is a wall, so Right -> Down
    const a = new AssistRig({ map, start: [1, 1] });
    flick(a, -40);
    expect(a.trace).toEqual([
      [1, 1],
      [2, 1],
      [2, 2],
    ]);
    // and back, (2,2) up-left: Up -> Left is open
    const b = new AssistRig({ map, start: [2, 2] });
    flick(b, 130);
    expect(b.trace).toEqual([
      [2, 2],
      [2, 1],
      [1, 1],
    ]);
  });

  it('walks a one-tile staircase corridor one whole route at a time', () => {
    const map = ['#######', '#.#####', '#..####', '##..###', '###..##', '####.##', '#######'];
    const r = new AssistRig({ map, start: [1, 1] });
    r.thumbDown();
    r.aim(-40, 0.9); // down-right held
    r.step(300);
    r.lift();
    r.assertCleanTrace();
    // Down -> Right each time: (1,1) -> (1,2) -> (2,2) -> (2,3) -> (3,3) -> (3,4) -> (4,4) -> (4,5)
    expect(r.trace.slice(0, 8)).toEqual([
      [1, 1],
      [1, 2],
      [2, 2],
      [2, 3],
      [3, 3],
      [3, 4],
      [4, 4],
      [4, 5],
    ]);
  });

  it('stays put in a dead end whose both diagonal neighbours are walls', () => {
    const map = ['#####', '#.#S#', '###.#', '#####'];
    const r = new AssistRig({ map, start: [1, 1] });
    flick(r, -40);
    expect(r.trace).toEqual([[1, 1]]);
  });

  it('does not pass through a crate on the route, and goes round it when the other order is free', () => {
    const r = new AssistRig({ map: room([], [[4, 5]]), start: START });
    flick(r, -40); // down-right: Down is the crate, so Right -> Down
    expect(r.trace).toEqual([START, [5, 4], [5, 5]]);
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

  it('prefers vertical-first for all four diagonals regardless of which axis is the stick main axis', () => {
    for (const [p, s, want] of [
      ['up', 'left', ['up', 'left']],
      ['left', 'up', ['up', 'left']],
      ['up', 'right', ['up', 'right']],
      ['right', 'up', ['up', 'right']],
      ['down', 'left', ['down', 'left']],
      ['left', 'down', ['down', 'left']],
      ['down', 'right', ['down', 'right']],
      ['right', 'down', ['down', 'right']],
    ] as [Dir, Dir, Dir[]][])
      expect(planDiagonal(board([]), { primary: p, secondary: s })).toEqual(want);
  });

  it('falls back to the reverse route, and to nothing when neither is whole', () => {
    expect(planDiagonal(board(['5,4']), { primary: 'up', secondary: 'left' })).toEqual(['left', 'up']);
    expect(planDiagonal(board(['4,5']), { primary: 'up', secondary: 'left' })).toEqual(['up', 'left']);
    expect(planDiagonal(board(['4,4']), { primary: 'up', secondary: 'left' })).toBeNull();
    expect(planDiagonal(board(['5,4', '4,5']), { primary: 'up', secondary: 'left' })).toBeNull();
    expect(planDiagonal(board([]), { primary: 'up', secondary: 'down' })).toBeNull();
  });

  it('the gate hands over a route as two steps and owes the second to the next ready tick only', () => {
    const gate = new MoveGate();
    const assist: GateAssist = {
      level: 'full',
      board: () => ({ ...board([]), x: 5, y: 5 }),
      diagonal: { primary: 'up', secondary: 'left' },
    };
    const active = new Set<Dir>(['up']);
    const legal = (): boolean => true;
    gate.press('up', 0);
    expect(gate.next(0, 'up', active, true, legal, assist)).toBe('up');
    expect(gate.next(1, 'up', active, false, legal, assist)).toBeNull(); // mid-step: nothing
    // the player is now on (5,4): the owed second step is a plain step from there
    const moved: GateAssist = { ...assist, board: () => ({ ...board([]), x: 5, y: 4 }) };
    expect(gate.next(10, null, new Set<Dir>(), true, legal, moved)).toBe('left');
    expect(gate.next(20, null, new Set<Dir>(), true, legal, moved)).toBeNull(); // and only once
  });

  it('the gate drops the second step when the player is not where the route put them', () => {
    const gate = new MoveGate();
    const assist: GateAssist = {
      level: 'full',
      board: () => board([]),
      diagonal: { primary: 'up', secondary: 'left' },
    };
    gate.press('up', 0);
    expect(gate.next(0, 'up', new Set<Dir>(['up']), true, () => true, assist)).toBe('up');
    // still on (5,5): the first step did not happen (stunned, teleported ...) - no second step from there
    expect(gate.next(10, null, new Set<Dir>(), true, () => true, assist)).toBeNull();
  });

  it('without a diagonal on the assist (keyboard, gamepad, Off) the gate never plans a route', () => {
    const gate = new MoveGate();
    const assist: GateAssist = { level: 'full', board: () => board([]), diagonal: null };
    gate.press('up', 0);
    expect(gate.next(0, 'up', new Set<Dir>(['up']), true, () => true, assist)).toBe('up');
    expect(gate.next(10, null, new Set<Dir>(), true, () => true, assist)).toBeNull();
  });
});

describe('state for the tests is real', () => {
  it('the helper board is a clean room with the corner kept clear for the opponent', () => {
    const r = new AssistRig({ map: room(), start: START });
    const s: GameState = r.state;
    expect(s.tiles[START[1] * s.width + START[0]]).toBe(Tile.Empty);
    expect(s.tiles[10 * s.width + 14]).toBe(Tile.Empty);
  });
});
