import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOVE_REPEAT_DELAY_TICKS } from '../src/input/moveGate';
import { stickConfigFor } from '../src/input/joystick';
import { Tile, tileIndex } from '../src/sim';
import type { Dir, Flame, GameState, StageEvent } from '../src/sim';
import { AssistRig, carve } from './assistRig';
import { addGenerator, addSoft } from './helpers';

/**
 * Assisted movement (decisions RE-A): the real InputManager + stick model + simulation, wired as
 * MatchController wires them. The simulation is never changed: the assist only picks which orthogonal
 * direction to hand over, and every substituted move is a plain, safe step.
 */
afterEach(() => vi.unstubAllGlobals());

/** A corridor along y=1 with a side street down at x=5 (two tiles deep). */
const CORNER = ['###########', '#.........#', '#####.#####', '#####.#####', '###########'];

/** A corridor along y=2 with an alley up at x=5 (two tiles deep). */
const ALLEY = ['#####.###', '#####.###', '#.......#', '#########'];

describe('early turn buffering (a turn pressed early is carried to the junction)', () => {
  it('a turn pressed two tiles before the opening is carried there and taken (touch)', () => {
    const r = new AssistRig({ map: CORNER, start: [1, 1] });
    r.thumbDown();
    r.push('right');
    r.until(3, 1);
    r.push('down'); // two tiles before the side street at x=5
    r.step(120);
    expect(r.at).toEqual([5, 3]);
    r.assertCleanTrace();
    // it went along the corridor to the opening, THEN turned: (4,1), (5,1), (5,2), (5,3)
    expect(r.trace.slice(-4)).toEqual([
      [4, 1],
      [5, 1],
      [5, 2],
      [5, 3],
    ]);
  });

  it('one tile early works too, and the turn is taken at the first opening, not a later one', () => {
    const map = ['###########', '#.........#', '#####.#.###', '#####.#.###', '###########'];
    const r = new AssistRig({ map, start: [1, 1] });
    r.thumbDown();
    r.push('right');
    r.until(4, 1);
    r.push('down');
    r.step(120);
    expect(r.at).toEqual([5, 3]);
    r.assertCleanTrace();
  });

  it('a turn with no opening in reach is delivered at once: the player faces the wall and stops (no wandering)', () => {
    const r = new AssistRig({ map: CORNER, start: [1, 1] });
    r.thumbDown();
    r.push('right');
    r.until(2, 1); // the side street is three tiles away: out of reach
    r.push('down');
    r.step(120);
    expect(r.at).toEqual([2, 1]);
    expect(r.p.facing).toBe('down');
    r.assertCleanTrace();
  });

  it('toggle off keeps the previous one-tile corner buffer exactly', () => {
    const r = new AssistRig({ map: CORNER, start: [1, 1], assist: 'off' });
    r.thumbDown();
    r.push('right');
    r.until(3, 1);
    r.push('down'); // two tiles early: WA2 carries one tile, then delivers the (blocked) turn
    r.step(120);
    expect(r.at).toEqual([4, 1]);
    const r2 = new AssistRig({ map: CORNER, start: [1, 1], assist: 'off' });
    r2.thumbDown();
    r2.push('right');
    r2.until(4, 1);
    r2.push('down'); // one tile early: carried and taken
    r2.step(120);
    expect(r2.at).toEqual([5, 3]);
  });

  it('a released flick is one plain press: nothing is carried after the thumb lifts (release stops at once)', () => {
    const r = new AssistRig({ map: CORNER, start: [1, 1] });
    r.thumbDown();
    r.push('right');
    r.until(3, 1);
    r.push('down');
    r.lift();
    r.step(120);
    expect(r.at[1]).toBe(1); // never reached the side street
    expect(r.at[0]).toBeLessThanOrEqual(4); // at most the step already under way
    r.assertCleanTrace();
  });

  it('standing still, a single press is exactly one tile and nothing else', () => {
    const r = new AssistRig({ map: CORNER, start: [3, 1] });
    r.thumbDown();
    r.push('right');
    r.step(4);
    r.lift();
    r.step(120);
    expect(r.at).toEqual([4, 1]);
    expect(r.tiles).toBe(1);
  });
});

