import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import type { Texture } from 'three';

export interface OverlayItem {
  /** World position. */
  x: number;
  z: number;
  y?: number;
  color: number;
  /** 0..1 brightness (additive blending: lower = fainter). */
  intensity: number;
  /** Rotation about Y. */
  rotY?: number;
  scale?: number;
}

/** A batch of flat, additive, camera-readable markers drawn on the floor in one draw call. */
export class TileOverlay {
  readonly mesh: InstancedMesh;
  private count = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly c = new Color();

  constructor(texture: Texture, capacity: number, renderOrder: number, y = 0.045) {
    const geo = new PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new InstancedMesh(
      geo,
      new MeshBasicMaterial({
        map: texture,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
      capacity,
    );
    this.mesh.renderOrder = renderOrder;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.baseY = y;
    this.mesh.setColorAt(0, this.c.setHex(0xffffff));
  }

  private readonly baseY: number;

  begin(): void {
    this.count = 0;
  }

  push(item: OverlayItem): void {
    if (this.count >= this.mesh.instanceMatrix.count) return;
    this.p.set(item.x, item.y ?? this.baseY, item.z);
    this.e.set(0, item.rotY ?? 0, 0);
    this.q.setFromEuler(this.e);
    const sc = item.scale ?? 1;
    this.s.set(sc, 1, sc);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(this.count, this.m);
    this.c.setHex(item.color).multiplyScalar(Math.max(0, item.intensity));
    this.mesh.setColorAt(this.count, this.c);
    this.count++;
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.mesh.dispose();
  }
}
