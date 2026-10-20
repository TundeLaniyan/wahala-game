import { Group, Mesh } from 'three';
import type { BufferGeometry, Material } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Bakes a model's meshes into one mesh per material (world transforms applied) to cut draw calls
 * for static scenery such as parked buses.
 */
export function bakeModel(root: Group): Group {
  root.updateMatrixWorld(true);
  const buckets = new Map<Material, BufferGeometry[]>();
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()) as BufferGeometry;
    for (const name of Object.keys(g.attributes))
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.attributes.uv) return;
    g.applyMatrix4(o.matrixWorld);
    const list = buckets.get(o.material as Material) ?? [];
    list.push(g);
    buckets.set(o.material as Material, list);
  });
  const out = new Group();
  for (const [material, geos] of buckets) {
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    const m = new Mesh(merged, material);
    m.castShadow = true;
    m.receiveShadow = true;
    out.add(m);
  }
  return out;
}

/**
 * Replaces the DIRECT mesh children of `group` with one merged mesh per material (in the group's
 * local space). Nested groups (animated pivots) are left alone. Meshes flagged `userData.keep`
 * stay separate, e.g. emissive lamps that are animated individually.
 */
export function bakeDirect(group: Group): void {
  const buckets = new Map<Material, BufferGeometry[]>();
  const toRemove: Mesh[] = [];
  for (const child of group.children) {
    if (!(child instanceof Mesh) || child.userData.keep) continue;
    child.updateMatrix();
    const g = (
      child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone()
    ) as BufferGeometry;
    for (const name of Object.keys(g.attributes))
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    g.applyMatrix4(child.matrix);
    const list = buckets.get(child.material as Material) ?? [];
    list.push(g);
    buckets.set(child.material as Material, list);
    toRemove.push(child);
  }
  for (const m of toRemove) group.remove(m);
  for (const [material, geos] of buckets) {
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    const mesh = new Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}