describe('sidestep: a direction pushed against a wall with the opening one tile along the corridor', () => {
  it('holding up beside an alley slides to the alley and goes up (either side)', () => {
    for (const [from, via] of [
      [4, 5],
      [6, 5],
    ] as const) {
      const r = new AssistRig({ map: ALLEY, start: [from, 2] });
      r.thumbDown();
      r.push('up');
      r.step(150);
      expect(r.at).toEqual([5, 0]);
      expect(r.trace[1]).toEqual([via, 2]);
      r.assertCleanTrace();
    }
  });

  it('toggle off: the player just stands against the wall', () => {
    const r = new AssistRig({ map: ALLEY, start: [4, 2], assist: 'off' });
    r.thumbDown();
    r.push('up');
    r.step(150);
    expect(r.at).toEqual([4, 2]);
  });

  it('is part of a deliberate hold: a quick tap at the wall never slides (a press is one tile)', () => {
    const r = new AssistRig({ map: ALLEY, start: [4, 2] });
    r.thumbDown();
    r.push('up');
    r.step(MOVE_REPEAT_DELAY_TICKS - 2);
    r.lift();
    r.step(150);
    expect(r.at).toEqual([4, 2]);
    expect(r.tiles).toBe(0);
  });

  it('two openings beside the player: no guessing (it stays), unless the way they just walked decides', () => {
    const two = ['###.#.###', '###.#.###', '#.......#', '#########'];
    const still = new AssistRig({ map: two, start: [4, 2] });
    still.thumbDown();
    still.push('up');
    still.step(150);
    expect(still.at).toEqual([4, 2]);
    // walking right and then pushing up: the turn plan takes the opening ahead, in the walking direction
    const walk = new AssistRig({ map: two, start: [2, 2] });
    walk.thumbDown();
    walk.push('right');
    walk.until(4, 2);
    walk.push('up');
    walk.step(150);
    expect(walk.at[0]).toBe(5);
    expect(walk.at[1]).toBe(0);
  });

  it('never slides away from a crate (the player is about to bomb it)', () => {
    const map = ['#####.###', '####S.###', '#.......#', '#########'];
    const r = new AssistRig({ map, start: [4, 2] });
    r.thumbDown();
    r.push('up');
    r.step(150);
    expect(r.at).toEqual([4, 2]);
  });

  it('a wall with no opening anywhere near does nothing', () => {
    const r = new AssistRig({ map: ALLEY, start: [2, 2] });
    r.thumbDown();
    r.push('up');
    r.step(150);
    expect(r.at).toEqual([2, 2]);
  });
});

