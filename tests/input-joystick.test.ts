import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputManager } from '../src/input';
import { VirtualStick, quantise, stickConfigFor } from '../src/input/joystick';
import { MOVE_REPEAT_DELAY_TICKS } from '../src/input/moveGate';
import { playerStepTicks, readyToStep, tick } from '../src/sim';
import type { Dir, GameState } from '../src/sim';
import { addSoft, put, sandbox } from './helpers';

/**
 * The floating thumbstick: an analog-feeling stick that only ever produces the four grid directions,
 * driving the same MoveGate as the keyboard (one tile per press, repeats at the step cadence while held).
 */
const PHONE = stickConfigFor(844, 390);
const deg = (a: number): [number, number] => [Math.cos((a * Math.PI) / 180), -Math.sin((a * Math.PI) / 180)];

describe('stick model', () => {
  it('sizes itself from the viewport short side for every common landscape phone and tablet', () => {
    for (const [w, h] of [
      [568, 320],
      [667, 375],
      [740, 360],
      [844, 390],
      [915, 412],
      [932, 430],
      [1024, 768],
      [1280, 720],
    ] as const) {
      const c = stickConfigFor(w, h);
      expect(c.radius).toBeGreaterThanOrEqual(44);
      expect(c.radius).toBeLessThanOrEqual(72);
      expect(c.releaseZone).toBeLessThan(c.deadZone);
      expect(c.deadZone).toBeLessThan(c.radius * 0.4);
      expect(c.followRadius).toBeGreaterThanOrEqual(c.radius);
    }
  });

  it('appears wherever the thumb lands: the origin is the touch point, nothing happens inside the dead zone', () => {
    for (const [x, y] of [
      [40, 300],
      [200, 150],
      [350, 370],
    ] as const) {
      const s = new VirtualStick(PHONE);
      expect(s.begin(1, x, y)).toBe(true);
      expect([s.originX, s.originY]).toEqual([x, y]);
      expect(s.move(1, x + PHONE.deadZone - 1, y)).toBeNull();
      expect(s.move(1, x, y - (PHONE.deadZone - 1))).toBeNull();
      expect(s.move(1, x + PHONE.deadZone + 1, y)).toBe('right');
    }
  });

  it('maps drags to exactly up / down / left / right', () => {
    const cases: [number, number, Dir][] = [
      [0, -40, 'up'],
      [0, 40, 'down'],
      [-40, 0, 'left'],
      [40, 0, 'right'],
      [40, -12, 'right'],
      [-10, 40, 'down'],
    ];
    for (const [dx, dy, want] of cases) {
      const s = new VirtualStick(PHONE);
      s.begin(1, 100, 100);
      expect(s.move(1, 100 + dx, 100 + dy)).toBe(want);
    }
  });

  it('has hysteresis: a thumb drifting around the diagonal keeps its direction; a clear turn switches', () => {
    const s = new VirtualStick(PHONE);
    s.begin(1, 0, 0);
    const at = (a: number, r = 40): Dir | null => {
      const [ux, uy] = deg(a);
      return s.move(1, ux * r, uy * r);
    };
    expect(at(0)).toBe('right');
    // wobble across the 45-degree line: still right
    for (const a of [40, 44, 46, 50, 44, 47, 51]) expect(at(a)).toBe('right');
    // clearly up now (needs > switchRatio dominance, about 53.5 degrees)
    expect(at(60)).toBe('up');
    // and the same hysteresis on the way back
    for (const a of [50, 46, 44, 40]) expect(at(a)).toBe('up');
    expect(at(30)).toBe('right');
  });

  it('reverses at once when the thumb crosses to the other side', () => {
    const s = new VirtualStick(PHONE);
    s.begin(1, 0, 0);
    expect(s.move(1, 40, 0)).toBe('right');
    expect(s.move(1, -30, 3)).toBe('left');
  });

  it('releases inside the smaller release zone, not at the dead-zone edge', () => {
    const s = new VirtualStick(PHONE);
    s.begin(1, 0, 0);
    expect(s.move(1, PHONE.deadZone + 2, 0)).toBe('right');
    expect(s.move(1, PHONE.deadZone - 2, 0)).toBe('right'); // between release and dead zone: kept
    expect(s.move(1, PHONE.releaseZone - 1, 0)).toBeNull();
    expect(quantise('up', 0, 0, 0, PHONE)).toBeNull();
  });

  it('clamps the knob to its radius and drags the origin along a long swipe, so reversing is a short flick', () => {
    const s = new VirtualStick(PHONE);
    s.begin(1, 0, 0);
    s.move(1, 400, 0);
    expect(Math.hypot(s.knobX, s.knobY)).toBeCloseTo(PHONE.radius, 5);
    expect(s.originX).toBeCloseTo(400 - PHONE.followRadius, 5);
    // a flick back of followRadius + deadZone is enough to go left
    expect(s.move(1, 400 - PHONE.followRadius - PHONE.deadZone - 2, 0)).toBe('left');
  });

  it('belongs to one finger: a second finger cannot steer or end it', () => {
    const s = new VirtualStick(PHONE);
    s.begin(1, 0, 0);
    expect(s.begin(2, 300, 300)).toBe(false);
    expect(s.move(2, 0, -80)).toBeNull();
    expect(s.end(2)).toBeNull();
    expect(s.active).toBe(true);
    expect(s.move(1, 0, -40)).toBe('up');
  });

  it('tells taps (vehicle entrance picks under the zone) from drags', () => {
    const s = new VirtualStick(PHONE);
    s.begin(1, 0, 0, 1000);
    s.move(1, 3, 2);
    expect(s.end(1, 1150)).toEqual({ tap: true });
    s.begin(1, 0, 0, 2000);
    s.move(1, 40, 0);
    s.move(1, 0, 0);
    expect(s.end(1, 2100)).toEqual({ tap: false });
    s.begin(1, 0, 0, 3000);
    expect(s.end(1, 3000 + PHONE.tapMs + 50)).toEqual({ tap: false });
    expect(s.active).toBe(false);
  });
});

