import {
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Color,
  Mesh,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
  Euler,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Layout } from '../coords';
import { artRng, concreteTexture, hazardStripes, wallTexture, windowsTexture } from '../textures';
import { box, mat } from './helpers';
import { bakeModel } from './merge';
import { createVehicleModel } from './vehicles';

export interface Backdrop {
  root: Group;
  /** Animates the crowd; call every frame. */
  update(time: number, excitement: number): void;
  dispose(): void;
}

/**
 * Everything around the playing field: raised slab, perimeter walls, parked danfos, buildings and
 * a cheering crowd. Walls on the camera side are kept low so no tile is hidden.
 */
export function createBackdrop(layout: Layout, crowdSize: number): Backdrop {
  const root = new Group();
  const W = layout.width;
  const H = layout.height;
  const disposables: { dispose(): void }[] = [];

  // asphalt ground + slab
  const ground = new Mesh(new PlaneGeometry(140, 110), mat(0x4c4741, { roughness: 1, flat: false }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.31;
  ground.receiveShadow = true;
  root.add(ground);
  root.add(
    box(
      W + 1.6,
      0.3,
      H + 1.6,
      mat(0xffffff, { map: concreteTexture(), flat: false, roughness: 1 }),
      0,
      -0.16,
      0,
    ),
  );

  // perimeter walls
  const wallTex = wallTexture();
  wallTex.repeat.set(Math.ceil(W / 4), 1);
  const wallMat = mat(0xffffff, { map: wallTex, flat: false, roughness: 1 });
  const thick = 0.55;
  const north = box(W + thick * 2, 0.8, thick, wallMat, 0, 0.4, -H / 2 - thick / 2);
  const east = box(thick, 0.55, H, wallMat, W / 2 + thick / 2, 0.275, 0);
  const west = box(thick, 0.55, H, wallMat, -W / 2 - thick / 2, 0.275, 0);
  const south = box(W + thick * 2, 0.2, thick, wallMat, 0, 0.1, H / 2 + thick / 2);
  root.add(north, east, west, south);
  const capMat = mat(0x8c867c, { roughness: 0.95 });
  root.add(box(W + thick * 2 + 0.1, 0.07, thick + 0.1, capMat, 0, 0.83, -H / 2 - thick / 2));
  root.add(box(thick + 0.1, 0.07, H + 0.1, capMat, W / 2 + thick / 2, 0.585, 0));
  root.add(box(thick + 0.1, 0.07, H + 0.1, capMat, -W / 2 - thick / 2, 0.585, 0));
  root.add(box(W + thick * 2 + 0.1, 0.06, thick + 0.1, capMat, 0, 0.22, H / 2 + thick / 2));
  // hazard-striped corner posts
  const stripeMat = mat(0xffffff, { map: hazardStripes(), flat: false, roughness: 0.6 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      root.add(
        box(
          0.7,
          sz < 0 ? 1.15 : 0.5,
          0.7,
          stripeMat,
          sx * (W / 2 + thick / 2),
          sz < 0 ? 0.575 : 0.25,
          sz * (H / 2 + thick / 2),
        ),
      );
    }
  }

  // parked danfos (baked to a handful of meshes each)
  const bus = bakeModel(createVehicleModel('danfo').root);
  const rng = artRng(404);
  const place = (x: number, z: number, ry: number, scale = 1.0): void => {
    const b = bus.clone();
    b.position.set(x, 0, z);
    b.rotation.y = ry;
    b.scale.setScalar(scale);
    root.add(b);
  };
  for (let i = 0; i < 5; i++)
    place(W / 2 + 2.1 + (i % 2) * 0.1, -H / 2 + 1.2 + i * 2.35, Math.PI / 2 + (rng() - 0.5) * 0.1);
  for (let i = 0; i < 4; i++) place(-W / 2 - 2.2, -H / 2 + 0.8 + i * 2.8, -Math.PI / 2 + (rng() - 0.5) * 0.1);
  for (let i = 0; i < 4; i++) place(-W / 2 + 2.5 + i * 3.6, -H / 2 - 2.0, (rng() - 0.5) * 0.1);
  place(W / 2 - 3.2, H / 2 + 2.2, Math.PI);

  // buildings
  const buildingColors = [0xd9a766, 0xc98b5a, 0xe0c07a, 0xb9745c, 0x9fb7a4, 0xd6c2a0];
  const roofColors = [0x8a4b34, 0x4a6a8a, 0x6a7a4a, 0x7a5a3a];
  const addBuilding = (x: number, z: number, w: number, d: number, h: number, i: number): void => {
    const tex = windowsTexture(i);
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
    disposables.push(t);
    root.add(
      box(
        w,
        h,
        d,
        mat(buildingColors[i % buildingColors.length]!, { map: t, flat: false, roughness: 1 }),
        x,
        h / 2 - 0.3,
        z,
      ),
    );
    const roof = box(
      w + 0.2,
      0.12,
      d + 0.2,
      mat(roofColors[i % roofColors.length]!, { roughness: 1 }),
      x,
      h - 0.24,
      z,
    );
    root.add(roof);
    if (i % 3 === 0) {
      root.add(box(0.5, 0.5, 0.5, mat(0x3a6ea5), x + w * 0.2, h + 0.1, z));
    }
  };
  let i = 0;
  for (let x = -W / 2 - 9; x < W / 2 + 10; x += 4.2) {
    addBuilding(x, -H / 2 - 5.6 - rng() * 1.2, 3.8, 4, 4 + rng() * 4, i++);
  }
  for (let z = -H / 2 - 4; z < H / 2 + 6; z += 4.2) {
    addBuilding(W / 2 + 6.2 + rng(), z, 4, 3.8, 3.5 + rng() * 4, i++);
    addBuilding(-W / 2 - 6.2 - rng(), z, 4, 3.8, 3.5 + rng() * 4, i++);
  }

  // crowd: merged person geometry, per-instance colour, animated bobbing
  const bodyGeo = mergeGeometries([
    new CylinderGeometry(0.13, 0.16, 0.5, 8).translate(0, 0.3, 0).toNonIndexed(),
    new SphereGeometry(0.12, 8, 6).translate(0, 0.68, 0).toNonIndexed(),
  ])!;
  const crowd = new InstancedMesh(bodyGeo, mat(0xffffff, { roughness: 0.8 }), crowdSize);
  crowd.castShadow = false;
  const homes: { x: number; z: number; phase: number; speed: number }[] = [];
  const color = new Color();
  const palette = [0xe8453c, 0x2f8cff, 0xffd23c, 0x34c26a, 0xf08a2c, 0xf2f2f2, 0xa23cff, 0xff7aa8];
  for (let n = 0; n < crowdSize; n++) {
    const side = n % 8;
    let x: number;
    let z: number;
    if (side < 3) {
      x = -W / 2 - 0.6 + rng() * (W + 1.2);
      z = -H / 2 - 1.0 - rng() * 1.1;
    } else if (side < 5) {
      x = W / 2 + 1.0 + rng() * 1.1;
      z = -H / 2 + rng() * (H + 1);
    } else if (side < 7) {
      x = -W / 2 - 1.0 - rng() * 1.1;
      z = -H / 2 + rng() * (H + 1);
    } else {
      x = -W / 2 + rng() * W;
      z = H / 2 + 0.9 + rng() * 0.9;
    }
    homes.push({ x, z, phase: rng() * 6.28, speed: 2 + rng() * 3 });
    color.setHex(palette[Math.floor(rng() * palette.length)]!);
    crowd.setColorAt(n, color);
  }
  root.add(crowd);

  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const pos = new Vector3();
  const sc = new Vector3(1, 1, 1);
  const update = (time: number, excitement: number): void => {
    for (let n = 0; n < homes.length; n++) {
      const h = homes[n]!;
      const jump =
        Math.max(0, Math.sin(time * h.speed * (1 + excitement) + h.phase)) * (0.05 + excitement * 0.18);
      pos.set(h.x, jump, h.z);
      e.set(0, Math.atan2(-h.x, 6 - h.z) * 0.5 + Math.PI, 0);
      q.setFromEuler(e);
      sc.set(1, 1 + jump * 0.5, 1);
      m.compose(pos, q, sc);
      crowd.setMatrixAt(n, m);
    }
    crowd.instanceMatrix.needsUpdate = true;
  };
  update(0, 0);

  return {
    root,
    update,
    dispose() {
      crowd.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}
