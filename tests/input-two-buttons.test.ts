import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputManager } from '../src/input';
import { MoveGate, TURN_BUFFER_TILES } from '../src/input/moveGate';
import { PlaceHold, SPECIAL_HOLD_TICKS, SpecialHold } from '../src/input/specialHold';
import { moveWouldAct, readyToStep, tick } from '../src/sim';
import type { Dir, GameState, Intent } from '../src/sim';
import { addGenerator, addSoft, put, sandbox } from './helpers';

/**
 * V2 controls in the input layer: B tap vs hold (Remote Detonator), and the corner-turn buffer.
 * Danfo Bus Park: pillars on (odd, odd), so along row 0 only even columns lead down.
 */
function manager(): InputManager {
  vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined });
  vi.stubGlobal('navigator', { getGamepads: () => [] });
  return new InputManager({ onNav: () => undefined, onDeviceChange: () => undefined });
}

afterEach(() => vi.unstubAllGlobals());

describe('B: tap = special, hold = remote', () => {
  it('without a live remote the special fires on the press itself (no delay)', () => {
    const b = new SpecialHold();
    b.pressDown('touch', 10, false);
    expect(b.take(10)).toBe('special');
    b.release('touch');
    expect(b.take(11)).toBeNull();
    // holding longer changes nothing: still exactly one special
    b.pressDown('touch', 20, false);
    expect(b.take(20)).toBe('special');
    for (let t = 21; t < 20 + 3 * SPECIAL_HOLD_TICKS; t++) expect(b.take(t)).toBeNull();
    b.release('touch');
    expect(b.take(99)).toBeNull();
  });

  it('with a live remote a short tap fires the special on release, never a detonation', () => {
    const b = new SpecialHold();
    b.pressDown('touch', 0, true);
    for (let t = 0; t < SPECIAL_HOLD_TICKS - 1; t++) expect(b.take(t)).toBeNull();
    expect(b.progress(SPECIAL_HOLD_TICKS / 2)).toBeCloseTo(0.5);
    b.release('touch');
    expect(b.take(SPECIAL_HOLD_TICKS - 1)).toBe('special');
    expect(b.take(SPECIAL_HOLD_TICKS)).toBeNull();
  });

  it('a long press detonates exactly once at the threshold; the release then does NOT fire the special', () => {
    const b = new SpecialHold();
    b.pressDown('touch', 0, true);
    const out: (string | null)[] = [];
    for (let t = 0; t <= SPECIAL_HOLD_TICKS + 30; t++) out.push(b.take(t));
    expect(out.filter((o) => o !== null)).toEqual(['detonate']);
    expect(out.indexOf('detonate')).toBe(SPECIAL_HOLD_TICKS);
    b.release('touch');
    expect(b.take(100)).toBeNull();
  });

  it('two sources on B (two keys, a key and a finger) are one press', () => {
    const b = new SpecialHold();
    b.pressDown('key:KeyK', 0, true);
    b.pressDown('key:KeyE', 2, true);
    b.release('key:KeyK');
    expect(b.take(3)).toBeNull(); // still held by E
    b.release('key:KeyE');
    expect(b.take(4)).toBe('special');
    expect(b.take(5)).toBeNull();
  });

  it('through the InputManager: a remote tap melees, a hold detonates, the sim never gets both', () => {
    const input = manager();
    const intents: Intent[] = [];
    const t0 = 100;
    input.buildIntent(t0, { remoteReady: true });
    input.touchDown('special', 'p1');
    for (let t = t0 + 1; t < t0 + 5; t++) intents.push(input.buildIntent(t, { remoteReady: true }));
    input.touchUp('special', 'p1');
    intents.push(input.buildIntent(t0 + 5, { remoteReady: true }));
    expect(intents.filter((i) => i.special)).toHaveLength(1);
    expect(intents.filter((i) => i.detonate)).toHaveLength(0);

    const held: Intent[] = [];
    input.touchDown('special', 'p2');
    for (let t = t0 + 6; t < t0 + 6 + SPECIAL_HOLD_TICKS + 10; t++)
      held.push(input.buildIntent(t, { remoteReady: true }));
    input.touchUp('special', 'p2');
    held.push(input.buildIntent(t0 + 100, { remoteReady: true }));
    expect(held.filter((i) => i.detonate)).toHaveLength(1);
    expect(held.filter((i) => i.special)).toHaveLength(0);
  });

  it('end to end: holding B sets off the remote generator; tapping B next to a rival pushes them instead', () => {
    const s = sandbox({ characters: ['streetBaller', 'lekkiBoy'] });
    put(s, 0, 4, 4);
    put(s, 1, 12, 8);
    const me = s.players[0]!;
    me.remote = true;
    const g = addGenerator(s, { ownerId: 0, x: 8, y: 2, mode: 'remote', timer: 9999 });
    const input = manager();
    const step = (): void => {
      const remoteReady = me.remote && s.generators.some((o) => o.ownerId === 0 && o.mode === 'remote');
      tick(s, { 0: input.buildIntent(s.tick, { canMove: readyToStep(me), remoteReady }) });
    };
    // a tap with a rival adjacent: push, the remote generator stays
    put(s, 1, 5, 4);
    step();
    input.touchDown('special', 'p1');
    step();
    step();
    input.touchUp('special', 'p1');
    step();
    expect(s.players[1]!.x).toBe(6);
    expect(s.generators).toContain(g);
    // a hold: the remote goes off
    input.touchDown('special', 'p1');
    for (let i = 0; i < SPECIAL_HOLD_TICKS + 2; i++) step();
    expect(s.generators.includes(g)).toBe(false);
  });
});

