import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputManager } from '../src/input';
import { MOVE_BUFFER_TICKS, MOVE_REPEAT_DELAY_TICKS, MoveGate } from '../src/input/moveGate';
import { playerStepTicks, readyToStep, tick } from '../src/sim';
import type { Dir, GameState } from '../src/sim';
import { addGenerator, addSoft, put, sandbox } from './helpers';

type Listener = (e: unknown) => void;
const KEY: Record<Dir, string> = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };
const PAD_BUTTON: Record<Dir, number> = { up: 12, down: 13, left: 14, right: 15 };

/** Drives the real InputManager and the real simulation exactly as MatchController does, one tick at a time. */
class Rig {
  readonly state: GameState = sandbox({ players: 2 });
  readonly input: InputManager;
  private readonly listeners = new Map<string, Set<Listener>>();
  private padButtons: number[] = [];
  private padAxes: [number, number] = [0, 0];
  /** Tick (state.tick) and x at every tile change of player 0. */
  readonly xTrace: { tick: number; x: number; y: number }[] = [];

  constructor(start: [number, number] = [6, 0]) {
    vi.stubGlobal('window', {
      addEventListener: (t: string, f: Listener) => {
        if (!this.listeners.has(t)) this.listeners.set(t, new Set());
        this.listeners.get(t)!.add(f);
      },
      removeEventListener: (t: string, f: Listener) => this.listeners.get(t)?.delete(f),
    });
    vi.stubGlobal('navigator', {
      getGamepads: () => [
        {
          connected: true,
          buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: this.padButtons.includes(i) })),
          axes: this.padAxes,
        },
      ],
    });
    this.input = new InputManager({ onNav: () => undefined, onDeviceChange: () => undefined });
    put(this.state, 0, start[0], start[1]);
    put(this.state, 1, 0, 10);
  }

  get p() {
    return this.state.players[0]!;
  }

  private fire(type: string, code: string): void {
    for (const f of this.listeners.get(type) ?? [])
      f({
        code,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        repeat: false,
        target: null,
        preventDefault() {},
      });
  }

  keyDown(d: Dir): void {
    this.fire('keydown', KEY[d]);
  }
  keyUp(d: Dir): void {
    this.fire('keyup', KEY[d]);
  }
  touch(d: Dir | null): void {
    this.input.setTouchDir(d);
  }
  pad(buttons: Dir[], axes: [number, number] = [0, 0]): void {
    this.padButtons = buttons.map((d) => PAD_BUTTON[d]);
    this.padAxes = axes;
  }

  /** One frame == one tick. */
  step(n = 1): void {
    for (let i = 0; i < n; i++) {
      this.input.pollDevices();
      const before = [this.p.x, this.p.y];
      const intent = this.input.buildIntent(this.state.tick, readyToStep(this.p));
      tick(this.state, { 0: intent });
      if (this.p.x !== before[0] || this.p.y !== before[1])
        this.xTrace.push({ tick: this.state.tick, x: this.p.x, y: this.p.y });
    }
  }

  get tiles(): number {
    return this.xTrace.length;
  }
}

/** Each device exposes the same press / release vocabulary so every scenario runs on all three. */
const DEVICES: Record<string, { down(r: Rig, d: Dir): void; up(r: Rig, d: Dir): void }> = {
  keyboard: { down: (r, d) => r.keyDown(d), up: (r, d) => r.keyUp(d) },
  touch: { down: (r, d) => r.touch(d), up: (r) => r.touch(null) },
  gamepad: { down: (r, d) => r.pad([d]), up: (r) => r.pad([]) },
};

afterEach(() => vi.unstubAllGlobals());

