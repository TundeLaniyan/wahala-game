import {
  ConeGeometry,
  CylinderGeometry,
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
import { arenaLook } from '../arenaLook';
import {
  artRng,
  concreteTexture,
  hazardStripes,
  labelTexture,
  wallTexture,
  windowsTexture,
} from '../textures';
import { box, cyl, mat } from './helpers';
import { addLekkiSite, addMarketCanopies, addSouthKerb } from './arenaSets';
import { createGlbCrowd } from './crowd';
import { assets } from './library';
import { bakeModel } from './merge';
import { createVehicleModel } from './vehicles';

/** Parked buses are drawn large and iconic so the Danfo fleet frames the Lagos arena. */
const PARKED_BUS_SCALE = 1.48;

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
function addModelledPerimeter(root: Group, statics: Group, out: InstancedMesh[], W: number, H: number): boolean {
  const wallIds = assets.loadedIds('env_wall').filter((id) => id !== 'env_wall_corner');
  if (wallIds.length === 0 || !assets.has('env_wall_corner')) return false;
  const T = 0.155; // half wall thickness
  const byVariant = wallIds.map(() => [] as Placement[]);
  let k = 0;
  const wall = (x: number, z: number, ry: number, sy = 1): void => {
    byVariant[k++ % wallIds.length]!.push({ x, z, ry, sy });
  };
  for (let i = 0; i < W; i++) {
    wall(-W / 2 + 0.5 + i, -H / 2 - T, 0, 1.05);
    // South wall: leave the center 3 tiles for the yellow/black hazard-striped compound gate
    if (i < 6 || i > 8) {
      wall(-W / 2 + 0.5 + i, H / 2 + T, Math.PI, 0.54);
    }
  }
  for (let i = 0; i < H; i++) {
    const sy = i > H - 2 ? 0.56 : i > H - 3 ? 0.78 : 1.02; // step down towards the camera side
    wall(W / 2 + T, -H / 2 + 0.5 + i, -Math.PI / 2, sy);
    wall(-W / 2 - T, -H / 2 + 0.5 + i, Math.PI / 2, sy);
  }
  wallIds.forEach((id, n) => instanceAsset(root, out, id, byVariant[n]!));

  // Center south compound gate with yellow/black diagonal hazard stripes & steel frame
  const gateTex = hazardStripes();
  gateTex.repeat.set(3, 1);
  const gateMat = mat(0xffffff, { map: gateTex, flat: false, roughness: 0.55 });
  const steelMat = mat(0x8a8f96, { roughness: 0.4, metalness: 0.6 });
  statics.add(box(2.96, 0.48, 0.22, gateMat, 0, 0.24, H / 2 + T));
  statics.add(box(3.04, 0.06, 0.26, steelMat, 0, 0.5, H / 2 + T));

  const cx = W / 2 + T;
  const cz = H / 2 + T;
  const posts: Placement[] = [
    { x: -cx, z: -cz, ry: 0, sy: 1.06 },
    { x: cx, z: -cz, ry: 0, sy: 1.06 },
    { x: -cx, z: cz, ry: 0, sy: 0.58 },
    { x: cx, z: cz, ry: 0, sy: 0.58 },
    // Gate posts flanking the center south hazard gate
    { x: -1.55, z: cz, ry: Math.PI, sy: 0.62 },
    { x: 1.55, z: cz, ry: Math.PI, sy: 0.62 },
  ];
  // intermediate pilasters every few panels break up the long runs (precast wall rhythm)
  for (let i = 3; i < W - 1; i += 3) posts.push({ x: -W / 2 + i, z: -cz, ry: 0, sy: 1.05 });
  for (let i = 3; i < H - 2; i += 3) {
    posts.push({ x: -cx, z: -H / 2 + i, ry: Math.PI / 2 });
    posts.push({ x: cx, z: -H / 2 + i, ry: -Math.PI / 2 });
  }
  for (let i = 3; i < W - 1; i += 3) {
    if (Math.abs(-W / 2 + i) > 2) posts.push({ x: -W / 2 + i, z: cz, ry: Math.PI, sy: 0.56 });
  }
  instanceAsset(root, out, 'env_wall_corner', posts);
  if (assets.has('env_bleacher')) {
    const off = T * 2 + 0.26;
    const plat: Placement[] = [];
    // Side spectator railings along the East and West walkways (North stays open for parked Danfos)
    for (let i = 0; i < H; i++) {
      plat.push({ x: W / 2 + off, z: -H / 2 + 0.5 + i, ry: Math.PI / 2 });
      plat.push({ x: -W / 2 - off, z: -H / 2 + 0.5 + i, ry: -Math.PI / 2 });
    }
    instanceAsset(root, out, 'env_bleacher', plat);
  }
  return true;
}

/**
 * Builds Balogun Market stalls: Ankara fabric racks, multi-striped market umbrellas,
 * bukka cooking pots, and stacked colourful plastic basins (matching z3d4z2z3d4z2z3d4 (1),(2),(7).jpeg).
 */
function addBalogunMarketDressing(
  root: Group,
  statics: Group,
  instanced: InstancedMesh[],
  W: number,
  H: number,
): void {
  const woodMat = mat(0x7c522b, { roughness: 0.85 });
  const poleMat = mat(0xc4c8ce, { roughness: 0.4, metalness: 0.5 });
  const potMat = mat(0x282a2e, { roughness: 0.45, metalness: 0.6 });
  const ankaraColors = [0xe63946, 0xffbe0b, 0x1d6fe0, 0x12964f, 0x8338ec, 0xfb5607, 0xff4f9a];
  const canopyPalettes: [number, number][] = [
    [0xe63946, 0xffbe0b],
    [0x1d6fe0, 0xf8f9fa],
    [0x12964f, 0xffbe0b],
    [0x8338ec, 0xfb5607],
    [0xd62828, 0xf8f9fa],
  ];

  const addUmbrella = (x: number, z: number, idx: number, scale = 1.0): void => {
    const [c1, c2] = canopyPalettes[idx % canopyPalettes.length]!;
    statics.add(cyl(0.03 * scale, 0.035 * scale, 2.25 * scale, poleMat, x, 1.12 * scale, z, 8));
    const cone = new Mesh(
      new ConeGeometry(1.18 * scale, 0.46 * scale, 8),
      mat(c1, { roughness: 0.75 }),
    );
    cone.position.set(x, 2.22 * scale, z);
    cone.rotation.y = (idx * 0.4) % Math.PI;
    statics.add(cone);
    const cap = new Mesh(
      new ConeGeometry(0.68 * scale, 0.28 * scale, 8),
      mat(c2, { roughness: 0.75 }),
    );
    cap.position.set(x, 2.34 * scale, z);
    cap.rotation.y = cone.rotation.y + Math.PI / 8;
    statics.add(cap);
    // Valance trim ring
    statics.add(cyl(1.16 * scale, 1.18 * scale, 0.09 * scale, mat(c2, { roughness: 0.8 }), x, 1.97 * scale, z, 8));
  };

  const addAnkaraStall = (x: number, z: number, ry: number, idx: number): void => {
    const g = new Group();
    // Wooden counter table + overhead fabric hanging rack
    g.add(box(2.1, 0.72, 0.85, woodMat, 0, 0.36, 0));
    g.add(box(2.2, 0.06, 0.92, mat(ankaraColors[idx % ankaraColors.length]!, { roughness: 0.8 }), 0, 0.74, 0));
    for (const sx of [-0.96, 0.96]) {
      g.add(box(0.07, 1.95, 0.07, woodMat, sx, 0.98, -0.32));
    }
    g.add(box(2.1, 0.07, 0.07, woodMat, 0, 1.92, -0.32));
    // Hanging bolts of patterned Ankara fabric & folded cloth stacks on table
    for (let k = 0; k < 5; k++) {
      const fx = -0.76 + k * 0.38;
      const colA = ankaraColors[(idx + k) % ankaraColors.length]!;
      const colB = ankaraColors[(idx + k + 2) % ankaraColors.length]!;
      g.add(box(0.28, 0.82, 0.05, mat(colA, { roughness: 0.75 }), fx, 1.44, -0.32));
      g.add(box(0.24, 0.24, 0.06, mat(colB, { roughness: 0.75 }), fx, 1.44, -0.32));
      // Folded fabric stacks on counter
      g.add(box(0.32, 0.14, 0.42, mat(colB, { roughness: 0.8 }), fx, 0.83, 0.08));
      g.add(box(0.28, 0.11, 0.36, mat(colA, { roughness: 0.8 }), fx, 0.95, 0.08));
    }
    // Stacked plastic market basins beside the stall
    for (let b = 0; b < 3; b++) {
      const bCol = ankaraColors[(idx + b * 2) % ankaraColors.length]!;
      g.add(cyl(0.28 - b * 0.02, 0.20, 0.16, mat(bCol, { roughness: 0.4 }), 1.28, 0.08 + b * 0.14, 0.15, 12));
    }
    // Bukka cooking pot on the opposite side
    g.add(cyl(0.24, 0.22, 0.32, potMat, -1.28, 0.16, 0.15, 12));
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    statics.add(g);
  };

  // Line the north, east, and west market walkways with Ankara stalls and colourful market umbrellas
  const stallX = [-W / 2 + 1.8, -2.6, 2.6, W / 2 - 1.8];
  stallX.forEach((x, i) => {
    addAnkaraStall(x, -H / 2 - 2.35, 0, i);
    addUmbrella(x + 0.85, -H / 2 - 2.05, i, 1.05);
  });
  for (let i = 0; i < 3; i++) {
    const z = -H / 2 + 1.8 + i * 3.4;
    addAnkaraStall(W / 2 + 2.35, z, -Math.PI / 2, i + 4);
    addUmbrella(W / 2 + 2.0, z - 0.7, i + 1, 1.0);
    addAnkaraStall(-W / 2 - 2.35, z, Math.PI / 2, i + 2);
    addUmbrella(-W / 2 - 2.0, z + 0.7, i + 3, 1.0);
  }
  // Extra umbrellas at the corners & south market entrance
  addUmbrella(-W / 2 - 1.7, H / 2 + 1.6, 0, 0.9);
  addUmbrella(W / 2 + 1.7, H / 2 + 1.6, 2, 0.9);

  // Market sacks, bottle crates, and water cartons clustered around the stalls
  instanceAsset(root, instanced, 'prop_soft_sacks', [
    { x: -W / 2 + 4.2, z: -H / 2 - 2.0, ry: 0.3 },
    { x: 0.0, z: -H / 2 - 2.1, ry: -0.2 },
    { x: W / 2 - 4.2, z: -H / 2 - 2.0, ry: 0.8 },
    { x: -W / 2 - 1.8, z: H / 2 + 2.2, ry: 0.4 },
    { x: W / 2 + 1.8, z: H / 2 + 2.2, ry: -0.5 },
  ]);
  instanceAsset(root, instanced, 'prop_soft_kegs', [
    { x: -W / 2 + 0.4, z: -H / 2 - 1.9, ry: 0.2 },
    { x: W / 2 - 0.4, z: -H / 2 - 1.9, ry: -0.4 },
  ]);

  // Iconic "BALOGUN MARKET * LAGOS ISLAND" archway banner over the north market row
  const archX = 0;
  const archZ = -H / 2 - 2.85;
  const archMat = mat(0xb81d2a, { roughness: 0.45, metalness: 0.2 });
  const goldTrim = mat(0xf6c218, { roughness: 0.4, metalness: 0.3 });
  for (const sx of [-2.4, 2.4]) {
    statics.add(box(0.12, 2.65, 0.12, archMat, archX + sx, 1.32, archZ));
    statics.add(box(0.2, 0.3, 0.2, goldTrim, archX + sx, 0.15, archZ));
  }
  statics.add(box(5.2, 0.18, 0.22, goldTrim, archX, 2.65, archZ));
  const signMat = new MeshBasicMaterial({
    map: labelTexture('BALOGUN MARKET', '#ffd628', 'bold 34px system-ui, sans-serif', '#7a0e18'),
    transparent: true,
  });
  const sign = new Mesh(new PlaneGeometry(4.4, 0.68), signMat);
  sign.position.set(archX, 2.68, archZ + 0.14);
  sign.rotation.x = -0.18;
  root.add(sign);
}

/**
 * Everything around the playing field: raised slab, perimeter walls, parked vehicles, buildings and
 * a cheering crowd. Walls on the camera side are kept low so no tile is hidden.
 */
export function createBackdrop(
  layout: Layout,
  crowdSize: number,
  busFraction = 1,
  arenaId = 'danfoBusPark',
): Backdrop {
  const root = new Group();
  // Static scenery is collected here and baked into a handful of meshes at the end.
  const statics = new Group();
  const W = layout.width;
  const H = layout.height;
  const disposables: { dispose(): void }[] = [];
  const isMarket = arenaId === 'balogunMarket';
  const isRoadworks = arenaId === 'lekkiRoadworks';

  // ground + raised arena slab
  const look = arenaLook(arenaId);
  const groundColor = look.street;
  const ground = new Mesh(new PlaneGeometry(140, 110), mat(groundColor, { roughness: 1, flat: false }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.31;
  ground.receiveShadow = true;
  statics.add(ground);
  statics.add(
    box(
      W + 1.6,
      0.3,
      H + 1.6,
      mat(look.slab, { map: concreteTexture(), flat: false, roughness: 1 }),
      0,
      -0.16,
      0,
    ),
  );

  // perimeter: modelled wall segments, corner posts and spectator platforms, else the procedural walls
  const instanced: InstancedMesh[] = [];
  const modelledPerimeter = addModelledPerimeter(root, statics, instanced, W, H);
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

  // parked vehicles around the perimeter:
  // - danfoBusPark: fleets of parked yellow Danfos
  // - balogunMarket: Keke Napeps and Danfos parked outside the market stalls
  // - lekkiRoadworks: LagRide Taxis, Keke Napeps, and Danfos held at the roadworks perimeter
  const rng = artRng(404);
  const busSpots: { x: number; z: number; ry: number }[] = [];
  const place = (x: number, z: number, ry: number): void => {
    busSpots.push({ x, z, ry });
  };
  if (isMarket) {
    place(-4.2, -H / 2 - 1.95, 0.04);
    place(4.2, -H / 2 - 1.95, Math.PI - 0.04);
    place(W / 2 + 3.1, -H / 2 + 1.6, -Math.PI * 0.66);
    place(-W / 2 - 3.1, -H / 2 + 1.6, -Math.PI * 0.34);
    place(W / 2 - 2.8, H / 2 + 2.15, Math.PI + 0.06);
    instanceAsset(root, instanced, 'veh_keke', [
      { x: -W / 2 + 2.8, z: H / 2 + 1.95, ry: Math.PI * 0.85, sx: 1.35, sy: 1.35, sz: 1.35 },
      { x: W / 2 + 2.8, z: H / 2 - 1.2, ry: Math.PI / 2, sx: 1.35, sy: 1.35, sz: 1.35 },
      { x: -W / 2 - 2.8, z: H / 2 - 1.2, ry: -Math.PI / 2, sx: 1.35, sy: 1.35, sz: 1.35 },
    ]);
  } else if (isRoadworks) {
    place(-4.2, -H / 2 - 1.95, 0.04);
    place(4.2, -H / 2 - 1.95, Math.PI - 0.04);
    for (let i = 0; i < 3; i++)
      place(W / 2 + 2.65, -H / 2 + 1.6 + i * 3.6, -Math.PI * 0.66 + (rng() - 0.5) * 0.06);
    for (let i = 0; i < 2; i++)
      place(-W / 2 - 2.55, -H / 2 + 2.0 + i * 4.2, -Math.PI * 0.34 + (rng() - 0.5) * 0.06);
    instanceAsset(root, instanced, 'veh_taxi', [
      { x: -W / 2 + 2.8, z: H / 2 + 2.0, ry: Math.PI / 2, sx: 1.35, sy: 1.35, sz: 1.35 },
      { x: W / 2 - 2.8, z: H / 2 + 2.0, ry: -Math.PI / 2, sx: 1.35, sy: 1.35, sz: 1.35 },
      { x: -W / 2 - 2.4, z: H / 2 - 1.8, ry: 0.25, sx: 1.35, sy: 1.35, sz: 1.35 },
    ]);
    instanceAsset(root, instanced, 'veh_keke', [
      { x: 0, z: -H / 2 - 2.0, ry: Math.PI / 2, sx: 1.35, sy: 1.35, sz: 1.35 },
    ]);
  } else {
    // Danfo Bus Park: matches the Gemini reference layout:
    // 1) Two prominent side-profile yellow Danfos flanking the timer behind the north wall
    place(-4.0, -H / 2 - 1.85, 0.03);
    place(4.0, -H / 2 - 1.85, Math.PI - 0.03);
    place(-W / 2 - 1.8, -H / 2 - 1.95, -0.18);
    // 2) Diagonal echelon of 3 large yellow Danfos along the east street behind the crowd railing
    place(W / 2 + 2.65, -H / 2 + 1.8, -Math.PI * 0.66);
    place(W / 2 + 2.75, -H / 2 + 5.3, -Math.PI * 0.68);
    place(W / 2 + 2.85, -H / 2 + 8.8, -Math.PI * 0.64);
    // 3) West street parked Danfos below the 2-story Lagos building
    place(-W / 2 - 2.55, -H / 2 + 2.6, -Math.PI * 0.34);
    place(-W / 2 - 2.45, H / 2 - 2.2, -Math.PI * 0.32);
    // 4) Foreground bottom-right Danfo outside the south compound wall
    place(W / 2 - 2.8, H / 2 + 2.05, Math.PI + 0.06);
  }
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
    let n = isMarket ? 2 : isRoadworks ? 1 : 0;
    const put = (x: number, z: number, ry: number, s = 1.16): void => {
      byVariant[n++ % buildingIds.length]!.push({
        x,
        z,
        ry,
        sx: s,
        sy: s * (1.02 + rng() * 0.16),
        sz: s,
      });
    };
    // North street row of 2-story Lagos buildings framed right behind the parked Danfos (the
    // roadworks has its construction site and the Lekki skyline there instead)
    if (!isRoadworks) {
      for (let x = -W / 2 - 6.5; x <= W / 2 + 6.5; x += 3.6) {
        put(x, -H / 2 - 3.85 - (Math.abs(Math.round(x)) % 2) * 0.25, 0, 1.18);
      }
    }
    // West & East street buildings (West brought closer so its balconies & awnings frame the left edge)
    for (let z = -H / 2 - 2.5; z < H / 2 + 5; z += 3.5) {
      put(-W / 2 - 3.95 - (Math.abs(Math.round(z)) % 2) * 0.2, z, Math.PI / 2, 1.18);
      put(W / 2 + 4.75 + (Math.abs(Math.round(z)) % 2) * 0.2, z, -Math.PI / 2, 1.16);
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

  // street dressing around the lot (kiosks, lamps, utility poles, tyre stacks, barrels, and arena-specific features)
  const dress = (id: string, spots: Placement[]): void => instanceAsset(root, instanced, id, spots);
  dress('env_kiosk', [
    { x: -W / 2 + 2.2, z: -H / 2 - 3.5, ry: 0, sx: 0.85, sy: 0.85, sz: 0.85 },
    { x: W / 2 - 3.2, z: -H / 2 - 3.5, ry: 0, sx: 0.85, sy: 0.85, sz: 0.85 },
    { x: 1.2, z: -H / 2 - 3.6, ry: 0.05, sx: 0.85, sy: 0.85, sz: 0.85 },
    { x: -W / 2 - 3.3, z: H / 2 + 2.6, ry: Math.PI / 2, sx: 0.85, sy: 0.85, sz: 0.85 },
  ]);
  dress('env_shopsign', [
    { x: -W / 2 - 1.2, z: H / 2 + 2.7, ry: 0.35 },
    { x: W / 2 + 1.3, z: H / 2 + 2.5, ry: Math.PI - 0.35 },
    { x: -W / 2 + 5.4, z: -H / 2 - 3.25, ry: 0 },
    { x: W / 2 + 3.1, z: -H / 2 - 2.9, ry: -Math.PI / 2 },
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
    { x: -W / 2 - 0.95, z: H / 2 + 0.85, ry: 0.5, sx: 1.15, sy: 1.15, sz: 1.15 },
    { x: W / 2 + 0.95, z: H / 2 + 0.85, ry: -0.4, sx: 1.15, sy: 1.15, sz: 1.15 },
    { x: -W / 2 - 1.4, z: H / 2 + 1.9, ry: 0.5 },
    { x: W / 2 + 1.5, z: H / 2 + 1.8, ry: -0.4 },
    { x: -W / 2 - 0.95, z: -H / 2 - 0.85, ry: 0.2, sx: 1.1, sy: 1.1, sz: 1.1 },
    { x: W / 2 + 0.95, z: -H / 2 - 0.85, ry: 2.2, sx: 1.1, sy: 1.1, sz: 1.1 },
  ]);
  dress('env_barrel', [
    { x: -W / 2 + 4.0, z: H / 2 + 1.7, ry: 0.3 },
    { x: W / 2 - 5.0, z: -H / 2 - 2.4, ry: 2.0 },
  ]);

  addSouthKerb(statics, W, H, arenaId);
  if (isMarket) {
    addBalogunMarketDressing(root, statics, instanced, W, H);
    addMarketCanopies(statics, W, H);
  } else if (isRoadworks) {
    addLekkiSite(root, statics, W, H);
    // Lekki Roadworks perimeter: roadwork barricades, asphalt barrels, and "LEKKI ROADWORKS" gantry sign
    dress('prop_soft_barrier', [
      { x: -W / 2 + 1.6, z: -H / 2 - 1.85, ry: 0.1 },
      { x: -1.8, z: -H / 2 - 1.85, ry: -0.08 },
      { x: 1.8, z: -H / 2 - 1.85, ry: 0.08 },
      { x: W / 2 - 1.6, z: -H / 2 - 1.85, ry: -0.1 },
      { x: -W / 2 - 1.8, z: H / 2 + 1.5, ry: 0.4 },
      { x: W / 2 + 1.8, z: H / 2 + 1.5, ry: -0.4 },
    ]);
    dress('env_barrel', [
      { x: -W / 2 - 2.1, z: -1.2, ry: 0.6 },
      { x: W / 2 + 2.1, z: 1.2, ry: 1.4 },
      { x: 0, z: -H / 2 - 2.2, ry: 0.9 },
    ]);
    const signX = 0;
    const signZ = -H / 2 - 2.85;
    const yellowMetal = mat(0xf6be18, { roughness: 0.42, metalness: 0.22 });
    const darkSteel = mat(0x181a1e, { roughness: 0.5, metalness: 0.5 });
    for (const sx of [-2.1, 2.1]) {
      statics.add(box(0.1, 2.45, 0.1, darkSteel, signX + sx, 1.22, signZ));
      statics.add(box(0.22, 0.35, 0.22, yellowMetal, signX + sx, 0.18, signZ));
    }
    statics.add(box(4.6, 0.16, 0.18, yellowMetal, signX, 2.45, signZ));
    const signMat = new MeshBasicMaterial({
      map: labelTexture('LEKKI ROADWORKS', '#16181c', 'bold 32px system-ui, sans-serif', '#ffc61a'),
      transparent: true,
    });
    const sign = new Mesh(new PlaneGeometry(4.1, 0.64), signMat);
    sign.position.set(signX, 2.48, signZ + 0.12);
    sign.rotation.x = -0.2;
    root.add(sign);
  } else {
    // Iconic yellow "OJUELEGBA" Lagos bus stop shelter + signboard centered between the two north Danfos
    const shelterX = 0;
    const shelterZ = -H / 2 - 2.35;
    const yellowMetal = mat(0xf6be18, { roughness: 0.42, metalness: 0.22 });
    const darkSteel = mat(0x181a1e, { roughness: 0.5, metalness: 0.5 });
    for (const sx of [-1.85, 1.85]) {
      for (const sz of [-0.45, 0.45]) {
        statics.add(box(0.08, 2.25, 0.08, yellowMetal, shelterX + sx, 1.1, shelterZ + sz));
        statics.add(box(0.14, 0.25, 0.14, darkSteel, shelterX + sx, 0.12, shelterZ + sz));
      }
    }
    statics.add(box(4.1, 0.14, 1.35, yellowMetal, shelterX, 2.25, shelterZ));
    statics.add(box(3.9, 0.10, 0.95, yellowMetal, shelterX, 2.34, shelterZ));
    statics.add(box(3.6, 1.1, 0.06, darkSteel, shelterX, 1.15, shelterZ - 0.44));
    statics.add(box(3.2, 0.07, 0.36, yellowMetal, shelterX, 0.52, shelterZ - 0.15));
    const signMat = new MeshBasicMaterial({
      map: labelTexture('OJUELEGBA', '#ffc61a', 'bold 34px system-ui, sans-serif', '#16181c'),
      transparent: true,
    });
    const sign = new Mesh(new PlaneGeometry(3.4, 0.62), signMat);
    sign.position.set(shelterX, 2.52, shelterZ + 0.55);
    sign.rotation.x = -0.22;
    root.add(sign);
  }

  // A working site draws a thinner crowd than the bus park or the market.
  const glbCrowd = createGlbCrowd(layout, isRoadworks ? Math.round(crowdSize * 0.55) : crowdSize, rng);
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
