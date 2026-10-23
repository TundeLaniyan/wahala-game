/**
 * Building kit for the Balogun Market set (presentation only). Everything procedural the market
 * builds is vertex-coloured and shares a handful of materials (matte wood/concrete, painted metal,
 * dyed cloth, rusted corrugated sheet, patched tarpaulin, painted signboards), so the hundreds of
 * stall parts bake into ~6 merged meshes instead of one draw call per colour. Modelled GLB props
 * are collected in a `Bag` and instanced once per asset at the end of the build.
 */
import {
  BoxGeometry,
  Group,
  Matrix4,
  BufferAttribute,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import type { BufferGeometry, Material ,
  Object3D} from 'three';
import { artRng, corrugatedTexture } from '../textures';
import { bakeModel } from '../assets/merge';
import type { Placement, SetContext } from './common';

export type Finish = 'matte' | 'metal' | 'cloth' | 'sheet' | 'tarp' | 'sign' | 'glow';

/** Cloth atlas bands (rows of the cloth texture). */
export const ADIRE = 0;
export const STRIPE = 1;
export const PRINT = 2;
export const PLAIN = 3;

/** Signboards painted on the sign atlas, one per row. */
export const SIGNS = [
  'BUKOLA TEXTILES',
  'ADIRE • ANKARA • LACE',
  "GOD'S TIME ENAMEL",
  'GARBA & SONS GRAINS',
  'NO CREDIT TODAY',
  'IYA BASIRAT BUKA',
  'MAMA NKECHI PROVISIONS',
  'OLUWASEUN FABRICS',
] as const;

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, r: () => number) => void, seed: number) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  draw(g, artRng(seed));
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Greyscale dyed-cloth patterns (tinted by vertex colour): adire resist, aso-oke stripes, print, plain. */
function clothAtlas(): CanvasTexture {
  return canvasTex(
    256,
    (g, r) => {
      const B = 64;
      // weave grain under everything
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 256; x += 2) {
          const v = 200 + (r() - 0.5) * 34 + ((x + y) % 4 === 0 ? -10 : 0);
          g.fillStyle = `rgb(${v},${v},${v})`;
          g.fillRect(x, y, 2, 1);
        }
      // adire: dark dyed field with pale resist circles and lines (starch-resist / tie-dye)
      g.fillStyle = 'rgba(40,40,40,0.48)';
      g.fillRect(0, 0, 256, B);
      g.strokeStyle = 'rgba(235,235,235,0.55)';
      g.lineWidth = 2;
      for (let x = 8; x < 256; x += 22)
        for (let y = 8; y < B; y += 22) {
          g.beginPath();
          g.arc(x + (r() - 0.5) * 3, y + (r() - 0.5) * 3, 4 + r() * 4, 0, Math.PI * 2);
          g.stroke();
          if (r() < 0.5) g.strokeRect(x - 9, y - 9, 18, 18);
        }
      // aso-oke: woven stripes of varied width and value
      for (let x = 0; x < 256;) {
        const w = 3 + Math.floor(r() * 12);
        const v = 70 + r() * 160;
        g.fillStyle = `rgba(${v},${v},${v},0.75)`;
        g.fillRect(x, B, w, B);
        x += w;
      }
      // faded print: rows of blotchy circles and leaves
      g.fillStyle = 'rgba(60,60,60,0.25)';
      g.fillRect(0, B * 2, 256, B);
      for (let i = 0; i < 70; i++) {
        const v = r() < 0.5 ? 'rgba(240,240,240,0.5)' : 'rgba(30,30,30,0.45)';
        g.fillStyle = v;
        g.beginPath();
        g.ellipse(r() * 256, B * 2 + r() * B, 3 + r() * 8, 2 + r() * 6, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
      // plain dyed cloth: just weave and uneven dye
      for (let i = 0; i < 30; i++) {
        g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.08})`;
        g.fillRect(r() * 256, B * 3 + r() * B, 10 + r() * 50, 2 + r() * 10);
      }
      // dust and fading on every band
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(190,170,140,${r() * 0.12})`;
        g.fillRect(r() * 256, r() * 256, 4 + r() * 14, 2 + r() * 6);
      }
    },
    5501,
  );
}