describe.each(Object.entries(DEVICES))('%s movement semantics', (_name, dev) => {
  let r: Rig;
  beforeEach(() => {
    r = new Rig();
  });

  it('one quick press moves exactly one tile, however long the tap lasts below the repeat delay', () => {
    for (const hold of [1, 3, 6, 9, MOVE_REPEAT_DELAY_TICKS - 1]) {
      const rig = new Rig();
      dev.down(rig, 'right');
      rig.step(hold);
      dev.up(rig, 'right');
      rig.step(80);
      expect([hold, rig.tiles, rig.p.x]).toEqual([hold, 1, 7]);
    }
  });

  it('a press released within the same frame still moves one tile', () => {
    dev.down(r, 'right');
    dev.up(r, 'right');
    r.step(60);
    // gamepads are polled once per frame so a sub-frame press is invisible to them by nature
    expect(r.p.x).toBe(_name === 'gamepad' ? 6 : 7);
  });

  it('releasing stops all further movement', () => {
    dev.down(r, 'right');
    r.step(45);
    dev.up(r, 'right');
    const atRelease = { x: r.p.x, tiles: r.tiles };
    r.step(120);
    // the step in progress at release may already be counted; nothing new starts afterwards
    expect(r.tiles).toBe(atRelease.tiles);
    expect(r.p.x).toBe(atRelease.x);
  });

  it('a long hold repeats at exactly the step cadence after the repeat delay', () => {
    r = new Rig([0, 0]);
    dev.down(r, 'right');
    r.step(100);
    dev.up(r, 'right');
    const stepTicks = playerStepTicks(r.state, r.p);
    const ticks = r.xTrace.map((t) => t.tick);
    const first = ticks[0]!;
    expect(ticks[1]! - first).toBe(MOVE_REPEAT_DELAY_TICKS); // initial repeat delay
    for (let i = 2; i < ticks.length; i++) expect(ticks[i]! - ticks[i - 1]!).toBe(stepTicks);
    const expected = 1 + Math.floor((100 - MOVE_REPEAT_DELAY_TICKS - 1) / stepTicks) + 1;
    expect(r.tiles).toBe(expected);
    expect(r.xTrace.every((t, i) => t.x === 1 + i && t.y === 0)).toBe(true); // contiguous tiles, no skips
  });

  it('repeat cadence follows speed upgrades and the Okada bonus', () => {
    r = new Rig([0, 0]);
    r.p.speedLevel = 2;
    r.p.mounted = true;
    const stepTicks = playerStepTicks(r.state, r.p);
    expect(stepTicks).toBeLessThan(10);
    dev.down(r, 'right');
    r.step(80);
    const ticks = r.xTrace.map((t) => t.tick);
    for (let i = 2; i < ticks.length; i++) expect(ticks[i]! - ticks[i - 1]!).toBe(stepTicks);
    expect(r.tiles).toBeGreaterThan(8);
  });

  it('a later press cancels the older direction: no phantom move opposite to the last press', () => {
    dev.down(r, 'left');
    dev.up(r, 'left');
    dev.down(r, 'right'); // before the simulation saw the first
    dev.up(r, 'right');
    r.step(80);
    expect(r.xTrace.map((t) => t.x)).toEqual(_name === 'gamepad' ? [] : [7]);
  });

  it('left then right inside one step: both are honoured, in order, exactly once', () => {
    dev.down(r, 'left');
    r.step(2);
    dev.up(r, 'left');
    r.step(2);
    dev.down(r, 'right');
    r.step(2);
    dev.up(r, 'right');
    r.step(100);
    expect(r.xTrace.map((t) => t.x)).toEqual([5, 6]);
  });

  it('buffering never stacks: mashing during one step yields that step plus a single buffered move', () => {
    for (let i = 0; i < 6; i++) {
      dev.down(r, 'right');
      r.step(1);
      dev.up(r, 'right');
      r.step(1);
    }
    r.step(120);
    expect(r.tiles).toBe(2);
    expect(r.p.x).toBe(8);
  });

  it('a press is not remembered for ever: it expires if the player cannot step in time', () => {
    r.p.stepRemaining = 60; // e.g. a long forced slide
    dev.down(r, 'right');
    r.step(2);
    dev.up(r, 'right');
    r.step(120);
    expect(r.tiles).toBe(0);
  });

  it('walls, pillars, soft blocks and generators block and leave no queued move behind', () => {
    // pillar below (1,0) -> (1,1)
    const a = new Rig([1, 0]);
    dev.down(a, 'down');
    a.step(30);
    dev.up(a, 'down');
    a.step(30);
    expect(a.tiles).toBe(0);
    // left edge
    const b = new Rig([0, 0]);
    dev.down(b, 'left');
    b.step(30);
    dev.up(b, 'left');
    b.step(60);
    expect([b.p.x, b.tiles]).toEqual([0, 0]);
    // soft block
    const c = new Rig([2, 0]);
    addSoft(c.state, 3, 0);
    dev.down(c, 'right');
    c.step(40);
    dev.up(c, 'right');
    c.step(40);
    expect([c.p.x, c.tiles]).toEqual([2, 0]);
    // generator placed by the opponent (does not explode during the test)
    const d = new Rig([2, 0]);
    addGenerator(d.state, { ownerId: 1, x: 3, y: 0, timer: 99999 });
    dev.down(d, 'right');
    d.step(40);
    dev.up(d, 'right');
    d.step(40);
    expect([d.p.x, d.tiles]).toEqual([2, 0]);
  });

  it('a blocked press does not turn into a move once the obstacle is gone', () => {
    const rig = new Rig([2, 0]);
    const g = addGenerator(rig.state, { ownerId: 1, x: 3, y: 0, timer: 99999 });
    dev.down(rig, 'right');
    rig.step(4);
    dev.up(rig, 'right');
    rig.state.generators.splice(rig.state.generators.indexOf(g), 1);
    rig.step(60);
    expect(rig.tiles).toBe(0);
  });
});

describe('devices are logically equivalent', () => {
  const script = (r: Rig, d: (typeof DEVICES)[string]) => {
    d.down(r, 'right');
    r.step(5);
    d.up(r, 'right');
    r.step(20);
    d.down(r, 'left');
    r.step(75);
    d.up(r, 'left');
    r.step(15);
    d.down(r, 'right');
    r.step(2);
    d.up(r, 'right');
    d.down(r, 'left');
    r.step(2);
    d.up(r, 'left');
    r.step(60);
    return r.xTrace;
  };

  it('keyboard, touch and gamepad produce identical movement traces', () => {
    const traces = Object.values(DEVICES).map((d) => script(new Rig(), d));
    expect(traces[0]!.length).toBeGreaterThan(5);
    expect(traces[1]).toEqual(traces[0]);
    expect(traces[2]).toEqual(traces[0]);
  });
});

