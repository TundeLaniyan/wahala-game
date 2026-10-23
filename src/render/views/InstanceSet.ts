import { DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4 } from 'three';
import type { BufferGeometry, Group, Material } from 'three';
import { Group as ThreeGroup } from 'three';
import { fadeableMaterial } from '../assets/occlusionFade';

export interface InstancePart {
  geometry: BufferGeometry;
  material: Material;
}

/**
 * A keyed set of instances rendered with one InstancedMesh per part. Adding, moving and
 * removing keys keeps the instance buffer dense (removal swaps with the last slot).
 *
 * With `fade: true` every part gets a per-instance occlusion-fade value (`setHide`, see
 * assets/occlusionFade.ts); the materials are cloned for that, the geometries copied.
 */
export class InstanceSet {
  readonly group: Group = new ThreeGroup();
  private readonly meshes: InstancedMesh[];
  private readonly slotOf = new Map<number, number>();
  private readonly keys: number[] = [];
  private readonly hide: InstancedBufferAttribute | null;
  private readonly owned: (Material | BufferGeometry)[] = [];

  constructor(parts: InstancePart[], capacity: number, opts: { fade?: boolean } = {}) {
    this.hide = opts.fade
      ? new InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage)
      : null;
    this.meshes = parts.map((p) => {
      let geometry = p.geometry;
      let material = p.material;
      if (this.hide) {
        geometry = p.geometry.clone();
        geometry.setAttribute('aHide', this.hide);
        material = fadeableMaterial(p.material);
        this.owned.push(geometry, material);
      }
      const m = new InstancedMesh(geometry, material, capacity);
      m.castShadow = true;
      m.receiveShadow = true;
      m.count = 0;
      this.group.add(m);
      return m;
    });
  }

  has(key: number): boolean {
    return this.slotOf.has(key);
  }

  get size(): number {
    return this.keys.length;
  }

  set(key: number, matrix: Matrix4): void {
    let slot = this.slotOf.get(key);
    if (slot === undefined) {
      slot = this.keys.length;
      this.keys.push(key);
      this.slotOf.set(key, slot);
      for (const m of this.meshes) m.count = this.keys.length;
      if (this.hide && this.hide.array[slot] !== 0) {
        this.hide.array[slot] = 0;
        this.hide.needsUpdate = true;
      }
    }
    for (const m of this.meshes) {
      m.setMatrixAt(slot, matrix);
      m.instanceMatrix.needsUpdate = true;
    }
  }

  /** Occlusion fade of one instance (0 = solid .. 1); ignored without `fade`. */
  setHide(key: number, value: number): void {
    const slot = this.slotOf.get(key);
    if (!this.hide || slot === undefined || this.hide.array[slot] === value) return;
    this.hide.array[slot] = value;
    this.hide.needsUpdate = true;
  }

  remove(key: number): void {
    const slot = this.slotOf.get(key);
    if (slot === undefined) return;
    const last = this.keys.length - 1;
    const lastKey = this.keys[last]!;
    const tmp = new Matrix4();
    if (lastKey !== key) {
      for (const m of this.meshes) {
        m.getMatrixAt(last, tmp);
        m.setMatrixAt(slot, tmp);
        m.instanceMatrix.needsUpdate = true;
      }
      if (this.hide) {
        this.hide.array[slot] = this.hide.array[last]!;
        this.hide.needsUpdate = true;
      }
      this.keys[slot] = lastKey;
      this.slotOf.set(lastKey, slot);
    }
    this.keys.pop();
    this.slotOf.delete(key);
    for (const m of this.meshes) m.count = this.keys.length;
  }

  dispose(): void {
    for (const m of this.meshes) m.dispose();
    for (const o of this.owned) o.dispose();
  }
}
