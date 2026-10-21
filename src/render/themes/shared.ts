import { InstancedMesh, Matrix4, Quaternion, Vector3, Euler } from 'three';
import type { Group } from 'three';
import { windowsTexture } from '../textures';
import { box, mat } from '../assets/helpers';
import { assets } from '../assets/library';
import type { DressContext, Placement } from './types';

/** Instances every mesh of a modelled asset at the given placements (node transforms are baked into the parts). */
export function instanceAsset(root: Group, out: InstancedMesh[], id: string, placements: Placement[]): void {
  if (placements.length === 0) return;
  const m4 = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const p = new Vector3();
  const s = new Vector3();
  for (const part of assets.parts(id)) {
    const im = new InstancedMesh(part.geometry, part.material, placements.length);
    im.castShadow = true;
    im.receiveShadow = true;
    placements.forEach((pl, n) => {
      q.setFromEuler(e.set(0, pl.ry, 0));
      m4.compose(p.set(pl.x, pl.y ?? 0, pl.z), q, s.set(pl.sx ?? 1, pl.sy ?? 1, pl.sz ?? 1));
      im.setMatrixAt(n, m4);
    });
    out.push(im);
    root.add(im);
  }
}

/** Keeps an evenly spread subset (`fraction` of the list) so weaker devices draw less scenery. */
export function thin<T>(list: T[], fraction: number): T[] {
  const keep = Math.max(1, Math.round(list.length * Math.min(1, fraction)));
  return list.filter(
    (_, n) => n === 0 || Math.floor((n * keep) / list.length) !== Math.floor(((n - 1) * keep) / list.length),
  );
}

/**
 * Rows of buildings behind the north, east and west streets: modelled `ids` cycled, or tinted boxes with
 * a window texture when none loaded.
 */
export function buildingRows(ctx: DressContext, ids: string[], fallbackColors: number[]): void {
  const { layout, rng } = ctx;
  const W = layout.width;
  const H = layout.height;
  const loaded = ids.filter((id) => assets.has(id));
  if (loaded.length > 0) {
    const byVariant = loaded.map(() => [] as Placement[]);
    let n = 0;
    const put = (x: number, z: number, ry: number): void => {
      byVariant[n++ % loaded.length]!.push({ x, z, ry, sy: 0.92 + rng() * 0.25 });
    };
    for (let x = -W / 2 - 7; x < W / 2 + 8; x += 3.45) put(x, -H / 2 - 4.7 - rng() * 0.5, 0);
    for (let z = -H / 2 - 3.5; z < H / 2 + 6; z += 3.3) {
      put(W / 2 + 5.2 + rng() * 0.5, z, -Math.PI / 2);
      put(-W / 2 - 5.2 - rng() * 0.5, z, Math.PI / 2);
    }
    loaded.forEach((id, k) => ctx.instance(id, byVariant[k]!));
    return;
  }
  let i = 0;
  const add = (x: number, z: number, w: number, d: number, h: number): void => {
    const t = windowsTexture(i).clone();
    t.needsUpdate = true;
    t.repeat.set(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
    ctx.track(t);
    const color = fallbackColors[i++ % fallbackColors.length]!;
    ctx.statics.add(box(w, h, d, mat(color, { map: t, flat: false, roughness: 1 }), x, h / 2 - 0.3, z));
  };
  for (let x = -W / 2 - 9; x < W / 2 + 10; x += 4.2)
    add(x, -H / 2 - 5.6 - rng() * 1.2, 3.8, 4, 4 + rng() * 4);
  for (let z = -H / 2 - 4; z < H / 2 + 6; z += 4.2) {
    add(W / 2 + 6.2 + rng(), z, 4, 3.8, 3.5 + rng() * 4);
    add(-W / 2 - 6.2 - rng(), z, 4, 3.8, 3.5 + rng() * 4);
  }
}
