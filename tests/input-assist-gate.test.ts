import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOVE_ASSIST_SETTINGS, buildMoveBoard, resolveAssistLevel } from '../src/input';
import type { MoveBoard } from '../src/input';
import { VirtualStick, stickConfigFor, wishFor } from '../src/input/joystick';
import { MoveGate } from '../src/input/moveGate';
import type { GateAssist } from '../src/input/moveGate';
import { PERPENDICULAR, canStep, planSidestep, planTurn } from '../src/input/moveAssist';
import { DIR_VEC, Tile, previewBlast, tileIndex } from '../src/sim';
import type { Dir, StageEvent, Vehicle } from '../src/sim';
import { AssistRig } from './assistRig';
import { addGenerator, put, sandbox } from './helpers';
import { LegacyMoveGate } from './legacyMoveGate';

afterEach(() => vi.unstubAllGlobals());

/** Tiny seeded generator so the randomised scenarios replay exactly. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const DIRS: Dir[] = ['up', 'right', 'down', 'left'];

/** A board where everything is open and safe: assistance can never be refused by the surroundings. */
const FREE_BOARD: MoveBoard = {
  x: 5,
  y: 5,
  open: () => true,
  soft: () => false,
  safe: () => true,
  vec: (d) => DIR_VEC[d],
};

describe('the setting', () => {
  it('Auto is full assistance on touch and the plain buffer elsewhere; On / Off are absolute', () => {
    expect(MOVE_ASSIST_SETTINGS).toEqual(['auto', 'on', 'off']);
    expect(resolveAssistLevel('auto', 'touch')).toBe('full');
    expect(resolveAssistLevel('auto', 'keyboard')).toBe('basic');
    expect(resolveAssistLevel('auto', 'gamepad')).toBe('basic');
    for (const d of ['touch', 'keyboard', 'gamepad'] as const) {
      expect(resolveAssistLevel('on', d)).toBe('full');
      expect(resolveAssistLevel('off', d)).toBe('off');
    }
  });
});

describe('toggle off is the previous behaviour exactly', () => {
  /** Random presses, releases, step-ready ticks and a drifting "legal" map, fed to both gates. */
  function script(seed: number) {
    const rnd = lcg(seed);
    const active = new Set<Dir>();
    const events: {
      tick: number;
      press?: Dir;
      release?: Dir;
      canMove: boolean;
      held: Dir | null;
      legal: Record<Dir, boolean>;
      active: Dir[];
    }[] = [];
    let held: Dir | null = null;
    let legal: Record<Dir, boolean> = { up: true, down: true, left: true, right: true };
    for (let tick = 0; tick < 900; tick++) {
      const e: (typeof events)[number] = {
        tick,
        canMove: tick % (5 + (seed % 5)) === 0,
        held,
        legal,
        active: [...active],
      };
      if (rnd() < 0.06) {
        const d = DIRS[Math.floor(rnd() * 4)]!;
        active.add(d);
        held = d;
        e.press = d;
      } else if (active.size && rnd() < 0.05) {
        const d = [...active][Math.floor(rnd() * active.size)]!;
        active.delete(d);
        if (held === d) held = [...active].pop() ?? null;
        e.release = d;
      }
      if (rnd() < 0.1) legal = { up: rnd() < 0.6, down: rnd() < 0.6, left: rnd() < 0.6, right: rnd() < 0.6 };
      e.held = held;
      e.legal = legal;
      e.active = [...active];
      events.push(e);
    }
    return events;
  }

  it('MoveGate without assist gives the very same moves as the pre-assist gate (30 random sessions)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const now = new MoveGate();
      const was = new LegacyMoveGate();
      for (const e of script(seed)) {
        if (e.press) {
          now.press(e.press, e.tick);
          was.press(e.press, e.tick);
        }
        const act = new Set(e.active);
        const a = now.next(e.tick, e.held, act, e.canMove, (d) => e.legal[d]);
        const b = was.next(e.tick, e.held, act, e.canMove, (d) => e.legal[d]);
        expect([seed, e.tick, a]).toEqual([seed, e.tick, b]);
      }
    }
  });

  it('basic assistance on a board with nothing dangerous is also identical (keyboard / gamepad under Auto)', () => {
    for (let seed = 40; seed <= 60; seed++) {
      const now = new MoveGate();
      const was = new LegacyMoveGate();
      const assist: GateAssist = { level: 'basic', board: () => FREE_BOARD, wish: null };
      for (const e of script(seed)) {
        if (e.press) {
          now.press(e.press, e.tick);
          was.press(e.press, e.tick);
        }
        const act = new Set(e.active);
        const a = now.next(e.tick, e.held, act, e.canMove, (d) => e.legal[d], assist);
        const b = was.next(e.tick, e.held, act, e.canMove, (d) => e.legal[d]);
        expect([seed, e.tick, a]).toEqual([seed, e.tick, b]);
      }
    }
  });

  it('InputManager "off" on touch reproduces the pre-assist trace (the two-tile early turn is NOT taken)', () => {
    const corner = ['###########', '#.........#', '#####.#####', '#####.#####', '###########'];
    const off = new AssistRig({ map: corner, start: [1, 1], assist: 'off' });
    off.thumbDown();
    off.push('right');
    off.until(3, 1);
    off.push('down');
    off.step(120);
    expect(off.at).toEqual([4, 1]);
    expect(off.input.assistLevel).toBe('off');
  });
});

