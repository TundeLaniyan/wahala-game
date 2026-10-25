/**
 * The City Rumble V2 stage surroundings (Oshodi, Lagos Island, Ojuelegba, Apapa, Lekki Nightworks) obey
 * the set rules in `src/render/arenas/common.ts` on their large boards: nothing stands on the board, and
 * the camera (south) side stays low so no tile is hidden. Built headless (a stub canvas stands in for the
 * DOM); every mesh triangle, vehicle, prop placement and background person is checked. The floor painters
 * run against the same stub, and each stage registers its look, set and floor.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Group, InstancedMesh, Mesh, Sprite, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { ArenaSet, Placement, SetContext } from '../../src/render/arenas/common';
import type { Vignette } from '../../src/render/life/StreetLife';
import type { StreetLife } from '../../src/render/life/StreetLife';
import type { AmbientFx } from '../../src/render/fx/Ambient';
import { QUALITY } from '../../src/render/quality';
import { artRng } from '../../src/render/textures';
import { getArena } from '../../src/sim';

function fakeContext(canvas: { width: number; height: number }): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const target: Record<string | symbol, unknown> = {
    canvas,
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
  };
  return new Proxy(target, {
    get: (t, p) => (p in t ? t[p] : () => undefined),
    set: (t, p, v) => {
      t[p] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

beforeAll(() => {
  vi.stubGlobal('document', {
    createElement: () => {
      const c = { width: 1, height: 1, style: {} } as { width: number; height: number; getContext?: () => unknown };
      c.getContext = () => fakeContext(c);
      return c;
    },
  });
});

const STAGES = ['rumbleOshodi', 'rumbleLagosIsland', 'rumbleOjuelegba', 'rumbleApapa', 'rumbleLekkiNight'];

interface Built {
  meshes: Mesh[];
  placements: { id: string; p: Placement }[];
  people: Vignette[];
}

function build(set: ArenaSet, W: number, H: number): Built {
  const root = new Group();
  const statics = new Group();
  statics.add(new Mesh());
  const placements: { id: string; p: Placement }[] = [];
  const people: Vignette[] = [];
  const noop = (): void => undefined;
  const ctx: SetContext = {
    W,
    H,
    root,
    statics,
    rng: artRng(404),
    quality: QUALITY.high,
    life: { add: (v: Vignette) => (people.push(v), true), group: new Group(), hasRoom: () => true } as unknown as StreetLife,
    ambient: { fire: noop, smokeColumn: noop, exhaust: noop, dust: noop } as unknown as AmbientFx,
    instance: (id, ps) => ps.forEach((p) => placements.push({ id, p })),
    vehicles: (kind, ps) => ps.forEach((p) => placements.push({ id: kind, p })),
    wreck: (kind, p) => placements.push({ id: kind, p }),
    own: noop,
  };
  set.build(ctx);
  const meshes: Mesh[] = [];
  const visit = (o: Object3D): void => {
    if (o instanceof Mesh && !(o instanceof InstancedMesh) && !(o instanceof Sprite)) meshes.push(o);
    o.children.forEach(visit);
  };
  root.updateMatrixWorld(true);
  statics.updateMatrixWorld(true);
  visit(root);
  visit(statics);
  return { meshes, placements, people };
}

async function art() {
  const { NEW_ARENA_ART } = await import('../../src/render/arenas/newArenas');
  return NEW_ARENA_ART();
}

describe.each(STAGES)('%s surroundings', (id) => {
  const a = getArena(id);
  const W = a.layout[0]!.length;
  const H = a.layout.length;
  const onBoard = (x: number, z: number): boolean => Math.abs(x) < W / 2 + 0.3 && Math.abs(z) < H / 2 + 0.3;
  const southStrip = (x: number, z: number): boolean => Math.abs(x) < W / 2 + 0.3 && z > H / 2 + 0.3 && z < H / 2 + 2.8;

  it('registers its own look, set and floor, and builds a richly dressed scene', async () => {
    const reg = (await art())[id];
    expect(reg).toBeDefined();
    const b = build(reg!.set, W, H);
    expect(b.meshes.length).toBeGreaterThan(200);
    expect(b.people.length).toBeGreaterThanOrEqual(9);
    expect(b.placements.filter((p) => ['danfo', 'taxi', 'keke', 'okada'].includes(p.id)).length).toBeGreaterThanOrEqual(4);
    // the floor painter runs on the stage's own board size
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 48;
    const g = c.getContext('2d')!;
    expect(() => reg!.floor(g, g, W, H)).not.toThrow();
  });

  it('puts nothing on the board and keeps the camera side low', async () => {
    const b = build((await art())[id]!.set, W, H);
    for (const m of b.meshes) {
      const pos = m.geometry.attributes.position;
      if (!pos) continue;
      const index = m.geometry.index;
      const n = index ? index.count : pos.count;
      const v = [new Vector3(), new Vector3(), new Vector3()];
      for (let i = 0; i + 2 < n; i += 3) {
        for (let k = 0; k < 3; k++) v[k]!.fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(m.matrixWorld);
        const samples = [v[0]!, v[1]!, v[2]!, new Vector3().add(v[0]!).add(v[1]!).add(v[2]!).multiplyScalar(1 / 3)];
        for (const [p, q] of [
          [0, 1],
          [1, 2],
          [2, 0],
        ] as const)
          samples.push(new Vector3().addVectors(v[p]!, v[q]!).multiplyScalar(0.5));
        for (const q of samples) {
          if (onBoard(q.x, q.z) && q.y > 0.001)
            throw new Error(`${id}: geometry over the board at ${q.x.toFixed(2)}, ${q.y.toFixed(2)}, ${q.z.toFixed(2)}`);
          if (southStrip(q.x, q.z) && q.y > 1.0)
            throw new Error(`${id}: tall geometry on the camera side at ${q.x.toFixed(2)}, ${q.y.toFixed(2)}, ${q.z.toFixed(2)}`);
        }
      }
    }
    for (const { id: what, p } of b.placements) {
      expect(onBoard(p.x, p.z), `${id}: ${what} placed on the board at ${p.x}, ${p.z}`).toBe(false);
      if (southStrip(p.x, p.z))
        expect(['env_tyrestack', 'okada', 'prop_soft_sacks', 'prop_soft_cartons'], `${id}: ${what} on the camera side`).toContain(what);
    }
    for (const v of b.people) {
      expect(onBoard(v.x, v.z), `${id}: ${v.kind} on the board`).toBe(false);
      expect(southStrip(v.x, v.z), `${id}: ${v.kind} in front of the camera`).toBe(false);
      if (v.toX !== undefined && v.toZ !== undefined)
        for (let t = 0; t <= 1; t += 0.1) {
          const x = v.x + (v.toX - v.x) * t;
          const z = v.z + (v.toZ - v.z) * t;
          expect(onBoard(x, z), `${id}: ${v.kind} walks across the board`).toBe(false);
          expect(southStrip(x, z), `${id}: ${v.kind} walks in front of the camera`).toBe(false);
        }
    }
    // no fights or area-boy scenes in the V2 stages (founder: no generic criminality)
    expect(b.people.some((p) => p.kind === 'fight')).toBe(false);
  });
});
