/**
 * Street building kit for the Ajegunle, Lagoon Jetty and Yaba sets (presentation only).
 *
 * Everything procedural is vertex-coloured and shares a handful of materials, so the hundreds of
 * walls, shutters, planks, poles and goods bake into a few merged meshes (one per material) with
 * the set's other statics:
 *
 * - `plaster`: rendered block walls with rain streaks, splash dirt, patches and blown render
 *   (greyscale map tinted by the vertex colour, UVs in world metres so the streaks keep their size);
 * - `matte` / `wood` / `metal` / `plastic`: untextured finishes (the grit pass adds the grime);
 * - `sheet`: corrugated iron with real ridges; `cloth`: washing and awnings (pattern atlas);
 * - `sign` / `lit`: painted signboards and back-lit lightboxes from one per-set sign atlas;
 * - `glow`: unlit colour (neon tubes, lit windows, embers): the grade never dulls a light source.
 *
 * Canvas textures need a DOM; without one (unit tests) the materials are simply untextured.
 */
import {
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import { artRng, corrugatedTexture } from '../textures';
import type { Placement, SetContext } from './common';

export type Finish =
  'plaster' | 'matte' | 'wood' | 'metal' | 'plastic' | 'sheet' | 'cloth' | 'sign' | 'lit' | 'glow';

/** Cloth atlas bands (washing, wrappers, awnings). */
export const PRINT = 0;
export const STRIPE = 1;
export const CHECK = 2;
export const PLAIN = 3;

export interface SignSpec {
  text: string;
  /** board colour */
  bg: string;
  ink: string;
  /** a second, smaller line under the name */
  sub?: string;
  /** back-lit lightbox / neon lettering (glowing ink on a dark or bright board) */
  neon?: boolean;
  font?: 'serif' | 'sans' | 'brush';
}

export interface Xform {
  rx?: number;
  ry?: number;
  rz?: number;
}

const canDraw = (): boolean => typeof document !== 'undefined';

function canvasTex(
  w: number,
  h: number,
  seed: number,
  draw: (g: CanvasRenderingContext2D, r: () => number) => void,
): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g, artRng(seed));
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * Rendered blockwork, one storey (2.8 m) high and 2.5 m wide per repeat: uneven render, rain
 * streaks running down from the eaves and sills, splash dirt along the foot, hairline cracks,
 * patched and blown render showing the sandcrete blocks underneath.
 */
