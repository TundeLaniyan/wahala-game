import type { InstancedMesh } from 'three';
import { Group, Mesh, PlaneGeometry } from 'three';
import type { Layout } from '../coords';
import { arenaLook } from '../arenaLook';
import { artRng, concreteTexture, hazardStripes } from '../textures';
import type { QualityProfile } from '../quality';
import { AmbientFx } from '../fx/Ambient';
import { StreetLife } from '../life/StreetLife';
import { arenaSet } from '../arenas';
import { createSetContext, instanceParts } from '../arenas/common';
import type { Placement } from '../arenas/common';
import { box, mat } from './helpers';
import { createGlbCrowd } from './crowd';
import { assets } from './library';
import { bakeModel } from './merge';

export interface Backdrop {
  root: Group;
  /** Animates the crowd, street life and atmosphere; call every frame. */
  update(time: number, excitement: number, dt: number): void;
  setPixelScale(scale: number): void;
  dispose(): void;
}

/**
 * Walls (north/east/west tall enough to read, south kept low so no tile is hidden), corner posts and
 * spectator platforms from the modelled set. Returns false when the models are not loaded.
 */
function addModelledPerimeter(
  root: Group,
  statics: Group,
  out: InstancedMesh[],
  W: number,
  H: number,
  platforms: boolean,
): boolean {
  // env_wall_d carries a flat painted cartoon Danfo mural: not used, so the only Danfos in the
  // scene are the modelled ones.
  const wallIds = assets
    .loadedIds('env_wall')
    .filter((id) => id !== 'env_wall_corner' && id !== 'env_wall_d');
  if (wallIds.length === 0 || !assets.has('env_wall_corner')) return false;
  const T = 0.155; // half wall thickness
  const byVariant = wallIds.map(() => [] as Placement[]);
  let k = 0;
  const wall = (x: number, z: number, ry: number, sy = 1): void => {
    byVariant[k++ % wallIds.length]!.push({ x, z, ry, sy });
  };
  for (let i = 0; i < W; i++) {
    wall(-W / 2 + 0.5 + i, -H / 2 - T, 0, 1.05);
    // South wall: leave the center 3 tiles for the hazard-striped compound gate
    if (i < 6 || i > 8) wall(-W / 2 + 0.5 + i, H / 2 + T, Math.PI, 0.54);
  }
  for (let i = 0; i < H; i++) {
    const sy = i > H - 2 ? 0.56 : i > H - 3 ? 0.78 : 1.02; // step down towards the camera side
    wall(W / 2 + T, -H / 2 + 0.5 + i, -Math.PI / 2, sy);
    wall(-W / 2 - T, -H / 2 + 0.5 + i, Math.PI / 2, sy);
  }
  wallIds.forEach((id, n) => instanceParts(root, out, id, byVariant[n]!));

  // centre south compound gate: worn hazard stripes and a steel frame
  const gateTex = hazardStripes();
  gateTex.repeat.set(3, 1);
  const gateMat = mat(0xb8b0a0, { map: gateTex, flat: false, roughness: 0.75 });
  const steelMat = mat(0x5c5a56, { roughness: 0.55, metalness: 0.6 });
  statics.add(box(2.96, 0.48, 0.22, gateMat, 0, 0.24, H / 2 + T));
  statics.add(box(3.04, 0.06, 0.26, steelMat, 0, 0.5, H / 2 + T));

  const cx = W / 2 + T;
  const cz = H / 2 + T;
  const posts: Placement[] = [
    { x: -cx, z: -cz, ry: 0, sy: 1.06 },
    { x: cx, z: -cz, ry: 0, sy: 1.06 },
    { x: -cx, z: cz, ry: 0, sy: 0.58 },
    { x: cx, z: cz, ry: 0, sy: 0.58 },
    { x: -1.55, z: cz, ry: Math.PI, sy: 0.62 },
    { x: 1.55, z: cz, ry: Math.PI, sy: 0.62 },
  ];
  for (let i = 3; i < W - 1; i += 3) posts.push({ x: -W / 2 + i, z: -cz, ry: 0, sy: 1.05 });
  for (let i = 3; i < H - 2; i += 3) {
    posts.push({ x: -cx, z: -H / 2 + i, ry: Math.PI / 2 });
    posts.push({ x: cx, z: -H / 2 + i, ry: -Math.PI / 2 });
  }
  for (let i = 3; i < W - 1; i += 3) {
    if (Math.abs(-W / 2 + i) > 2) posts.push({ x: -W / 2 + i, z: cz, ry: Math.PI, sy: 0.56 });
  }
  instanceParts(root, out, 'env_wall_corner', posts);
  if (platforms && assets.has('env_bleacher')) {
    const off = T * 2 + 0.26;
    const plat: Placement[] = [];
    for (let i = 0; i < H; i++) {
      plat.push({ x: W / 2 + off, z: -H / 2 + 0.5 + i, ry: Math.PI / 2 });
      plat.push({ x: -W / 2 - off, z: -H / 2 + 0.5 + i, ry: -Math.PI / 2 });
    }
    instanceParts(root, out, 'env_bleacher', plat);
  }
  return true;
}