// ------------------------------------------------------------------ with the real input + simulation

/** A thumb on the stick, wired exactly as `TouchControls` wires it into the InputManager. */
class Thumb {
  readonly stick = new VirtualStick(PHONE);
  constructor(private readonly input: InputManager) {}
  down(id = 1, x = 120, y = 300): void {
    this.stick.begin(id, x, y);
    this.input.touchActive();
  }
  to(dx: number, dy: number, id = 1): void {
    this.input.setTouchDir(this.stick.move(id, this.stick.originX + dx, this.stick.originY + dy));
  }
  push(dir: Dir, dist = 44): void {
    const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    // a real thumb is not perfectly straight
    this.to(v[0]! * dist + v[1]! * 6, v[1]! * dist + v[0]! * 6);
  }
  up(id = 1): void {
    if (this.stick.end(id)) this.input.setTouchDir(null);
  }
}

class Rig {
  readonly state: GameState = sandbox({ players: 2 });
  readonly input: InputManager;
  readonly thumb: Thumb;
  readonly trace: [number, number][] = [];
  readonly stepTicks: number[] = [];

  constructor(start: [number, number] = [6, 0]) {
    vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined });
    vi.stubGlobal('navigator', { getGamepads: () => [] });
    this.input = new InputManager({ onNav: () => undefined, onDeviceChange: () => undefined });
    this.thumb = new Thumb(this.input);
    put(this.state, 0, start[0], start[1]);
    put(this.state, 1, 0, 10);
    this.trace.push(start);
  }
  get p() {
    return this.state.players[0]!;
  }
  step(n = 1): void {
    for (let i = 0; i < n; i++) {
      const before = [this.p.x, this.p.y];
      tick(this.state, { 0: this.input.buildIntent(this.state.tick, readyToStep(this.p)) });
      if (this.p.x !== before[0] || this.p.y !== before[1]) {
        this.trace.push([this.p.x, this.p.y]);
        this.stepTicks.push(this.state.tick);
      }
    }
  }
  get tiles(): number {
    return this.trace.length - 1;
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('thumbstick drives grid movement', () => {
  it('a quick flick moves exactly one tile in each of the four directions', () => {
    for (const [dir, want] of [
      ['right', [7, 2]],
      ['left', [5, 2]],
      ['down', [6, 3]],
      ['up', [6, 1]],
    ] as const) {
      const r = new Rig([6, 2]);
      r.thumb.down();
      r.thumb.push(dir);
      r.step(4);
      r.thumb.up();
      r.step(60);
      expect([dir, r.p.x, r.p.y]).toEqual([dir, ...want]);
      expect(r.tiles).toBe(1);
    }
  });

  it('holding a direction repeats at the step cadence; releasing stops at once; never a diagonal step', () => {
    const r = new Rig([0, 0]);
    r.thumb.down();
    r.thumb.push('right');
    r.step(MOVE_REPEAT_DELAY_TICKS + 4 * playerStepTicks(r.state, r.p));
    const held = r.tiles;
    expect(held).toBeGreaterThanOrEqual(4);
    r.thumb.up();
    const atRelease = r.tiles;
    r.step(60);
    // at most the step already committed when the finger lifted
    expect(r.tiles - atRelease).toBeLessThanOrEqual(0);
    for (let i = 1; i < r.trace.length; i++) {
      const [ax, ay] = r.trace[i - 1]!;
      const [bx, by] = r.trace[i]!;
      expect(Math.abs(bx - ax) + Math.abs(by - ay)).toBe(1); // one orthogonal tile each time
    }
    // repeats are spaced by the player's own step time (no skipped or doubled tiles)
    const gaps = r.stepTicks.slice(2).map((t, i) => t - r.stepTicks[i + 1]!);
    for (const g of gaps) expect(g).toBe(playerStepTicks(r.state, r.p));
  });

  it('respects speed upgrades: the repeat cadence follows Roller Skates', () => {
    const r = new Rig([0, 0]);
    r.p.speedLevel = 2;
    r.thumb.down();
    r.thumb.push('right');
    r.step(MOVE_REPEAT_DELAY_TICKS + 5 * playerStepTicks(r.state, r.p));
    const gaps = r.stepTicks.slice(2).map((t, i) => t - r.stepTicks[i + 1]!);
    expect(gaps.length).toBeGreaterThan(2);
    for (const g of gaps) expect(g).toBe(8);
  });

  it('a thumb held near the diagonal never zig-zags', () => {
    const r = new Rig([0, 0]);
    r.thumb.down();
    r.thumb.to(40, 0);
    for (let i = 0; i < 80; i++) {
      const a = 45 + (i % 2 ? 4 : -4); // wobbling across the diagonal down-right
      const [ux, uy] = deg(-a);
      r.thumb.to(ux * 40, uy * 40);
      r.step(1);
    }
    r.thumb.up();
    expect(r.trace.every(([, y]) => y === 0)).toBe(true); // stayed on the row: only rightward steps
    expect(r.tiles).toBeGreaterThan(3);
  });

  it('collisions hold: pushing into a pillar or a crate never moves or skips', () => {
    const r = new Rig([1, 0]); // (1,1) is a pillar
    addSoft(r.state, 2, 0);
    r.thumb.down();
    r.thumb.push('down');
    r.step(60);
    r.thumb.to(0, 0);
    r.thumb.push('right');
    r.step(60);
    r.thumb.up();
    expect([r.p.x, r.p.y]).toEqual([1, 0]);
    expect(r.tiles).toBe(0);
  });

  it('dead zone: a resting thumb never moves the player', () => {
    const r = new Rig([6, 2]);
    r.thumb.down();
    for (let i = 0; i < 60; i++) {
      r.thumb.to((i % 5) - 2, ((i * 3) % 7) - 3);
      r.step(1);
    }
    r.thumb.up();
    expect(r.tiles).toBe(0);
  });

  it('multitouch: a second finger drops a generator while the thumb keeps walking', () => {
    const r = new Rig([0, 0]);
    r.thumb.down(1);
    r.thumb.push('right');
    r.step(MOVE_REPEAT_DELAY_TICKS + 12);
    // another finger on GENERATOR (the stick ignores it)
    expect(r.thumb.stick.begin(2, 700, 300)).toBe(false);
    r.input.touchPress('place');
    r.step(1);
    expect(r.state.generators).toHaveLength(1);
    const placedAt = r.state.generators[0]!.x;
    r.step(30);
    r.thumb.up(1);
    expect(r.p.x).toBeGreaterThan(placedAt); // still walking away from it
  });

  it('a cancelled gesture (incoming call, rotation, lost capture) stops movement immediately', () => {
    const r = new Rig([0, 0]);
    r.thumb.down();
    r.thumb.push('right');
    r.step(MOVE_REPEAT_DELAY_TICKS + 20);
    const before = r.tiles;
    r.thumb.stick.reset();
    r.input.setTouchDir(null);
    r.step(1);
    const committed = r.tiles;
    r.step(60);
    expect(r.tiles).toBe(committed);
    expect(committed - before).toBeLessThanOrEqual(1);
  });
});
