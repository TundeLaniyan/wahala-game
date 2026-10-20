import { Color, Euler, Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { Material } from 'three';
import type { Layout } from '../coords';
import { assets } from './library';

export interface Crowd {
  group: Group;
  update(time: number, excitement: number): void;
  dispose(): void;
}

interface Home {
  y: number;
  x: number;
  z: number;
  phase: number;
  speed: number;
  scale: number;
  yaw: number;
}

/** Perimeter positions (world units) around the arena, behind the walls; deterministic from `rng`. */
export function crowdHomes(layout: Layout, count: number, rng: () => number): Home[] {
  const W = layout.width;
  const H = layout.height;
  const platform = assets.has('env_bleacher');
  const homes: Home[] = [];
  for (let n = 0; n < count; n++) {
    const side = n % 8;
    // 0 = north, 1 = east, 2 = west, 3 = south; the camera-side (south) has no platform.
    const edge = side < 3 ? 0 : side < 5 ? 1 : side < 7 ? 2 : 3;
    const onPlatform = platform && edge !== 3 && rng() < 0.62;
    const out = onPlatform ? 0.47 + rng() * 0.22 : 1.0 + rng() * 0.5;
    let x: number;
    let z: number;
    if (edge === 0) {
      x = -W / 2 - 0.4 + rng() * (W + 0.8);
      z = -H / 2 - out;
    } else if (edge === 1) {
      x = W / 2 + out;
      z = -H / 2 + rng() * (H + 0.6);
    } else if (edge === 2) {
      x = -W / 2 - out;
      z = -H / 2 + rng() * (H + 0.6);
    } else {
      x = -W / 2 + rng() * W;
      z = H / 2 + 0.7 + rng() * 0.7;
    }
    homes.push({
      x,
      y: onPlatform ? 0.62 : 0,
      z,
      phase: rng() * 6.28,
      speed: 2 + rng() * 3,
      scale: 0.5 + rng() * 0.14,
      // face the middle of the arena, with a little individual attention drift
      yaw: Math.atan2(-x, -z) + (rng() - 0.5) * 0.5,
    });
  }
  return homes;
}

/** Posed, clothed spectators from `crowd.glb`: one InstancedMesh per variant, bobbing and cheering with the match. */
export function createGlbCrowd(layout: Layout, count: number, rng: () => number): Crowd | null {
  const variants = assets.parts('crowd');
  if (variants.length === 0) return null;
  const homes = crowdHomes(layout, count, rng);
  const group = new Group();
  const perVariant = variants.map(() => [] as number[]);
  homes.forEach((_, i) => perVariant[i % variants.length]!.push(i));
  const meshes = variants.map((v, k) => {
    const m = new InstancedMesh(v.geometry, v.material, Math.max(1, perVariant[k]!.length));
    m.castShadow = false;
    m.receiveShadow = true;
    m.frustumCulled = false;
    const tint = new Color();
    perVariant[k]!.forEach((_, slot) => {
      const t = 0.82 + rng() * 0.3;
      m.setColorAt(slot, tint.setRGB(t, t * (0.95 + rng() * 0.08), t * (0.95 + rng() * 0.08)));
    });
    group.add(m);
    return m;
  });
  const mat4 = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const pos = new Vector3();
  const sc = new Vector3();
  const update = (time: number, excitement: number): void => {
    meshes.forEach((m, k) => {
      perVariant[k]!.forEach((homeIndex, slot) => {
        const h = homes[homeIndex]!;
        const beat = Math.sin(time * h.speed * (1 + excitement) + h.phase);
        const jump = Math.max(0, beat) * (0.04 + excitement * 0.16);
        pos.set(h.x, h.y + jump, h.z);
        e.set(0, h.yaw + Math.sin(time * 0.9 + h.phase) * 0.08, beat * 0.035 * (0.5 + excitement));
        q.setFromEuler(e);
        const s = h.scale;
        sc.set(s, s * (1 + jump * 0.25), s);
        mat4.compose(pos, q, sc);
        m.setMatrixAt(slot, mat4);
      });
      m.instanceMatrix.needsUpdate = true;
    });
  };
  update(0, 0);
  return {
    group,
    update,
    dispose() {
      for (const m of meshes) m.dispose();
      for (const v of variants) {
        v.geometry.dispose();
        (v.material as Material).dispose?.();
      }
    },
  };
}