/** Procedural perimeter used when the modelled walls are missing. */
function addProceduralPerimeter(statics: Group, W: number, H: number): void {
  const wallMat = mat(0x8e877c, { map: concreteTexture(), flat: false, roughness: 1 });
  const thick = 0.55;
  statics.add(box(W + thick * 2, 0.8, thick, wallMat, 0, 0.4, -H / 2 - thick / 2));
  statics.add(box(thick, 0.55, H, wallMat, W / 2 + thick / 2, 0.275, 0));
  statics.add(box(thick, 0.55, H, wallMat, -W / 2 - thick / 2, 0.275, 0));
  statics.add(box(W + thick * 2, 0.2, thick, wallMat, 0, 0.1, H / 2 + thick / 2));
}

/**
 * Everything around the playing field: street ground, the raised arena slab and perimeter walls
 * (shared), the spectator crowd, and the arena's own set (src/render/arenas): buildings,
 * vehicles, stalls or machinery, living background activity and atmosphere.
 */
export function createBackdrop(layout: Layout, quality: QualityProfile, arenaId = 'danfoBusPark'): Backdrop {
  const root = new Group();
  const statics = new Group();
  const W = layout.width;
  const H = layout.height;
  const disposables: { dispose(): void }[] = [];
  const instanced: InstancedMesh[] = [];
  const look = arenaLook(arenaId);
  const set = arenaSet(arenaId);
  const rng = artRng(404);

  const ground = new Mesh(new PlaneGeometry(140, 110), mat(look.street, { roughness: 1, flat: false }));
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
  if (!addModelledPerimeter(root, statics, instanced, W, H, set.crowdEdges.east || set.crowdEdges.west))
    addProceduralPerimeter(statics, W, H);

  const ambient = new AmbientFx({
    density: quality.particleDensity,
    lights: quality.flameLights > 0 ? 2 : 0,
  });
  const life = new StreetLife(quality.level === 'high' ? 16 : quality.level === 'medium' ? 10 : 4);
  root.add(ambient.group, life.group);
  set.build(createSetContext({ W, H, root, statics, rng, quality, life, ambient, instanced, disposables }));

  const crowd = createGlbCrowd(layout, Math.round(quality.crowd * set.crowd), rng, set.crowdEdges);
  if (crowd) {
    crowd.group.userData.grit = 'crowd';
    root.add(crowd.group);
  }
  root.add(bakeModel(statics));

  return {
    root,
    update(time, excitement, dt) {
      crowd?.update(time, excitement);
      life.update(dt, time, excitement);
      ambient.update(dt, time);
    },
    setPixelScale: (s) => ambient.setPixelScale(s),
    dispose() {
      crowd?.dispose();
      life.dispose();
      ambient.dispose();
      for (const im of instanced) im.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}