describe('A: tap = generator, hold = remote', () => {
  it('without a live remote a press places at once and holding never detonates', () => {
    const a = new PlaceHold();
    a.pressDown('key:Space', 10, false);
    expect(a.take(10)).toBe('place');
    const out: (string | null)[] = [];
    for (let t = 11; t < 10 + 3 * SPECIAL_HOLD_TICKS; t++) out.push(a.take(t));
    a.release('key:Space');
    expect(out.every((o) => o === null)).toBe(true);
    expect(a.take(200)).toBeNull();
  });

  it('with a live remote a quick tap places on release and can never detonate', () => {
    const a = new PlaceHold();
    a.pressDown('touch', 0, true);
    for (let t = 0; t < SPECIAL_HOLD_TICKS - 1; t++) expect(a.take(t)).toBeNull();
    expect(a.progress(SPECIAL_HOLD_TICKS / 2)).toBeCloseTo(0.5);
    a.release('touch');
    expect(a.take(SPECIAL_HOLD_TICKS - 1)).toBe('place');
    expect(a.take(SPECIAL_HOLD_TICKS)).toBeNull();
  });

  it('a hold detonates exactly once at the threshold and the release places nothing', () => {
    const a = new PlaceHold();
    a.pressDown('touch', 0, true);
    const out: (string | null)[] = [];
    for (let t = 0; t <= SPECIAL_HOLD_TICKS + 30; t++) out.push(a.take(t));
    expect(out.filter((o) => o !== null)).toEqual(['detonate']);
    expect(out.indexOf('detonate')).toBe(SPECIAL_HOLD_TICKS);
    a.release('touch');
    expect(a.take(100)).toBeNull();
  });

  it('through the InputManager: tap = place (never detonate), hold = detonate (never place); B is untouched', () => {
    const input = manager();
    const t0 = 100;
    const ctx = { remoteReady: true };
    input.buildIntent(t0, ctx);
    // quick tap on A with a live remote
    const tap: Intent[] = [];
    input.touchDown('place', 'p1');
    for (let t = t0 + 1; t < t0 + 5; t++) tap.push(input.buildIntent(t, ctx));
    input.touchUp('place', 'p1');
    tap.push(input.buildIntent(t0 + 5, ctx));
    expect(tap.filter((i) => i.place)).toHaveLength(1);
    expect(tap.filter((i) => i.detonate)).toHaveLength(0);
    // hold on A
    const held: Intent[] = [];
    input.touchDown('place', 'p2');
    for (let t = t0 + 6; t < t0 + 6 + SPECIAL_HOLD_TICKS + 10; t++) held.push(input.buildIntent(t, ctx));
    expect(input.placeHoldProgress()).toBeNull(); // resolved: the ring is done
    input.touchUp('place', 'p2');
    held.push(input.buildIntent(t0 + 100, ctx));
    expect(held.filter((i) => i.detonate)).toHaveLength(1);
    expect(held.filter((i) => i.place)).toHaveLength(0);
    expect(held.filter((i) => i.special)).toHaveLength(0);
    // B still taps as the special and holds as the remote
    input.touchDown('special', 'p3');
    const b = [input.buildIntent(t0 + 101, ctx), input.buildIntent(t0 + 102, ctx)];
    input.touchUp('special', 'p3');
    b.push(input.buildIntent(t0 + 103, ctx));
    expect(b.filter((i) => i.special)).toHaveLength(1);
    expect(b.filter((i) => i.place || i.detonate)).toHaveLength(0);
  });

  it('exposes the arming fill for A (and the larger of A and B) while a press is open', () => {
    const input = manager();
    const ctx = { remoteReady: true };
    input.buildIntent(10, ctx);
    expect(input.detonateProgress()).toBeNull();
    input.touchDown('place', 'p1');
    input.buildIntent(10 + SPECIAL_HOLD_TICKS / 2, ctx);
    expect(input.placeHoldProgress()).toBeCloseTo(0.5, 1);
    expect(input.detonateProgress()).toBeCloseTo(0.5, 1);
    input.touchUp('place', 'p1');
    input.buildIntent(10 + SPECIAL_HOLD_TICKS, ctx);
    expect(input.detonateProgress()).toBeNull();
  });

  it('end to end: a tap on A drops a generator and the remote stays; holding A sets off only your remote generators', () => {
    const s = sandbox({ characters: ['streetBaller', 'lekkiBoy'] });
    put(s, 0, 4, 4);
    put(s, 1, 12, 8);
    const me = s.players[0]!;
    me.remote = true;
    me.capacity = 6; // room for the pre-placed generators and the one dropped by the tap
    const mine = addGenerator(s, { ownerId: 0, x: 8, y: 2, mode: 'remote', timer: 9999 });
    const theirs = addGenerator(s, { ownerId: 1, x: 12, y: 6, mode: 'remote', timer: 9999 });
    const timed = addGenerator(s, { ownerId: 0, x: 2, y: 8, mode: 'timed', timer: 9999 });
    const input = manager();
    const step = (): void => {
      const remoteReady = me.remote && s.generators.some((o) => o.ownerId === 0 && o.mode === 'remote');
      tick(s, { 0: input.buildIntent(s.tick, { canMove: readyToStep(me), remoteReady }) });
    };
    const before = s.generators.length;
    input.touchDown('place', 'p1');
    step();
    step();
    input.touchUp('place', 'p1');
    step();
    expect(s.generators.length).toBe(before + 1);
    expect(s.generators).toContain(mine);
    // a hold on A: only the player's own remote generator goes off
    input.touchDown('place', 'p1');
    for (let i = 0; i < SPECIAL_HOLD_TICKS + 2; i++) step();
    input.touchUp('place', 'p1');
    step();
    expect(s.generators.includes(mine)).toBe(false);
    expect(s.generators).toContain(theirs);
    expect(s.generators).toContain(timed); // timed fuses are never set off by hand
    expect(s.generators.filter((g) => g.ownerId === 0 && g.mode === 'timed').length).toBeGreaterThanOrEqual(
      1,
    );
  });
});

