import { describe, expect, it } from 'vitest';
import {
  VIEW_CLEAR,
  corridorTiles,
  hidesFighter,
  pickOccluders,
  segmentEnters,
} from '../../src/render/assets/viewClear';
import type { Aabb } from '../../src/render/assets/viewClear';

/** A building of 4 x 3 tiles and `h` tall, its north face at z = zn (camera looks north from +z). */
const building = (x0: number, x1: number, zn: number, h: number, depth = 3): Aabb => ({
  minX: x0,
  maxX: x1,
  minZ: zn,
  maxZ: zn + depth,
  minY: 0,
  maxY: h,
});

// a steep three-quarter camera 9 up and 7 south of the fighter at the origin
const cam = { x: 0, y: 9, z: 7 };
const fighter = { x: 0, z: 0 };

describe('segmentEnters', () => {
  it('hits a box the line crosses and misses one it passes beside', () => {
    const a = { x: 0, y: 9, z: 7 };
    const b = { x: 0, y: 1, z: 0 };
    expect(segmentEnters(a, b, building(-2, 2, 1.5, 6), 0, 0)).toBe(true);
    expect(segmentEnters(a, b, building(3, 7, 1.5, 6), 0, 0)).toBe(false);
  });

  it('ignores a box behind the target (the segment ends at the fighter)', () => {
    expect(segmentEnters(cam, { x: 0, y: 1, z: 0 }, building(-2, 2, -6, 6), 0.3, 0.6)).toBe(false);
  });

  it('does not count a wall right beside the fighter as in front of it', () => {
    // the building starts exactly where the fighter stands
    expect(hidesFighter(cam, fighter, building(-2, 2, -3, 6), VIEW_CLEAR.enterPad)).toBe(false);
  });
});

describe('pickOccluders', () => {
  it('fades a tall building in front, not a low one the line passes over', () => {
    // 3 tiles south of the fighter the line is already above 3.8 high: a 6 m building blocks it, a 1 m shed does not
    const tall = building(-2, 2, 3, 6);
    const low = building(-2, 2, 3, 1);
    expect(pickOccluders(cam, fighter, [tall, low], null)).toEqual([0]);
  });

  it('fades nothing when the fighter is in the clear', () => {
    const away = building(10, 14, 3, 6);
    const behind = building(-2, 2, -8, 9);
    expect(pickOccluders(cam, fighter, [away, behind], null)).toEqual([]);
  });

  it('catches a building taller than the old fixed reach and several columns away from the fighter', () => {
    // far south and off to the side: only a real line test sees that it crosses the view
    const far = building(0.6, 4, 5, 9, 2);
    const eye = { x: 3, y: 9, z: 7 };
    expect(pickOccluders(eye, fighter, [far], null)).toEqual([0]);
  });

  it('hysteresis: a fading building keeps fading in the margin, a new one does not start there', () => {
    // the line passes 0.4 beside the building west edge: between the enter pad (0.1) and the exit pad (0.3)
    const near = building(0.2, 4, 2, 9);
    const side = { x: 0, y: 6, z: 4 }; // line from here to the fighter stays at x = 0
    const target = { x: 0, z: 0 };
    expect(pickOccluders(side, target, [near], null)).toEqual([]);
    expect(pickOccluders(side, target, [near], new Set([0]))).toEqual([0]);
    // far outside even the exit pad: released
    expect(pickOccluders(side, target, [building(1.6, 4, 2, 9)], new Set([0]))).toEqual([]);
  });

  it('a building one tile over (its edge exactly half a tile from the fighter) is never picked, even while it fades', () => {
    // regression: with an exit pad of half a tile, a fighter walking a lane kept the neighbouring building dissolved
    const next = building(0.5, 4.5, 2, 9);
    const target = { x: 0, z: 0 };
    const side = { x: 0, y: 6, z: 4 };
    expect(pickOccluders(side, target, [next], null)).toEqual([]);
    expect(pickOccluders(side, target, [next], new Set([0]))).toEqual([]);
  });

  it('is deterministic and does not depend on box order', () => {
    const boxes = [building(-2, 2, 3, 6), building(5, 9, 3, 6), building(-1, 1, 5, 8)];
    const a = pickOccluders(cam, fighter, boxes, null);
    const b = pickOccluders(cam, fighter, [...boxes].reverse(), null).map((i) => boxes.length - 1 - i);
    expect(a).toEqual([0, 2]);
    expect([...b].sort()).toEqual(a);
  });
});

