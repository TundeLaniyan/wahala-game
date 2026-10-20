import { InstancedMesh, Matrix4 } from 'three';
import type { BufferGeometry, Group, Material } from 'three';
import { Group as ThreeGroup } from 'three';

export interface InstancePart {
  geometry: BufferGeometry;
  material: Material;
}

/**
 * A keyed set of instances rendered with one InstancedMesh per part. Adding, moving and
 * removing keys keeps the instance buffer dense (removal swaps with the last slot).
 */
export class InstanceSet {
  readonly group: Group = new ThreeGroup();
  private readonly meshes: InstancedMesh[];
  private readonly slotOf = new Map<number, number>();
  private readonly keys: number[] = [];

  constructor(parts: InstancePart[], capacity: number) {
    this.meshes = parts.map((p) => {
      const m = new InstancedMesh(p.geometry, p.material, capacity);
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
    }
    for (const m of this.meshes) {
      m.setMatrixAt(slot, matrix);
      m.instanceMatrix.needsUpdate = true;
    }
  }

  remove(key: number): void {
    const slot = this.slotOf.get(key);
    if (slot === undefined) return;
    const lastKey = this.keys[this.keys.length - 1]!;
    const tmp = new Matrix4();
    if (lastKey !== key) {
      for (const m of this.meshes) {
        m.getMatrixAt(this.keys.length - 1, tmp);
        m.setMatrixAt(slot, tmp);
        m.instanceMatrix.needsUpdate = true;
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
  }
}