describe('keyboard and gamepad stay as responsive as before', () => {
  const FIELD = Array.from({ length: 11 }, () => '..............');
  it.each(['keyboard', 'gamepad'] as const)(
    '%s: moves are handed over on the very same ticks with assist off, auto and on',
    (dev) => {
      const run = (assist: 'off' | 'auto' | 'on') => {
        const r = new AssistRig({ map: FIELD, start: [2, 2], assist });
        const down = (d: Dir): void => (dev === 'keyboard' ? r.keyDown(d) : r.pad([d]));
        const up = (d: Dir): void => (dev === 'keyboard' ? r.keyUp(d) : r.pad([]));
        down('right');
        r.step(5);
        up('right');
        r.step(20);
        down('down');
        r.step(40);
        down('left');
        r.step(15);
        up('left');
        r.step(40);
        return { moves: r.movesDelivered, trace: r.trace };
      };
      const base = run('off');
      expect(base.moves.length).toBeGreaterThan(3);
      expect(run('auto')).toEqual(base);
      expect(run('on')).toEqual(base); // open ground: nothing to assist, nothing delayed
    },
  );

  it('under Auto the keyboard keeps the plain corner buffer: a turn two tiles early is NOT carried, no sidestep', () => {
    const corner = ['###########', '#.........#', '#####.#####', '#####.#####', '###########'];
    const r = new AssistRig({ map: corner, start: [1, 1], assist: 'auto' });
    r.keyDown('right');
    r.until(3, 1);
    r.keyUp('right');
    r.keyDown('down');
    r.step(120);
    expect(r.input.assistLevel).toBe('basic');
    expect(r.at[1]).toBe(1); // faced the wall, no help
    const alley = ['#####.###', '#####.###', '#.......#', '#########'];
    const w = new AssistRig({ map: alley, start: [4, 2], assist: 'auto' });
    w.keyDown('up');
    w.step(150);
    expect(w.at).toEqual([4, 2]);
  });

  it('the keyboard corner buffer (one tile) still works under Auto, and a flame on the carried tile cancels the carry', () => {
    const corner = ['###########', '#.........#', '#####.#####', '#####.#####', '###########'];
    const r = new AssistRig({ map: corner, start: [1, 1], assist: 'auto' });
    r.keyDown('right');
    r.until(4, 1);
    r.keyUp('right');
    r.keyDown('down');
    r.step(120);
    expect(r.at).toEqual([5, 3]);

    const f = new AssistRig({ map: corner, start: [1, 1], assist: 'auto' });
    f.state.flames.push({
      x: 5,
      y: 1,
      eventId: 1,
      genId: 1,
      ownerId: 1,
      dir: null,
      tip: false,
      startTick: 0,
      endTick: 9999,
    });
    f.keyDown('right');
    f.until(4, 1);
    f.keyUp('right');
    f.keyDown('down');
    f.step(120);
    expect(f.at).toEqual([4, 1]); // did not walk into the flame on the player's behalf
  });
});

