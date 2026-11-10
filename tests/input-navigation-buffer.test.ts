/**
 * Forgiving navigation (integrated release, Task 4; decisions NV1-NV4, docs/integrated-release/task4-navigation.md).
 * Real InputManager + real simulation (`AssistRig`), deterministic, one orthogonal tile per step:
 *
 *  NV1  held-turn continuation (keyboard, gamepad): a perpendicular turn asked for while it is still blocked, with the
 *       way the player walks STILL held (two keys, a rolled D-pad), keeps the player walking and is taken on the first
 *       tile where it opens; letting either go ends it. The touchscreen keeps its approved rules (2-tile early turn,
 *       corner route; AS4 / MV3);
 *  NV2  the gamepad D-pad gives the NEWEST button priority (a rolled thumb asks for the turn);
 *  NV3  Settings > Control size scales the thumbstick (and the buttons, in CSS);
 *  NV4  optional vibration: the pattern for a batch of events (pure).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tile } from '../src/sim';
import type { SimEvent } from '../src/sim';
import { stickConfigFor } from '../src/input/joystick';
import { DOWN_MS, HURT_MS, hapticFor } from '../src/platform/haptics';
import { DEFAULT_GAME_SETTINGS, sanitizeSettings } from '../src/app/settings';
import { addGenerator, put } from './helpers';
import { AssistRig } from './assistRig';

afterEach(() => vi.unstubAllGlobals());

/**
 * A one-tile market passage: the corridor x = 1 runs up from y = 8; the only way right is the gap at y = 2 (a row of
 * stalls / crates on either side). Pressed at y = 7 the turn is FIVE tiles early, well beyond the 2-tile carry.
 */
const PASSAGE = [
  '#########', //
  '#.#######',
  '#.......#',
  '#.#######',
  '#.#######',
  '#.#######',
  '#.#######',
  '#.#######',
  '#.#######',
  '#########',
];

/** Walks up from (1, 8) holding UP, then asks for RIGHT at y = 7 while UP is still held. */
function earlyTurn(device: 'keyboard' | 'gamepad', assist: 'auto' | 'on' | 'off' = 'auto'): AssistRig {
  const r = new AssistRig({ map: PASSAGE, start: [1, 8], assist });
  if (device === 'keyboard') r.keyDown('up');
  else r.pad(['up']);
  r.until(1, 7, 60);
  if (device === 'keyboard') r.keyDown('right');
  else r.pad(['up', 'right']);
  return r;
}

describe('NV1: a turn asked for early is taken at the first legal tile while the walk is still held', () => {
  for (const device of ['keyboard', 'gamepad'] as const) {
    it(`${device}: five tiles early into a one-tile passage - walks on, turns at the gap, never stops`, () => {
      const r = earlyTurn(device);
      r.step(200);
      expect(r.at[1], 'turned at the gap row').toBe(2);
      expect(r.at[0], 'and walks the passage').toBeGreaterThan(3);
      // never a stall on the way: consecutive tile changes are at most one step (+ the hand-over tick) apart
      const gaps = r.stepTicks.slice(1).map((t, i) => t - r.stepTicks[i]!);
      expect(Math.max(...gaps.slice(0, 8))).toBeLessThanOrEqual(r.p.stepTotal + 1);
      r.assertCleanTrace();
    });
  }

  it('assisted movement Off keeps the old gate exactly: the early turn bumps and the player stops', () => {
    const r = earlyTurn('keyboard', 'off');
    r.step(200);
    expect(r.at[0]).toBe(1);
    expect(r.at[1]).toBeGreaterThan(2); // never reached the gap
  });

  it('letting go of the walk direction cancels: no turn is taken later on its own', () => {
    const r = earlyTurn('keyboard');
    r.step(15);
    r.keyUp('up');
    r.keyUp('right');
    r.step(200);
    expect(r.at[1]).toBeGreaterThan(2); // stopped in the corridor, did not drift to the gap
    expect(r.at[0]).toBe(1);
  });

  it('letting go of the turn keeps walking straight past the gap (the turn expired with the key)', () => {
    const r = earlyTurn('keyboard');
    r.step(15);
    r.keyUp('right');
    r.step(200);
    expect(r.at).toEqual([1, 1]); // walked on to the corridor's end, never turned
  });

  it('a reversal is never continued: holding UP then DOWN walks back down at once', () => {
    const r = new AssistRig({ map: PASSAGE, start: [1, 8], assist: 'auto' });
    r.keyDown('up');
    r.until(1, 6, 60);
    r.keyDown('down');
    r.step(40);
    expect(r.at[1]).toBeGreaterThan(6);
  });

  it('a newer direction replaces the pending one (the newest press wins)', () => {
    const r = earlyTurn('keyboard');
    r.step(12);
    r.keyUp('right');
    r.keyDown('left'); // LEFT is a wall all the way: the request is now LEFT, never the old RIGHT
    r.step(200);
    expect(r.at[0]).toBe(1); // no right turn was taken at the gap
  });

  it('touchscreen keeps its approved rules (AS4 / MV3): a turn 5 tiles early is not continued by a lean', () => {
    const r = new AssistRig({ map: PASSAGE, start: [1, 8], assist: 'on' });
    r.thumbDown();
    r.push('up');
    r.until(1, 7, 60);
    r.aim(25); // RIGHT (blocked here, the gap is 5 tiles on)
    r.step(2);
    r.aim(40); // a lean back towards UP is not a walk order on the touchscreen
    r.step(120);
    expect(r.at[1]).toBeGreaterThan(2); // no slide up the wall to the gap
    r.assertCleanTrace();
  });

  it('touchscreen: the 2-tile early turn still works (pointing at the turn two tiles before the gap)', () => {
    const r = new AssistRig({ map: PASSAGE, start: [1, 8], assist: 'on' });
    r.thumbDown();
    r.push('up');
    r.until(1, 4, 80);
    r.push('right');
    r.step(80);
    expect(r.at[1]).toBe(2);
    expect(r.at[0]).toBeGreaterThan(1);
    r.assertCleanTrace();
  });

  it('a generator in the corridor ahead is never walked through (the walk stops at it, the turn still waits)', () => {
    const r = earlyTurn('keyboard');
    addGenerator(r.state, { ownerId: 1, x: 1, y: 4, timer: 9999 });
    r.step(120);
    r.assertCleanTrace();
    expect(r.at[1]).toBeGreaterThanOrEqual(4);
    expect(r.at[0]).toBe(1);
  });

  it('another fighter in the corridor does not break it (players share tiles as always)', () => {
    const r = earlyTurn('keyboard');
    put(r.state, 1, 1, 4);
    r.step(200);
    expect(r.at[1]).toBe(2);
    r.assertCleanTrace();
  });

  it('box corners: the turn opens as soon as a crate in the way is blown up, not one tile later', () => {
    const map = PASSAGE.map((row, y) => (y === 5 ? '#.S......' : row));
    const r = new AssistRig({ map, start: [1, 8], assist: 'auto' });
    r.keyDown('up');
    r.until(1, 7, 60);
    r.keyDown('right');
    r.until(1, 5, 80); // walking up, the crate at (2, 5) blocks the right turn here
    r.state.tiles[5 * r.state.width + 2] = Tile.Empty; // the crate is gone
    r.step(30);
    expect(r.at[1]).toBe(5); // took the newly open turn right here
    expect(r.at[0]).toBeGreaterThan(1);
  });

  it('quick alternating directions stay one tile per press (no extra steps, no skipped tiles)', () => {
    const map = ['#########', '#.......#', '#.......#', '#.......#', '#########'];
    const r = new AssistRig({ map, start: [4, 2], assist: 'auto' });
    for (const d of ['left', 'right', 'left', 'right'] as const) {
      r.keyDown(d);
      r.step(3);
      r.keyUp(d);
      r.step(12);
    }
    r.assertCleanTrace();
    expect(r.tiles).toBe(4);
    expect(r.at).toEqual([4, 2]);
  });
});