describe('keyboard specifics', () => {
  it('WASD and arrows share semantics; OS auto-repeat events do not add presses', () => {
    const r = new Rig();
    const listeners = (r as unknown as { listeners: Map<string, Set<Listener>> }).listeners;
    const send = (type: string, code: string, repeat = false) =>
      listeners.get(type)!.forEach((f) =>
        f({
          code,
          repeat,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          target: null,
          preventDefault() {},
        }),
      );
    send('keydown', 'KeyD');
    r.step(2);
    for (let i = 0; i < 5; i++) send('keydown', 'KeyD', true); // browser key repeat while still held
    r.step(8);
    send('keyup', 'KeyD');
    r.step(60);
    expect(r.tiles).toBe(1);
  });

  it('two keys: releasing the newer one resumes the older one that is still held, without a pause or a phantom step', () => {
    const r = new Rig();
    r.keyDown('right');
    r.step(30); // repeating right
    r.keyDown('up');
    r.step(1);
    r.keyUp('up');
    r.step(40);
    r.keyUp('right');
    const last = r.xTrace.slice(-1)[0]!;
    r.step(60);
    expect(r.xTrace.slice(-1)[0]).toEqual(last);
    // direction of every step is one of the two held keys and never left
    expect(r.xTrace.every((t) => t.x >= 7)).toBe(true);
  });

  it('losing focus mid-hold stops movement', () => {
    const r = new Rig();
    r.keyDown('right');
    r.step(40);
    (r as unknown as { listeners: Map<string, Set<Listener>> }).listeners.get('blur')!.forEach((f) => f({}));
    const n = r.tiles;
    r.step(80);
    expect(r.tiles).toBe(n);
  });
});

describe('input state resets', () => {
  it('clear() (pause / new match) discards a buffered press', () => {
    const r = new Rig();
    r.p.stepRemaining = 5;
    r.keyDown('right');
    r.input.clear();
    r.keyUp('right');
    r.step(60);
    expect(r.tiles).toBe(0);
  });

  it('vehicle-selection mode swallows movement and leaves nothing behind', () => {
    const r = new Rig();
    r.input.navMode = true;
    r.keyDown('right');
    r.step(5);
    r.keyUp('right');
    r.input.navMode = false;
    r.step(60);
    expect(r.tiles).toBe(0);
  });
});

describe('gamepad stick', () => {
  it('a wobbling stick near the diagonal does not fake extra presses', () => {
    const r = new Rig();
    r.pad([], [0.9, 0.0]);
    r.step(2);
    for (const y of [0.55, 0.7, 0.4, 0.6, 0.3]) {
      r.pad([], [0.8, y]); // vertical component wanders but never beats horizontal by 25%
      r.step(1);
    }
    r.pad([], [0, 0]);
    r.step(60);
    expect(r.xTrace.map((t) => [t.x, t.y])).toEqual([[7, 0]]);
  });

  it('a deliberate switch of axis is a new press', () => {
    const r = new Rig([5, 2]);
    r.pad([], [0.9, 0]);
    r.step(3);
    r.pad([], [0, 0.9]);
    r.step(3);
    r.pad([], [0, 0]);
    r.step(60);
    expect(r.xTrace.map((t) => [t.x, t.y])).toEqual([
      [6, 2],
      [6, 3],
    ]);
  });

  it('stick below the dead zone does nothing', () => {
    const r = new Rig();
    r.pad([], [0.4, 0.2]);
    r.step(60);
    expect(r.tiles).toBe(0);
  });
});

describe('MoveGate', () => {
  const none = new Set<Dir>();
  it('delivers a press once, on the first tick the player can step', () => {
    const g = new MoveGate();
    g.press('up', 10);
    expect(g.next(10, null, none, false)).toBeNull();
    expect(g.next(11, null, none, true)).toBe('up');
    expect(g.next(12, null, none, true)).toBeNull();
  });
  it('expires an undelivered press after the buffer window', () => {
    const g = new MoveGate();
    g.press('up', 0);
    expect(g.next(MOVE_BUFFER_TICKS + 1, null, none, true)).toBeNull();
  });
  it('repeats only after the delay and only while held', () => {
    const g = new MoveGate();
    const held = new Set<Dir>(['left']);
    g.press('left', 0);
    expect(g.next(0, 'left', held, true)).toBe('left');
    expect(g.next(MOVE_REPEAT_DELAY_TICKS - 1, 'left', held, true)).toBeNull();
    expect(g.next(MOVE_REPEAT_DELAY_TICKS, 'left', held, true)).toBe('left');
    expect(g.next(MOVE_REPEAT_DELAY_TICKS + 1, null, none, true)).toBeNull();
  });
});
