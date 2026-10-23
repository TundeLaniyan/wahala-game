/** Building blocks several arena sets use (presentation only). */
import { Group, Mesh, PlaneGeometry, DoubleSide } from 'three';
import { corrugatedTexture } from '../textures';
import { assets } from '../assets/library';
import { box, uniqueMat } from '../assets/helpers';
import type { Placement, SetContext } from './common';

/**
 * A corrugated iron roof sheet (w along x, d along z) at height y, tilted `tilt` radians about x so
 * the rain runs off; `color` is the faded paint under the rust.
 */
export function corrugatedRoof(
  statics: Group,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  color: number,
  tilt = 0,
  ry = 0,
): void {
  const map = corrugatedTexture().clone();
  map.needsUpdate = true;
  map.repeat.set(Math.max(1, w / 1.2), Math.max(1, d / 1.2));
  const m = uniqueMat(color, { map, roughness: 0.7, metalness: 0.45, flat: false });
  m.side = DoubleSide;
  const sheet = new Mesh(new PlaneGeometry(w, d), m);
  sheet.rotation.set(-Math.PI / 2 + tilt, 0, 0);
  const holder = new Group();
  holder.position.set(x, y, z);
  holder.rotation.y = ry;
  holder.add(sheet);
  sheet.castShadow = true;
  sheet.receiveShadow = true;
  // a thin rolled edge so it reads as a sheet from the low side too
  holder.add(box(w, 0.035, 0.05, m, 0, -Math.sin(tilt) * (d / 2), d / 2));
  statics.add(holder);
}

/**
 * Two-storey Lagos shophouses (modelled env_building_* GLBs) along the chosen streets. `close`
 * pulls the facades in (a narrow market street).
 */
export function shophouseRows(
  ctx: SetContext,
  o: { north?: boolean; east?: boolean; west?: boolean; seed?: number; close?: number; scale?: number },
): void {
  const { W, H, rng } = ctx;
  const ids = assets.loadedIds('env_building_');
  if (ids.length === 0) return;
  const byVariant = ids.map(() => [] as Placement[]);
  let n = o.seed ?? 0;
  const s0 = o.scale ?? 1.17;
  const put = (x: number, z: number, ry: number, s = s0): void => {
    byVariant[n++ % ids.length]!.push({ x, z, ry, sx: s, sy: s * (1.02 + rng() * 0.16), sz: s });
  };
  const close = o.close ?? 0;
  if (o.north) {
    for (let x = -W / 2 - 6.5; x <= W / 2 + 6.5; x += 3.6)
      put(x, -H / 2 - 3.85 + close - (Math.abs(Math.round(x)) % 2) * 0.25, 0);
  }
  for (let z = -H / 2 - 2.5; z < H / 2 + 5; z += 3.5) {
    if (o.west) put(-W / 2 - 3.95 + close - (Math.abs(Math.round(z)) % 2) * 0.2, z, Math.PI / 2);
    if (o.east) put(W / 2 + 4.75 - close + (Math.abs(Math.round(z)) % 2) * 0.2, z, -Math.PI / 2, s0 - 0.01);
  }
  ids.forEach((id, k) => ctx.instance(id, byVariant[k]!));
}

/** Lamps, utility poles and shop signs every street in Lagos has. */
export function streetDressing(ctx: SetContext): void {
  const { W, H } = ctx;
  ctx.instance('env_lamp', [
    { x: -W / 2 - 1.9, z: -H / 2 - 1.8, ry: 0.4 },
    { x: W / 2 + 1.9, z: -H / 2 - 1.8, ry: -0.4 },
    { x: -W / 2 - 1.9, z: H / 2 + 1.0, ry: 2.6 },
    { x: W / 2 + 1.9, z: H / 2 + 1.0, ry: -2.6 },
  ]);
  ctx.instance('env_poles', [
    { x: -W / 2 - 4.0, z: 1.0, ry: Math.PI / 2 },
    { x: W / 2 + 4.0, z: -1.5, ry: -Math.PI / 2 },
  ]);
  ctx.instance('env_shopsign', [
    { x: -W / 2 - 1.2, z: H / 2 + 2.7, ry: 0.35 },
    { x: W / 2 + 1.3, z: H / 2 + 2.5, ry: Math.PI - 0.35 },
    { x: W / 2 + 3.1, z: -H / 2 - 2.9, ry: -Math.PI / 2 },
  ]);
}
