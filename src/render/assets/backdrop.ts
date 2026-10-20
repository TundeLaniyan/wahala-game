import {
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  MeshBasicMaterial,
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
import {
  artRng,
  concreteTexture,
  hazardStripes,
  labelTexture,
  wallTexture,
  windowsTexture,
} from '../textures';
import { box, mat } from './helpers';
import { createGlbCrowd } from './crowd';
import { assets } from './library';
import { bakeModel } from './merge';
import { createVehicleModel } from './vehicles';

/** Parked buses are drawn larger than the playing-field buses so the lot feels crowded and the arena small. */
const PARKED_BUS_SCALE = 1.3;

export interface Backdrop {
  root: Group;
  /** Animates the crowd; call every frame. */
  update(time: number, excitement: number): void;
  dispose(): void;
}

interface Placement {
  x: number;
  y?: number;
  z: number;
  ry: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

/** Instances every mesh of a modelled asset at the given placements (node transforms are baked into the parts). */
function instanceAsset(root: Group, out: InstancedMesh[], id: string, placements: Placement[]): void {
  if (placements.length === 0) return;
  const m4 = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const p = new Vector3();
  const s = new Vector3();
  for (const part of assets.parts(id)) {
    const im = new InstancedMesh(part.geometry, part.material, placements.length);
    im.castShadow = true;
    im.receiveShadow = true;
    placements.forEach((pl, n) => {
      q.setFromEuler(e.set(0, pl.ry, 0));
      m4.compose(p.set(pl.x, pl.y ?? 0, pl.z), q, s.set(pl.sx ?? 1, pl.sy ?? 1, pl.sz ?? 1));
      im.setMatrixAt(n, m4);
    });
    out.push(im);
    root.add(im);
  }
}

/**
 * Walls (north/east/west tall enough to read, south kept low so no tile is hidden), corner posts and
 * spectator platforms from the modelled set. Returns false when the models are not loaded.
 */
function addModelledPerimeter(root: Group, out: InstancedMesh[], W: number, H: number): boolean {
  const wallIds = assets.loadedIds('env_wall').filter((id) => id !== 'env_wall_corner');
  if (wallIds.length === 0 || !assets.has('env_wall_corner')) return false;
  const T = 0.155; // half wall thickness
  const byVariant = wallIds.map(() => [] as Placement[]);
  let k = 0;
  const wall = (x: number, z: number, ry: number, sy = 1): void => {
    byVariant[k++ % wallIds.length]!.push({ x, z, ry, sy });
  };
  for (let i = 0; i < W; i++) {
    wall(-W / 2 + 0.5 + i, -H / 2 - T, 0);
    wall(-W / 2 + 0.5 + i, H / 2 + T, Math.PI, 0.45);
  }
  for (let i = 0; i < H; i++) {
    wall(W / 2 + T, -H / 2 + 0.5 + i, -Math.PI / 2, i > H - 2 ? 0.45 : 1);
    wall(-W / 2 - T, -H / 2 + 0.5 + i, Math.PI / 2, i > H - 2 ? 0.45 : 1);
  }
  wallIds.forEach((id, n) => instanceAsset(root, out, id, byVariant[n]!));
  const cx = W / 2 + T;
  const cz = H / 2 + T;
  instanceAsset(root, out, 'env_wall_corner', [
    { x: -cx, z: -cz, ry: 0, sy: 1.1 },
    { x: cx, z: -cz, ry: 0, sy: 1.1 },
    { x: -cx, z: cz, ry: 0, sy: 0.45 },
    { x: cx, z: cz, ry: 0, sy: 0.45 },
  ]);
  if (assets.has('env_bleacher')) {
    const off = T * 2 + 0.26;
    const plat: Placement[] = [];
    // rail side faces the arena: the model's rail is on its -Z side, so face the front (+Z) away from the field
    for (let i = -1; i <= W; i++) plat.push({ x: -W / 2 + 0.5 + i, z: -H / 2 - off, ry: Math.PI });
    for (let i = 0; i < H; i++) {
      plat.push({ x: W / 2 + off, z: -H / 2 + 0.5 + i, ry: Math.PI / 2 });
      plat.push({ x: -W / 2 - off, z: -H / 2 + 0.5 + i, ry: -Math.PI / 2 });
    }
    instanceAsset(root, out, 'env_bleacher', plat);
  }
  return true;
}

/**
 * Everything around the playing field: raised slab, perimeter walls, parked danfos, buildings and
 * a cheering crowd. Walls on the camera side are kept low so no tile is hidden.
 */
export function createBackdrop(layout: Layout, crowdSize: number, busFraction = 1): Backdrop {
  const root = new Group();
  // Static scenery is collected here and baked into a handful of meshes at the end.
  const statics = new Group();
  const W = layout.width;
  const H = layout.height;
  const disposables: { dispose(): void }[] = [];

  // asphalt ground + slab
  const ground = new Mesh(new PlaneGeometry(140, 110), mat(0x4c4741, { roughness: 1, flat: false }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.31;
  ground.receiveShadow = true;
  statics.add(ground);
  statics.add(
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

  // perimeter: modelled wall segments, corner posts and spectator platforms, else the procedural walls
  const instanced: InstancedMesh[] = [];
  const modelledPerimeter = addModelledPerimeter(root, instanced, W, H);
  if (!modelledPerimeter) {
    // perimeter walls
    const wallTex = wallTexture();
    wallTex.repeat.set(Math.ceil(W / 4), 1);
    const wallMat = mat(0xffffff, { map: wallTex, flat: false, roughness: 1 });
    const thick = 0.55;
    const north = box(W + thick * 2, 0.8, thick, wallMat, 0, 0.4, -H / 2 - thick / 2);
    const east = box(thick, 0.55, H, wallMat, W / 2 + thick / 2, 0.275, 0);
    const west = box(thick, 0.55, H, wallMat, -W / 2 - thick / 2, 0.275, 0);
    const south = box(W + thick * 2, 0.2, thick, wallMat, 0, 0.1, H / 2 + thick / 2);
    statics.add(north, east, west, south);
    const capMat = mat(0x8c867c, { roughness: 0.95 });
    statics.add(box(W + thick * 2 + 0.1, 0.07, thick + 0.1, capMat, 0, 0.83, -H / 2 - thick / 2));
    statics.add(box(thick + 0.1, 0.07, H + 0.1, capMat, W / 2 + thick / 2, 0.585, 0));
    statics.add(box(thick + 0.1, 0.07, H + 0.1, capMat, -W / 2 - thick / 2, 0.585, 0));
    statics.add(box(W + thick * 2 + 0.1, 0.06, thick + 0.1, capMat, 0, 0.22, H / 2 + thick / 2));
    // hazard-striped corner posts
    const stripeMat = mat(0xffffff, { map: hazardStripes(), flat: false, roughness: 0.6 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        statics.add(
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
  }

  // parked danfos: instanced from the modelled bus, or baked procedural copies as a fallback
  const rng = artRng(404);
  const busSpots: { x: number; z: number; ry: number }[] = [];
  const place = (x: number, z: number, ry: number): void => {
    busSpots.push({ x, z, ry });
  };
  for (let i = 0; i < 5; i++)
    place(W / 2 + 2.1 + (i % 2) * 0.1, -H / 2 + 1.2 + i * 2.35, Math.PI / 2 + (rng() - 0.5) * 0.1);
  for (let i = 0; i < 4; i++) place(-W / 2 - 2.2, -H / 2 + 0.8 + i * 2.8, -Math.PI / 2 + (rng() - 0.5) * 0.1);
  for (let i = 0; i < 4; i++) place(-W / 2 + 2.5 + i * 3.6, -H / 2 - 2.0, (rng() - 0.5) * 0.1);
  place(W / 2 - 3.2, H / 2 + 2.2, Math.PI);
  // thin the lot on weaker devices: keep an evenly spread subset
  const keep = Math.max(1, Math.round(busSpots.length * busFraction));
  const shown = busSpots.filter(
    (_, n) =>
      Math.floor((n * keep) / busSpots.length) !== Math.floor(((n - 1) * keep) / busSpots.length) || n === 0,
  );
  busSpots.splice(0, busSpots.length, ...shown);
  const busParts = assets.parts('veh_danfo');
  if (busParts.length > 0) {
    const m4 = new Matrix4();
    const q4 = new Quaternion();
    const e4 = new Euler();
    for (const part of busParts) {
      const im = new InstancedMesh(part.geometry, part.material, busSpots.length);
      im.castShadow = true;
      im.receiveShadow = true;
      busSpots.forEach((b, n) => {
        // modelled buses face +Z, the procedural ones faced +X
        q4.setFromEuler(e4.set(0, b.ry + Math.PI / 2, 0));
        m4.compose(
          new Vector3(b.x, 0, b.z),
          q4,
          new Vector3(PARKED_BUS_SCALE, PARKED_BUS_SCALE, PARKED_BUS_SCALE),
        );
        im.setMatrixAt(n, m4);
      });
      instanced.push(im);
      root.add(im);
    }
  } else {
    const bus = bakeModel(createVehicleModel('danfo').root);
    for (const b of busSpots) {
      const copy = bus.clone();
      copy.position.set(b.x, 0, b.z);
      copy.rotation.y = b.ry;
      statics.add(copy);
    }
  }

  // buildings
  const buildingColors = [0xd9a766, 0xc98b5a, 0xe0c07a, 0xb9745c, 0x9fb7a4, 0xd6c2a0];
  const roofColors = [0x8a4b34, 0x4a6a8a, 0x6a7a4a, 0x7a5a3a];
  const addBuilding = (x: number, z: number, w: number, d: number, h: number, i: number): void => {
    const tex = windowsTexture(i);
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
    disposables.push(t);
    statics.add(
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
    statics.add(roof);
    if (i % 3 === 0) {
      statics.add(box(0.5, 0.5, 0.5, mat(0x3a6ea5), x + w * 0.2, h + 0.1, z));
    }
  };
  const buildingIds = assets.loadedIds('env_building_');
  if (buildingIds.length > 0) {
    const byVariant = buildingIds.map(() => [] as Placement[]);
    let n = 0;
    const put = (x: number, z: number, ry: number): void => {
      byVariant[n++ % buildingIds.length]!.push({ x, z, ry, sy: 0.92 + rng() * 0.25 });
    };
    for (let x = -W / 2 - 7; x < W / 2 + 8; x += 3.45) put(x, -H / 2 - 4.7 - rng() * 0.5, 0);
    for (let z = -H / 2 - 3.5; z < H / 2 + 6; z += 3.3) {
      put(W / 2 + 5.2 + rng() * 0.5, z, -Math.PI / 2);
      put(-W / 2 - 5.2 - rng() * 0.5, z, Math.PI / 2);
    }
    buildingIds.forEach((id, k) => instanceAsset(root, instanced, id, byVariant[k]!));
  } else {
    let i = 0;
    for (let x = -W / 2 - 9; x < W / 2 + 10; x += 4.2) {
      addBuilding(x, -H / 2 - 5.6 - rng() * 1.2, 3.8, 4, 4 + rng() * 4, i++);
    }
    for (let z = -H / 2 - 4; z < H / 2 + 6; z += 4.2) {
      addBuilding(W / 2 + 6.2 + rng(), z, 4, 3.8, 3.5 + rng() * 4, i++);
      addBuilding(-W / 2 - 6.2 - rng(), z, 4, 3.8, 3.5 + rng() * 4, i++);
    }
  }

  // street dressing around the lot (kiosks, lamps, utility poles, tyre stacks, barrels)
  const dress = (id: string, spots: Placement[]): void => instanceAsset(root, instanced, id, spots);
  dress('env_kiosk', [
    { x: -W / 2 + 2.2, z: -H / 2 - 3.5, ry: 0, sx: 0.8, sy: 0.8, sz: 0.8 },
    { x: W / 2 - 3.2, z: -H / 2 - 3.5, ry: 0, sx: 0.8, sy: 0.8, sz: 0.8 },
  ]);
  dress('env_lamp', [
    { x: -W / 2 - 1.9, z: -H / 2 - 1.8, ry: 0.4 },
    { x: W / 2 + 1.9, z: -H / 2 - 1.8, ry: -0.4 },
    { x: -W / 2 - 1.9, z: H / 2 + 1.0, ry: 2.6 },
    { x: W / 2 + 1.9, z: H / 2 + 1.0, ry: -2.6 },
  ]);
  dress('env_poles', [
    { x: -W / 2 - 4.0, z: 1.0, ry: Math.PI / 2 },
    { x: W / 2 + 4.0, z: -1.5, ry: -Math.PI / 2 },
  ]);
  dress('env_tyrestack', [
    { x: -W / 2 - 1.4, z: H / 2 + 1.9, ry: 0.5 },
    { x: W / 2 + 1.5, z: H / 2 + 1.8, ry: -0.4 },
    { x: -2.5, z: -H / 2 - 2.5, ry: 1.2 },
  ]);
  dress('env_barrel', [
    { x: -W / 2 + 4.0, z: H / 2 + 1.7, ry: 0.3 },
    { x: W / 2 - 5.0, z: -H / 2 - 2.4, ry: 2.0 },
  ]);

  // Green-white-green bunting along the back wall, and the bus-park signboard.
  const tri = new BufferGeometry();
  tri.setAttribute('position', new Float32BufferAttribute([-0.2, 0, 0, 0.2, 0, 0, 0, -0.38, 0], 3));
  tri.setAttribute('normal', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  const flags = new InstancedMesh(tri, new MeshBasicMaterial({ side: DoubleSide }), 34);
  const flagColor = new Color();
  const fm = new Matrix4();
  for (let n = 0; n < 34; n++) {
    const t = n / 33;
    const x = -W / 2 - 0.2 + t * (W + 0.4);
    const sag = Math.sin(t * Math.PI) * 0.35;
    fm.makeTranslation(x, 2.0 - sag, -H / 2 - 0.45);
    flags.setMatrixAt(n, fm);
    flags.setColorAt(n, flagColor.setHex(n % 3 === 1 ? 0xffffff : 0x1fa64a));
  }
  root.add(flags);
  const signMat = new MeshBasicMaterial({
    map: labelTexture('DANFO BUS PARK', '#ffc21a', 'bold 30px system-ui, sans-serif', '#1a1208'),
    transparent: true,
  });
  const sign = new Mesh(new PlaneGeometry(4.2, 1.5), signMat);
  sign.position.set(-W / 2 + 3.2, 1.55, -H / 2 - 0.62);
  sign.rotation.x = -0.35;
  root.add(sign);

  const glbCrowd = createGlbCrowd(layout, crowdSize, rng);
  if (glbCrowd) {
    root.add(glbCrowd.group, bakeModel(statics));
    return {
      root,
      update: glbCrowd.update,
      dispose() {
        glbCrowd.dispose();
        for (const im of instanced) im.dispose();
        for (const d of disposables) d.dispose();
      },
    };
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
  root.add(bakeModel(statics));

  return {
    root,
    update,
    dispose() {
      crowd.dispose();
      for (const im of instanced) im.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}
