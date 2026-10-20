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
