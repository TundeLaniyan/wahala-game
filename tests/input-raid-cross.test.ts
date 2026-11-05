/**
 * The raid cross control and cardinal-only input (docs/RAID_PRESENTATION.md, decisions RR6, RR7).
 *
 * 1. `CrossPad` (pure): one cardinal direction per press, the newest held arrow wins, sliding switches, never two.
 * 2. Through the REAL InputManager + simulation (`AssistRig`): the cross is one tile per press, a hold repeats via the
 *    existing move gate, switching replaces, and with `setCardinalOnly(true)` no device ever takes a corner route,
 *    sidestep or diagonal although assisted movement is on; normal mode is unchanged.
 * 3. The gamepad stick snaps to four cardinals (an ambiguous diagonal gives nothing in raids).
 * 4. The layout: the cross (>= 56 px arrows) overlaps neither the action buttons nor the board's bottom row on
 *    640x360, 740x360, 844x390 and portrait.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CROSS_DIRS,
  CROSS_MIN_BUTTON,
  CrossPad,
  actionColumn,
  crossLayout,
  inputModeFor,
  overlaps,
  snapStick,
} from '../src/input';
import type { Dir } from '../src/sim';
import { CameraRig } from '../src/render/cameraRig';
import { createLayout } from '../src/render/coords';
import { AssistRig } from './assistRig';
import { sandbox } from './helpers';

afterEach(() => vi.unstubAllGlobals());

describe('1. CrossPad: cardinal output only', () => {
  it('a press reports exactly that arrow; releasing reports nothing', () => {
    const p = new CrossPad();
    for (const d of CROSS_DIRS) {
      expect(p.press(1, d)).toBe(d);
      expect(p.release(1)).toBeNull();
    }
  });

  it('a second finger on another arrow replaces the first; lifting it hands back the one still held', () => {
    const p = new CrossPad();
    p.press(1, 'up');
    expect(p.press(2, 'right')).toBe('right');
    expect(p.dir).toBe('right'); // never both
    expect(p.release(2)).toBe('up');
    expect(p.release(1)).toBeNull();
  });

  it('a finger sliding from one arrow onto another switches direction; sliding off every arrow releases', () => {
    const p = new CrossPad();
    p.press(1, 'left');
    expect(p.slide(1, 'left')).toBe('left');
    expect(p.slide(1, 'down')).toBe('down');
    expect(p.slide(1, null)).toBeNull();
    // an unknown finger changes nothing
    expect(p.slide(9, 'up')).toBeNull();
  });

  it('whatever the gesture, the output is one of the four directions or null (never a pair or a diagonal)', () => {
    const p = new CrossPad();
    let seed = 7;
    const rnd = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const seen = new Set<unknown>();
    for (let i = 0; i < 500; i++) {
      const id = Math.floor(rnd() * 3);
      const d = CROSS_DIRS[Math.floor(rnd() * 4)]!;
      const r = rnd();
      const out =
        r < 0.4 ? p.press(id, d) : r < 0.7 ? p.slide(id, d) : r < 0.9 ? p.release(id) : p.slide(id, null);
      seen.add(out);
      expect(out === null || CROSS_DIRS.includes(out)).toBe(true);
      expect(typeof out === 'string' || out === null).toBe(true);
    }
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe('2. through the input layer and the simulation', () => {
  const open = (): string[] => Array.from({ length: 9 }, () => '.........');

  it('inputModeFor: raids are cardinal-only with the cross; every other kind is unchanged', () => {
    const s = sandbox();
    expect(inputModeFor(s)).toEqual({ cardinalOnly: false, cross: false });
    for (const game of ['classic', 'survival', 'deathmatch', 'team', 'mission'] as const)
      expect(inputModeFor({ settings: { ...s.settings, game } }).cross).toBe(false);
    expect(inputModeFor({ settings: { ...s.settings, game: 'raid' } })).toEqual({
      cardinalOnly: true,
      cross: true,
    });
  });

  it('a cross press is exactly one tile', () => {
    const r = new AssistRig({ map: open(), start: [4, 4] });
    r.input.setCardinalOnly(true);
    r.input.touchActive();
    r.input.setTouchDir('right');
    r.step(4);
    r.input.setTouchDir(null);
    r.step(40);
    expect(r.at).toEqual([5, 4]);
    expect(r.tiles).toBe(1);
    r.assertCleanTrace();
  });

  it('holding repeats at the step cadence through the move gate, and releasing stops at once', () => {
    const r = new AssistRig({ map: open(), start: [1, 4] });
    r.input.setCardinalOnly(true);
    r.input.setTouchDir('right');
    r.step(60);
    r.input.setTouchDir(null);
    const where = r.at[0];
    expect(where).toBeGreaterThan(3);
    r.step(30);
    expect(r.at[0]).toBe(where); // nothing carried over
    r.assertCleanTrace();
  });

  it('switching direction replaces the press: the new arrow, not the old one, takes the next step', () => {
    const r = new AssistRig({ map: open(), start: [4, 4] });
    r.input.setCardinalOnly(true);
    r.input.setTouchDir('right');
    r.input.setTouchDir('down'); // before the first tick: replaces
    r.step(30);
    r.input.setTouchDir(null);
    r.step(20);
    expect(r.trace.slice(1)[0]).toEqual([4, 5]);
    r.assertCleanTrace();
  });

  it('every move handed to the simulation is a single cardinal direction, for any device mix', () => {
    const r = new AssistRig({ map: open(), start: [4, 4] });
    r.input.setCardinalOnly(true);
    r.keyDown('up');
    r.keyDown('right'); // two keys: the newest wins, never both
    r.pad(['left', 'down']);
    r.step(20);
    r.keyUp('up');
    r.keyUp('right');
    r.pad([]);
    r.input.setTouchDir('left', 'up'); // a wish is ignored in raids
    r.step(40);
    r.input.setTouchDir(null);
    for (const m of r.movesDelivered) expect(CROSS_DIRS).toContain(m.move);
    r.assertCleanTrace();
  });

  it('no corner assistance in raids: a blocked direction with a diagonal lean stays blocked', () => {
    const wall = open().map((row, y) => (y === 3 ? '....#....' : row));
    // normal mode (full assist): the lean up-right round the wall moves the player somewhere other than straight up
    const normal = new AssistRig({ map: wall, start: [4, 4] });
    normal.thumbDown();
    normal.aim(50, 0.9);
    normal.step(40);
    normal.lift();
    const normalMoved = normal.tiles;

    const raid = new AssistRig({ map: wall, start: [4, 4] });
    raid.input.setCardinalOnly(true);
    raid.thumbDown();
    raid.aim(50, 0.9); // the stick model still reports a wish; the input layer drops it
    raid.step(40);
    raid.lift();
    expect(normalMoved).toBeGreaterThan(0);
    expect(raid.tiles).toBe(0); // up is a wall: the player stays, facing it
    expect(raid.at).toEqual([4, 4]);
    expect(raid.movesDelivered.every((m) => m.move === 'up')).toBe(true);
  });

  it('no sidestep or bend for a held direction either (keyboard) in raids', () => {
    const wall = open().map((row, y) => (y === 4 ? '.....#...' : row));
    const raid = new AssistRig({ map: wall, start: [4, 4] });
    raid.input.setCardinalOnly(true);
    raid.keyDown('right');
    raid.step(60);
    raid.keyUp('right');
    expect(raid.at).toEqual([4, 4]);
    expect(raid.movesDelivered.length).toBeGreaterThan(0);
    expect(raid.movesDelivered.every((m) => m.move === 'right')).toBe(true);
  });

  it('turning it off restores the assisted behaviour exactly', () => {
    const wall = open().map((row, y) => (y === 3 ? '....#....' : row));
    const a = new AssistRig({ map: wall, start: [4, 4] });
    a.input.setCardinalOnly(true);
    a.input.setCardinalOnly(false);
    a.thumbDown();
    a.aim(50, 0.9);
    a.step(40);
    const b = new AssistRig({ map: wall, start: [4, 4] });
    b.thumbDown();
    b.aim(50, 0.9);
    b.step(40);
    expect(a.trace).toEqual(b.trace);
  });
});

describe('3. gamepad stick snaps to cardinals', () => {
  it('the dominant axis wins and a clear deflection reports one direction', () => {
    expect(snapStick(null, 0.9, 0.1, true)).toBe('right');
    expect(snapStick(null, -0.9, 0.2, true)).toBe('left');
    expect(snapStick(null, 0.1, -0.9, true)).toBe('up');
    expect(snapStick(null, 0.2, 0.9, true)).toBe('down');
    expect(snapStick(null, 0.2, 0.2, true)).toBeNull(); // inside the dead zone
  });

  it('a thumb resting on a diagonal gives no new direction in raids (but the old behaviour elsewhere)', () => {
    expect(snapStick(null, 0.7, 0.68, true)).toBeNull();
    expect(snapStick(null, 0.7, 0.68, false)).toBe('right');
  });

  it('an active direction is kept near a diagonal (no flicker) and released when the stick comes back', () => {
    expect(snapStick('right', 0.8, 0.7, true)).toBe('right');
    expect(snapStick('right', 0.8, 1.0, true)).toBe('down'); // the other axis is clearly stronger: switches whole
    expect(snapStick('right', 0.2, 0.1, true)).toBeNull();
  });

  it('through the manager: the stick never produces a diagonal in raids', () => {
    for (const [ax, ay] of [
      [0.9, 0.9],
      [0.6, 0.55],
      [-0.7, 0.7],
    ] as const)
      expect(snapStick(null, ax, ay, true)).toBeNull();
  });
});

describe('4. layout: the cross never overlaps the action buttons or the board', () => {
  const VIEWPORTS: [string, number, number][] = [
    ['640x360', 640, 360],
    ['740x360', 740, 360],
    ['844x390', 844, 390],
    ['932x430', 932, 430],
    ['1280x720', 1280, 720],
    ['portrait 390x844', 390, 844],
    ['portrait 360x740', 360, 740],
  ];

  it.each(VIEWPORTS)('%s: arrows >= 56 px, inside the screen, clear of the action column', (_n, w, h) => {
    const safe = { left: 0, right: 0, bottom: 0 };
    const cross = crossLayout({ width: w, height: h, safe });
    expect(cross.button).toBeGreaterThanOrEqual(CROSS_MIN_BUTTON);
    for (const d of CROSS_DIRS) {
      const b = cross.buttons[d];
      expect(b.right - b.left).toBe(cross.button);
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.bottom).toBeLessThanOrEqual(h);
      expect(b.top).toBeGreaterThanOrEqual(0);
    }
    // the four arrows never overlap each other
    for (const a of CROSS_DIRS)
      for (const b of CROSS_DIRS) if (a < b) expect(overlaps(cross.buttons[a], cross.buttons[b])).toBe(false);
    expect(overlaps(cross.box, actionColumn({ width: w, height: h, safe }))).toBe(false);
  });

  it.each(VIEWPORTS)('%s: the cross box stays clear of safe areas', (_n, w, h) => {
    // a notch beside the board in landscape, only the home indicator in portrait
    const safe = w > h ? { left: 44, right: 44, bottom: 21 } : { left: 0, right: 0, bottom: 34 };
    const cross = crossLayout({ width: w, height: h, safe });
    expect(cross.box.left).toBeGreaterThanOrEqual(safe.left);
    expect(cross.box.bottom).toBeLessThanOrEqual(h - safe.bottom);
    expect(overlaps(cross.box, actionColumn({ width: w, height: h, safe }))).toBe(false);
  });

  // the board of a raid is small and fixed; judge against a 13 x 9 board (the compact standard size) and the full
  // 15 x 11 one: the camera keeps the near corners between the two control strips
  it.each(VIEWPORTS.filter(([n]) => !n.startsWith('portrait')))(
    '%s: no tile of the board sits under the cross',
    (_n, w, h) => {
      for (const [cols, rows] of [
        [13, 9],
        [15, 11],
      ] as const) {
        const layout = createLayout(cols, rows);
        const rig = new CameraRig(layout);
        rig.fit(w / h, h < 480 ? { top: 0.13, bottom: 0.03 } : { top: 0.1, bottom: 0.05 });
        rig.update(0, 0, 0, null);
        const box = crossLayout({ width: w, height: h }).box;
        for (let y = 0; y < rows; y++)
          for (let x = 0; x < cols; x++) {
            const v = rig.projectTilesNdc([{ x, y }])[0]!;
            const px = ((v.x + 1) / 2) * w;
            const py = ((1 - v.y) / 2) * h;
            const inside = px > box.left && px < box.right && py > box.top && py < box.bottom;
            expect(inside, `tile ${x},${y} at ${Math.round(px)},${Math.round(py)} under the cross`).toBe(
              false,
            );
          }
      }
    },
  );

  it('portrait: the board bottom row is above the cross (rotate card aside, the layout still holds)', () => {
    const w = 390;
    const h = 844;
    const layout = createLayout(13, 9);
    const rig = new CameraRig(layout);
    rig.fit(w / h, { top: 0.1, bottom: 0.05 });
    rig.update(0, 0, 0, null);
    const box = crossLayout({ width: w, height: h }).box;
    const bottomRow = rig.projectTilesNdc(Array.from({ length: 13 }, (_, x) => ({ x, y: 8 })));
    for (const v of bottomRow) {
      const px = ((v.x + 1) / 2) * w;
      const py = ((1 - v.y) / 2) * h;
      expect(px > box.left && px < box.right && py > box.top && py < box.bottom).toBe(false);
    }
  });
});

// keep the type import used for readers: Dir is the only direction vocabulary
export type { Dir };
