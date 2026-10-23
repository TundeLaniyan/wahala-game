import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { BufferGeometry } from 'three';

/** Fragment shapes: splintered planks, chunky lumps, flat slabs (concrete, cardboard, sheet metal). */
export type FragmentShape = 'plank' | 'lump' | 'slab';

export interface FragmentSpec {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** size multiplier on the base shape */
  size: number;
  color: [number, number, number];
  life: number;
}

interface Piece {
  alive: boolean;
  p: Vector3;
  v: Vector3;
  rot: Euler;
  spin: Vector3;
  size: number;
  age: number;
  life: number;
  resting: boolean;
}

const GEOMETRY: Record<FragmentShape, () => BufferGeometry> = {
  plank: () => new BoxGeometry(0.34, 0.045, 0.1),
  lump: () => new IcosahedronGeometry(0.075, 0),
  slab: () => new BoxGeometry(0.17, 0.07, 0.14),
};

/**
 * Real 3D debris: instanced, lit, shadow-casting fragments with simple physics (gravity, tumbling,
 * a bounce or two on the floor, then they settle and sink away). One draw call per shape; a fixed
 * pool per shape recycles the oldest piece. Presentation only (never read by the simulation).
 */
export class DebrisField {
  private readonly meshes = new Map<FragmentShape, InstancedMesh>();
  private readonly pieces = new Map<FragmentShape, Piece[]>();
  private readonly heads = new Map<FragmentShape, number>();
  private readonly material = new MeshStandardMaterial({ roughness: 0.92, metalness: 0.05 });
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly c = new Color();

  constructor(
    readonly group: { add(...o: InstancedMesh[]): unknown },
    capacity: number,
  ) {
    for (const shape of Object.keys(GEOMETRY) as FragmentShape[]) {
      const mesh = new InstancedMesh(GEOMETRY[shape](), this.material, capacity);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.setColorAt(0, this.c.setRGB(1, 1, 1));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.meshes.set(shape, mesh);
      this.pieces.set(
        shape,
        Array.from({ length: capacity }, () => ({
          alive: false,
          p: new Vector3(),
          v: new Vector3(),
          rot: new Euler(),
          spin: new Vector3(),
          size: 1,
          age: 0,
          life: 1,
          resting: false,
        })),
      );
      this.heads.set(shape, 0);
      group.add(mesh);
    }
  }

  get active(): number {
    let n = 0;
    for (const list of this.pieces.values()) for (const p of list) if (p.alive) n++;
    return n;
  }

  emit(shape: FragmentShape, f: FragmentSpec): void {
    const list = this.pieces.get(shape)!;
    const mesh = this.meshes.get(shape)!;
    const i = this.heads.get(shape)!;
    this.heads.set(shape, (i + 1) % list.length);
    const piece = list[i]!;
    piece.alive = true;
    piece.resting = false;
    piece.p.set(f.x, f.y, f.z);
    piece.v.set(f.vx, f.vy, f.vz);
    piece.rot.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    piece.spin.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 18);
    piece.size = f.size;
    piece.age = 0;
    piece.life = f.life;
    mesh.setColorAt(i, this.c.setRGB(f.color[0], f.color[1], f.color[2], SRGBColorSpace));
    mesh.instanceColor!.needsUpdate = true;
    mesh.count = Math.max(mesh.count, i + 1);
  }

  update(dt: number): void {
    for (const [shape, list] of this.pieces) {
      const mesh = this.meshes.get(shape)!;
      let any = false;
      for (let i = 0; i < mesh.count; i++) {
        const p = list[i]!;
        if (!p.alive) continue;
        any = true;
        p.age += dt;
        if (p.age >= p.life) {
          p.alive = false;
          this.m.makeScale(0, 0, 0);
          mesh.setMatrixAt(i, this.m);
          continue;
        }
        const half = 0.03 * p.size;
        if (!p.resting) {
          p.v.y -= 13 * dt;
          p.p.addScaledVector(p.v, dt);
          p.rot.x += p.spin.x * dt;
          p.rot.y += p.spin.y * dt;
          p.rot.z += p.spin.z * dt;
          if (p.p.y < half) {
            p.p.y = half;
            if (Math.abs(p.v.y) < 1.2) {
              p.resting = true;
              // settle flat-ish
              p.rot.x = Math.round(p.rot.x / Math.PI) * Math.PI;
              p.rot.z = Math.round(p.rot.z / Math.PI) * Math.PI;
            } else {
              p.v.y = -p.v.y * 0.32;
              p.v.x *= 0.55;
              p.v.z *= 0.55;
              p.spin.multiplyScalar(0.5);
            }
          }
        }
        // last 30% of its life: sink into the ground / shrink away
        const k = p.age / p.life;
        const shrink = k > 0.7 ? Math.max(0, 1 - (k - 0.7) / 0.3) : 1;
        this.q.setFromEuler(p.rot);
        this.s.setScalar(p.size * shrink);
        this.m.compose(p.p, this.q, this.s);
        mesh.setMatrixAt(i, this.m);
      }
      if (any) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.material.dispose();
  }
}
