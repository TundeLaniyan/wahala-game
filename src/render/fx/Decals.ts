import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import type { Texture } from 'three';

/**
 * Floor decals (scorch marks, cracks) as ONE instanced mesh per texture with a ring buffer: the
 * oldest mark is recycled when the pool is full. Each mark fades in quickly, stays for most of a
 * match (the street remembers the fight) and fades out. Presentation only.
 */
export class DecalPool {
  readonly mesh: InstancedMesh;
  private readonly fade: InstancedBufferAttribute;
  private readonly born: Float32Array;
  private readonly peak: Float32Array;
  private head = 0;
  private used = 0;
  private time = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  private readonly spin = new Quaternion();
  private readonly zAxis = new Vector3(0, 0, 1);
  private readonly hold: number;
  private readonly fadeOut: number;
  private readonly y: number;

  constructor(
    map: Texture,
    private readonly capacity: number,
    opts: { y: number; renderOrder: number; hold: number; fadeOut: number },
  ) {
    this.hold = opts.hold;
    this.fadeOut = opts.fadeOut;
    this.y = opts.y;
    const geo = new PlaneGeometry(1, 1);
    this.fade = new InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage);
    geo.setAttribute('aFade', this.fade);
    const material = new MeshBasicMaterial({
      map,
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFade;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vFade;');
    };
    material.customProgramCacheKey = () => 'decal-fade';
    this.mesh = new InstancedMesh(geo, material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = opts.renderOrder;
    this.mesh.count = 0;
    this.born = new Float32Array(capacity).fill(-1e9);
    this.peak = new Float32Array(capacity);
  }

  /** A mark at world (x, z), `sx` x `sz` world units, rotated by `rot` about the vertical. */
  add(x: number, z: number, sx: number, sz: number, rot: number, opacity: number): void {
    const i = this.head;
    this.head = (this.head + 1) % this.capacity;
    this.used = Math.min(this.capacity, this.used + 1);
    this.spin.setFromAxisAngle(this.zAxis, rot);
    this.q.copy(this.flat).multiply(this.spin);
    // later marks sit a hair higher so overlapping marks never z-fight
    this.m.compose(this.p.set(x, this.y + (i % 8) * 0.0007, z), this.q, this.s.set(sx, sz, 1));
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.born[i] = this.time;
    this.peak[i] = opacity;
    this.mesh.count = this.used;
  }

  update(dt: number): void {
    this.time += dt;
    let changed = false;
    for (let i = 0; i < this.used; i++) {
      const age = this.time - this.born[i]!;
      const a =
        this.peak[i]! * Math.min(1, age * 6) * Math.max(0, 1 - Math.max(0, age - this.hold) / this.fadeOut);
      if (this.fade.array[i] !== a) {
        this.fade.array[i] = a;
        changed = true;
      }
    }
    if (changed) this.fade.needsUpdate = true;
  }

  get active(): number {
    let n = 0;
    for (let i = 0; i < this.used; i++) if ((this.fade.array[i] as number) > 0) n++;
    return n;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.mesh.dispose();
  }
}
