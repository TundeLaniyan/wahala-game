/**
 * The cover kit of the researched Rumble communities (presentation only): materials, the sign atlas and the tiny
 * drawing helpers every family builds from. One `CK` per board; `CoverBuilder` bakes everything into a few merged
 * meshes (vertex colours on shared materials, one sign atlas), so a whole community costs about a dozen draw calls
 * per visible chunk.
 */
import {
  BoxGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import type { BufferGeometry, Material } from 'three';
import type { CoverRect } from '../../../sim';
import { artRng, concreteTexture, corrugatedTexture } from '../../textures';
import { CoverBuilder } from '../boardCover';
import { SignAtlas } from '../ojuelegbaSigns';
import type { BoardSpec, UvRect } from '../ojuelegbaSigns';

/** An arena's palette and boards. Every name is FICTIONAL (no real business, bank, operator or brand). */
export interface Theme {
  /** wall paints of ordinary buildings */
  plaster: readonly number[];
  /** stronger colours of the far skyline */
  far: readonly number[];
  /** tarpaulin / umbrella colours */
  tarps: readonly number[];
  /** corrugated sheet colours (faded paint over rust) */
  roofs: readonly number[];
  /** door / shutter / kiosk paints */
  accent: readonly number[];
  /** fascia boards of shops */
  shops: readonly BoardSpec[];
  /** boards of kiosks / small stalls */
  small: readonly BoardSpec[];
  seed: number;
}

export interface CK {
  b: CoverBuilder;
  atlas: SignAtlas;
  paint: Material;
  metal: Material;
  concrete: Material;
  zinc: Material;
  signs: MeshStandardMaterial;
  glow: Material;
  wx(x: number): number;
  wz(y: number): number;
  r(): number;
  theme: Theme;
  W: number;
  H: number;
}

/** A cover rectangle in tiles with its world centre. */
export interface Rect extends CoverRect {
  x1: number;
  y1: number;
  cx: number;
  cz: number;
}

export type Family = (k: CK, g: number, r: Rect, n: number) => void;

const m4 = new Matrix4();
const q = new Quaternion();
const e = new Euler();
const p = new Vector3();
const s = new Vector3(1, 1, 1);

export function at(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): Matrix4 {
  q.setFromEuler(e.set(rx, ry, rz, 'YXZ'));
  return m4.compose(p.set(x, y, z), q, s.set(1, 1, 1));
}

/** A box whose UVs tile once per world unit (textured materials do not stretch). */
function bx(w: number, h: number, d: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  const uv = g.attributes.uv!;
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++)
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f]![0], uv.getY(i) * dims[f]![1]);
    }
  return g;
}

/** Box with its BOTTOM at y0 (world centre x, z). */
export function box(
  k: CK,
  g: number,
  material: Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y0: number,
  z: number,
  color: number,
  ry = 0,
  rx = 0,
  rz = 0,
): void {
  k.b.add(g, bx(w, h, d), material, at(x, y0 + h / 2, z, ry, rx, rz), color);
}

export function cyl(
  k: CK,
  g: number,
  material: Material,
  rt: number,
  rb: number,
  h: number,
  x: number,
  y0: number,
  z: number,
  color: number,
  seg = 10,
  rx = 0,
  rz = 0,
): void {
  k.b.add(g, new CylinderGeometry(rt, rb, h, seg), material, at(x, y0 + h / 2, z, 0, rx, rz), color);
}

/** A flat disc / drum lying down (tyres, rims): radius r, thickness t, centre at height y. */
export function drum(
  k: CK,
  g: number,
  material: Material,
  r: number,
  t: number,
  x: number,
  y: number,
  z: number,
  color: number,
  rx = Math.PI / 2,
  rz = 0,
  seg = 10,
): void {
  k.b.add(g, new CylinderGeometry(r, r, t, seg), material, at(x, y, z, 0, rx, rz), color);
}

/** A sign board (atlas rectangle) facing direction `ry` (0 = south, towards the camera). */
export function board(
  k: CK,
  g: number,
  uv: UvRect,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  ry = 0,
  rx = 0,
): void {
  const geo = new PlaneGeometry(w, h);
  const a = geo.attributes.uv!;
  for (let i = 0; i < a.count; i++)
    a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1]));
  k.b.add(g, geo, k.signs, at(x, y, z, ry, rx), 0xffffff);
}

export const pick = <T>(list: readonly T[], i: number): T =>
  list[((i % list.length) + list.length) % list.length]!;

/** The theme's shop fascia for index `i`, painted into the atlas on first use. */
export function shopBoard(k: CK, i: number): UvRect {
  const spec = pick(k.theme.shops, i);
  return k.atlas.board(
    `${k.theme.seed}:shop${((i % k.theme.shops.length) + k.theme.shops.length) % k.theme.shops.length}`,
    256,
    48,
    spec,
  );
}

export function smallBoard(k: CK, i: number): UvRect {
  const spec = pick(k.theme.small, i);
  return k.atlas.board(
    `${k.theme.seed}:small${((i % k.theme.small.length) + k.theme.small.length) % k.theme.small.length}`,
    128,
    40,
    spec,
  );
}

/** The shared materials and a new `CK` for a board of `W x H` tiles. */
export function createCK(W: number, H: number, theme: Theme): CK {
  const b = new CoverBuilder(W, H);
  const dom = typeof document !== 'undefined';
  const paint = b.own(
    new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.03, flatShading: true }),
  );
  const concrete = b.own(
    new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
      map: dom ? concreteTexture() : null,
    }),
  );
  const zinc = b.own(
    new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.7,
      metalness: 0.35,
      map: dom ? corrugatedTexture() : null,
    }),
  );
  const signs = b.own(new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }));
  const glow = b.own(new MeshBasicMaterial({ vertexColors: true }));
  return {
    b,
    atlas: new SignAtlas(theme.seed),
    paint,
    metal: paint,
    concrete,
    zinc,
    signs,
    glow,
    wx: (x) => x - W / 2 + 0.5,
    wz: (y) => y - H / 2 + 0.5,
    r: artRng(theme.seed * 7 + 3),
    theme,
    W,
    H,
  };
}

export function toRect(k: CK, c: CoverRect): Rect {
  const x1 = c.x + c.w - 1;
  const y1 = c.y + c.h - 1;
  return { ...c, x1, y1, cx: (k.wx(c.x) + k.wx(x1)) / 2, cz: (k.wz(c.y) + k.wz(y1)) / 2 };
}
