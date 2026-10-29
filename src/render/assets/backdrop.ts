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
  /** Live quality change: thins the crowd, street life and atmosphere, sets the animation stride. */
  setQuality(profile: QualityProfile): void;
  dispose(): void;
}

/**
 * Perimeter wall sizing (scales of the 1.5 m `env_wall` model and the 1.85 m `env_wall_corner` pier).
 * North: ~1.6 m, a real boundary behind the far row; east/west 1.5 m stepping down over the last two
 * rows towards the camera; south: the low barrier (0.42 m) so the nearest row is not hidden.
 */
export const WALL = {
  halfThickness: 0.2,
  lowHalfDepth: 0.25,
  north: 1.08,
  side: 1,
  southFallback: 0.3,
  post: 1,
  postSouth: 0.34,
} as const;

/** Height scale of the side-wall panel next to row `i` (0 = north): steps down near the camera. */
export function sideWallScale(i: number, H: number): number {
  return i > H - 2 ? 0.46 : i > H - 3 ? 0.7 : WALL.side;
}

/**
 * The perimeter: heavy precast walls (1.5 m panels, 0.4 m thick) on the north, east and west, stepping
 * down towards the camera on the last two side rows; the south (camera-side) run is the low, thick
 * `env_wall_low` barrier so the nearest row stays visible; massive piers between panels; spectator
 * kerbs. Returns false when the models are not loaded (procedural fallback).
 */
function addModelledPerimeter(
  root: Group,
  statics: Group,
  out: InstancedMesh[],
  W: number,
  H: number,
  platforms: boolean,
): boolean {
  const wallIds = assets
    .loadedIds('env_wall')
    .filter((id) => id !== 'env_wall_corner' && id !== 'env_wall_low' && id !== 'env_wall_d');
  if (wallIds.length === 0 || !assets.has('env_wall_corner')) return false;
  const T = WALL.halfThickness;
  const byVariant = wallIds.map(() => [] as Placement[]);
  let k = 0;
  const wall = (x: number, z: number, ry: number, sy = 1): void => {
    byVariant[k++ % wallIds.length]!.push({ x, z, ry, sy });
  };
  const low: Placement[] = [];
  for (let i = 0; i < W; i++) {
    wall(-W / 2 + 0.5 + i, -H / 2 - T, 0, WALL.north);
    // South wall: leave the center 3 tiles for the hazard-striped compound gate
    if (i < 6 || i > 8) {
      if (assets.has('env_wall_low'))
        low.push({ x: -W / 2 + 0.5 + i, z: H / 2 + WALL.lowHalfDepth, ry: Math.PI });
      else wall(-W / 2 + 0.5 + i, H / 2 + T, Math.PI, WALL.southFallback);
    }
  }
  for (let i = 0; i < H; i++) {
    const sy = sideWallScale(i, H);
    wall(W / 2 + T, -H / 2 + 0.5 + i, -Math.PI / 2, sy);
    wall(-W / 2 - T, -H / 2 + 0.5 + i, Math.PI / 2, sy);
  }
  wallIds.forEach((id, n) => instanceParts(root, out, id, byVariant[n]!));
  instanceParts(root, out, 'env_wall_low', low);

  // centre south compound gate: a heavy steel gate frame with worn hazard stripes, as low as the barrier
  const gateTex = hazardStripes();
  gateTex.repeat.set(3, 1);
  const gateMat = mat(0xb8b0a0, { map: gateTex, flat: false, roughness: 0.75 });
  const steelMat = mat(0x5c5a56, { roughness: 0.55, metalness: 0.6 });
  statics.add(box(2.96, 0.36, 0.3, gateMat, 0, 0.18, H / 2 + 0.2));
  statics.add(box(3.04, 0.07, 0.36, steelMat, 0, 0.395, H / 2 + 0.2));

  const cx = W / 2 + T;
  const cz = H / 2 + T;
  const posts: Placement[] = [
    { x: -cx, z: -cz, ry: 0, sy: WALL.post },
    { x: cx, z: -cz, ry: 0, sy: WALL.post },
    { x: -cx, z: cz, ry: 0, sy: WALL.postSouth },
    { x: cx, z: cz, ry: 0, sy: WALL.postSouth },
    { x: -1.55, z: cz, ry: Math.PI, sy: WALL.postSouth },
    { x: 1.55, z: cz, ry: Math.PI, sy: WALL.postSouth },
  ];
  for (let i = 3; i < W - 1; i += 3) posts.push({ x: -W / 2 + i, z: -cz, ry: 0, sy: WALL.post });
  for (let i = 3; i < H - 2; i += 3) {
    const sy = Math.min(WALL.post, sideWallScale(i, H) * 1.1);
    posts.push({ x: -cx, z: -H / 2 + i, ry: Math.PI / 2, sy });
    posts.push({ x: cx, z: -H / 2 + i, ry: -Math.PI / 2, sy });
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
  const thick = 0.45;
  statics.add(box(W + thick * 2, 1.55, thick, wallMat, 0, 0.775, -H / 2 - thick / 2));
  statics.add(box(thick, 1.4, H, wallMat, W / 2 + thick / 2, 0.7, 0));
  statics.add(box(thick, 1.4, H, wallMat, -W / 2 - thick / 2, 0.7, 0));
  statics.add(box(W + thick * 2, 0.4, thick, wallMat, 0, 0.2, H / 2 + thick / 2));
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
  const life = new StreetLife(quality.streetLife);
  root.add(ambient.group, life.group);
  set.build(createSetContext({ W, H, root, statics, rng, quality, life, ambient, instanced, disposables }));

  const crowd = createGlbCrowd(layout, Math.round(quality.crowd * set.crowd), rng, set.crowdEdges);
  if (crowd) {
    crowd.group.userData.grit = 'crowd';
    root.add(crowd.group);
  }
  root.add(bakeModel(statics));

  // Live quality (adaptive): thin what was built, never add to it (the build used the profile of match start),
  // and update the background animation every Nth frame with the time it missed.
  let stride = quality.animationStride;
  let sinceUpdate = 0;
  let frame = 0;

  return {
    root,
    update(time, excitement, dt) {
      sinceUpdate += dt;
      if (stride > 1 && ++frame % stride !== 0) return;
      crowd?.update(time, excitement);
      life.update(sinceUpdate, time, excitement);
      ambient.update(sinceUpdate, time);
      sinceUpdate = 0;
    },
    setQuality(q) {
      stride = Math.max(1, q.animationStride);
      crowd?.setShare(q.crowd / Math.max(1, quality.crowd));
      life.setShare(q.streetLife / Math.max(1, quality.streetLife));
      ambient.setScale(q.ambient / Math.max(0.01, quality.ambient));
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