describe('diagonal thumb: main axis now, secondary axis as the next turn', () => {
  it('walks the corridor and takes the side street at the first opening, then keeps going down it', () => {
    const r = new AssistRig({ map: CORNER, start: [1, 1] });
    r.thumbDown();
    r.aim(-40); // right and a little down
    r.step(300);
    expect(r.at).toEqual([5, 3]);
    r.assertCleanTrace();
  });

  it('a thumb only slightly off the axis is just that axis', () => {
    const r = new AssistRig({ map: CORNER, start: [1, 1] });
    r.thumbDown();
    r.aim(-15);
    r.step(300);
    expect(r.at).toEqual([9, 1]);
  });

  it('toggle off: a diagonal thumb is its main axis only (previous behaviour)', () => {
    const r = new AssistRig({ map: CORNER, start: [1, 1], assist: 'off' });
    r.thumbDown();
    r.aim(-40);
    r.step(300);
    expect(r.at).toEqual([9, 1]);
  });

  it('a flick is still exactly one tile, diagonal or not', () => {
    const r = new AssistRig({ map: CORNER, start: [4, 1] });
    r.thumbDown();
    r.aim(-40);
    r.step(5);
    r.lift();
    r.step(120);
    expect(r.at).toEqual([5, 1]);
    expect(r.tiles).toBe(1);
  });

  it('in open ground a diagonal thumb walks a clean staircase: right, down, right, down ...', () => {
    const field = Array.from({ length: 11 }, () => '..............');
    const r = new AssistRig({ map: field, start: [0, 0] });
    r.thumbDown();
    r.aim(-44);
    r.step(200);
    r.lift();
    r.assertCleanTrace();
    expect(r.tiles).toBeGreaterThan(6);
    for (let i = 1; i < r.trace.length; i++) {
      expect(r.trace[i]![0]).toBeGreaterThanOrEqual(r.trace[i - 1]![0]);
      expect(r.trace[i]![1]).toBeGreaterThanOrEqual(r.trace[i - 1]![1]);
    }
    // alternating after the first flick tile: never two vertical or two horizontal steps in a row
    const dirs = r.trace.slice(1).map(([x], i) => (x !== r.trace[i]![0] ? 'h' : 'v'));
    for (let i = 1; i < dirs.length; i++) expect(dirs[i]).not.toBe(dirs[i - 1]);
  });

  it('a wobbling thumb around the diagonal never zig-zags: the path only ever goes right and down', () => {
    const field = Array.from({ length: 11 }, () => '..............');
    const r = new AssistRig({ map: field, start: [0, 0] });
    r.thumbDown();
    for (let i = 0; i < 300; i++) {
      r.aim(-45 + (i % 2 ? 6 : -6));
      r.step(1);
    }
    r.lift();
    r.assertCleanTrace();
    for (let i = 1; i < r.trace.length; i++) {
      expect(r.trace[i]![0]).toBeGreaterThanOrEqual(r.trace[i - 1]![0]);
      expect(r.trace[i]![1]).toBeGreaterThanOrEqual(r.trace[i - 1]![1]);
    }
  });

  it('a wobble near the axis stays on the row', () => {
    const field = Array.from({ length: 11 }, () => '..............');
    const r = new AssistRig({ map: field, start: [0, 0] });
    r.thumbDown();
    for (let i = 0; i < 300; i++) {
      r.aim(-14 + (i % 2 ? 5 : -5));
      r.step(1);
    }
    expect(r.trace.every(([, y]) => y === 0)).toBe(true);
    expect(r.tiles).toBeGreaterThan(5);
  });

  it('never cuts a blocked corner: with both neighbours solid the diagonal tile is unreachable', () => {
    const map = ['#####', '###.#', '##.##', '#####'];
    const r = new AssistRig({ map, start: [2, 2] });
    r.thumbDown();
    r.aim(45);
    r.step(200);
    expect(r.at).toEqual([2, 2]);
    expect(r.tiles).toBe(0);
  });
});

describe('direction switching', () => {
  it('a swipe through the stick centre cannot leak a stray perpendicular step', () => {
    const field = Array.from({ length: 11 }, () => '..............');
    const stray = (assist: 'on' | 'off'): number => {
      const r = new AssistRig({ map: field, start: [7, 5], assist });
      r.thumbDown();
      r.push('right');
      r.step(3);
      r.lift();
      r.thumbDown();
      r.push('right');
      // wait for a tick on which the player can step, then sweep right -> (transient down) -> left
      while (r.p.stepRemaining > 1) r.step(1);
      r.input.setTouchDir('down');
      r.step(1);
      r.input.setTouchDir('left');
      r.step(40);
      r.lift();
      return r.trace.filter(([, y]) => y !== 5).length;
    };
    expect(stray('off')).toBeGreaterThan(0); // the old behaviour does leak it
    expect(stray('on')).toBe(0);
  });

  it('rapid direction changes keep every step a single legal tile', () => {
    const r = new AssistRig({ map: ALLEY, start: [3, 2] });
    r.thumbDown();
    const seq: Dir[] = ['right', 'up', 'left', 'down', 'right', 'up', 'right', 'left', 'up', 'down', 'left'];
    for (let i = 0; i < 120; i++) {
      if (i % 5 === 0) r.push(seq[(i / 5) % seq.length]!);
      r.step(1);
    }
    r.assertCleanTrace();
  });
});