describe('moveAssist planners', () => {
  const board = (rows: string[], x: number, y: number): MoveBoard => {
    const at = (cx: number, cy: number): string => rows[cy]?.[cx] ?? '#';
    return {
      x,
      y,
      open: (cx, cy) => at(cx, cy) === '.' || at(cx, cy) === 'x',
      soft: (cx, cy) => at(cx, cy) === 'S',
      safe: (cx, cy) => at(cx, cy) !== 'x',
      vec: (d) => DIR_VEC[d],
    };
  };

  it('planTurn finds the first opening within reach along the walking direction', () => {
    const rows = ['#####.####', '..........', '##########'];
    // walking right along row 1, wanting up; the opening is at x=5
    expect(planTurn(board(rows, 3, 1), 'right', 'up', 2)).toBe(2);
    expect(planTurn(board(rows, 4, 1), 'right', 'up', 2)).toBe(1);
    expect(planTurn(board(rows, 2, 1), 'right', 'up', 2)).toBeNull(); // three tiles away
    expect(planTurn(board(rows, 6, 1), 'right', 'up', 2)).toBeNull(); // already past it
  });

  it('planTurn refuses a path through a dangerous or blocked tile', () => {
    const rows = ['#####.####', '....x.....', '##########'];
    expect(planTurn(board(rows, 3, 1), 'right', 'up', 2)).toBeNull(); // x=4 is dangerous
    const wall = ['#####.####', '....#.....', '##########'];
    expect(planTurn(board(wall, 3, 1), 'right', 'up', 2)).toBeNull();
    const turnDanger = ['#####x####', '..........', '##########'];
    expect(planTurn(board(turnDanger, 4, 1), 'right', 'up', 2)).toBeNull(); // the opening itself is dangerous
  });

  it('planSidestep needs exactly one clear side (or a preference), never a crate in front', () => {
    const one = ['#####.###', '#.......#'.slice(0, 9), '#########'];
    // player at (4,1) pressing up: wall above, alley at x=5
    expect(planSidestep(board(['#####.###', '.........', '#########'], 4, 1), 'up', [])).toBe('right');
    const both = ['###.#.###', '.........', '#########'];
    expect(planSidestep(board(both, 4, 1), 'up', [])).toBeNull();
    expect(planSidestep(board(both, 4, 1), 'up', [null, 'left'])).toBe('left');
    expect(planSidestep(board(both, 4, 1), 'up', ['down', 'right'])).toBe('right');
    expect(planSidestep(board(['####S.###', '.........', '#########'], 4, 1), 'up', [])).toBeNull();
    expect(one.length).toBe(3);
  });

  it('canStep is a plain step only: floor and safe', () => {
    const rows = ['#.#', '.x.', '#.#'];
    const b = board(rows, 1, 1);
    expect(canStep(b, 'up')).toBe(true);
    expect(canStep(board(rows, 0, 1), 'right')).toBe(false); // (1,1) is dangerous
    expect(canStep(b, 'left')).toBe(true);
    expect(PERPENDICULAR.up).toEqual(['left', 'right']);
  });
});

