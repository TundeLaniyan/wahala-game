/**
 * The Oshodi Interchange, Surulere Power Yard and Third Mainland Checkpoint surroundings obey the
 * set rules in `src/render/arenas/common.ts`: nothing stands on the board, and the camera (south)
 * side stays low so no tile is hidden. The sets are built headless (a stub canvas stands in for the
 * DOM) and every mesh, vehicle, prop placement and background person is checked.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Group, InstancedMesh, Mesh, Sprite, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { Placement, SetContext } from '../../src/render/arenas/common';
import type { Vignette } from '../../src/render/life/StreetLife';
import type { StreetLife } from '../../src/render/life/StreetLife';
import type { AmbientFx } from '../../src/render/fx/Ambient';
import { QUALITY } from '../../src/render/quality';
import { artRng } from '../../src/render/textures';

/** A 2D context that accepts every call (headless stand-in for the canvas painters). */
function fakeContext(canvas: { width: number; height: number }): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const target: Record<string | symbol, unknown> = {
    canvas,
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
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
      const c = { width: 1, height: 1, style: {} } as {
        width: number;
        height: number;
        getContext?: () => unknown;
      };
      c.getContext = () => fakeContext(c);
      return c;
    },
  });
});

const W = 15;
const H = 11;
const STREET = -0.3;

interface Built {
  meshes: Mesh[];
  placements: { id: string; p: Placement }[];
  people: Vignette[];
}

function build(set: { build(ctx: SetContext): void }): Built {
  const root = new Group();
  const statics = new Group();
  // the shared backdrop's street plane, as backdrop.ts adds it before the set builds
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
    life: {
      add: (v: Vignette) => (people.push(v), true),
      group: new Group(),
      hasRoom: () => true,
    } as unknown as StreetLife,
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

/** Inside the walls (with a little margin). */
const onBoard = (x: number, z: number): boolean => Math.abs(x) < W / 2 + 0.3 && Math.abs(z) < H / 2 + 0.3;
/** The strip in front of the south wall that the camera looks across, within the board's width. */
const southStrip = (x: number, z: number): boolean =>
  Math.abs(x) < W / 2 + 0.3 && z > H / 2 + 0.3 && z < H / 2 + 2.8;

async function sets() {
  const [{ OSHODI_SET }, { POWER_YARD_SET }, { THIRD_MAINLAND_SET }] = await Promise.all([
    import('../../src/render/arenas/oshodi'),
    import('../../src/render/arenas/powerYard'),
    import('../../src/render/arenas/thirdMainland'),
  ]);
  return {
    oshodiInterchange: OSHODI_SET,
    surulerePowerYard: POWER_YARD_SET,
    thirdMainland: THIRD_MAINLAND_SET,
  };
}

describe('B1 arena surroundings (Oshodi, Power Yard, Third Mainland)', () => {
  it('build without errors and dress the scene richly', async () => {
    for (const [id, set] of Object.entries(await sets())) {
      const b = build(set);
      expect(b.meshes.length, id).toBeGreaterThan(300);
      expect(b.people.length, id).toBeGreaterThanOrEqual(8);
      expect(set.crowd, id).toBe(0);
    }
  });

  it('put nothing on the board and keep the camera side low', async () => {
    for (const [id, set] of Object.entries(await sets())) {
      const b = build(set);
      for (const m of b.meshes) {
        // sample every triangle (corners, edge midpoints, centroid) in world space: merged meshes
        // (baked statics, light glows) span the scene, so their bounding boxes say nothing
        const pos = m.geometry.attributes.position;
        if (!pos) continue;
        const index = m.geometry.index;
        const n = index ? index.count : pos.count;
        const v = [new Vector3(), new Vector3(), new Vector3()];
        const s = new Vector3();
        for (let i = 0; i + 2 < n; i += 3) {
          for (let k = 0; k < 3; k++)
            v[k]!.fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(m.matrixWorld);
          const samples = [v[0]!, v[1]!, v[2]!];
          for (const [a, c] of [
            [0, 1],
            [1, 2],
            [2, 0],
          ] as const)
            samples.push(s.clone().addVectors(v[a]!, v[c]!).multiplyScalar(0.5));
          samples.push(
            s
              .clone()
              .add(v[0]!)
              .add(v[1]!)
              .add(v[2]!)
              .multiplyScalar(1 / 3),
          );
          for (const q of samples) {
            if (onBoard(q.x, q.z) && q.y > 0.001)
              throw new Error(
                `${id}: geometry over the board at ${q.x.toFixed(2)}, ${q.y.toFixed(2)}, ${q.z.toFixed(2)}`,
              );
            if (southStrip(q.x, q.z) && q.y > 1.0)
              throw new Error(
                `${id}: tall geometry on the camera side at ${q.x.toFixed(2)}, ${q.y.toFixed(2)}, ${q.z.toFixed(2)}`,
              );
          }
          s.set(0, 0, 0);
        }
      }
      for (const { id: what, p } of b.placements) {
        expect(onBoard(p.x, p.z), `${id}: ${what} placed on the board`).toBe(false);
        if (southStrip(p.x, p.z))
          expect(['env_tyrestack', 'okada'], `${id}: ${what} on the camera side`).toContain(what);
      }
      for (const v of b.people) {
        expect(onBoard(v.x, v.z), `${id}: ${v.kind} on the board`).toBe(false);
        expect(southStrip(v.x, v.z), `${id}: ${v.kind} in front of the camera`).toBe(false);
        if (v.toX !== undefined && v.toZ !== undefined) {
          for (let t = 0; t <= 1; t += 0.1) {
            const x = v.x + (v.toX - v.x) * t;
            const z = v.z + (v.toZ - v.z) * t;
            expect(onBoard(x, z), `${id}: ${v.kind} walks across the board`).toBe(false);
            expect(southStrip(x, z), `${id}: ${v.kind} walks in front of the camera`).toBe(false);
          }
        }
      }
    }
  });

  it('Third Mainland removes the shared street plane so the lagoon shows far below the deck', async () => {
    const { thirdMainland } = await sets();
    const root = new Group();
    const statics = new Group();
    const { PlaneGeometry, MeshBasicMaterial } = await import('three');
    const street = new Mesh(new PlaneGeometry(140, 110), new MeshBasicMaterial());
    statics.add(street);
    const noop = (): void => undefined;
    thirdMainland.build({
      W,
      H,
      root,
      statics,
      rng: artRng(404),
      quality: QUALITY.low,
      life: { add: () => true, group: new Group(), hasRoom: () => true } as unknown as StreetLife,
      ambient: { fire: noop, smokeColumn: noop, exhaust: noop, dust: noop } as unknown as AmbientFx,
      instance: noop,
      vehicles: noop,
      wreck: noop,
      own: noop,
    });
    expect(statics.children).not.toContain(street);
    expect(STREET).toBeLessThan(0);
  });
});
