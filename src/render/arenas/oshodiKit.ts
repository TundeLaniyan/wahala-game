/**
 * Road and utility infrastructure kit shared by Oshodi Interchange, Surulere Power Yard and Third
 * Mainland Checkpoint (presentation only): cached painted canvas textures (signs, ground), a
 * textured street plane, painted kerbs, concrete parapets, lamp standards, big market umbrellas,
 * sagging overhead wires, wind-blown flags and drifting wind streaks.
 *
 * Static pieces go into the set's baked `statics`; the few animated ones (flags, streaks) are
 * added to `root` and animate themselves in `onBeforeRender`, so the set needs no update hook.
 * Everything stays OFF the board; callers keep the camera (south) side low (see `common.ts`).
 */
import {
  AdditiveBlending,
  CanvasTexture,
  CatmullRomCurve3,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
} from 'three';
import type { BufferAttribute, Material, Object3D } from 'three';
import { artRng } from '../textures';
import { box, cyl, mat, mesh, uniqueMat } from '../assets/helpers';
import type { SetContext } from './common';
import { STREET } from './common';
import type { SiteLights } from './roadworksKit';
import { bar, lampMat, tiltedBox, v3 } from './roadworksKit';

export type Paint = CanvasRenderingContext2D;

const cache = new Map<string, CanvasTexture>();

/** A cached canvas texture painted once by `draw` (sRGB, mipmapped). */
export function painted(
  key: string,
  w: number,
  h: number,
  draw: (g: Paint, r: () => number) => void,
  repeat = false,
  seed = 1,
): CanvasTexture {
  let t = cache.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!, artRng(seed));
    t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
    cache.set(key, t);
  }
  return t;
}

/** Rust runs, chipped paint and grime over a painted board (call after the lettering). */
export function weather(g: Paint, r: () => number, w: number, h: number, amount = 1): void {
  for (let i = 0; i < 26 * amount; i++) {
    const x = r() * w;
    const grad = g.createLinearGradient(x, 0, x, h);
    grad.addColorStop(0, `rgba(104,50,24,${0.18 + r() * 0.3})`);
    grad.addColorStop(1, 'rgba(104,50,24,0)');
    g.fillStyle = grad;
    g.fillRect(x, r() * h * 0.3, 1.5 + r() * 4, h * (0.2 + r() * 0.6));
  }
  for (let i = 0; i < 220 * amount; i++) {
    g.fillStyle = r() < 0.7 ? `rgba(28,24,18,${r() * 0.2})` : `rgba(210,200,180,${r() * 0.22})`;
    g.fillRect(r() * w, r() * h, 2 + r() * 10, 1 + r() * 6);
  }
}

export interface SignSpec {
  bg: string;
  fg: string;
  lines: [string, number][];
  border?: string;
  /** a band of colour across the top (danger boards) */
  band?: { color: string; text: string; fg: string };
  wear?: number;
}