describe('the stick reports a diagonal wish with hysteresis', () => {
  const sizes: [number, number][] = [
    [568, 320],
    [667, 375],
    [740, 360],
    [844, 390],
    [932, 430],
    [390, 844],
  ];
  it.each(sizes)(
    '%i x %i: 40 degrees engages, 15 degrees does not, the wish lets go below 27 degrees',
    (w, h) => {
      const c = stickConfigFor(w, h);
      const s = new VirtualStick(c);
      s.begin(1, 0, 0);
      const at = (deg: number, frac = 0.85): [Dir | null, Dir | null] => {
        const a = (deg * Math.PI) / 180;
        const dir = s.move(1, Math.cos(a) * c.radius * frac, -Math.sin(a) * c.radius * frac);
        return [dir, s.wish];
      };
      expect(at(0)).toEqual(['right', null]);
      expect(at(15)).toEqual(['right', null]);
      expect(at(40)).toEqual(['right', 'up']);
      expect(at(-40)).toEqual(['right', 'down']);
      // hysteresis: once engaged it holds down to ~27 degrees ...
      at(40);
      expect(at(30)).toEqual(['right', 'up']);
      expect(at(20)).toEqual(['right', null]);
      // ... and does not come back until 35 degrees again
      expect(at(30)).toEqual(['right', null]);
      expect(at(37)).toEqual(['right', 'up']);
      // the wish is always perpendicular to the main direction
      expect(at(-50)[1]).toBe('down');
      for (let deg = -180; deg < 180; deg += 7) {
        const [dir, wish] = at(deg);
        if (dir && wish) expect(PERPENDICULAR[dir]).toContain(wish);
      }
    },
  );

  it('dead zone: nothing, not even a wish, inside it; releasing clears it', () => {
    const c = stickConfigFor(844, 390);
    const s = new VirtualStick(c);
    s.begin(1, 0, 0);
    expect(s.move(1, c.deadZone * 0.6, c.deadZone * 0.6)).toBeNull();
    expect(s.wish).toBeNull();
    s.move(1, 40, -34);
    expect(s.wish).toBe('up');
    s.move(1, 0, 0);
    expect(s.dir).toBeNull();
    expect(s.wish).toBeNull();
    expect(wishFor('right', null, 40, 0, c)).toBeNull();
  });
});