describe('phone viewports (stick sizes) and portrait', () => {
  const SIZES: [number, number][] = [
    [568, 320],
    [667, 375],
    [740, 360],
    [844, 390],
    [932, 430],
    [390, 844], // portrait
    [360, 740],
  ];
  it.each(SIZES)('%i x %i: early turn, sidestep and diagonal wish all work with that stick', (w, h) => {
    const corner = new AssistRig({ map: CORNER, start: [1, 1], viewport: [w, h] });
    corner.thumbDown();
    corner.push('right', 0.9);
    corner.until(3, 1);
    corner.push('down', 0.9);
    corner.step(120);
    expect(corner.at).toEqual([5, 3]);

    const alley = new AssistRig({ map: ALLEY, start: [4, 2], viewport: [w, h] });
    alley.thumbDown();
    alley.push('up', 0.9);
    alley.step(150);
    expect(alley.at).toEqual([5, 0]);

    const diag = new AssistRig({ map: CORNER, start: [1, 1], viewport: [w, h] });
    diag.thumbDown();
    diag.aim(-40, 0.9);
    diag.step(300);
    expect(diag.at).toEqual([5, 3]);

    // and a resting thumb inside the dead zone still never walks
    const rest = new AssistRig({ map: CORNER, start: [1, 1], viewport: [w, h] });
    rest.thumbDown();
    const c = stickConfigFor(w, h);
    for (let i = 0; i < 60; i++) {
      rest.input.setTouchDir(
        rest.stick.move(1, rest.stick.originX + ((i % 3) - 1) * (c.deadZone - 2), rest.stick.originY),
        rest.stick.wish,
      );
      rest.step(1);
    }
    expect(rest.tiles).toBe(0);
  });
});

// ------------------------------------------------------------------ safety

/** Marks tile (x, y) as dangerous; `anchor` is where a generator stands whose blast covers it. */
type Hazard = (s: GameState, x: number, y: number, anchor: [number, number]) => void;

const flame: Hazard = (s, x, y) => {
  const f: Flame = {
    x,
    y,
    eventId: 900,
    genId: 900,
    ownerId: 1,
    dir: null,
    tip: false,
    startTick: s.tick,
    endTick: s.tick + 600,
  };
  s.flames.push(f);
};
const crushWarning: Hazard = (s, x, y) => {
  s.crush = {
    order: [],
    next: 0,
    warnAt: [],
    nextAtTick: Infinity,
    pending: [{ index: tileIndex(s, x, y), landTick: s.tick + 6000 }],
  };
};
const lethalStage: Hazard = (s, x, y) => {
  const ev: StageEvent = {
    id: 777,
    hazard: 0,
    kind: 'strike',
    style: 'debris',
    tiles: [tileIndex(s, x, y)],
    dir: null,
    warnTick: s.tick,
    startTick: s.tick + 6000,
    endTick: s.tick + 6100,
    eventId: 5,
    index: -1,
    stepRemaining: 0,
    stepTicks: 0,
  };
  s.stage.events.push(ev);
};
const floorTrap: Hazard = (s, x, y) => {
  s.floorHazards[tileIndex(s, x, y)] = 'oil';
};
/** An armed generator whose blast covers the tile (it stands two tiles further along the alley). */
const generatorFootprint: Hazard = (s, _x, _y, anchor) => {
  addGenerator(s, { ownerId: 1, x: anchor[0], y: anchor[1], range: 3, timer: 6000 });
};

const HAZARDS: [string, Hazard][] = [
  ['a flame', flame],
  ['a Wahala Crush warning', crushWarning],
  ['a warned lethal stage event', lethalStage],
  ['a live floor trap', floorTrap],
  ['an armed generator footprint', generatorFootprint],
];