describe('corner-turn buffer (stick and keyboard)', () => {
  const all = (dirs: Dir[]): ReadonlySet<Dir> => new Set(dirs);

  it('gate: a perpendicular turn pressed one tile early is carried exactly one tile, then taken', () => {
    const gate = new MoveGate();
    // walking right: a move went out at tick 0
    gate.press('right', 0);
    expect(gate.next(0, 'right', all(['right']), true, () => true)).toBe('right');
    // up pressed at tick 5 while up is blocked: keep walking right on the next ready tick
    gate.press('up', 5);
    let open = false;
    const legal = (d: Dir): boolean => d === 'right' || (d === 'up' && open);
    expect(gate.next(9, 'up', all(['up']), true, legal)).toBe('right');
    // on the next tile up is open: the turn is taken
    open = true;
    expect(gate.next(19, 'up', all(['up']), true, legal)).toBe('up');
  });

  it('gate: never more than TURN_BUFFER_TILES carried tiles; then the turn is simply delivered (no skip)', () => {
    const gate = new MoveGate();
    gate.press('right', 0);
    gate.next(0, 'right', all(['right']), true, () => true);
    gate.press('up', 5);
    const legal = (d: Dir): boolean => d === 'right';
    const out: (Dir | null)[] = [];
    for (let i = 0; i <= TURN_BUFFER_TILES; i++)
      out.push(gate.next(9 + i * 10, 'up', all(['up']), true, legal));
    expect(out.slice(0, TURN_BUFFER_TILES)).toEqual(Array(TURN_BUFFER_TILES).fill('right'));
    expect(out[TURN_BUFFER_TILES]).toBe('up');
  });

  it('gate: standing still, released, or reversing: no carrying, no involuntary turn', () => {
    const legal = (d: Dir): boolean => d !== 'up';
    const still = new MoveGate();
    still.press('up', 100);
    expect(still.next(100, 'up', all(['up']), true, legal)).toBe('up'); // not walking: just faces the wall

    const released = new MoveGate();
    released.press('right', 0);
    released.next(0, 'right', all(['right']), true, legal);
    released.press('up', 4);
    expect(released.next(9, null, all([]), true, legal)).toBe('up'); // a flick-and-release is one plain press

    const reverse = new MoveGate();
    reverse.press('right', 0);
    reverse.next(0, 'right', all(['right']), true, () => true);
    reverse.press('left', 4);
    expect(reverse.next(9, 'left', all(['left']), true, (d) => d !== 'left')).toBe('left');
  });

  class Walker {
    readonly state: GameState = sandbox({ players: 2 });
    readonly input = manager();
    readonly trace: [number, number][] = [];
    held: Dir | null = null;
    constructor(x: number, y: number) {
      put(this.state, 0, x, y);
      put(this.state, 1, 14, 10);
      this.trace.push([x, y]);
    }
    get p() {
      return this.state.players[0]!;
    }
    hold(d: Dir | null): void {
      this.held = d;
      this.input.setTouchDir(d);
    }
    step(n = 1): void {
      for (let i = 0; i < n; i++) {
        const p = this.p;
        const before = [p.x, p.y];
        tick(this.state, {
          0: this.input.buildIntent(this.state.tick, {
            canMove: readyToStep(p),
            legal: (d) => moveWouldAct(this.state, p, d),
          }),
        });
        if (p.x !== before[0] || p.y !== before[1]) this.trace.push([p.x, p.y]);
      }
    }
    /** Runs until the player stands on (x, y) (or gives up). */
    until(x: number, y: number, max = 200): void {
      for (let i = 0; i < max && !(this.p.x === x && this.p.y === y && this.p.stepRemaining <= 1); i++)
        this.step();
    }
  }

  it('real sim: thumb rolls from right to down one tile early -> walks on to the opening and turns', () => {
    const w = new Walker(0, 0);
    w.hold('right');
    w.until(1, 0); // the step onto (1,0) is finishing; (1,1) below is concrete
    w.hold('down');
    w.step(60);
    w.hold(null);
    w.step(30);
    expect(w.trace.slice(0, 3)).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    expect(w.trace[3]).toEqual([2, 1]); // turned down at the first open column
    for (let i = 1; i < w.trace.length; i++) {
      const [ax, ay] = w.trace[i - 1]!;
      const [bx, by] = w.trace[i]!;
      expect(Math.abs(bx - ax) + Math.abs(by - ay)).toBe(1); // never a skipped or diagonal tile
    }
  });

  it('real sim: a turn that never opens up stops the player after the single carried tile', () => {
    const w = new Walker(0, 0);
    addSoft(w.state, 2, 1); // the next column down is blocked too
    w.hold('right');
    w.until(1, 0);
    w.hold('down');
    w.step(80);
    w.hold(null);
    w.step(30);
    expect([w.p.x, w.p.y]).toEqual([2, 0]);
  });

  it('real sim: standing still and pushing into a wall never moves the player', () => {
    const w = new Walker(1, 0);
    w.step(40);
    w.hold('down');
    w.step(60);
    w.hold(null);
    expect([w.p.x, w.p.y]).toEqual([1, 0]);
    expect(w.trace).toHaveLength(1);
  });
});
