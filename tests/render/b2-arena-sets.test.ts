import { AdditiveBlending, Box3, Group, Mesh, Texture } from 'three';
import type { Material, Object3D } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { AJEGUNLE_SET } from '../../src/render/arenas/ajegunle';
import { LAGOON_SET } from '../../src/render/arenas/lagoon';
import { YABA_SET } from '../../src/render/arenas/yaba';
import type { Placement, SetContext } from '../../src/render/arenas/common';
import type { Vignette } from '../../src/render/life/StreetLife';
import { QUALITY } from '../../src/render/quality';
import { artRng } from '../../src/render/textures';

// canvas textures need a DOM; the headless build only needs a stand-in for the glow sprite
vi.mock('../../src/render/textures', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  glowTexture: () => new Texture(),
}));

const W = 15;
const H = 11;

interface Built {
  root: Group;
  statics: Group;
  placed: { id: string; p: Placement }[];
  vehicles: Placement[];
  actors: Vignette[];
}

function build(set: typeof AJEGUNLE_SET, level: 'low' | 'high' = 'high'): Built {
  const root = new Group();
  const statics = new Group();
  const placed: Built['placed'] = [];
  const vehicles: Placement[] = [];
  const actors: Vignette[] = [];
  const group = new Group();
  const life = {
    group,
    get count() {
      return actors.length;
    },
    add(v: Vignette) {
      actors.push(v);
      group.add(new Group());
      return true;
    },
  };
  const noop = (): void => {};
  const ctx: SetContext = {
    W,
    H,
    root,
    statics,
    rng: artRng(404),
    quality: QUALITY[level],
    life: life as unknown as SetContext['life'],
    ambient: { fire: noop, smokeColumn: noop, exhaust: noop, dust: noop } as unknown as SetContext['ambient'],
    instance: (id, ps) => ps.forEach((p) => placed.push({ id, p })),
    vehicles: (_kind, ps) => vehicles.push(...ps),
    wreck: (_kind, p) => vehicles.push(p),
    own: noop,
  };
  set.build(ctx);
  return { root, statics, placed, vehicles, actors };
}

/** World boxes of every solid mesh under `o` (additive light halos are merged set-wide: skipped). */
function boxes(o: Object3D): Box3[] {
  o.updateMatrixWorld(true);
  const out: Box3[] = [];
  o.traverse((m) => {
    if (m instanceof Mesh && (m.material as Material).blending !== AdditiveBlending)
      out.push(new Box3().setFromObject(m));
  });
  return out;
}

const onBoard = (b: Box3, margin = 0): boolean =>
  b.max.y > 0.02 &&
  b.min.x < W / 2 - margin &&
  b.max.x > -W / 2 + margin &&
  b.min.z < H / 2 - margin &&
  b.max.z > -H / 2 + margin;

describe.each([
  ['ajegunleBackstreets', AJEGUNLE_SET],
  ['lagoonJetty', LAGOON_SET],
  ['yabaAfterDark', YABA_SET],
])('%s surroundings', (_id, set) => {
  const b = build(set);
  const all = [...boxes(b.statics), ...boxes(b.root)];

  it('builds a substantial set', () => {
    expect(all.length).toBeGreaterThan(300);
    expect(b.actors.length).toBeGreaterThanOrEqual(10);
  });

  it('puts nothing on the board', () => {
    const bad = all.filter((x) => onBoard(x));
    expect(bad.map((x) => [x.min.toArray(), x.max.toArray()])).toEqual([]);
  });

  it('keeps the camera (south) side low', () => {
    // everything starting south of the south wall, in front of the board, stays under ~1 m
    const tall = all.filter(
      (x) =>
        x.min.z > H / 2 &&
        x.min.z < H / 2 + 2.5 &&
        x.max.x > -W / 2 - 1 &&
        x.min.x < W / 2 + 1 &&
        x.max.y > 1.0,
    );
    expect(tall.map((x) => [x.min.toArray(), x.max.toArray()])).toEqual([]);
  });

  it('keeps people, vehicles and modelled props off the board', () => {
    const off = (x: number, z: number, m = 0.3): boolean =>
      Math.abs(x) > W / 2 + m || Math.abs(z) > H / 2 + m;
    for (const v of b.actors) {
      expect(off(v.x, v.z), `${v.kind} at ${v.x},${v.z}`).toBe(true);
      if (v.toX !== undefined && v.toZ !== undefined)
        expect(off(v.toX, v.toZ), `${v.kind} path end`).toBe(true);
      // a walking path never crosses the board either
      if (v.toX !== undefined && v.toZ !== undefined)
        for (let t = 0; t <= 1; t += 0.05)
          expect(off(v.x + (v.toX - v.x) * t, v.z + (v.toZ - v.z) * t)).toBe(true);
    }
    for (const p of b.vehicles) expect(off(p.x, p.z, 1.0), `vehicle at ${p.x},${p.z}`).toBe(true);
    for (const { id, p } of b.placed) expect(off(p.x, p.z, 0.4), `${id} at ${p.x},${p.z}`).toBe(true);
  });
});

describe('B2 arena sets on low quality', () => {
  it('still build within the smaller actor budget', () => {
    for (const set of [AJEGUNLE_SET, LAGOON_SET, YABA_SET]) expect(() => build(set, 'low')).not.toThrow();
  });
});