/** Tarpaulin: woven plastic, sewn patches, a seam, grime and stains (tinted by vertex colour). */
function tarpTex(): CanvasTexture {
  return canvasTex(
    256,
    (g, r) => {
      g.fillStyle = 'rgb(205,205,205)';
      g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 2) {
        g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.04})`;
        g.fillRect(0, y, 256, 1);
      }
      for (let i = 0; i < 7; i++) {
        // sewn-on patches of a different shade
        const x = r() * 220;
        const y = r() * 220;
        const w = 24 + r() * 60;
        const h = 18 + r() * 50;
        const v = r() < 0.5 ? 150 : 235;
        g.fillStyle = `rgba(${v},${v},${v * 0.95},0.7)`;
        g.fillRect(x, y, w, h);
        g.strokeStyle = 'rgba(40,36,30,0.55)';
        g.setLineDash([3, 3]);
        g.strokeRect(x + 2, y + 2, w - 4, h - 4);
        g.setLineDash([]);
      }
      g.fillStyle = 'rgba(30,28,24,0.35)';
      g.fillRect(126, 0, 4, 256);
      for (let i = 0; i < 50; i++) {
        const x = r() * 256;
        const y = r() * 256;
        const rad = 4 + r() * 18;
        const grad = g.createRadialGradient(x, y, 1, x, y, rad);
        grad.addColorStop(0, `rgba(${60 + r() * 40},${44 + r() * 20},24,${0.12 + r() * 0.22})`);
        grad.addColorStop(1, 'rgba(60,44,24,0)');
        g.fillStyle = grad;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      // a couple of tears showing dark underneath
      for (let i = 0; i < 4; i++) {
        g.strokeStyle = 'rgba(20,18,16,0.8)';
        g.lineWidth = 2;
        g.beginPath();
        const x = r() * 256;
        const y = r() * 256;
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30);
        g.stroke();
      }
    },
    5502,
  );
}

/** Hand-painted market signboards on faded boards, one per row (sign `i` uses row i). */
function signAtlas(): CanvasTexture {
  const bgs = ['#b9ae92', '#5e6f78', '#8a4a36', '#6f7356', '#a89a74', '#4e5a4a', '#c2b6a0', '#6a4a3a'];
  const inks = ['#2a2418', '#e0d8c4', '#e6dcc6', '#e4dcc4', '#5a1e16', '#ddd2b8', '#243a5a', '#e6dcc8'];
  return canvasTex(
    512,
    (g, r) => {
      const R = 64;
      SIGNS.forEach((text, i) => {
        const y = i * R;
        g.fillStyle = bgs[i]!;
        g.fillRect(0, y, 512, R);
        // plank lines
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.fillRect(0, y + 21, 512, 2);
        g.fillRect(0, y + 42, 512, 2);
        g.font = `bold ${text.length > 18 ? 34 : 40}px Georgia, 'Times New Roman', serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = inks[i]!;
        g.fillText(text, 256, y + R / 2 + 2);
        // peeling paint, rust bleed from the nails, grime
        for (let k = 0; k < 60; k++) {
          g.fillStyle = r() < 0.5 ? 'rgba(70,50,30,0.35)' : 'rgba(200,190,170,0.25)';
          g.fillRect(r() * 512, y + r() * R, 2 + r() * 12, 1 + r() * 5);
        }
        for (const nx of [10, 502]) {
          const grad = g.createLinearGradient(0, y, 0, y + R);
          grad.addColorStop(0, 'rgba(110,50,20,0.6)');
          grad.addColorStop(1, 'rgba(110,50,20,0)');
          g.fillStyle = grad;
          g.fillRect(nx - 3, y + 4, 6, R - 8);
        }
        g.fillStyle = 'rgba(20,16,12,0.25)';
        g.fillRect(0, y + R - 6, 512, 6);
      });
    },
    5503,
  );
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

/** Remaps a geometry's V coordinate into one row of an atlas with `rows` rows (row 0 = top). */
function atlasRow(g: BufferGeometry, row: number, rows: number, uRepeat = 1): void {
  const uv = g.attributes.uv!;
  for (let i = 0; i < uv.count; i++) {
    uv.setX(i, uv.getX(i) * uRepeat);
    uv.setY(i, 1 - (row + 1) / rows + (0.04 + uv.getY(i) * 0.92) / rows);
  }
}

export interface Xform {
  rx?: number;
  ry?: number;
  rz?: number;
}

/** Instanced-asset placements gathered during the build, flushed as one InstancedMesh set per id. */
export class Bag {
  private readonly items = new Map<string, Placement[]>();
  put(id: string, p: Placement): void {
    const list = this.items.get(id) ?? [];
    list.push(p);
    this.items.set(id, list);
  }
  flush(ctx: SetContext): void {
    for (const [id, list] of this.items) ctx.instance(id, list);
    this.items.clear();
  }
}

/** A local frame (stall origin + facing) that maps local offsets to world placements. */
export interface Frame {
  x: number;
  y: number;
  z: number;
  ry: number;
}

export function toWorld(f: Frame, lx: number, lz: number, lry = 0): { x: number; z: number; ry: number } {
  const c = Math.cos(f.ry);
  const s = Math.sin(f.ry);
  return { x: f.x + c * lx + s * lz, z: f.z - s * lx + c * lz, ry: f.ry + lry };
}

export class Kit {
  private readonly mats: Record<Finish, Material>;
  readonly bag = new Bag();