describe('the board sees every danger the sim exposes', () => {
  const open = (rows = 7) => {
    const s = sandbox({ players: 2 });
    s.tiles = s.tiles.map((t) => (t === Tile.Hard ? Tile.Empty : t)); // an open field
    put(s, 0, 7, 5);
    put(s, 1, 14, 10);
    return { s, me: s.players[0]!, rows };
  };

  it('flames, grounded generators and their blast footprints, crush and stage warnings, traps, vehicles, manholes', () => {
    const { s, me } = open();
    const b = () => buildMoveBoard(s, me);
    expect(b().safe(3, 3)).toBe(true);
    s.flames.push({
      x: 3,
      y: 3,
      eventId: 1,
      genId: 1,
      ownerId: 1,
      dir: null,
      tip: false,
      startTick: 0,
      endTick: 99,
    });
    expect(b().safe(3, 3)).toBe(false);

    const g = addGenerator(s, { ownerId: 1, x: 10, y: 8, range: 2, timer: 999 });
    for (const [x, y] of [
      [10, 8],
      [10, 9],
      [10, 10],
      [11, 8],
      [12, 8],
      [10, 7],
      [10, 6],
    ] as const)
      expect(b().safe(x, y)).toBe(false);
    expect(b().safe(9, 7)).toBe(true);
    expect(b().open(10, 8)).toBe(false); // a generator is not floor for an assisted step
    g.mode = 'disabled';
    expect(b().safe(10, 9)).toBe(true); // a Kill-Switched generator is no timed danger (its own tile still is)
    expect(b().safe(10, 8)).toBe(false);

    s.crush = {
      order: [],
      next: 0,
      warnAt: [],
      nextAtTick: Infinity,
      pending: [{ index: tileIndex(s, 1, 1), landTick: 500 }],
    };
    expect(b().safe(1, 1)).toBe(false);

    const ev = {
      id: 1,
      hazard: 0,
      kind: 'sweep',
      style: 'traffic',
      tiles: [tileIndex(s, 4, 4), tileIndex(s, 5, 4)],
      dir: 'right',
      warnTick: 0,
      startTick: 999,
      endTick: 1099,
      eventId: 3,
      index: -1,
      stepRemaining: 0,
      stepTicks: 0,
    } as StageEvent;
    s.stage.events.push(ev);
    expect(b().safe(5, 4)).toBe(false);
    s.stage.events[0] = { ...ev, kind: 'push', tiles: [tileIndex(s, 6, 4)] };
    expect(b().safe(6, 4)).toBe(true); // a gust zone is not lethal
    s.stage.events[0] = { ...ev, kind: 'drop', tiles: [tileIndex(s, 6, 4)] };
    expect(b().safe(6, 4)).toBe(false); // goods about to fall

    s.floorHazards[tileIndex(s, 2, 2)] = 'pothole';
    expect(b().safe(2, 2)).toBe(false);
    s.endgameTraps.warnings.push({ index: tileIndex(s, 2, 6), kind: 'oil', liveTick: 999 });
    expect(b().safe(2, 6)).toBe(false);

    const veh = {
      id: 9,
      ownerId: 1,
      kind: 'danfo',
      route: [
        { x: 0, y: 9 },
        { x: 1, y: 9 },
        { x: 2, y: 9 },
      ],
      phase: 'warning',
    } as unknown as Vehicle;
    s.vehicles.push(veh);
    expect(b().safe(1, 9)).toBe(false);
    veh.phase = 'crashing';
    expect(b().safe(1, 9)).toBe(true);

    expect(b().safe(-1, 0)).toBe(false);
    expect(b().open(-1, 0)).toBe(false);
  });

  it('covers the City Rumble radial blast through the shared previewBlast', () => {
    const s = sandbox({ players: 2, arenaId: 'rumbleLagosIsland' });
    put(s, 0, 10, 3);
    put(s, 1, 40, 30);
    // a radial generator in the open plaza rows: every tile of its disc (not only the cross) is unsafe
    s.config.generator.blastMode = 'radial';
    const g = addGenerator(s, { ownerId: 1, x: 10, y: 2, range: 3, timer: 999 });
    const b = buildMoveBoard(s, s.players[0]!);
    const diagonal = tileIndex(s, 11, 3);
    expect(s.tiles[diagonal]).toBe(Tile.Empty);
    expect(b.safe(11, 3)).toBe(false);
    expect(b.safe(12, 4)).toBe(false); // off the cross: only a radial footprint covers it
    expect(g.x).toBe(10);
  });

  it('a crowd of generators near the player falls back to a cautious superset (never less than the exact footprints)', () => {
    const s = sandbox({ players: 2, arenaId: 'rumbleLagosIsland' });
    s.config.generator.blastMode = 'radial';
    put(s, 0, 12, 7);
    put(s, 1, 40, 30);
    const placed: ReturnType<typeof addGenerator>[] = [];
    for (let y = 0; y < 12 && placed.length < 24; y += 2)
      for (let x = 6; x < 20 && placed.length < 24; x += 3)
        if (s.tiles[y * s.width + x] === Tile.Empty)
          placed.push(addGenerator(s, { ownerId: 1, x, y, range: 3, timer: 999 }));
    expect(placed.length).toBeGreaterThan(14);
    const board = buildMoveBoard(s, s.players[0]!);
    for (const g of placed)
      for (const i of previewBlast(s, g))
        expect(board.safe(i % s.width, Math.floor(i / s.width))).toBe(false);
  });

  it('an inverted-controls curse flips the board so planning matches what the sim will do', () => {
    const { s, me } = open();
    me.curse = { kind: 'inverted', until: s.tick + 600 } as never;
    const b = buildMoveBoard(s, me);
    expect(b.vec('left')).toEqual(DIR_VEC.right);
    me.curse = null;
    expect(buildMoveBoard(s, me).vec('left')).toEqual(DIR_VEC.left);
  });
});

