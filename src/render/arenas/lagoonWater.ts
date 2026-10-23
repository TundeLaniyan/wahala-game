/**
 * Lagos Lagoon Jetty: the water and everything on it (presentation only). Murky green-grey lagoon
 * water with drifting ripples (an animated normal map: one draw call per water sheet), mats of water
 * hyacinth and floating rubbish, plank and dugout canoes painted in faded bands, a covered passenger
 * ferry, a rusted cargo lighter and, far out in the mist, Makoko-style stilt houses. Boats ride the
 * swell with a slow bob and roll (each boat is baked to one mesh per material and moved as a whole).
 */
import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  Vector2,
} from 'three';
import type { Object3D } from 'three';
import { artRng } from '../textures';
import { bakeModel } from '../assets/merge';
import type { SetContext } from './common';
import { frame, v3 } from './ajegunleKit';
import type { StreetKit } from './ajegunleKit';

/** The lagoon surface height (just above the street ground plane, below the quay tops). */
export const WATER = -0.27;

/** A tileable ripple normal map (sum of integer-frequency waves, so it wraps seamlessly). */
function rippleNormals(): CanvasTexture {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const g = c.getContext('2d')!;
  const r = artRng(6401);
  const waves = Array.from({ length: 9 }, () => ({
    kx: Math.round((r() - 0.5) * 12),
    ky: Math.round((r() - 0.5) * 12) || 1,
    a: 0.4 + r(),
    p: r() * Math.PI * 2,
  }));
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let v = 0;
      for (const w of waves) v += w.a * Math.sin(((w.kx * x + w.ky * y) / N) * Math.PI * 2 + w.p);
      h[y * N + x] = v;
    }
  const img = g.createImageData(N, N);
  const s = 2.2;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = h[y * N + ((x + 1) % N)]! - h[y * N + ((x + N - 1) % N)]!;
      const dy = h[((y + 1) % N) * N + x]! - h[((y + N - 1) % N) * N + x]!;
      let nx = -dx * s * 0.05;
      let ny = -dy * s * 0.05;
      const len = Math.hypot(nx, ny, 1);
      nx /= len;
      ny /= len;
      const i = (y * N + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 0.5 * 255 + 127;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** One lagoon sheet (w x d centred on x, z) with slowly drifting ripples. */
export function waterSheet(ctx: SetContext, x: number, z: number, w: number, d: number): Mesh {
  const m = new MeshStandardMaterial({
    color: 0x3e4c44,
    roughness: 0.1,
    metalness: 0.1,
    envMapIntensity: 1.6,
  });
  if (typeof document !== 'undefined') {
    const n = rippleNormals();
    n.repeat.set(w / 3.2, d / 3.2);
    m.normalMap = n;
    m.normalScale = new Vector2(0.9, 0.9);
    ctx.own(n);
  }
  m.userData.noGrit = true; // no dust film on water
  ctx.own(m);
  const g = new PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  ctx.own(g);
  const sheet = new Mesh(g, m);
  sheet.position.set(x, WATER, z);
  sheet.receiveShadow = true;
  sheet.castShadow = false;
  sheet.onBeforeRender = () => {
    const t = performance.now() / 1000;
    if (m.normalMap) m.normalMap.offset.set(t * 0.011, t * 0.017);
  };
  ctx.root.add(sheet);
  return sheet;
}

/**
 * A plank / dugout canoe hull along +z (length L, beam B, depth D): outer skin in `paint` with a
 * contrasting sheer stripe, raw wood inside, tar-black below the waterline, raised pointed ends.
 */
export function canoeHull(
  L: number,
  B: number,
  D: number,
  paint: number,
  stripe: number,
  inner = 0x6a5038,
): BufferGeometry {
  const NS = 18; // sections along the length
  const NA = 7; // points round the half section
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const rgb = (h: number): [number, number, number] => [
    ((h >> 16) & 255) / 255,
    ((h >> 8) & 255) / 255,
    (h & 255) / 255,
  ];
  const lin = (c: [number, number, number]) => c.map((v) => Math.pow(v, 2.2)) as [number, number, number];
  const P = lin(rgb(paint));
  const S = lin(rgb(stripe));
  const I = lin(rgb(inner));
  const TAR = lin(rgb(0x1a1816));
  // ring of points at section t (0..1) for skin k (0 outer, 1 inner)
  const ring = (t: number, k: number): [number, number, number, number][] => {
    const z = (t - 0.5) * L;
    const half = Math.pow(Math.sin(Math.PI * t), 0.55) * (B / 2) + 0.012;
    const sheer = D + 0.22 * Math.pow(Math.abs(2 * t - 1), 3); // ends sweep up
    const out: [number, number, number, number][] = [];
    for (let a = 0; a < NA; a++) {
      const th = (a / (NA - 1)) * Math.PI; // 0 = starboard gunwale, PI = port gunwale
      const sx = Math.cos(th);
      const sy = Math.sin(th);
      const shrink = k ? 0.88 : 1;
      const x = sx * half * shrink;
      const y =
        sheer - sy * (sheer * 0.95) * (k ? 0.85 : 1) * (0.5 + 0.5 * Math.pow(Math.sin(Math.PI * t), 0.3));
      out.push([x, k ? Math.max(y, 0.08) : y, z, sy]);
    }
    return out;
  };
  const push = (p: [number, number, number, number], k: number, t: number, a: number) => {
    pos.push(p[0], p[1], p[2]);
    const below = p[1] < D * 0.35;
    const nearTop = p[3] < 0.3;
    const c = k ? I : below ? TAR : nearTop ? S : P;
    col.push(...c);
    uv.push(t * 4, a);
  };
  for (const k of [0, 1]) {
    for (let s = 0; s < NS; s++) {
      const t0 = s / NS;
      const t1 = (s + 1) / NS;
      const r0 = ring(t0, k);
      const r1 = ring(t1, k);
      for (let a = 0; a + 1 < NA; a++) {
        const quad: [number, number][] = [
          [0, a],
          [1, a],
          [1, a + 1],
          [0, a],
          [1, a + 1],
          [0, a + 1],
        ];
        // outer skin faces out; inner skin is wound the other way to face in
        const order = k ? [0, 2, 1, 3, 5, 4] : [0, 1, 2, 3, 4, 5];
        for (const o of order) {
          const [which, ai] = quad[o]!;
          const rr = which ? r1 : r0;
          push(rr[ai]!, k, which ? t1 : t0, ai / (NA - 1));
        }
      }
    }
  }
  // gunwale caps joining the skins
  for (let s = 0; s < NS; s++) {
    const t0 = s / NS;
    const t1 = (s + 1) / NS;
    for (const a of [0, NA - 1]) {
      const o0 = ring(t0, 0)[a]!;
      const o1 = ring(t1, 0)[a]!;
      const i0 = ring(t0, 1)[a]!;
      const i1 = ring(t1, 1)[a]!;
      const tri = a === 0 ? [o0, i0, i1, o0, i1, o1] : [o0, o1, i1, o0, i1, i0];
      for (const p of tri) push([p[0], p[1] + 0.005, p[2], 0], 0, t0, 0);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

interface Bob {
  g: Object3D;
  y: number;
  phase: number;
  amp: number;
  roll: number;
}

/** Collects the floating things and moves them on the swell (one hook per set). */
export class Swell {
  private readonly items: Bob[] = [];

  add(g: Object3D, amp = 0.03, roll = 0.025): void {
    this.items.push({ g, y: g.position.y, phase: this.items.length * 1.37, amp, roll });
  }

  /** Hooks the animation to a mesh that is always drawn (the water sheet). */
  attach(driver: Mesh): void {
    const prev = driver.onBeforeRender;
    let last = -1;
    driver.onBeforeRender = (...args) => {
      prev.apply(driver, args);
      const t = performance.now() / 1000;
      if (t === last) return;
      last = t;
      for (const b of this.items) {
        const p = t * 0.9 + b.phase;
        b.g.position.y = b.y + Math.sin(p) * b.amp;
        b.g.rotation.z = Math.sin(p * 0.83 + 1) * b.roll;
        b.g.rotation.x = Math.sin(p * 0.61) * b.roll * 0.5;
      }
    };
  }
}

/** Bakes a boat group into its own floating object (one mesh per material) and adds it to the swell. */
function float(
  ctx: SetContext,
  swell: Swell,
  built: Group,
  x: number,
  z: number,
  ry: number,
  amp: number,
  roll: number,
): Object3D {
  const holder = new Group();
  const baked = bakeModel(built);
  holder.add(baked);
  holder.position.set(x, WATER, z);
  holder.rotation.y = ry;
  holder.userData.grit = 'vehicle';
  // boats far out in the mist never throw a shadow anyone could see
  if (z < -13) baked.traverse((o) => (o.castShadow = false));
  ctx.root.add(holder);
  swell.add(holder, amp, roll);
  return holder;
}

export interface CanoeOpts {
  len?: number;
  paint?: number;
  stripe?: number;
  motor?: boolean;
  nets?: boolean;
  /** goods: fish baskets / sacks heaped amidships */
  cargo?: boolean;
}

/** A plank canoe (outboard optional) floating at (x, z) with its bow along `ry`. */
export function canoe(
  kit: StreetKit,
  ctx: SetContext,
  swell: Swell,
  x: number,
  z: number,
  ry: number,
  o: CanoeOpts = {},
): Object3D {
  const L = o.len ?? 6.5;
  const B = L * 0.14;
  const D = 0.42;
  const g = new Group();
  const hull = new Mesh(canoeHull(L, B, D, o.paint ?? 0x3a5a7a, o.stripe ?? 0xb8b0a0), kit.material('wood'));
  g.add(hull);
  // ride low: the keel sits ~0.18 m under the surface
  hull.position.y = -0.18;
  const r = kit.rng;
  for (let k = -2; k <= 2; k++) kit.box(g, B * 0.8, 0.04, 0.16, 0x5a4430, 0, D - 0.22, k * (L / 6), 'wood'); // thwarts
  kit.box(g, B * 0.5, 0.02, L * 0.6, 0x4a3a28, 0, -0.06, 0, 'wood'); // floor boards
  if (o.motor) {
    kit.box(g, 0.32, 0.5, 0.4, 0x8a8a84, 0, D + 0.05, -L / 2 + 0.1, 'metal');
    kit.box(g, 0.34, 0.12, 0.42, 0x2a2a2a, 0, D + 0.32, -L / 2 + 0.1, 'metal');
    kit.box(g, 0.08, 0.6, 0.12, 0x3a3a38, 0, D - 0.4, -L / 2 - 0.05, 'metal');
  }
  if (o.nets) {
    for (let k = 0; k < 3; k++)
      kit.box(
        g,
        B * 0.6,
        0.18 + r() * 0.1,
        0.5 + r() * 0.3,
        k % 2 ? 0x2a4a3e : 0x3a5a6a,
        (r() - 0.5) * 0.1,
        0.02,
        -0.6 + k * 0.6,
        'cloth',
        { ry: r() * 0.4 },
      );
    for (let k = 0; k < 6; k++)
      kit.cyl(
        g,
        0.06,
        0.06,
        0.1,
        k % 2 ? 0xd8d0c0 : 0xc85a2a,
        (r() - 0.5) * B * 0.5,
        0.18,
        -0.9 + k * 0.35,
        'plastic',
        6,
      );
  }
  if (o.cargo) {
    for (let k = 0; k < 4; k++) {
      const bz = -1.0 + k * 0.62;
      if (k % 2) kit.box(g, B * 0.6, 0.32, 0.5, 0xb8a888, 0, 0.12, bz, 'cloth', { ry: 0.2 });
      else kit.cyl(g, 0.24, 0.18, 0.3, 0x8a6a40, 0, 0.12, bz, 'wood', 10);
    }
  }
  // a paddle laid across
  kit.box(g, 0.05, 0.03, 1.6, 0x5a4430, B * 0.2, D - 0.15, 0.6, 'wood', { ry: 0.3 });
  return float(ctx, swell, g, x, z, ry, 0.025 + r() * 0.015, 0.02 + r() * 0.015);
}

/**
 * A covered passenger ferry (the white-and-blue Lagos water bus): steel hull, a long cabin with
 * dark window bands, a canopy roof, orange life rings, two outboards.
 */
export function ferry(
  kit: StreetKit,
  ctx: SetContext,
  swell: Swell,
  x: number,
  z: number,
  ry: number,
): Object3D {
  const g = new Group();
  const L = 9.5;
  const hull = new Mesh(canoeHull(L, 2.6, 0.9, 0xd8d4c8, 0x2a5a8a, 0x8a8a84), kit.material('metal'));
  hull.position.y = -0.4;
  hull.scale.set(1, 1, 1);
  g.add(hull);
  kit.box(g, 2.0, 0.06, L * 0.7, 0x6a6a64, 0, 0.42, 0, 'metal'); // deck
  // cabin: posts, half-height side panels, window gap, canopy roof
  const cl = L * 0.55;
  kit.box(g, 2.0, 0.55, cl, 0xd0ccc0, 0, 0.72, -0.3, 'metal');
  kit.box(g, 2.02, 0.42, cl - 0.2, 0x1a2026, 0, 1.2, -0.3, 'metal');
  for (let k = 0; k <= 6; k++)
    for (const s of [-1, 1])
      kit.box(g, 0.05, 0.5, 0.05, 0xd0ccc0, s * 0.98, 1.2, -0.3 - cl / 2 + (k * cl) / 6, 'metal');
  kit.box(g, 2.25, 0.08, cl + 0.5, 0x2a5a8a, 0, 1.48, -0.3, 'plastic');
  kit.box(g, 2.0, 0.06, 0.6, 0xd0ccc0, 0, 1.55, -0.3 + cl / 2 - 0.4, 'metal');
  // seated passengers' heads through the windows (dark shapes)
  for (let k = 0; k < 7; k++)
    for (const s of [-0.5, 0.5])
      kit.box(g, 0.2, 0.22, 0.2, 0x2a2018, s, 1.12, -0.3 - cl / 2 + 0.4 + k * (cl / 7), 'matte');
  for (const s of [-1, 1])
    kit.cyl(g, 0.2, 0.2, 0.07, 0xd8642a, s * 1.03, 0.9, 1.4, 'plastic', 12, { rz: Math.PI / 2 });
  for (const s of [-0.45, 0.45]) {
    kit.box(g, 0.34, 0.55, 0.42, 0x2a2a2c, s, 0.7, -L / 2 + 0.3, 'metal');
    kit.box(g, 0.08, 0.55, 0.12, 0x3a3a38, s, 0.2, -L / 2 + 0.15, 'metal');
  }
  kit.sign(g, 0, 1.6, 0.26, 0, 0.72, -0.3 + cl / 2 + 0.01, false);
  return float(ctx, swell, g, x, z, ry, 0.03, 0.012);
}

/** A rusted steel cargo lighter with two containers and a heap of sacks, moored far out. */
export function lighter(
  kit: StreetKit,
  ctx: SetContext,
  swell: Swell,
  x: number,
  z: number,
  ry: number,
): Object3D {
  const g = new Group();
  kit.box(g, 3.6, 0.9, 11, 0x5a3a28, 0, 0.15, 0, 'metal');
  kit.box(g, 3.7, 0.12, 11.1, 0x3a2a20, 0, 0.62, 0, 'metal');
  kit.box(g, 2.4, 2.4, 5.6, 0x3a5a6a, 0, 1.85, -2.4, 'metal');
  kit.box(g, 2.4, 2.4, 5.6, 0x8a4a2a, 0, 1.85, 3.0, 'metal');
  kit.box(g, 2.0, 2.0, 1.6, 0xd0ccc0, 0, 1.6, -5.0, 'metal'); // wheelhouse
  kit.box(g, 1.9, 0.4, 0.05, 0x1a2026, 0, 2.2, -4.18, 'metal');
  return float(ctx, swell, g, x, z, ry, 0.012, 0.004);
}

/** A Makoko-style stilt house: plank walls and a rusted roof on a platform over the water. */
export function stiltHouse(kit: StreetKit, parent: Object3D, x: number, z: number, ry: number, s = 1): void {
  const r = kit.rng;
  const g = frame(parent, x, WATER, z, ry);
  g.scale.setScalar(s);
  const w = 3 + r() * 1.5;
  const d = 2.6 + r() * 1.2;
  const deck = 1.1 + r() * 0.4;
  for (let i = 0; i <= 3; i++)
    for (const sz of [-1, 1])
      kit.cyl(
        g,
        0.06,
        0.07,
        deck + 0.6,
        0x3a2e22,
        -w / 2 + (i * w) / 3,
        (deck - 0.6) / 2,
        (sz * d) / 2,
        'wood',
        5,
      );
  kit.box(g, w + 0.8, 0.08, d + 0.6, 0x5a4632, 0, deck, 0.2, 'wood');
  const wall = [0x6a5440, 0x5a4a3a, 0x7a6248][Math.floor(r() * 3)]!;
  kit.box(g, w, 1.9, d, wall, 0, deck + 1.0, 0, 'wood');
  for (let k = 0; k < w / 0.3; k++)
    kit.box(g, 0.02, 1.9, 0.02, 0x2a2018, -w / 2 + k * 0.3, deck + 1.0, d / 2 + 0.01, 'wood');
  kit.box(g, 0.7, 1.4, 0.04, 0x1a1410, -w / 4, deck + 0.75, d / 2 + 0.02, 'matte');
  kit.box(g, 0.6, 0.45, 0.04, 0x1a1410, w / 4, deck + 1.3, d / 2 + 0.02, 'matte');
  const roof = [0x7a5a40, 0x6a6058, 0x8a6044][Math.floor(r() * 3)]!;
  kit.sheet(g, w + 0.5, d / 2 + 0.6, roof, 0, deck + 2.15, d / 4 + 0.15, 0.32);
  kit.sheet(g, w + 0.5, d / 2 + 0.6, roof, 0, deck + 2.15, -d / 4 - 0.15, 0.32, Math.PI);
  // washing on the rail, a ladder down to the canoe
  kit.bar(
    g,
    v3(-w / 2 - 0.3, deck + 0.9, d / 2 + 0.4),
    v3(w / 2 + 0.3, deck + 0.9, d / 2 + 0.4),
    0.02,
    0x3a2e22,
    'wood',
    4,
  );
  for (let k = 0; k < 3; k++)
    kit.cloth(g, 0.5, 0.5, [0xa83a2a, 0x2a4a7a, 0xd8d0b8][k]!, k, -w / 3 + k * 0.8, deck + 0.9, d / 2 + 0.42);
}

/** Water hyacinth mats and floating rubbish along the quay. */
export function flotsam(
  kit: StreetKit,
  parent: Object3D,
  x: number,
  z: number,
  w: number,
  d: number,
  n: number,
): void {
  const r = kit.rng;
  for (let i = 0; i < n; i++) {
    const px = x + (r() - 0.5) * w;
    const pz = z + (r() - 0.5) * d;
    if (r() < 0.6) {
      // a clump of hyacinth: glossy green leaves in a low mound
      for (let k = 0; k < 4; k++)
        kit.cyl(
          parent,
          0.18 + r() * 0.2,
          0.22 + r() * 0.2,
          0.06,
          r() < 0.5 ? 0x3a5a2a : 0x4a6a32,
          px + (r() - 0.5) * 0.6,
          WATER + 0.02,
          pz + (r() - 0.5) * 0.4,
          'plastic',
          7,
        );
    } else {
      kit.box(
        parent,
        0.08 + r() * 0.2,
        0.04,
        0.06 + r() * 0.12,
        [0xd8dce0, 0x2a5a9a, 0x1a1a1a, 0xc8b8a0][i % 4]!,
        px,
        WATER + 0.01,
        pz,
        'plastic',
        { ry: r() * 3 },
      );
    }
  }
}