describe.each(HAZARDS)('assistance never auto-travels into %s', (_name, mark) => {
  it('sidestep refuses a danger on the side tile or on the alley tile', () => {
    for (const [x, y] of [
      [5, 2], // the tile it would slide onto
      [5, 1], // the first tile of the alley
    ] as const) {
      const r = new AssistRig({ map: ALLEY, start: [4, 2] });
      mark(r.state, x, y, [5, 0]);
      r.thumbDown();
      r.push('up');
      r.step(100);
      expect(r.at).toEqual([4, 2]);
    }
    // control: the same scene without the danger does slide
    const clean = new AssistRig({ map: ALLEY, start: [4, 2] });
    clean.thumbDown();
    clean.push('up');
    clean.step(150);
    expect(clean.at).toEqual([5, 0]);
  });

  it('an early turn is not carried through it, and a diagonal wish does not turn into it', () => {
    const r = new AssistRig({ map: CORNER, start: [1, 1] });
    mark(r.state, 4, 1, [7, 1]); // the corridor tile the carry would walk through
    r.thumbDown();
    r.push('right');
    r.until(3, 1);
    r.push('down');
    r.step(100);
    expect(r.at).toEqual([3, 1]);

    const w = new AssistRig({ map: CORNER, start: [1, 1] });
    mark(w.state, 5, 2, [5, 3]); // the side street the wish would turn into
    w.thumbDown();
    w.aim(-40);
    w.step(100);
    // it walked on along the corridor but never into the side street
    expect(w.trace.some(([, y]) => y > 1)).toBe(false);

    // control: the same scenes with the danger far away DO carry / turn
    const far = new AssistRig({ map: CORNER, start: [1, 1] });
    mark(far.state, 9, 1, [9, 1]);
    far.thumbDown();
    far.push('right');
    far.until(3, 1);
    far.push('down');
    far.step(100);
    expect(far.at).toEqual([5, 3]);
    const farWish = new AssistRig({ map: CORNER, start: [1, 1] });
    mark(farWish.state, 9, 1, [9, 1]);
    farWish.thumbDown();
    farWish.aim(-40);
    farWish.step(300);
    expect(farWish.at).toEqual([5, 3]);
  });
});

describe('assistance never helps the player through solid objects or generators', () => {
  it('an armed generator in the way is never walked into or around by the assist', () => {
    // generator in the corridor; the player has no contact ability: holding right must not slide round it
    const map = ['#########', '#.......#', '#.......#', '#########'];
    const r = new AssistRig({ map, start: [2, 1] });
    addGenerator(r.state, { ownerId: 1, x: 3, y: 1, range: 2, timer: 6000, mode: 'remote' });
    r.thumbDown();
    r.push('right');
    r.step(200);
    expect(r.at).toEqual([2, 1]); // stays: the raw press hits the generator, no assist route round its footprint
    expect(r.state.generators.some((g) => g.x === r.p.x && g.y === r.p.y)).toBe(false);
  });

  it('never walks through concrete or crates when the intent was a legal alternative', () => {
    const map = ['#####', '#.S.#', '#.#.#', '#...#', '#####'];
    const r = new AssistRig({ map, start: [1, 1] });
    r.thumbDown();
    r.push('right'); // crate ahead
    r.step(100);
    expect(r.at).toEqual([1, 1]);
    r.assertCleanTrace();
  });
});

describe('the explicit hold is never second-guessed', () => {
  it('an explicit press into a dangerous tile still goes there (assistance adds help, never removes control)', () => {
    const r = new AssistRig({ map: CORNER, start: [1, 1] });
    flame(r.state, 2, 1, [2, 1]);
    r.thumbDown();
    r.push('right');
    r.step(6);
    expect(r.at).toEqual([2, 1]);
  });
});

describe('Lagos Island market (tight stall corridors)', () => {
  // row 5 is an aisle; the stall row above it (y=4) has gaps at x=4, 8, 12 ...
  it('walking the aisle and pushing up two tiles early lands in the stall gap and goes up it', () => {
    const r = new AssistRig({ arena: 'rumbleLagosIsland', start: [0, 5] });
    r.thumbDown();
    r.push('right');
    r.until(2, 5);
    r.push('up');
    r.step(200);
    expect(r.at[0]).toBe(4);
    expect(r.at[1]).toBeLessThan(5);
    r.assertCleanTrace();
  });

  it('holding down beside a gap slides to the gap', () => {
    const r = new AssistRig({ arena: 'rumbleLagosIsland', start: [1, 5] });
    r.thumbDown();
    r.push('down'); // gap in the stall row below is at x=2
    r.step(200);
    expect(r.at[0]).toBe(2);
    expect(r.at[1]).toBeGreaterThan(5);
    r.assertCleanTrace();
  });
});

describe('sanity of the helpers', () => {
  it('carve and addSoft agree on tile kinds', () => {
    const r = new AssistRig({ map: CORNER, start: [1, 1] });
    addSoft(r.state, 2, 1);
    expect(r.state.tiles[r.state.width + 2]).toBe(Tile.Soft);
    carve(r.state, CORNER);
    expect(r.state.tiles[r.state.width + 2]).toBe(Tile.Empty);
  });
});