describe('NV2: gamepad D-pad newest button wins', () => {
  it('rolling from UP onto UP+RIGHT asks for RIGHT (it used to keep UP by fixed priority)', () => {
    const map = ['#########', '#.......#', '#.......#', '#.......#', '#########'];
    const r = new AssistRig({ map, start: [2, 3], assist: 'auto' });
    r.pad(['up']);
    r.step(12);
    r.pad(['up', 'right']);
    r.step(30);
    expect(r.at[0]).toBeGreaterThan(2);
  });
});

describe('NV3 / NV4: control size and vibration', () => {
  it('Large scales the stick radius and every zone with it; Normal is unchanged', () => {
    const normal = stickConfigFor(844, 390);
    const large = stickConfigFor(844, 390, 1.15);
    expect(stickConfigFor(844, 390, 1)).toEqual(normal);
    expect(large.radius).toBeGreaterThan(normal.radius);
    expect(large.deadZone).toBeGreaterThanOrEqual(normal.deadZone);
    expect(large.releaseZone).toBeLessThan(large.deadZone);
  });

  it('settings: control size and vibration are sanitised (defaults Normal and On)', () => {
    expect(DEFAULT_GAME_SETTINGS.controlSize).toBe('normal');
    expect(DEFAULT_GAME_SETTINGS.vibration).toBe('on');
    const bad = sanitizeSettings({
      ...DEFAULT_GAME_SETTINGS,
      controlSize: 'huge' as never,
      vibration: 1 as never,
    });
    expect(bad.controlSize).toBe('normal');
    expect(bad.vibration).toBe('on');
  });

  it('vibration pattern: hurt or dazed = a short buzz, knocked out = a pattern, someone else = nothing', () => {
    const hit = {
      type: 'campaignHit',
      victimId: 0,
      byId: 1,
      source: 'punch',
      result: 'damaged',
      damage: 1,
      hpAfter: 2,
      maxHp: 4,
      dazeTicks: 18,
      x: 1,
      y: 1,
    } as SimEvent;
    expect(hapticFor([hit], 0)).toBe(HURT_MS);
    expect(hapticFor([hit], 1)).toBeNull();
    expect(hapticFor([{ type: 'playerDazed', playerId: 0, byId: 1 }], 0)).toBe(HURT_MS);
    expect(hapticFor([{ type: 'playerEliminated', playerId: 0 } as SimEvent], 0)).toBe(DOWN_MS);
    expect(hapticFor([], 0)).toBeNull();
  });
});
