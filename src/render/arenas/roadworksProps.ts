/**
 * Lekki Roadworks materials and small site clutter (presentation only): concrete pipe stacks,
 * rebar bundles on bearers, pallets of sandcrete blocks, cement bags under a tarp, timber and
 * formwork stacks, water-filled and concrete barriers, traffic cones, sandbags, wheelbarrows and
 * cable runs. All static; everything is added to the baked statics.
 */
import { BoxGeometry, ConeGeometry, Group, LatheGeometry, Vector2 } from 'three';
import type { Material } from 'three';
import { box, cyl, mat, mesh } from '../assets/helpers';
import type { SetContext } from './common';
import { STREET } from './common';
import type { SitePalette } from './roadworksKit';
import { bar, mound, tiltedBox, uvScale, v3 } from './roadworksKit';
import { blockworkTexture } from './roadworksTextures';

function put(ctx: SetContext, g: Group, x: number, z: number, ry: number, y = STREET): void {
  g.position.set(x, y, z);
  g.rotation.y = ry;
  ctx.statics.add(g);
}

/** A tapered prism: a box whose top face is scaled by (tx, tz). */
function taper(
  w: number,
  h: number,
  d: number,
  tx: number,
  tz: number,
  m: Material,
  x: number,
  y: number,
  z: number,
) {
  const geo = new BoxGeometry(w, h, d);
  const p = geo.attributes.position!;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setXYZ(i, p.getX(i) * tx, p.getY(i), p.getZ(i) * tz);
  return mesh(geo, m, x, y, z);
}

const PIPE = (r: number, len: number, wall = 0.07) =>
  new LatheGeometry(
    [
      new Vector2(r - wall, -len / 2),
      new Vector2(r, -len / 2),
      new Vector2(r, len / 2),
      new Vector2(r - wall, len / 2),
      new Vector2(r - wall, -len / 2),
    ],
    20,
  );

/** Hollow concrete drainage pipes stacked in a pyramid, chocked with timber. */
export function pipeStack(
  ctx: SetContext,
  P: SitePalette,
  x: number,
  z: number,
  ry: number,
  r = 0.42,
  len = 1.6,
): void {
  const g = new Group();
  const geo = PIPE(r, len);
  const rows = [3, 2];
  rows.forEach((n, row) => {
    for (let i = 0; i < n; i++) {
      const p = mesh(geo.clone(), P.pipe, (i - (n - 1) / 2) * r * 2.02, r + row * r * 1.72, 0);
      p.rotation.x = Math.PI / 2;
      g.add(p);
    }
  });
  for (const sx of [-1, 1]) g.add(box(0.12, 0.12, len * 0.9, P.timber, sx * r * 3.1, 0.06, 0));
  put(ctx, g, x, z, ry);
}

/** A bundle of rebar on timber bearers, wire-tied, a few bars splayed out of the bundle. */
export function rebarBundle(
  ctx: SetContext,
  P: SitePalette,
  x: number,
  z: number,
  ry: number,
  len = 4.2,
  n = 16,
): void {
  const g = new Group();
  for (const sz of [-len * 0.35, 0, len * 0.35]) g.add(box(0.5, 0.1, 0.1, P.timber, 0, 0.05, sz));
  const r = ctx.rng;
  for (let i = 0; i < n; i++) {
    const bx = ((i % 5) - 2) * 0.045 + (r() - 0.5) * 0.02;
    const by = 0.13 + Math.floor(i / 5) * 0.04;
    const splay = i === n - 1 ? 0.25 : i === n - 3 ? -0.18 : 0;
    g.add(bar(v3(bx, by, -len / 2), v3(bx + splay, by + Math.abs(splay) * 0.3, len / 2), 0.014, P.rebar, 4));
  }
  for (const sz of [-len * 0.25, len * 0.25]) g.add(box(0.26, 0.2, 0.03, P.black, 0, 0.18, sz));
  put(ctx, g, x, z, ry);
}

/** A timber pallet of hollow sandcrete blocks (shrink-wrapped stacks are not a Lagos thing). */
export function blockPallet(
  ctx: SetContext,
  P: SitePalette,
  x: number,
  z: number,
  ry: number,
  h = 0.8,
): void {
  const g = new Group();
  const blocks = mat(0x9a968e, { map: blockworkTexture(), roughness: 1, flat: false });
  g.add(box(1.1, 0.12, 0.9, P.timber, 0, 0.06, 0));
  const stack = box(1.0, h, 0.86, blocks, 0, 0.12 + h / 2, 0);
  uvScale(stack.geometry, 1, h);
  g.add(stack);
  g.add(box(0.45, 0.2, 0.2, P.block, 0.2, 0.22 + h, 0.1));
  put(ctx, g, x, z, ry);
}

/** Cement bags stacked on a pallet, half under a weighted blue tarp. */
export function cementBags(ctx: SetContext, P: SitePalette, x: number, z: number, ry: number): void {
  const g = new Group();
  g.add(box(1.2, 0.12, 1.0, P.timber, 0, 0.06, 0));
  for (let row = 0; row < 4; row++)
    for (let k = 0; k < 2; k++)
      g.add(
        tiltedBox(0.55, 0.14, 0.92, P.sack, -0.28 + k * 0.56, 0.2 + row * 0.14, 0, 0, row % 2 ? 0.05 : -0.04),
      );
  g.add(tiltedBox(0.9, 0.04, 1.15, P.tarp, 0.18, 0.78, 0, 0, 0, 0.12));
  g.add(tiltedBox(0.05, 0.55, 1.1, P.tarp, 0.62, 0.5, 0, 0, 0, 0.05));
  g.add(box(0.2, 0.2, 0.2, P.block, 0.3, 0.88, 0.2));
  put(ctx, g, x, z, ry);
}

