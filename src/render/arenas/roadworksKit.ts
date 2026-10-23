/**
 * Lekki Roadworks building kit (presentation only): the site's weathered palette, small geometry
 * helpers, and `SiteLights`, which collects every lamp glow, light cone and flashing beacon of the
 * set and turns them into a handful of draw calls (one merged additive mesh for the glows, one for
 * the beams, one sprite per animated beacon, at most two real point lights).
 */
import {
  AdditiveBlending,
  BufferAttribute,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { BufferGeometry, Material, MeshStandardMaterial, Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glowTexture } from '../textures';
import { box, cyl, mat, mesh } from '../assets/helpers';
import type { SetContext } from './common';

/** The site palette: chipped plant ochre, raw concrete, rust, galvanised tube, dull hoarding paint. */
export function sitePalette() {
  return {
    plant: mat(0xa06a00, { roughness: 0.58, metalness: 0.1 }), // excavator / roller ochre-yellow
    plantWorn: mat(0x6e5010, { roughness: 0.75, metalness: 0.15 }), // scuffed, oily panels
    black: mat(0x1a1a1c, { roughness: 0.7, metalness: 0.35 }),
    rubber: mat(0x141414, { roughness: 0.95 }),
    track: mat(0x2a2826, { roughness: 0.7, metalness: 0.55 }),
    chrome: mat(0xb4b4b0, { roughness: 0.22, metalness: 0.95 }),
    glass: mat(0x1a242c, { roughness: 0.12, metalness: 0.6 }),
    concrete: mat(0x6c6862, { roughness: 1 }),
    concreteDark: mat(0x4c4844, { roughness: 1 }),
    concreteFresh: mat(0x7a766e, { roughness: 0.95 }),
    pipe: mat(0x77736b, { roughness: 0.95, flat: false }),
    block: mat(0x7e7a72, { roughness: 1 }),
    rebar: mat(0x6e3e22, { roughness: 0.7, metalness: 0.5 }),
    tube: mat(0x7a7c7a, { roughness: 0.5, metalness: 0.7 }),
    timber: mat(0x6a4e32, { roughness: 1 }),
    ply: mat(0x8a6a42, { roughness: 0.95 }),
    sand: mat(0x6a5232, { roughness: 1, flat: false }),
    laterite: mat(0x6a2e18, { roughness: 1, flat: false }),
    gravel: mat(0x4e4a46, { roughness: 1, flat: false }),
    mud: mat(0x2c241c, { roughness: 0.55 }),
    water: mat(0x101418, { roughness: 0.08, metalness: 0.2 }),
    asphalt: mat(0x1c1c1e, { roughness: 0.38, metalness: 0.1 }), // fresh, still warm
    orange: mat(0xb4521c, { roughness: 0.6 }),
    white: mat(0x8a867c, { roughness: 0.6 }),
    red: mat(0x8a2a22, { roughness: 0.7 }),
    olive: mat(0x4a5638, { roughness: 0.7, metalness: 0.35 }),
    steel: mat(0x4e4e4c, { roughness: 0.55, metalness: 0.6 }),
    rust: mat(0x6a3a24, { roughness: 0.85, metalness: 0.35 }),
    net: mat(0x2c4632, { roughness: 1 }),
    blueSheet: mat(0x2c4258, { roughness: 0.7, metalness: 0.4 }),
    tarp: mat(0x2e3c52, { roughness: 0.9 }),
    sack: mat(0x6e675c, { roughness: 1 }),
  };
}
export type SitePalette = ReturnType<typeof sitePalette>;

const emissives = new Map<number, MeshStandardMaterial>();
/** A self-lit lamp face (not weathered: it is the light). */
export function lampMat(color: number, intensity = 2.6): MeshStandardMaterial {
  let m = emissives.get(color * 10 + intensity);
  if (!m) {
    m = mat(color, { emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
    m.userData.noGrit = true;
    emissives.set(color * 10 + intensity, m);
  }
  return m;
}

/** Multiplies a geometry's UVs so a tiling texture repeats over a large face (shared material). */
export function uvScale<G extends BufferGeometry>(g: G, su: number, sv: number): G {
  const uv = g.attributes.uv as BufferAttribute | undefined;
  if (uv) {
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    uv.needsUpdate = true;
  }
  return g;
}

/** A box rotated about Y/X/Z (radians) at a position. */
export function tiltedBox(
  w: number,
  h: number,
  d: number,
  m: Material,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): Mesh {
  const b = box(w, h, d, m, x, y, z);
  b.rotation.set(rx, ry, rz, 'YXZ');
  return b;
}

/** A thin round bar (tube, rod, rebar) between two points. */
export function bar(a: Vector3, b: Vector3, r: number, m: Material, seg = 6): Mesh {
  const len = a.distanceTo(b);
  const c = cyl(r, r, len, m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, seg);
  c.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return c;
}

/** A box beam between two points (square section w x d). */
export function beam(a: Vector3, b: Vector3, w: number, d: number, m: Material): Mesh {
  const len = a.distanceTo(b);
  const bx = box(w, len, d, m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  bx.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return bx;
}

export const v3 = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);

/** A lumpy heap (sand, gravel, spoil): a flattened, noise-displaced dome. Watertight (noise by position). */
export function mound(
  m: Material,
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  seed = 0,
  stretch = 1,
): Mesh {
  const g = new SphereGeometry(1, 22, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position as BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i);
    const py = p.getY(i);
    const pz = p.getZ(i);
    const n =
      0.1 * Math.sin(px * 3.1 + seed) * Math.cos(pz * 2.7 - seed * 0.7) +
      0.035 * Math.sin(px * 7.3 + pz * 5.9 + seed * 1.3);
    const k = 1 + n * (0.4 + py);
    // a slumped profile: steeper flanks, rounded crest
    const yy = Math.pow(Math.max(0, py), 0.8);
    p.setXYZ(i, px * k * r * stretch, yy * h * (1 + n * 0.6), pz * k * r * 0.85);
  }
  g.computeVertexNormals();
  return mesh(g, m, x, y, z);
}

interface Quad {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  color: [number, number, number];
}

/** A glowing quad facing the fixed gameplay camera (it looks north, pitched 46 degrees down). */
const FACE_CAMERA = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.8);

function rgb(hex: number, k: number): [number, number, number] {
  return [(((hex >> 16) & 255) / 255) * k, (((hex >> 8) & 255) / 255) * k, ((hex & 255) / 255) * k];
}

function paint(g: BufferGeometry, f: (i: number) => [number, number, number]): BufferGeometry {
  const n = g.attributes.position!.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set(f(i), i * 3);
  g.setAttribute('color', new BufferAttribute(c, 3));
  return g;
}

/** Collects the set's light dressing and builds it in a few draw calls. */
export class SiteLights {
  private readonly quads: Quad[] = [];
  private readonly beams: BufferGeometry[] = [];
  private readonly beacons: {
    x: number;
    y: number;
    z: number;
    color: number;
    size: number;
    kind: 'beacon' | 'arc';
  }[] = [];
  private readonly points: {
    x: number;
    y: number;
    z: number;
    color: number;
    intensity: number;
    distance: number;
  }[] = [];

  /** A soft halo around a lamp head. */
  glow(x: number, y: number, z: number, size: number, color: number, strength = 1): void {
    this.quads.push({ x, y, z, w: size, h: size * 0.75, color: rgb(color, strength) });
  }

  /**
   * A faint volumetric beam (open cone, additive, fading out) from a lamp at `from` towards `to`.
   * `radius` is the spread at the far end.
   */
  beam(from: Vector3, to: Vector3, radius: number, color: number, strength = 0.07): void {
    const len = from.distanceTo(to);
    const g = new CylinderGeometry(0.12, radius, len, 14, 5, true);
    paint(g, (i) => {
      const y = g.attributes.position!.getY(i) / len + 0.5; // 1 at the lamp, 0 at the far end
      return rgb(color, strength * Math.pow(y, 1.6));
    });
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), from.clone().sub(to).normalize());
    g.applyQuaternion(q);
    g.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    this.beams.push(g);
  }

  /** A rotating amber beacon (plant) or a flickering welding arc. */
  beacon(
    x: number,
    y: number,
    z: number,
    color: number,
    size = 0.9,
    kind: 'beacon' | 'arc' = 'beacon',
  ): void {
    this.beacons.push({ x, y, z, color, size, kind });
  }

  /** A real (unshadowed) point light; the set adds at most two. */
  point(x: number, y: number, z: number, color: number, intensity: number, distance: number): void {
    if (this.points.length < 2) this.points.push({ x, y, z, color, intensity, distance });
  }

  build(ctx: SetContext): void {
    const root = ctx.root;
    const add = (o: Object3D): void => {
      o.castShadow = false;
      o.receiveShadow = false;
      root.add(o);
    };
    if (this.quads.length) {
      const geos = this.quads.map((q) => {
        const g = new PlaneGeometry(q.w, q.h);
        g.applyQuaternion(FACE_CAMERA);
        g.translate(q.x, q.y, q.z);
        return paint(g, () => q.color);
      });
      const m = new MeshBasicMaterial({
        map: glowTexture(),
        vertexColors: true,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
        toneMapped: false, // additive light: the grade would tint its near-black body
      });
      ctx.own(m);
      const merged = mergeGeometries(geos);
      if (merged) {
        const glow = new Mesh(merged, m);
        glow.renderOrder = 6;
        ctx.own(merged);
        add(glow);
      }
    }
    if (this.beams.length) {
      const m = new MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        fog: false,
        toneMapped: false, // additive light: the grade would tint its near-black body
      });
      ctx.own(m);
      const merged = mergeGeometries(this.beams);
      if (merged) {
        const beams = new Mesh(merged, m);
        beams.renderOrder = 5;
        ctx.own(merged);
        add(beams);
      }
    }
    this.beacons.forEach((b, n) => {
      const m = new SpriteMaterial({
        map: glowTexture(),
        color: b.color,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
        toneMapped: false, // additive light: the grade would tint its near-black body
      });
      ctx.own(m);
      const s = new Sprite(m);
      s.position.set(b.x, b.y, b.z);
      s.scale.set(b.size, b.size, 1);
      const phase = n * 1.7;
      s.onBeforeRender = () => {
        const t = performance.now() / 1000 + phase;
        if (b.kind === 'beacon') {
          // a rotating reflector: a sharp flash once a revolution, a dim glow between
          const a = (t * 1.6) % 1;
          m.opacity = 0.25 + 0.75 * Math.pow(Math.max(0, Math.cos(a * Math.PI * 2)), 6);
        } else {
          // welding: bursts of hard flicker with pauses while the welder moves along the seam
          const burst = Math.sin(t * 0.9) + Math.sin(t * 0.37 + 1) > 0.2;
          m.opacity = burst ? 0.45 + 0.55 * Math.abs(Math.sin(t * 47) * Math.sin(t * 31)) : 0.04;
        }
      };
      add(s);
    });
    for (const p of this.points) {
      const l = new PointLight(p.color, p.intensity, p.distance, 1.6);
      l.position.set(p.x, p.y, p.z);
      l.castShadow = false;
      root.add(l);
      ctx.own(l);
    }
  }
}

/** A detached group placed and turned in the world, added to the baked statics. */
export function placed(
  ctx: SetContext,
  x: number,
  y: number,
  z: number,
  ry: number,
  ...parts: Object3D[]
): Group {
  const g = new Group();
  g.add(...parts);
  g.position.set(x, y, z);
  g.rotation.y = ry;
  ctx.statics.add(g);
  return g;
}