function plasterTex(): CanvasTexture {
  return canvasTex(256, 256, 7101, (g, r) => {
    g.fillStyle = '#e6e6e6';
    g.fillRect(0, 0, 256, 256);
    // uneven trowelled render
    for (let i = 0; i < 900; i++) {
      const v = 218 + (r() - 0.5) * 44;
      g.fillStyle = `rgba(${v},${v},${v},0.25)`;
      g.fillRect(r() * 256, r() * 256, 4 + r() * 18, 3 + r() * 10);
    }
    // rain streaks from the top (eaves) and from a sill line at mid height
    for (let i = 0; i < 70; i++) {
      const x = r() * 256;
      const y0 = r() < 0.6 ? 0 : 118 + r() * 6;
      const len = 30 + r() * 120;
      const grad = g.createLinearGradient(0, y0, 0, y0 + len);
      const a = 0.12 + r() * 0.22;
      grad.addColorStop(0, `rgba(40,40,40,${a})`);
      grad.addColorStop(1, 'rgba(40,40,40,0)');
      g.fillStyle = grad;
      g.fillRect(x, y0, 2 + r() * 7, len);
    }
    // splash dirt and damp creeping up from the ground
    const foot = g.createLinearGradient(0, 256, 0, 196);
    foot.addColorStop(0, 'rgba(46,40,34,0.6)');
    foot.addColorStop(1, 'rgba(46,40,34,0)');
    g.fillStyle = foot;
    g.fillRect(0, 196, 256, 60);
    for (let i = 0; i < 140; i++) {
      g.fillStyle = `rgba(40,34,28,${0.1 + r() * 0.2})`;
      g.fillRect(r() * 256, 220 + r() * 36, 2 + r() * 5, 2 + r() * 5);
    }
    // blown render: the blocks show through
    for (let i = 0; i < 2; i++) {
      const x = r() * 220;
      const y = 60 + r() * 140;
      const w = 18 + r() * 30;
      const h = 12 + r() * 18;
      g.fillStyle = 'rgba(176,176,176,0.85)';
      g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(110,110,110,0.55)';
      g.lineWidth = 1;
      for (let by = y; by < y + h; by += 9) {
        g.beginPath();
        g.moveTo(x, by);
        g.lineTo(x + w, by);
        g.stroke();
        const off = ((by - y) / 9) % 2 ? 0 : 9;
        for (let bx = x + off; bx < x + w; bx += 18) {
          g.beginPath();
          g.moveTo(bx, by);
          g.lineTo(bx, Math.min(by + 9, y + h));
          g.stroke();
        }
      }
      g.strokeStyle = 'rgba(120,120,120,0.6)';
      g.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }
    // patched render (a different, smoother grey) and hairline cracks
    for (let i = 0; i < 4; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? 236 : 176},${r() < 0.5 ? 236 : 176},${r() < 0.5 ? 236 : 176},0.35)`;
      g.fillRect(r() * 230, r() * 230, 20 + r() * 40, 20 + r() * 40);
    }
    g.strokeStyle = 'rgba(50,50,50,0.5)';
    g.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      let x = r() * 256;
      let y = r() * 256;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (r() - 0.5) * 16;
        y += 4 + r() * 10;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

/** Greyscale cloth patterns tinted by vertex colour: ankara print, stripes, gingham check, plain. */
function clothTex(): CanvasTexture {
  return canvasTex(256, 256, 7103, (g, r) => {
    const B = 64;
    g.fillStyle = '#d0d0d0';
    g.fillRect(0, 0, 256, 256);
    // ankara-like wax print: bold circles, leaves and dots
    for (let i = 0; i < 46; i++) {
      const x = r() * 256;
      const y = r() * B;
      g.fillStyle = r() < 0.5 ? 'rgba(40,40,40,0.55)' : 'rgba(250,250,250,0.6)';
      g.beginPath();
      g.arc(x, y, 4 + r() * 9, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(30,30,30,0.5)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, 6 + r() * 10, 0, Math.PI * 1.4);
      g.stroke();
    }
    // stripes
    for (let x = 0; x < 256;) {
      const w = 4 + Math.floor(r() * 14);
      const v = 60 + r() * 170;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, B, w, B);
      x += w;
    }
    // gingham
    for (let k = 0; k < 256; k += 16) {
      g.fillStyle = 'rgba(40,40,40,0.35)';
      g.fillRect(k, B * 2, 8, B);
      g.fillRect(0, B * 2 + (k % 64), 256, 8);
    }
    // plain, unevenly faded
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.1})`;
      g.fillRect(r() * 256, B * 3 + r() * B, 10 + r() * 50, 2 + r() * 10);
    }
    // wear on every band
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(200,200,200,${r() * 0.12})`;
      g.fillRect(r() * 256, r() * 256, 3 + r() * 12, 2 + r() * 5);
    }
  });
}

const FONTS = {
  serif: "bold 40px Georgia, 'Times New Roman', serif",
  sans: 'bold 40px Impact, "Arial Narrow", system-ui, sans-serif',
  brush: "italic bold 40px 'Trebuchet MS', Georgia, serif",
};

/**
 * One sign per 64 px row. Painted boards get plank lines, peeling paint and rust bleed; lit ones
 * get glowing lettering (blurred halo) on a dark acrylic face with a scuffed, dusty edge.
 */
function signTex(specs: SignSpec[], seed: number): CanvasTexture {
  const R = 64;
  return canvasTex(512, Math.max(64, specs.length * R), seed, (g, r) => {
    specs.forEach((s, i) => {
      const y = i * R;
      g.fillStyle = s.bg;
      g.fillRect(0, y, 512, R);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const base = FONTS[s.font ?? (s.neon ? 'sans' : 'serif')];
      const size = s.text.length > 20 ? 30 : s.text.length > 14 ? 36 : 42;
      g.font = base.replace('40px', `${s.sub ? size - 6 : size}px`);
      const ty = y + (s.sub ? R * 0.38 : R / 2 + 2);
      if (s.neon) {
        g.shadowColor = s.ink;
        g.shadowBlur = 14;
        g.fillStyle = s.ink;
        g.fillText(s.text, 256, ty);
        g.shadowBlur = 4;
        g.fillStyle = '#ffffff';
        g.globalAlpha = 0.55;
        g.fillText(s.text, 256, ty);
        g.globalAlpha = 1;
        g.shadowBlur = 0;
      } else {
        g.fillStyle = 'rgba(0,0,0,0.16)';
        g.fillRect(0, y + 21, 512, 2);
        g.fillRect(0, y + 42, 512, 2);
        g.fillStyle = s.ink;
        g.fillText(s.text, 256, ty);
      }
      if (s.sub) {
        g.font = base.replace('40px', '17px');
        g.fillStyle = s.neon ? '#f4f0e8' : s.ink;
        g.fillText(s.sub, 256, y + R * 0.78);
      }
      // wear: peeling paint / dust, rust bleed from the fixings, a grimy lower edge
      for (let k = 0; k < (s.neon ? 18 : 70); k++) {
        g.fillStyle = r() < 0.5 ? 'rgba(60,44,30,0.35)' : 'rgba(210,200,180,0.22)';
        g.fillRect(r() * 512, y + r() * R, 2 + r() * 12, 1 + r() * 4);
      }
      if (!s.neon) {
        for (const nx of [12, 500]) {
          const grad = g.createLinearGradient(0, y, 0, y + R);
          grad.addColorStop(0, 'rgba(110,50,20,0.6)');
          grad.addColorStop(1, 'rgba(110,50,20,0)');
          g.fillStyle = grad;
          g.fillRect(nx - 3, y + 4, 6, R - 8);
        }
      }
      g.fillStyle = 'rgba(16,12,10,0.3)';
      g.fillRect(0, y + R - 5, 512, 5);
      g.fillRect(0, y, 512, 2);
    });
  });
}

function paint(g: BufferGeometry, hex: number): BufferGeometry {
  const c = new Color(hex);
  const n = g.attributes.position!.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new BufferAttribute(a, 3));
  return g;
}

/** World-metre UVs on a BoxGeometry's faces (+x, -x, +y, -y, +z, -z) for a w x h x d box. */
function metreUVs(g: BoxGeometry, w: number, h: number, d: number, su: number, sv: number): void {
  const uv = g.attributes.uv!;
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let i = 0; i < uv.count; i++) {
    const [fu, fv] = dims[Math.min(5, Math.floor(i / 4))]!;
    uv.setXY(i, (uv.getX(i) * fu) / su, (uv.getY(i) * fv) / sv);
  }
}

/** Remaps a geometry's V into one row of an atlas (row 0 = top). */
function atlasRow(g: BufferGeometry, row: number, rows: number, uRepeat = 1): void {
  const uv = g.attributes.uv!;
  for (let i = 0; i < uv.count; i++) {
    uv.setX(i, uv.getX(i) * uRepeat);
    uv.setY(i, 1 - (row + 1) / rows + (0.03 + uv.getY(i) * 0.94) / rows);
  }
}

/** A local frame (origin + facing) for building a structure in its own coordinates. */
export function frame(parent: Object3D, x: number, y: number, z: number, ry = 0): Group {
  const g = new Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  parent.add(g);
  return g;
}

export const v3 = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);

export class StreetKit {
  private readonly mats: Record<Finish, Material>;
  private readonly bag = new Map<string, Placement[]>();
  readonly signCount: number;

  constructor(
    private readonly ctx: SetContext,
    signs: SignSpec[] = [],
    signSeed = 7105,
  ) {
    this.signCount = Math.max(1, signs.length);
    const own = <M extends Material>(m: M): M => {
      ctx.own(m);
      return m;
    };
    const tex = (make: () => CanvasTexture): CanvasTexture | null => {
      if (!canDraw()) return null;
      const t = make();
      ctx.own(t);
      return t;
    };
    const vc = (o: ConstructorParameters<typeof MeshStandardMaterial>[0]): MeshStandardMaterial =>
      own(new MeshStandardMaterial({ vertexColors: true, ...o }));
    const signMap = signs.length ? tex(() => signTex(signs, signSeed)) : null;
    if (signMap) signMap.wrapS = signMap.wrapT = RepeatWrapping;
    this.mats = {
      plaster: vc({ roughness: 0.95, map: tex(plasterTex), flatShading: false }),
      matte: vc({ roughness: 0.92, flatShading: true }),
      wood: vc({ roughness: 0.88, flatShading: true }),
      metal: vc({ roughness: 0.45, metalness: 0.45, flatShading: false }),
      plastic: vc({ roughness: 0.55, metalness: 0, flatShading: false }),
      sheet: vc({
        roughness: 0.7,
        metalness: 0.25,
        map: canDraw() ? corrugatedTexture() : null,
        side: DoubleSide,
        flatShading: false,
      }),
      cloth: vc({ roughness: 0.95, map: tex(clothTex), side: DoubleSide, flatShading: false }),
      sign: vc({ roughness: 0.85, map: signMap, flatShading: true }),
      lit: own(new MeshBasicMaterial({ vertexColors: true, map: signMap })),
      glow: own(new MeshBasicMaterial({ vertexColors: true })),
    };
  }

  get rng(): () => number {
    return this.ctx.rng;
  }

  get statics(): Object3D {
    return this.ctx.statics;
  }

  /** Collects a modelled GLB placement (instanced once per asset in `finish`). */
  put(id: string, p: Placement): void {
    const list = this.bag.get(id) ?? [];
    list.push(p);
    this.bag.set(id, list);
  }

  /** Instances the collected GLB placements. */
  finish(): void {
    for (const [id, list] of this.bag) this.ctx.instance(id, list);
    this.bag.clear();
  }

  material(f: Finish): Material {
    return this.mats[f];
  }

  /** Adds a painted geometry to `parent` (default: the baked statics). */
  add(
    geo: BufferGeometry,
    color: number,
    finish: Finish,
    x: number,
    y: number,
    z: number,
    t: Xform = {},
    parent: Object3D = this.ctx.statics,
  ): Mesh {
    const m = new Mesh(paint(geo, color), this.mats[finish]);
    m.position.set(x, y, z);
    m.rotation.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0, 'YXZ');
    const lightSource = finish === 'glow' || finish === 'lit';
    m.castShadow = !lightSource;
    m.receiveShadow = !lightSource;
    parent.add(m);
    return m;
  }

  box(
    parent: Object3D,
    w: number,
    h: number,
    d: number,
    color: number,
    x: number,
    y: number,
    z: number,
    finish: Finish = 'matte',
    t: Xform = {},
  ): Mesh {
    return this.add(new BoxGeometry(w, h, d), color, finish, x, y, z, t, parent);
  }

  /** A rendered wall / building mass with storey-sized weathering (UVs in metres). */
  wall(
    parent: Object3D,
    w: number,
    h: number,
    d: number,
    color: number,
    x: number,
    y: number,
    z: number,
    t: Xform = {},
  ): Mesh {
    const g = new BoxGeometry(w, h, d);
    metreUVs(g, w, h, d, 2.5, 2.8);
    // offset per wall so the streaks never line up from house to house
    const uv = g.attributes.uv!;
    const ou = this.ctx.rng();
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) + ou);
    return this.add(g, color, 'plaster', x, y, z, t, parent);
  }

  cyl(
    parent: Object3D,
    rt: number,
    rb: number,
    h: number,
    color: number,
    x: number,
    y: number,
    z: number,
    finish: Finish = 'matte',
    seg = 10,
    t: Xform = {},
  ): Mesh {
    return this.add(new CylinderGeometry(rt, rb, h, seg), color, finish, x, y, z, t, parent);
  }

  /** A round bar between two points (poles, pipes, rails, cables, neon tubes). */
  bar(
    parent: Object3D,
    a: Vector3,
    b: Vector3,
    r: number,
    color: number,
    finish: Finish = 'metal',
    seg = 6,
  ): Mesh {
    const len = a.distanceTo(b);
    const m = this.add(
      new CylinderGeometry(r, r, Math.max(0.001, len), seg),
      color,
      finish,
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      (a.z + b.z) / 2,
      {},
      parent,
    );
    m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  }

  /** A sagging cable / washing line between two points (a catenary of short bars). */
  sag(parent: Object3D, a: Vector3, b: Vector3, dip: number, r: number, color: number, segs = 6): Vector3[] {
    const pts: Vector3[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const p = a.clone().lerp(b, t);
      p.y -= dip * 4 * t * (1 - t);
      pts.push(p);
    }
    for (let i = 0; i < segs; i++) this.bar(parent, pts[i]!, pts[i + 1]!, r, color, 'matte', 4);
    return pts;
  }

  /**
   * A corrugated iron sheet (w across the ridges, d down the slope) with real ridges so it
   * catches the light; `tilt` lowers the +z edge.
   */
  sheet(
    parent: Object3D,
    w: number,
    d: number,
    color: number,
    x: number,
    y: number,
    z: number,
    tilt = 0,
    ry = 0,
    rz = 0,
  ): Mesh {
    const pitch = 0.13;
    const ridges = Math.max(2, Math.round(w / pitch));
    const g = new PlaneGeometry(w, d, ridges * 3, 1);
    const pos = g.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      pos.setZ(i, Math.sin(((px + w / 2) / pitch) * Math.PI * 2) * 0.018);
    }
    g.computeVertexNormals();
    const uv = g.attributes.uv!;
    const ou = this.ctx.rng();
    for (let i = 0; i < uv.count; i++) uv.setXY(i, ou + uv.getX(i) * (ridges / 10), uv.getY(i) * (d / 1.2));
    g.rotateX(-Math.PI / 2);
    return this.add(g, color, 'sheet', x, y, z, { rx: tilt, ry, rz }, parent);
  }

  /** A hanging piece of cloth (a wrapper, a shirt, a towel) facing +z, top edge at y. */
  cloth(
    parent: Object3D,
    w: number,
    h: number,
    color: number,
    band: number,
    x: number,
    y: number,
    z: number,
    t: Xform = {},
  ): Mesh {
    const g = new PlaneGeometry(w, h, 3, 3);
    const pos = g.attributes.position!;
    const r = this.ctx.rng;
    for (let i = 0; i < pos.count; i++) {
      // a little billow and a damp sag at the hem
      pos.setZ(i, Math.sin(pos.getX(i) * 6 + r()) * 0.025 + (r() - 0.5) * 0.015);
    }
    g.computeVertexNormals();
    g.translate(0, -h / 2, 0);
    atlasRow(g, band, 4, Math.max(0.6, w * 1.4));
    return this.add(g, color, 'cloth', x, y, z, t, parent);
  }

  /** A signboard from the set's sign atlas, facing +z of its parent (`lit`: a back-lit lightbox). */
  sign(
    parent: Object3D,
    index: number,
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    lit = false,
    t: Xform = {},
  ): Mesh {
    const g = new BoxGeometry(w, h, 0.04);
    atlasRow(g, index % this.signCount, this.signCount);
    return this.add(g, lit ? 0xffffff : 0xe8e4dc, lit ? 'lit' : 'sign', x, y, z, t, parent);
  }

  /** A neon tube along a polyline (unlit colour; pair it with a SiteLights glow for the halo). */
  neon(parent: Object3D, pts: Vector3[], color: number, r = 0.018): void {
    for (let i = 0; i + 1 < pts.length; i++) this.bar(parent, pts[i]!, pts[i + 1]!, r, color, 'glow', 5);
  }
}