  constructor(private readonly ctx: SetContext) {
    const vc = (o: ConstructorParameters<typeof MeshStandardMaterial>[0]): MeshStandardMaterial => {
      const m = new MeshStandardMaterial({ vertexColors: true, ...o });
      ctx.own(m);
      return m;
    };
    // canvas textures need a DOM (absent in headless tests): fall back to untextured
    const canDraw = typeof document !== 'undefined';
    const own = (make: () => CanvasTexture): CanvasTexture | null => {
      if (!canDraw) return null;
      const t = make();
      ctx.own(t);
      return t;
    };
    this.mats = {
      matte: vc({ roughness: 0.93, metalness: 0, flatShading: true }),
      metal: vc({ roughness: 0.42, metalness: 0.3, flatShading: false }),
      cloth: vc({ roughness: 0.96, map: own(clothAtlas), side: DoubleSide }),
      sheet: vc({
        roughness: 0.72,
        metalness: 0.22,
        map: canDraw ? corrugatedTexture() : null,
        side: DoubleSide,
      }),
      tarp: vc({ roughness: 0.88, map: own(tarpTex), side: DoubleSide }),
      sign: vc({ roughness: 0.9, map: own(signAtlas) }),
      // glowing embers: unlit, so neither the grade nor the weathering dulls them
      glow: (() => {
        const m = new MeshBasicMaterial({ vertexColors: true });
        ctx.own(m);
        return m;
      })(),
    };
  }

  get rng(): () => number {
    return this.ctx.rng;
  }

  /** The baked static group of the set. */
  get statics(): Object3D {
    return this.ctx.statics;
  }

  /**
   * Finishes the build: instances the bagged GLB props, and moves the roof sheets and tarps out of
   * the shadow-casting statics into their own merged meshes that receive but do not cast shadows,
   * so the stalls under them stay readable from the high camera.
   */
  finish(): void {
    this.bag.flush(this.ctx);
    const statics = this.ctx.statics;
    statics.updateMatrixWorld(true);
    const roofs = new Group();
    const moved: Mesh[] = [];
    statics.traverse((o) => {
      if (o instanceof Mesh && (o.material === this.mats.sheet || o.material === this.mats.tarp))
        moved.push(o);
    });
    const m4 = new Matrix4();
    for (const mesh of moved) {
      m4.copy(mesh.matrixWorld);
      mesh.removeFromParent();
      m4.decompose(mesh.position, mesh.quaternion, mesh.scale);
      roofs.add(mesh);
    }
    const baked = bakeModel(roofs);
    baked.traverse((o) => {
      o.castShadow = false;
    });
    this.ctx.root.add(baked);
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
    m.castShadow = true;
    m.receiveShadow = true;
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

  /** A length or bolt of dyed cloth using one pattern band of the cloth atlas. */
  cloth(
    parent: Object3D,
    w: number,
    h: number,
    d: number,
    color: number,
    band: number,
    x: number,
    y: number,
    z: number,
    t: Xform = {},
  ): Mesh {
    const g = new BoxGeometry(w, h, d);
    atlasRow(g, band, 4, Math.max(0.5, w * 1.6));
    return this.add(g, color, 'cloth', x, y, z, t, parent);
  }

  /** A rolled bolt of cloth lying on its side. */
  bolt(
    parent: Object3D,
    len: number,
    rad: number,
    color: number,
    band: number,
    x: number,
    y: number,
    z: number,
    ry = 0,
  ): Mesh {
    const g = new CylinderGeometry(rad, rad, len, 9);
    atlasRow(g, band, 4, 1.5);
    return this.add(g, color, 'cloth', x, y, z, { rz: Math.PI / 2, ry }, parent);
  }

  /**
   * A corrugated iron sheet (w across the ridges, d along them, i.e. down the slope) with real
   * ridges so it catches the light; `tilt` lowers the +z edge.
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
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (ridges / 10), uv.getY(i) * (d / 1.2));
    g.rotateX(-Math.PI / 2);
    return this.add(g, color, 'sheet', x, y, z, { rx: tilt, ry }, parent);
  }

  /** A sagging, patched tarpaulin stretched over w x d; `tilt` lowers the +z edge. */
  tarp(
    parent: Object3D,
    w: number,
    d: number,
    color: number,
    x: number,
    y: number,
    z: number,
    tilt = 0,
    ry = 0,
    sag = 0.12,
  ): Mesh {
    const g = new PlaneGeometry(w, d, 8, 6);
    const pos = g.attributes.position!;
    const r = this.ctx.rng;
    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getX(i) / w) * 2;
      const v = (pos.getY(i) / d) * 2;
      const edge = Math.abs(u) > 0.99 || Math.abs(v) > 0.99;
      pos.setZ(i, -sag * (1 - u * u) * (1 - v * v * 0.6) + (edge ? 0 : (r() - 0.5) * 0.04));
    }
    g.computeVertexNormals();
    // about one texture repeat per 1.6 m, offset per tarp so the patches never line up
    const uv = g.attributes.uv!;
    const ou = r();
    const ov = r();
    for (let i = 0; i < uv.count; i++) uv.setXY(i, ou + (uv.getX(i) * w) / 1.6, ov + (uv.getY(i) * d) / 1.6);
    g.rotateX(-Math.PI / 2);
    return this.add(g, color, 'tarp', x, y, z, { rx: tilt, ry }, parent);
  }

  /** A painted signboard from the sign atlas, facing +z of its parent. */
  sign(parent: Object3D, index: number, w: number, x: number, y: number, z: number, t: Xform = {}): Mesh {
    const g = new BoxGeometry(w, w * 0.16, 0.03);
    atlasRow(g, index % SIGNS.length, 8);
    return this.add(g, 0xffffff, 'sign', x, y, z, t, parent);
  }
}
