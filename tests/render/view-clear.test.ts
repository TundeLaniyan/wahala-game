import { Matrix4, PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { MAX_HIDE, VIEW_HIDE } from '../../src/render/assets/occlusionFade';
import {
  VIEW_CLEAR,
  hidesAny,
  hidesFighter,
  holdMisses,
  isNearerThan,
  pickOccluders,
  pickOccludersFor,
  projectNdc,
  regionTiles,
  segmentEnters,
  viewPoints,
} from '../../src/render/assets/viewClear';
import type { Aabb, ViewPoint } from '../../src/render/assets/viewClear';

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

/** The follow camera at a given aspect: 9 up and 7 south of the fighter at the origin, looking at it. */
function frame(
  aspect: number,
  fov = 40,
): { eye: { x: number; y: number; z: number }; vp: ArrayLike<number> } {
  const cam = new PerspectiveCamera(fov, aspect, 0.1, 200);
  cam.position.set(0, 9, 7);
  cam.lookAt(0, 0.6, 0);
  cam.updateMatrixWorld(true);
  const m = new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  return { eye: { x: 0, y: 9, z: 7 }, vp: m.elements };
}
const open = (): boolean => true;
const points = (aspect: number, walkable: (x: number, z: number) => boolean = open): ViewPoint[] =>
  viewPoints({ fighter: { x: 0, z: 0 }, viewProj: frame(aspect).vp, walkable });

describe('viewPoints (what must stay readable)', () => {
  it('always holds the fighter feet / torso / head, on any aspect', () => {
    for (const aspect of [844 / 390, 390 / 844, 16 / 9]) {
      const fighter = points(aspect).filter((p) => p.ring === 0);
      expect(fighter.map((p) => p.y)).toEqual([...VIEW_CLEAR.heights]);
    }
  });

  it('holds the floor disc: three rings of walkable points and an outer halo', () => {
    const pts = points(844 / 390);
    const radii = new Set(pts.filter((p) => p.ring > 0).map((p) => p.ring));
    expect([...radii].sort()).toEqual([...VIEW_CLEAR.ringRadii, VIEW_CLEAR.haloRadius].sort());
    expect(pts.filter((p) => p.halo).length).toBeGreaterThan(0);
    expect(pts.filter((p) => p.ring > 0 && !p.halo).length).toBeGreaterThan(20);
  });

  it('skips floor on a block or building (the object does not hide its own footprint) and off-screen floor', () => {
    const all = points(844 / 390).length;
    const east = points(844 / 390, (x) => x < 0.2).length;
    expect(east).toBeLessThan(all);
    // a narrow portrait frame shows less of the disc sideways than the landscape phone
    expect(points(390 / 844).length).toBeLessThanOrEqual(all);
  });

  it('adds live rivals and generators near the fighter, capped', () => {
    const extras = Array.from({ length: 30 }, (_, i) => ({ x: -1 + (i % 3) * 0.5, z: -0.5, y: 0.9 }));
    const pts = viewPoints({
      fighter: { x: 0, z: 0 },
      viewProj: frame(844 / 390).vp,
      walkable: open,
      extras,
    });
    const withExtras = pts.filter((p) => p.ring === 0 && !VIEW_CLEAR.heights.includes(p.y) && p.y !== 0.15);
    expect(withExtras.length).toBe(VIEW_CLEAR.maxExtras);
  });

  it('projectNdc puts the looked-at point at the centre and reports a point behind the camera', () => {
    const { vp } = frame(2);
    const c = projectNdc(vp, 0, 0.6, 0);
    expect(Math.abs(c.x)).toBeLessThan(1e-6);
    expect(Math.abs(c.y)).toBeLessThan(1e-6);
    expect(projectNdc(vp, 0, 9, 20).ahead).toBe(false);
  });
});

describe('pickOccludersFor (screen-space decision)', () => {
  const eye = { x: 0, y: 9, z: 7 };
  const F = { x: 0, z: 0 }; // the fighter

  it('fades a tall building that covers the floor beside the fighter although the fighter line is clear', () => {
    // 1.4 east and 1.5 south of the fighter: the line to the fighter (x = 0) passes it, the floor east of the fighter is behind it
    const beside = building(1.2, 4, 1.4, 6, 2);
    expect(pickOccluders(eye, { x: 0, z: 0 }, [beside], null)).toEqual([]); // the old single-line test missed it
    for (const aspect of [844 / 390, 390 / 844, 1280 / 720])
      expect(
        pickOccludersFor(eye, points(aspect), [beside], null, VIEW_CLEAR, F),
        `aspect ${aspect}`,
      ).toEqual([0]);
  });

  it('fades the building in front of the fighter on a phone landscape and a phone portrait frame', () => {
    const front = building(-2, 2, 2.5, 6);
    for (const aspect of [844 / 390, 390 / 844])
      expect(pickOccludersFor(eye, points(aspect), [front], null, VIEW_CLEAR, F)).toEqual([0]);
  });

  it('fades a rival hidden behind a building even though the fighter stands in the clear', () => {
    const rival = { x: -3.2, z: -0.5, y: 0.9 };
    const pts = viewPoints({
      fighter: { x: 0, z: 0 },
      viewProj: frame(844 / 390).vp,
      walkable: () => false,
      extras: [rival],
    });
    const hides = building(-4.5, -2.6, 1.0, 6, 1.6);
    expect(pickOccludersFor(eye, pts, [hides], null, VIEW_CLEAR, F)).toEqual([0]);
    expect(
      pickOccludersFor(
        eye,
        pts.filter((p) => p.ring === 0 && VIEW_CLEAR.heights.includes(p.y)),
        [hides],
        null,
      ),
    ).toEqual([]);
  });

  it('fades nothing when nothing covers the fighter or the floor around it', () => {
    const boxes = [
      building(6, 10, 1, 8), // far to the east
      building(-2, 2, -9, 9), // wholly behind (north of) the fighter
      building(-12, -8, 3, 9), // far to the west
      building(-2, 2, 6.5, 0.4), // a kerb at the camera's feet
    ];
    for (const aspect of [844 / 390, 390 / 844, 1280 / 720])
      expect(pickOccludersFor(eye, points(aspect), boxes, null, VIEW_CLEAR, F), `aspect ${aspect}`).toEqual(
        [],
      );
  });

  it('a low crate only protects the inner rings: far floor behind it does not fade it', () => {
    const crate = building(2.0, 3.0, 1.5, 1.1, 1); // covers floor at about x 2.4..3.7, z -1.2: ring 2.5 only
    const asTall = { ...crate, maxY: 3 };
    const low = pickOccludersFor(eye, points(844 / 390), [crate], null, VIEW_CLEAR, F);
    const tall = pickOccludersFor(eye, points(844 / 390), [asTall], null, VIEW_CLEAR, F);
    expect(low).toEqual([]);
    expect(tall).toEqual([0]);
  });

  it('hysteresis of the disc: a building that only covers the halo ring never starts fading, but keeps fading', () => {
    // find a building that covers halo points but no core point
    const pts = points(844 / 390);
    const core = pts.filter((p) => !p.halo);
    const halo = pts.filter((p) => p.halo);
    let found: Aabb | null = null;
    for (let x = -6; x <= 6 && !found; x += 0.5)
      for (let z = -2; z <= 5 && !found; z += 0.5) {
        const b = building(x, x + 1, z, 6, 1);
        const coversCore = pickOccludersFor(eye, core, [b], null, VIEW_CLEAR, F).length > 0;
        const coversHalo = pickOccludersFor(eye, halo, [b], new Set([0]), VIEW_CLEAR, F).length > 0;
        if (!coversCore && coversHalo) found = b;
      }
    expect(found).not.toBeNull();
    expect(pickOccludersFor(eye, pts, [found!], null, VIEW_CLEAR, F)).toEqual([]);
    expect(pickOccludersFor(eye, pts, [found!], new Set([0]), VIEW_CLEAR, F)).toEqual([0]);
  });

  it('returns to clear at once when the fighter steps out from behind (no lingering)', () => {
    const front = building(-2, 2, 2.5, 6);
    const at = (x: number): { eye: { x: number; y: number; z: number }; pts: ViewPoint[] } => {
      // the follow camera moves with the fighter
      const cam = new PerspectiveCamera(40, 844 / 390, 0.1, 200);
      cam.position.set(x, 9, 7);
      cam.lookAt(x, 0.6, 0);
      cam.updateMatrixWorld(true);
      const vp = new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements;
      return {
        eye: { x, y: 9, z: 7 },
        pts: viewPoints({ fighter: { x, z: 0 }, viewProj: vp, walkable: open }),
      };
    };
    expect(pickOccludersFor(at(0).eye, at(0).pts, [front], null)).toEqual([0]);
    expect(pickOccludersFor(at(9).eye, at(9).pts, [front], new Set([0]))).toEqual([]);
  });

  it('a lane building one tile over is not picked by the disc either (no flicker walking a lane)', () => {
    const lane = (x: number, z: number): boolean => Math.abs(x) < 0.5 && z > -9 && z < 9; // a 1-wide lane along z
    const pts = viewPoints({ fighter: { x: 0, z: 0 }, viewProj: frame(844 / 390).vp, walkable: lane });
    const next = building(0.5, 4.5, 2, 9);
    expect(pickOccludersFor(eye, pts, [next], null, VIEW_CLEAR, F)).toEqual([]);
    expect(pickOccludersFor(eye, pts, [next], new Set([0]), VIEW_CLEAR, F)).toEqual([]);
  });

  it('an object behind the fighter that only covers floor further back stays solid; in front of it fades', () => {
    // a hut right behind (north of) the fighter: it hides the floor behind itself, nothing in front of the fighter
    const hut = building(-1, 1, -2.5, 3, 2.5); // its south face overhangs onto the fighter's own row
    const pts = points(844 / 390);
    expect(pickOccludersFor(eye, pts, [hut], null, VIEW_CLEAR, F)).toEqual([]);
    // without the rule (no fighter given) the disc would dissolve it: this is what the rule prevents
    expect(pickOccludersFor(eye, pts, [hut], null)).toEqual([0]);
    // the same hut moved in front of the fighter does fade
    const front = building(-1, 1, 1.8, 3, 1.6);
    expect(pickOccludersFor(eye, pts, [front], null, VIEW_CLEAR, F)).toEqual([0]);
  });
});

describe('isNearerThan', () => {
  const cam = { x: 0, z: 7 };
  it('compares the closest point of the footprint with the fighter, with the slack', () => {
    const f = { x: 0, z: 0 };
    expect(isNearerThan(cam, f, building(-1, 1, 2, 3, 1), 0.1)).toBe(true); // in front
    expect(isNearerThan(cam, f, building(-1, 1, -3, 3, 1.5), 0.1)).toBe(false); // behind
    expect(isNearerThan(cam, f, building(2, 4, -0.5, 3, 1), 0.1)).toBe(true); // beside, a corner nearer
    expect(isNearerThan(cam, f, building(-1, 1, -1.2, 1.4, 0.9), 0.1)).toBe(false); // wholly behind the fighter
    // a group box whose south face overhangs to the fighter's own row is not in front of it (the default margin)
    const overhang = building(-3, 1, -3.5, 3, 3.5); // z -3.5 .. 0
    expect(isNearerThan(cam, f, overhang, VIEW_CLEAR.nearerSlack)).toBe(false);
    expect(isNearerThan(cam, f, building(-3, 1, -3.5, 3, 4.0), VIEW_CLEAR.nearerSlack)).toBe(true); // reaches 0.5 in front
  });
});

describe('regionTiles', () => {
  const W = 30;
  const tileOf = (x: number, z: number): number => {
    const tx = Math.round(x + W / 2 - 0.5);
    const ty = Math.round(z + W / 2 - 0.5);
    return tx < 0 || ty < 0 || tx >= W || ty >= W ? -1 : ty * W + tx;
  };
  it('covers the corridor to the camera, widened by the disc, and the disc itself', () => {
    const t = regionTiles({ x: 0.5, z: 0.5 }, { x: 0.5, z: 10.5 }, tileOf, 3.3);
    const f = tileOf(0.5, 0.5);
    for (const d of [-3, 0, 3]) expect(t.has(f + d)).toBe(true); // beside the fighter
    expect(t.has(f + 4 * W)).toBe(true);
    expect(t.has(f + 3 * W + 3)).toBe(true);
    expect(t.has(f - 5 * W)).toBe(false); // well north of the disc
  });
});

describe('dissolve strength', () => {
  it('an object hiding the fighter dissolves further than a pillar merely standing in front, and keeps an outline', () => {
    expect(VIEW_HIDE).toBeGreaterThan(MAX_HIDE);
    expect(VIEW_HIDE).toBeLessThan(1);
  });
});

describe('pickOccludersFor prefilter', () => {
  it('returns exactly what testing every box would (the hull shortcut only skips boxes no line can cross)', () => {
    const eye = { x: 1, y: 9, z: 7 };
    const pts = points(844 / 390);
    let seed = 12345;
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const boxes: Aabb[] = [];
    for (let i = 0; i < 200; i++) {
      const x = rnd() * 30 - 15;
      const z = rnd() * 24 - 12;
      boxes.push({
        minX: x,
        maxX: x + 1 + rnd() * 3,
        minZ: z,
        maxZ: z + 1 + rnd() * 3,
        minY: 0,
        maxY: rnd() * 8,
      });
    }
    const active = new Set([3, 40, 77]);
    const brute = boxes.flatMap((b, i) => (hidesAny(eye, pts, b, active.has(i)) ? [i] : []));
    expect(pickOccludersFor(eye, pts, boxes, active)).toEqual(brute);
    expect(brute.length).toBeGreaterThan(0);
    expect(brute.length).toBeLessThan(boxes.length / 2);
  });
});

describe('holdMisses (release debounce)', () => {
  it('keeps an object for leaveTests - 1 tests without a hit, then lets it go', () => {
    const misses = new Map<number, number>();
    const cfg = { ...VIEW_CLEAR, leaveTests: 2 };
    let faded = new Set([7]);
    faded = holdMisses(faded, new Set(), misses, cfg); // first miss: still faded
    expect([...faded]).toEqual([7]);
    faded = holdMisses(faded, new Set(), misses, cfg); // second miss: released
    expect([...faded]).toEqual([]);
    expect(misses.size).toBe(0);
  });

  it('a hit in between resets the count, so an object blinking at an edge stays faded', () => {
    const misses = new Map<number, number>();
    let faded = new Set([3]);
    const seq = [false, true, false, true, false, true]; // hit / miss / hit ... every other test
    for (const hit of seq) faded = holdMisses(faded, hit ? new Set([3]) : new Set(), misses);
    expect([...faded]).toEqual([3]);
  });

  it('a new hit starts fading at once and an object that was never faded is not invented', () => {
    const misses = new Map<number, number>();
    expect([...holdMisses(new Set(), new Set([1, 2]), misses)].sort()).toEqual([1, 2]);
    expect([...holdMisses(new Set(), new Set(), misses)]).toEqual([]);
  });

  it('forgets counts of objects that are no longer in play', () => {
    const misses = new Map<number, number>([[9, 1]]);
    holdMisses(new Set(), new Set(), misses);
    expect(misses.size).toBe(0);
  });
});