/** A painted sign board texture (lines of bold lettering, optional top band), weathered. */
export function signTexture(key: string, w: number, h: number, s: SignSpec, seed = 7): CanvasTexture {
  return painted(
    `sign:${key}`,
    w,
    h,
    (g, r) => {
      g.fillStyle = s.bg;
      g.fillRect(0, 0, w, h);
      let top = 0;
      if (s.band) {
        const bh = Math.round(h * 0.3);
        g.fillStyle = s.band.color;
        g.fillRect(0, 0, w, bh);
        g.fillStyle = s.band.fg;
        g.font = `bold ${Math.round(bh * 0.66)}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(s.band.text, w / 2, bh / 2 + 2);
        top = bh;
      }
      g.fillStyle = s.fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const total = s.lines.reduce((n, [, size]) => n + size * 1.25, 0);
      let y = top + (h - top - total) / 2;
      for (const [text, size] of s.lines) {
        g.font = `bold ${size}px system-ui, sans-serif`;
        g.fillText(text, w / 2, y + size * 0.65, w * 0.94);
        y += size * 1.25;
      }
      if (s.border) {
        g.strokeStyle = s.border;
        g.lineWidth = Math.max(4, w * 0.012);
        g.strokeRect(6, 6, w - 12, h - 12);
      }
      weather(g, r, w, h, s.wear ?? 1);
    },
    false,
    seed,
  );
}

/**
 * A sign: the painted face (both sides drawn), a steel backing tray and optional posts down to the
 * street. `y` is the centre of the face above the street.
 */
export function sign(
  ctx: SetContext,
  map: CanvasTexture,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  ry: number,
  o: { posts?: number; postMat?: Material; tilt?: number; parent?: Object3D } = {},
): void {
  const g = new Group();
  const face = uniqueMat(0xffffff, { map, roughness: 0.82, flat: false });
  ctx.own(face);
  const plane = mesh(new PlaneGeometry(w, h), face, 0, 0, 0.03);
  g.add(plane);
  g.add(box(w + 0.06, h + 0.06, 0.05, o.postMat ?? mat(0x3c3c3a, { roughness: 0.6, metalness: 0.5 })));
  const holder = new Group();
  holder.position.set(x, STREET + y, z);
  holder.rotation.set(o.tilt ?? 0, ry, 0, 'YXZ');
  holder.add(g);
  const steel = o.postMat ?? mat(0x4a4a48, { roughness: 0.55, metalness: 0.6 });
  if (o.posts) {
    for (const sx of o.posts === 1 ? [0] : [-w * 0.38, w * 0.38]) {
      const len = y - h / 2 + 0.02;
      holder.add(box(0.07, len, 0.07, steel, sx, -h / 2 - len / 2, -0.05));
    }
  }
  (o.parent ?? ctx.statics).add(holder);
}

/**
 * The street around the board as one textured plane (`ppm` pixels per metre), painted in world
 * coordinates: `draw` receives a helper mapping world (x, z) to canvas pixels.
 */
export function streetPlane(
  ctx: SetContext,
  key: string,
  o: { x: number; z: number; w: number; d: number; ppm: number; y?: number; rough?: number },
  draw: (g: Paint, px: (x: number, z: number) => [number, number], s: number, r: () => number) => void,
): Mesh {
  const W = Math.round(o.w * o.ppm);
  const D = Math.round(o.d * o.ppm);
  const x0 = o.x - o.w / 2;
  const z0 = o.z - o.d / 2;
  const map = painted(
    key,
    W,
    D,
    (g, r) => draw(g, (x, z) => [(x - x0) * o.ppm, (z - z0) * o.ppm], o.ppm, r),
    false,
    11,
  );
  map.anisotropy = 8;
  const m = mat(0xffffff, { map, roughness: o.rough ?? 0.92, flat: false });
  const plane = mesh(new PlaneGeometry(o.w, o.d), m, o.x, o.y ?? STREET + 0.004, o.z);
  plane.rotation.x = -Math.PI / 2;
  plane.castShadow = false;
  ctx.statics.add(plane);
  return plane;
}

/** Painted kerb stones along a line: alternating colours (Lagos black / yellow or black / white). */
export function kerb(
  ctx: SetContext,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  a: Material,
  b: Material,
  h = 0.14,
  seg = 0.7,
): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / seg));
  const ry = Math.atan2(x1 - x0, z1 - z0);
  const r = ctx.rng;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    if (r() < 0.04) continue; // a missing kerb stone
    const k = box(0.2, h, (len / n) * 0.97, i % 2 ? a : b, 0, 0, 0);
    k.position.set(x0 + (x1 - x0) * t, STREET + h / 2 - (r() < 0.12 ? 0.03 : 0), z0 + (z1 - z0) * t);
    k.rotation.set(0, ry + (r() - 0.5) * 0.03, 0);
    ctx.statics.add(k);
  }
}

/** A concrete road parapet (F-shape profile) along x from x0 to x1 at z; `face` = which side is the road (+1 south). */
export function parapetX(
  ctx: SetContext,
  x0: number,
  x1: number,
  z: number,
  m: Material,
  o: { y?: number; h?: number; rail?: Material; face?: 1 | -1; postEvery?: number } = {},
): void {
  const y = o.y ?? STREET;
  const h = o.h ?? 0.85;
  const face = o.face ?? 1;
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  const s = ctx.statics;
  s.add(box(len, 0.22, 0.5, m, cx, y + 0.11, z));
  s.add(box(len, h - 0.22, 0.24, m, cx, y + 0.22 + (h - 0.22) / 2, z - face * 0.06));
  s.add(tiltedBox(len, 0.24, 0.1, m, cx, y + 0.32, z + face * 0.1, face * 0.5));
  if (o.rail) {
    s.add(box(len, 0.06, 0.08, o.rail, cx, y + h + 0.34, z - face * 0.06));
    s.add(box(len, 0.04, 0.05, o.rail, cx, y + h + 0.16, z - face * 0.06));
    const every = o.postEvery ?? 1.6;
    for (let x = x0 + 0.3; x < x1; x += every)
      s.add(box(0.06, 0.38, 0.06, o.rail, x, y + h + 0.17, z - face * 0.06));
  }
}

/**
 * A street lamp standard: tapered pole, outreach arm and a cobra-head luminaire over `dir`. When
 * `lit`, the head glows (dusk) through `L`; by day the lens is a dull grey.
 */
export function lampStandard(
  ctx: SetContext,
  L: SiteLights | null,
  x: number,
  z: number,
  o: {
    y?: number;
    h?: number;
    dir: number;
    reach?: number;
    lit?: boolean;
    color?: number;
    pole?: Material;
    double?: boolean;
  },
): void {
  const y = o.y ?? STREET;
  const h = o.h ?? 5.2;
  const reach = o.reach ?? 1.3;
  const pole = o.pole ?? mat(0x5a5c5a, { roughness: 0.5, metalness: 0.65 });
  const s = ctx.statics;
  s.add(box(0.36, 0.06, 0.36, pole, x, y + 0.03, z));
  s.add(cyl(0.065, 0.11, h, pole, x, y + h / 2, z, 8));
  s.add(box(0.2, 0.42, 0.14, pole, x, y + 0.5, z)); // the access door box
  const dirs = o.double ? [o.dir, o.dir + Math.PI] : [o.dir];
  for (const d of dirs) {
    const fx = Math.sin(d);
    const fz = Math.cos(d);
    const hx = x + fx * reach;
    const hz = z + fz * reach;
    s.add(bar(v3(x, y + h - 0.25, z), v3(hx, y + h + 0.08, hz), 0.035, pole, 6));
    const head = box(0.5, 0.11, 0.22, pole, hx + fx * 0.15, y + h + 0.06, hz + fz * 0.15);
    head.rotation.y = d + Math.PI / 2;
    s.add(head);
    const lens = box(
      0.4,
      0.03,
      0.16,
      o.lit ? lampMat(o.color ?? 0xffb060, 2.6) : mat(0x8c8e88, { roughness: 0.3, metalness: 0.2 }),
      hx + fx * 0.15,
      y + h,
      hz + fz * 0.15,
    );
    lens.rotation.y = d + Math.PI / 2;
    s.add(lens);
    if (o.lit && L) L.glow(hx + fx * 0.15, y + h - 0.05, hz + fz * 0.15, 1.7, o.color ?? 0xffa850, 0.75);
  }
}

/** A big striped trader's umbrella on a pole (Oshodi's sea of umbrellas). Stays under `y + 2.3`. */
export function umbrella(
  ctx: SetContext,
  x: number,
  z: number,
  r: number,
  a: Material,
  b: Material,
  o: { y?: number; h?: number; tilt?: number; panels?: number; parent?: Object3D } = {},
): void {
  const y = o.y ?? STREET;
  const h = o.h ?? 2.1;
  const g = new Group();
  const n = o.panels ?? 8;
  const rib = mat(0x3a3a38, { roughness: 0.5, metalness: 0.6 });
  g.add(cyl(0.025, 0.03, h, mat(0x8a8a86, { roughness: 0.5, metalness: 0.6 }), 0, h / 2, 0, 5));
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    // one canopy panel: a triangle from the crown to the rim, slightly drooping
    const geo = new PlaneGeometry(1, 1, 1, 1);
    const p = geo.attributes.position as BufferAttribute;
    const crown = [0, h + 0.38, 0];
    const rim0 = [Math.sin(a0) * r, h - 0.02, Math.cos(a0) * r];
    const rim1 = [Math.sin(a1) * r, h - 0.02, Math.cos(a1) * r];
    // the quad's top edge collapses onto the crown: one real triangle per panel
    p.setXYZ(0, crown[0]!, crown[1]!, crown[2]!);
    p.setXYZ(1, crown[0]!, crown[1]!, crown[2]!);
    p.setXYZ(2, rim0[0]!, rim0[1]!, rim0[2]!);
    p.setXYZ(3, rim1[0]!, rim1[1]!, rim1[2]!);
    geo.computeVertexNormals();
    const m = i % 2 ? a : b;
    g.add(mesh(geo, m));
    // the hanging valance between two ribs, and the rib itself
    const va = new PlaneGeometry(1, 1, 1, 1);
    const vp = va.attributes.position as BufferAttribute;
    vp.setXYZ(0, rim0[0]!, rim0[1]!, rim0[2]!);
    vp.setXYZ(1, rim1[0]!, rim1[1]!, rim1[2]!);
    vp.setXYZ(2, rim0[0]! * 0.99, rim0[1]! - 0.13, rim0[2]! * 0.99);
    vp.setXYZ(3, rim1[0]! * 0.99, rim1[1]! - 0.13, rim1[2]! * 0.99);
    va.computeVertexNormals();
    const valance = mesh(va, m);
    g.add(valance);
    g.add(bar(v3(0, h + 0.36, 0), v3(rim0[0]! * 1.01, rim0[1]! - 0.02, rim0[2]! * 1.01), 0.012, rib, 3));
  }
  g.position.set(x, y, z);
  g.rotation.set(o.tilt ?? 0, ctx.rng() * 3, (ctx.rng() - 0.5) * 0.12, 'YXZ');
  (o.parent ?? ctx.statics).add(g);
}

/** A sagging overhead wire between two points (catenary approximated by a parabola). */
export function wire(ctx: SetContext, a: Vector3, b: Vector3, sag: number, m: Material, r = 0.012): void {
  const pts: Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new Vector3().lerpVectors(a, b, t).add(v3(0, -sag * 4 * t * (1 - t), 0)));
  }
  const geo = new TubeGeometry(new CatmullRomCurve3(pts), 16, r, 3, false);
  const w = mesh(geo, m);
  w.castShadow = false;
  ctx.statics.add(w);
}

const FACE_CAMERA = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.8);

/**
 * A cloth flag on a pole top that ripples in the wind (vertex wave in `onBeforeRender`). The flag
 * hangs from (x, y, z) and streams along +x * `dir`; `gust` exaggerates the motion.
 */
export function flag(
  ctx: SetContext,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  map: CanvasTexture,
  dir: 1 | -1 = 1,
  gust = 1,
): void {
  const geo = new PlaneGeometry(w, h, 10, 4);
  geo.translate(w / 2, -h / 2, 0);
  const pos = geo.attributes.position as BufferAttribute;
  const rest = Float32Array.from(pos.array as Float32Array);
  const m = uniqueMat(0xffffff, { map, roughness: 0.9, flat: false });
  m.side = DoubleSide;
  ctx.own(m);
  ctx.own(geo);
  const f = new Mesh(geo, m);
  f.position.set(x, STREET + y, z);
  f.scale.x = dir;
  f.castShadow = true;
  const animate = ctx.quality.level !== 'low';
  const phase = ctx.rng() * 10;
  let last = -1;
  f.onBeforeRender = () => {
    if (!animate) return;
    const t = performance.now() / 1000 + phase;
    if (Math.abs(t - last) < 1 / 40) return;
    last = t;
    for (let i = 0; i < pos.count; i++) {
      const px = rest[i * 3]!;
      const py = rest[i * 3 + 1]!;
      const k = px / w; // 0 at the pole, 1 at the fly end
      const wave = Math.sin(px * 3.2 - t * 7.5 * gust) * 0.11 + Math.sin(px * 5.1 - t * 11 + py * 2) * 0.04;
      pos.setXYZ(i, px * (1 - 0.06 * k * k), py - k * k * 0.06, wave * k * gust * w);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  };
  ctx.root.add(f);
}

/**
 * Thin pale streaks of wind-blown dust drifting along x through boxes `areas` ([x0, x1, z0, z1, y]),
 * one instanced draw call; they wrap around inside their box. Fewer on weaker devices.
 */
export function windStreaks(
  ctx: SetContext,
  areas: [number, number, number, number, number][],
  perArea: number,
  dir: 1 | -1 = 1,
): void {
  const n = Math.max(2, Math.round(perArea * areas.length * (0.35 + 0.65 * ctx.quality.particleDensity)));
  const geo = new PlaneGeometry(1, 0.035);
  const m = new MeshBasicMaterial({
    color: 0xffe2b8,
    transparent: true,
    opacity: 0.22,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
    toneMapped: false,
  });
  ctx.own(geo);
  ctx.own(m);
  const im = new InstancedMesh(geo, m, n);
  im.instanceMatrix.setUsage(DynamicDrawUsage);
  im.castShadow = false;
  im.frustumCulled = false;
  const r = ctx.rng;
  const items = Array.from({ length: n }, (_, i) => {
    const a = areas[i % areas.length]!;
    return {
      a,
      u: r(),
      z: a[2] + r() * (a[3] - a[2]),
      y: a[4] + r() * 0.9,
      len: 0.6 + r() * 1.4,
      speed: 0.09 + r() * 0.08,
    };
  });
  const m4 = new Matrix4();
  const s = new Vector3();
  const p = new Vector3();
  let prev = performance.now();
  im.onBeforeRender = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - prev) / 1000);
    prev = now;
    items.forEach((it, i) => {
      it.u = (it.u + it.speed * dt * dir + 1) % 1;
      const [x0, x1] = it.a;
      // fade in and out over the length of the run (scale the streak to nothing at the ends)
      const fade = Math.sin(it.u * Math.PI);
      p.set(x0 + (x1 - x0) * it.u, STREET + it.y, it.z);
      s.set(it.len * fade, fade, 1);
      m4.compose(p, FACE_CAMERA, s);
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
  };
  ctx.root.add(im);
}

/** A steel drum (oil / diesel) painted `paint`, optionally on its side; cheaper than the GLB when many. */
export function drum(
  ctx: SetContext,
  paint: Material,
  x: number,
  z: number,
  o: { y?: number; lying?: number; band?: Material } = {},
): void {
  const y = o.y ?? STREET;
  const g = new Group();
  g.add(cyl(0.29, 0.29, 0.88, paint, 0, 0.44, 0, 14));
  for (const by of [0.3, 0.6]) g.add(cyl(0.3, 0.3, 0.03, o.band ?? paint, 0, by, 0, 14));
  g.add(cyl(0.28, 0.28, 0.02, mat(0x2a2a28, { roughness: 0.6, metalness: 0.5 }), 0, 0.885, 0, 14));
  const h = new Group();
  h.add(g);
  if (o.lying !== undefined) {
    g.rotation.z = Math.PI / 2;
    g.position.set(0.44, 0.29, 0);
    h.rotation.y = o.lying;
  }
  h.position.set(x, y, z);
  ctx.statics.add(h);
}