describe('gate: a turn the assist waited for is dropped if its tile turned dangerous', () => {
  it('carry one tile, then the turn tile gets a flame: nothing is delivered (the explicit hold repeats later)', () => {
    const gate = new MoveGate();
    gate.press('right', 0);
    gate.next(0, 'right', new Set<Dir>(['right']), true, () => true);
    gate.press('up', 5);
    let safe = true;
    const board = (): MoveBoard => ({ ...FREE_BOARD, safe: () => safe });
    const assist: GateAssist = { level: 'full', board };
    let upLegal = false;
    const legal = (d: Dir): boolean => d === 'right' || (d === 'up' && upLegal);
    // free corridor ahead, opening one tile on: carry
    const opening: MoveBoard = { ...FREE_BOARD, open: (x, y) => !(y === 4 && x === 5) && true };
    expect(
      gate.next(9, 'up', new Set<Dir>(['up']), true, legal, { level: 'full', board: () => opening }),
    ).toBe('right');
    upLegal = true;
    safe = false; // a flame appeared on the turn tile
    expect(gate.next(19, 'up', new Set<Dir>(['up']), true, legal, assist)).toBeNull();
    safe = true;
    // the hold repeat (explicit) is the player's call
    expect(gate.next(40, 'up', new Set<Dir>(['up']), true, legal, assist)).toBe('up');
  });
});

describe('randomised steering never breaks the rules (market + dense hazards)', () => {
  it('60 sessions of a wandering thumb: every step is one clean orthogonal tile, and every move the player did not ask for is a plain safe step', () => {
    let substituted = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const rnd = lcg(seed * 7919);
      const arena = seed % 2 ? 'rumbleLagosIsland' : 'danfoBusPark';
      const r = new AssistRig({
        arena,
        start: arena === 'danfoBusPark' ? [0, 0] : [0, 5],
        assist: seed % 3 === 0 ? 'auto' : 'on',
      });
      // scatter armed generators and flames near the start
      for (let i = 0; i < 6; i++) {
        const x = Math.floor(rnd() * 9);
        const y = Math.floor(rnd() * 9);
        if (r.state.tiles[y * r.state.width + x] === Tile.Empty && !(x === r.p.x && y === r.p.y))
          addGenerator(r.state, { ownerId: 1, x, y, range: 2, timer: 60 + Math.floor(rnd() * 200) });
      }
      r.thumbDown();
      const recent: { dir: Dir; tick: number }[] = [];
      let current: Dir | null = null;
      for (let t = 0; t < 500 && r.p.alive; t++) {
        if (rnd() < 0.08) {
          if (rnd() < 0.15) {
            r.centre();
            current = null;
          } else {
            r.aim(Math.floor(rnd() * 360), 0.5 + rnd() * 0.5);
            current = r.stick.dir;
            if (current) recent.push({ dir: current, tick: r.state.tick });
          }
        }
        r.step(1, (intent) => {
          if (!intent.move) return;
          const asked =
            current === intent.move ||
            recent.some((e) => e.dir === intent.move && r.state.tick - e.tick <= 14);
          if (asked) return;
          // the assist chose this on its own: it must be a plain step onto open, safe floor
          const board = buildMoveBoard(r.state, r.p);
          const to = { x: r.p.x + DIR_VEC[intent.move].dx, y: r.p.y + DIR_VEC[intent.move].dy };
          substituted++;
          const why = `seed ${seed} tick ${r.state.tick}: ${intent.move} from ${r.p.x},${r.p.y}`;
          expect(r.state.tiles[to.y * r.state.width + to.x], why).toBe(Tile.Empty);
          expect(
            r.state.generators.some((g) => g.x === to.x && g.y === to.y),
            why,
          ).toBe(false);
          expect(board.safe(to.x, to.y), why).toBe(true);
        });
      }
      r.assertCleanTrace();
    }
    expect(substituted).toBeGreaterThan(30); // the scenario really exercises the assist
  });
});