/** Timber planks or formwork plywood sheets stacked flat on bearers. */
export function timberStack(
  ctx: SetContext,
  P: SitePalette,
  x: number,
  z: number,
  ry: number,
  ply = false,
): void {
  const g = new Group();
  for (const sz of [-0.9, 0.9]) g.add(box(0.8, 0.08, 0.1, P.timber, 0, 0.04, sz));
  const r = ctx.rng;
  for (let k = 0; k < (ply ? 7 : 9); k++) {
    const y = 0.1 + k * (ply ? 0.035 : 0.06);
    if (ply) g.add(tiltedBox(1.2, 0.03, 2.4, P.ply, (r() - 0.5) * 0.08, y, 0, 0, (r() - 0.5) * 0.05));
    else
      for (let j = 0; j < 3; j++)
        g.add(box(0.2, 0.05, 2.6 + r() * 0.3, P.timber, -0.25 + j * 0.25, y, (r() - 0.5) * 0.2));
  }
  put(ctx, g, x, z, ry);
}

/** Orange/white water-filled barriers along a line from (x0, z0) to (x1, z1). */
export function barrierLine(
  ctx: SetContext,
  P: SitePalette,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  h = 0.62,
): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 1.0));
  const ry = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
  const r = ctx.rng;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const g = new Group();
    const m = i % 2 ? P.orange : P.white;
    g.add(taper(0.98, h, 0.42, 0.92, 0.55, m, 0, h / 2, 0));
    g.add(box(0.2, 0.07, 0.1, m, 0, h + 0.03, 0)); // fill cap
    put(ctx, g, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, ry + (r() - 0.5) * 0.12);
  }
}

/** Precast concrete (jersey) barriers along a line, chipped and stained. */
export function jerseyLine(
  ctx: SetContext,
  P: SitePalette,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 2.0));
  const ry = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
  const r = ctx.rng;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const g = new Group();
    g.add(taper(1.95, 0.25, 0.6, 1, 0.55, P.concrete, 0, 0.125, 0));
    g.add(taper(1.95, 0.5, 0.33, 1, 0.6, P.concrete, 0, 0.5, 0));
    if (i % 3 === 1) g.add(box(0.5, 0.14, 0.34, P.red, 0.4, 0.5, 0)); // a painted band
    put(ctx, g, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, ry + (r() - 0.5) * 0.08);
  }
}

/** Traffic cones with a reflective band; `fallen` tips one over. */
export function cones(ctx: SetContext, P: SitePalette, spots: [number, number][], fallen = -1): void {
  spots.forEach(([x, z], i) => {
    const g = new Group();
    g.add(box(0.34, 0.03, 0.34, P.black, 0, 0.015, 0));
    g.add(mesh(new ConeGeometry(0.13, 0.55, 10), P.orange, 0, 0.3, 0));
    g.add(cyl(0.085, 0.1, 0.09, P.white, 0, 0.32, 0, 10));
    if (i === fallen) {
      g.rotation.z = Math.PI / 2 - 0.25;
      g.position.y = 0.13;
    }
    const h = new Group();
    h.add(g);
    put(ctx, h, x, z, i * 1.3);
  });
}

/** A low row of sandbags (kept under the south-side height limit). */
export function sandbags(
  ctx: SetContext,
  P: SitePalette,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.round(len / 0.55);
  const ry = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
  const r = ctx.rng;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const g = new Group();
    g.add(tiltedBox(0.52, 0.16, 0.32, P.sack, 0, 0.08, 0, 0, (r() - 0.5) * 0.3, (r() - 0.5) * 0.1));
    if (i % 2) g.add(tiltedBox(0.5, 0.15, 0.3, P.sack, 0.26, 0.23, 0, 0, (r() - 0.5) * 0.4));
    put(ctx, g, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, ry);
  }
}

/** A builder's wheelbarrow, optionally full of wet mortar. */
export function wheelbarrow(
  ctx: SetContext,
  P: SitePalette,
  x: number,
  z: number,
  ry: number,
  load = true,
): void {
  const g = new Group();
  g.add(taper(0.55, 0.3, 0.75, 1.25, 1.25, P.olive, 0, 0.45, 0));
  if (load) g.add(mound(P.concreteDark, 0, 0.55, 0, 0.32, 0.12, 4));
  const w = cyl(0.17, 0.17, 0.08, P.rubber, 0, 0.17, 0.55, 12);
  w.rotation.z = Math.PI / 2;
  g.add(w);
  for (const sx of [-0.2, 0.2]) {
    g.add(bar(v3(sx * 0.5, 0.17, 0.55), v3(sx, 0.55, -0.7), 0.02, P.black, 4));
    g.add(bar(v3(sx, 0.32, -0.1), v3(sx, 0, -0.25), 0.02, P.black, 4));
  }
  put(ctx, g, x, z, ry);
}

/** A cable lying on the ground along a polyline (from the generator to the lamps). */
export function cable(ctx: SetContext, P: SitePalette, pts: [number, number][]): void {
  const g = new Group();
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    g.add(bar(v3(ax, STREET + 0.03, az), v3(bx, STREET + 0.03, bz), 0.025, P.black, 4));
  }
  ctx.statics.add(g);
}

/** A material heap (sand, gravel, laterite) on the street. */
export function heap(
  ctx: SetContext,
  m: Material,
  x: number,
  z: number,
  r: number,
  h: number,
  seed = 0,
): void {
  ctx.statics.add(mound(m, x, STREET, z, r, h, seed));
}
