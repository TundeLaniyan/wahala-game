/**
 * Practical lights of a living stage environment: lamp, tube and bulb glows (and an optional pool of
 * light on the street under them) as ONE instanced additive mesh, so the whole layer is a single draw
 * call and adds no scene lights (no shader recompiles, no per-pixel cost). Flicker is a pure function
 * of the render clock (`flickerAt`).
 */
import {
  AdditiveBlending,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { STREET } from '../arenas/common';
import { glowTexture } from '../textures';
import { flickerAt } from './plan';
import type { BoardSize, LightPocket } from './types';

/** The fixed gameplay camera looks north, pitched about 46 degrees down: glows tilt to face it. */
const FACE_CAMERA = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.8);
const LIE_FLAT = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);

interface Slot {
  light: LightPocket;
  /** Glow (true) or ground pool (false). */
  glow: boolean;
  base: Color;
  phase: number;
}

export class PracticalLights {
  readonly group = new Group();
  private readonly mesh: InstancedMesh | null;
  private readonly slots: Slot[] = [];
  private readonly material: MeshBasicMaterial;
  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly c = new Color();

  constructor(lights: readonly LightPocket[], board: BoardSize) {
    this.group.name = 'practicalLights';
    this.material = new MeshBasicMaterial({
      map: glowTexture(),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false, // additive light: the grade would tint its near-black body
    });
    const m = new Matrix4();
    lights.forEach((l, n) => {
      const color = new Color(l.color);
      this.slots.push({
        light: l,
        glow: true,
        base: color.clone().multiplyScalar(l.strength),
        phase: n * 1.7,
      });
      if (l.pool && l.pool > 0)
        this.slots.push({
          light: l,
          glow: false,
          base: color.clone().multiplyScalar(l.strength * 0.35),
          phase: n * 1.7,
        });
    });
    if (this.slots.length === 0) {
      this.mesh = null;
      return;
    }
    this.mesh = new InstancedMesh(this.geometry, this.material, this.slots.length);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 6;
    this.slots.forEach((s, i) => {
      const l = s.light;
      const x = l.at[0] - board.cols / 2;
      const z = l.at[1] - board.rows / 2;
      if (s.glow) {
        m.compose(new Vector3(x, STREET + l.height, z), FACE_CAMERA, new Vector3(l.size, l.size * 0.75, 1));
      } else {
        const d = (l.pool ?? 1) * 2;
        m.compose(new Vector3(x, STREET + 0.04, z), LIE_FLAT, new Vector3(d, d, 1));
      }
      this.mesh!.setMatrixAt(i, m);
      this.mesh!.setColorAt(i, s.base);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.mesh);
  }

  /** Light pockets drawn (each is a glow, some also a pool of light). */
  get count(): number {
    return this.slots.filter((s) => s.glow).length;
  }

  get drawCalls(): number {
    return this.mesh ? 1 : 0;
  }

  update(time: number): void {
    if (!this.mesh) return;
    this.slots.forEach((s, i) => {
      const k = flickerAt(s.light.flicker ?? 'steady', time, s.phase);
      this.mesh!.setColorAt(i, this.c.copy(s.base).multiplyScalar(k));
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.dispose();
    }
    this.geometry.dispose();
    this.material.dispose();
  }
}
