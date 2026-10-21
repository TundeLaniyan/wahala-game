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
import { artRng, concreteTexture, hazardStripes, labelTexture, wallTexture } from '../textures';
import type { ArenaTheme, DressContext, Placement } from '../themes';
import { instanceAsset } from '../themes/shared';
import { box, mat } from './helpers';
import { createGlbCrowd } from './crowd';
import { assets } from './library';
import { bakeModel } from './merge';

export interface Backdrop {
  root: Group;
  /** Animates the crowd; call every frame. */
  update(time: number, excitement: number): void;
  dispose(): void;
}

/**
 * Walls (north/east/west tall enough to read, south kept low so no tile is hidden), corner posts and
 * spectator platforms from the modelled set. Returns false when the models are not loaded.
 */
function addModelledPerimeter(
  root: Group,
  out: InstancedMesh[],
  W: number,
  H: number,
  theme: ArenaTheme,
): boolean {
  const wallIds = theme.walls.filter((id) => assets.has(id));
  if (wallIds.length === 0 || !assets.has(theme.wallCorner)) return false;
  const T = 0.155; // half wall thickness
  const byVariant = wallIds.map(() => [] as Placement[]);
  let k = 0;
  const wall = (x: number, z: number, ry: number, sy = 1): void => {
    byVariant[k++ % wallIds.length]!.push({ x, z, ry, sy });
  };
  for (let i = 0; i < W; i++) {
    wall(-W / 2 + 0.5 + i, -H / 2 - T, 0);
    wall(-W / 2 + 0.5 + i, H / 2 + T, Math.PI, 0.4);
  }
  for (let i = 0; i < H; i++) {
    const sy = i > H - 2 ? 0.4 : i > H - 3 ? 0.7 : 1; // step down towards the camera side
    wall(W / 2 + T, -H / 2 + 0.5 + i, -Math.PI / 2, sy);
    wall(-W / 2 - T, -H / 2 + 0.5 + i, Math.PI / 2, sy);
  }
  wallIds.forEach((id, n) => instanceAsset(root, out, id, byVariant[n]!));
  const cx = W / 2 + T;
  const cz = H / 2 + T;
  const posts: Placement[] = [
    { x: -cx, z: -cz, ry: 0 },
    { x: cx, z: -cz, ry: 0 },
    { x: -cx, z: cz, ry: 0, sy: 0.42 },
    { x: cx, z: cz, ry: 0, sy: 0.42 },
  ];
  // intermediate pilasters every few panels break up the long runs (precast wall rhythm)
  for (let i = 3; i < W - 1; i += 3) posts.push({ x: -W / 2 + i, z: -cz, ry: 0 });
  for (let i = 3; i < H - 2; i += 3) {
    posts.push({ x: -cx, z: -H / 2 + i, ry: Math.PI / 2 });
    posts.push({ x: cx, z: -H / 2 + i, ry: -Math.PI / 2 });
  }
  for (let i = 3; i < W - 1; i += 3) posts.push({ x: -W / 2 + i, z: cz, ry: Math.PI, sy: 0.42 });
  instanceAsset(root, out, theme.wallCorner, posts);
  if (theme.platform && assets.has(theme.platform)) {
    const off = T * 2 + 0.26;
    const plat: Placement[] = [];
    // rail side faces the arena: the model's rail is on its -Z side, so face the front (+Z) away from the field
    for (let i = -1; i <= W; i++) plat.push({ x: -W / 2 + 0.5 + i, z: -H / 2 - off, ry: Math.PI });
    for (let i = 0; i < H; i++) {
      plat.push({ x: W / 2 + off, z: -H / 2 + 0.5 + i, ry: Math.PI / 2 });
      plat.push({ x: -W / 2 - off, z: -H / 2 + 0.5 + i, ry: -Math.PI / 2 });
    }
    instanceAsset(root, out, theme.platform, plat);
  }
  return true;
}

/**
 * Everything around the playing field: ground, raised slab, perimeter walls, the arena theme's own
 * scenery (parked buses or market stalls...), bunting, the entrance board and a living crowd.
 * Walls on the camera side are kept low so no tile is hidden.
 */
export function createBackdrop(layout: Layout, theme: ArenaTheme, crowdSize: number, density = 1): Backdrop {
  const root = new Group();
  // Static scenery is collected here and baked into a handful of meshes at the end.
  const statics = new Group();
  const W = layout.width;
  const H = layout.height;
  const disposables: { dispose(): void }[] = [];

  // ground + slab
  const ground = new Mesh(new PlaneGeometry(140, 110), mat(theme.ground, { roughness: 1, flat: false }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.31;
  ground.receiveShadow = true;
  statics.add(ground);
  statics.add(
    box(
      W + 1.6,
      0.3,
      H + 1.6,
      mat(theme.slab, { map: concreteTexture(), flat: false, roughness: 1 }),
      0,
      -0.16,
      0,
    ),
  );

  // perimeter: modelled wall segments, corner posts and spectator platforms, else the procedural walls
  const instanced: InstancedMesh[] = [];
  const modelledPerimeter = addModelledPerimeter(root, instanced, W, H, theme);
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

  // the theme's own surroundings
  const rng = artRng(404);
  const ctx: DressContext = {
    layout,
    root,
    statics,
    rng,
    density,
    instance: (id: string, placements: Placement[]) => {
      if (assets.has(id)) instanceAsset(root, instanced, id, placements);
    },
    track: (d) => disposables.push(d),
  };
  theme.dress(ctx);

  // Bunting along the back wall, and the entrance signboard.
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
    // strung high over the back crowd (not across the wall face)
    fm.makeTranslation(x, 2.75 - sag, -H / 2 - 1.5);
    flags.setMatrixAt(n, fm);
    flags.setColorAt(n, flagColor.setHex(theme.bunting[n % theme.bunting.length]!));
  }
  root.add(flags);
  const signMat = new MeshBasicMaterial({
    map: labelTexture(
      theme.sign.text,
      theme.sign.color,
      'bold 30px system-ui, sans-serif',
      theme.sign.background,
    ),
    transparent: true,
  });
  const sign = new Mesh(new PlaneGeometry(4.2, 1.5), signMat);
  sign.position.set(-W / 2 + 3.2, 2.55, -H / 2 - 2.9);
  sign.rotation.x = -0.35;
  root.add(sign);

  const glbCrowd = createGlbCrowd(layout, crowdSize, rng, !!theme.platform && assets.has(theme.platform));
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