describe('corridorTiles', () => {
  const W = 20;
  const tileOf = (x: number, z: number): number => {
    const tx = Math.round(x + W / 2 - 0.5);
    const ty = Math.round(z + W / 2 - 0.5);
    return tx < 0 || ty < 0 || tx >= W || ty >= W ? -1 : ty * W + tx;
  };

  it('lists the tiles from the fighter towards the camera and nothing north of the fighter', () => {
    const tiles = corridorTiles({ x: 0.5, z: 0.5 }, { x: 0.5, z: 10.5 }, tileOf);
    const fighterTile = tileOf(0.5, 0.5);
    expect(tiles.has(fighterTile + W)).toBe(true);
    expect(tiles.has(fighterTile + 3 * W)).toBe(true);
    expect(tiles.has(fighterTile - W)).toBe(false);
  });

  it('is bounded by the corridor reach', () => {
    const tiles = corridorTiles({ x: 0.5, z: -9.5 }, { x: 0.5, z: 80 }, tileOf);
    expect(Math.max(...[...tiles].map((t) => Math.floor(t / W)))).toBeLessThanOrEqual(
      Math.ceil(9.5 + VIEW_CLEAR.reach),
    );
  });
});

describe('Lekki board cover bounds', async () => {
  const { getArena } = await import('../../src/sim');
  const { NEW_ARENA_ART } = await import('../../src/render/arenas/newArenas');
  const a = getArena('rumbleLekki');
  const W = a.layout[0]!.length;
  const H = a.layout.length;
  const cover = NEW_ARENA_ART().rumbleLekki!.cover!({ width: W, height: H })!;
  const wx = (x: number): number => x - W / 2 + 0.5;
  const wz = (y: number): number => y - H / 2 + 0.5;

  it('exposes a world box per fade group, each claiming a tile the cover draws', () => {
    expect(cover.bounds.length).toBeGreaterThan(50);
    for (const b of cover.bounds) {
      expect(cover.covers(b.tile)).toBe(true);
      expect(b.maxY).toBeGreaterThan(b.minY);
      expect(b.maxX).toBeGreaterThan(b.minX);
    }
  });

  it('a fighter in the lane north of a tall block is hidden by it from the follow camera; in the open it is not', () => {
    const tall = cover.bounds.filter((b) => b.maxY >= 4);
    expect(tall.length).toBeGreaterThan(5);
    // camera 8 up and 6.5 south of the fighter (the stadium follow camera's pose)
    const eye = (x: number, y: number) => ({ x: wx(x), y: 8, z: wz(y) + 6.5 });
    let hidden = 0;
    let clear = 0;
    for (let y = 2; y < H - 8; y++)
      for (let x = 2; x < W - 2; x++) {
        if (a.layout[y]![x] === '#') continue;
        const hit = pickOccluders(eye(x, y), { x: wx(x), z: wz(y) }, cover.bounds, null);
        if (hit.length > 0) hidden++;
        else clear++;
        // never an object wholly behind (north of) the fighter
        for (const i of hit) expect(cover.bounds[i]!.maxZ).toBeGreaterThan(wz(y));
      }
    expect(hidden).toBeGreaterThan(50);
    expect(clear).toBeGreaterThan(hidden); // most of the board is in the clear: no needless transparency
  });
});
