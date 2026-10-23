/**
 * Lekki Roadworks: a night-shift construction zone on the Lekki corridor, nothing like the bus
 * park. North of the arena an excavator digs a service trench while a half-built concrete frame
 * bristling with rebar rises behind its scaffold and debris netting, a tower crane and the lit
 * Lekki towers far beyond. The west street is opened up by a shored trench with red spoil heaps;
 * the east carries the roller on fresh, steaming asphalt, a tar boiler, a drum fire, the site
 * office container and the materials yard. Towable lighting towers and sodium work lamps throw
 * hard light and faint beams through the dust; amber beacons turn and a welder's arc flickers on
 * the frame. Workers in hi-vis dig, haul and argue. No spectators, no shops: a working site.
 */
import { CircleGeometry, Group, MeshStandardMaterial, PlaneGeometry } from 'three';
import type { Object3D, Mesh } from 'three';
import { assets } from '../assets/library';
import { bakeModel } from '../assets/merge';
import { box, cyl, mat, mesh } from '../assets/helpers';
import type { Vignette } from '../life/StreetLife';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import { SiteLights, bar, lampMat, sitePalette, uvScale, v3 } from './roadworksKit';
import { siteGroundTexture } from './roadworksTextures';
import type { SitePalette } from './roadworksKit';
import {
  concreteMixer,
  excavator,
  generatorSet,
  lightTower,
  roller,
  skip,
  tarBoiler,
} from './roadworksMachines';
import {
  barrierLine,
  blockPallet,
  cable,
  cementBags,
  cones,
  heap,
  jerseyLine,
  pipeStack,
  rebarBundle,
  sandbags,
  timberStack,
  wheelbarrow,
} from './roadworksProps';
import {
  concreteFrame,
  hoarding,
  scaffold,
  siteBoard,
  siteOffice,
  skyline,
  towerCrane,
  trench,
} from './roadworksStructures';

/** A sodium work lamp on a steel pole with a short outreach arm (matches the arena's warm lamps). */
function sodiumPole(
  ctx: SetContext,
  P: SitePalette,
  L: SiteLights,
  x: number,
  z: number,
  h: number,
  dir: number,
): void {
  const s = ctx.statics;
  s.add(cyl(0.05, 0.07, h, P.steel, x, STREET + h / 2, z, 6));
  s.add(box(0.3, 0.05, 0.3, P.steel, x, STREET + 0.025, z));
  const hx = x + Math.sin(dir) * 0.45;
  const hz = z + Math.cos(dir) * 0.45;
  s.add(box(0.06, 0.06, 0.06, P.steel, (x + hx) / 2, STREET + h, (z + hz) / 2));
  s.add(box(0.36, 0.12, 0.24, P.black, hx, STREET + h - 0.02, hz));
  s.add(box(0.3, 0.03, 0.2, lampMat(0xffa848, 3), hx, STREET + h - 0.09, hz));
  L.glow(hx, STREET + h - 0.1, hz, 2.2, 0xff9a3a, 0.75);
  L.beam(
    v3(hx, STREET + h - 0.1, hz),
    v3(hx + Math.sin(dir) * 1.2, STREET, hz + Math.cos(dir) * 1.2),
    1.6,
    0xff9a3a,
    0.028,
  );
}

/** A tripod work light: twin halogen heads on a telescopic pole, aimed along `dir`. */
function tripodLamp(
  ctx: SetContext,
  P: SitePalette,
  L: SiteLights,
  x: number,
  z: number,
  dir: number,
  h = 1.9,
): void {
  const s = ctx.statics;
  const top = v3(x, STREET + 1.1, z);
  for (let k = 0; k < 3; k++) {
    const a = dir + (k * Math.PI * 2) / 3 + Math.PI / 3;
    s.add(bar(top, v3(x + Math.sin(a) * 0.5, STREET, z + Math.cos(a) * 0.5), 0.018, P.plant, 4));
  }
  s.add(bar(top, v3(x, STREET + h, z), 0.022, P.tube, 5));
  const fx = Math.sin(dir);
  const fz = Math.cos(dir);
  const px = -fz;
  const pz = fx;
  for (const side of [-0.18, 0.18]) {
    const hx = x + px * side + fx * 0.06;
    const hz = z + pz * side + fz * 0.06;
    const head = box(0.26, 0.2, 0.1, P.black, hx, STREET + h, hz);
    head.rotation.set(0.5, dir, 0, 'YXZ');
    const face = box(
      0.22,
      0.15,
      0.02,
      lampMat(0xfff2dc, 3),
      hx + fx * 0.055,
      STREET + h - 0.02,
      hz + fz * 0.055,
    );
    face.rotation.set(0.5, dir, 0, 'YXZ');
    s.add(head, face);
  }
  L.glow(x + fx * 0.15, STREET + h, z + fz * 0.15, 1.5, 0xfff0d6, 0.85);
}

/** The bare site ground over the street: sand and laterite fill with ruts, and wet hollows. */
function siteGround(ctx: SetContext, P: SitePalette, H: number): void {
  const ground = mesh(
    uvScale(new PlaneGeometry(44, 36), 11, 9),
    mat(0xb4ab9c, { map: siteGroundTexture(), roughness: 0.95, flat: false }),
    0,
    STREET + 0.004,
    -H / 2 + 3.5,
  );
  ground.rotation.x = -Math.PI / 2;
  ctx.statics.add(ground);
  const puddles: [number, number, number, number][] = [
    [-9.3, -4.6, 0.7, 0.4],
    [-11.2, 0.6, 0.9, 0.5],
    [-8.9, 2.6, 0.5, 0.3],
    [9.1, 0.4, 0.8, 0.45],
    [11.6, -6.8, 1.0, 0.5],
    [-3.0, -7.4, 0.9, 0.4],
    [6.8, -7.6, 0.8, 0.35],
    [12.5, 6.2, 0.9, 0.5],
  ];
  for (const [x, z, rx, rz] of puddles) {
    const p = mesh(new CircleGeometry(1, 14), P.water, x, STREET + 0.009, z);
    p.rotation.x = -Math.PI / 2;
    p.scale.set(rx, rz, 1);
    ctx.statics.add(p);
  }
}

/** Hi-vis coveralls for the crew: fluorescent orange or lime, kept vivid (retroreflective at night). */
function dressCrew(actors: Object3D[]): void {
  actors.forEach((a, n) =>
    a.traverse((o) => {
      const m = (o as Mesh).material;
      if (!(m instanceof MeshStandardMaterial) || !m.name.toLowerCase().includes('cloth')) return;
      m.map = null;
      m.color.setHex(n % 3 === 1 ? 0xa8ae26 : 0xc45a18);
      m.roughness = 0.75;
      m.userData.noGrit = true;
      m.needsUpdate = true;
    }),
  );
}

function build(ctx: SetContext): void {
  const { H } = ctx;
  const north = -H / 2;
  const P = sitePalette();
  const L = new SiteLights();
  // the plant is baked on its own and weathered as machinery (less washed out than the scenery)
  const plant = new Group();
  const pctx: SetContext = { ...ctx, statics: plant };

  siteGround(ctx, P, H);

  // ---------------------------------------------------------------- north: the dig and the frame
  // the trench sits beyond the strip the north wall hides from the camera
  trench(ctx, P, 1.2, north - 2.2, 5.2, 0.9, 0, 1);
  // side-on to the camera, swinging a bucket of spoil over the skip in the north-west corner
  excavator(pctx, P, L, { x: -3.9, z: north - 4.1, ry: -Math.PI / 2 + 0.12 }, 0.15, 'load');
  concreteFrame(ctx, P, L, { x: 5.4, z: north - 5.3, ry: 0 }, 7.0, 2.6);
  scaffold(ctx, P, 5.4, north - 4.1, 7.0, 1.0, 2, 0, 0.35);
  pipeStack(ctx, P, -1.0, north - 2.3, Math.PI / 2 + 0.08);
  blockPallet(ctx, P, 3.6, north - 2.75, 0.1);
  blockPallet(ctx, P, 4.75, north - 2.7, -0.05, 0.6);
  wheelbarrow(ctx, P, 3.9, north - 1.75, 2.4);
  siteBoard(ctx, P, -6.6, north - 1.9, 0.2);

  // north-west corner: lighting tower, generator, skip
  const nwLamp = lightTower(pctx, P, L, -11.2, north - 1.5, v3(-4, 0, 1), 4.6);
  const gen = generatorSet(pctx, P, L, { x: -12.9, z: north - 3.3, ry: 0.35 });
  cable(ctx, P, [
    [gen.x, gen.z],
    [-11.9, north - 2.2],
    [-11.2, north - 1.5],
  ]);
  skip(pctx, P, { x: -9.5, z: north - 3.0, ry: 0.12 });
  sodiumPole(ctx, P, L, -8.5, north - 1.3, 3.3, 2.6);

  // north-east corner: the mixer by its sand and gravel, cement under a tarp
  concreteMixer(pctx, P, { x: 10.0, z: north - 1.6, ry: -1.9 });
  heap(ctx, P.sand, 11.4, north - 3.0, 1.3, 1.0, 2);
  heap(ctx, P.gravel, 12.8, north - 1.3, 1.0, 0.75, 5);
  cementBags(ctx, P, 9.3, north - 3.3, 0.3);
  sodiumPole(ctx, P, L, 9.4, north - 2.4, 3.3, -2.6);
  wheelbarrow(ctx, P, 9.0, north - 1.2, -0.6, false);

  // further north: the crane, more frame, the Lekki towers
  towerCrane(ctx, P, L, -6.5, north - 11, -0.35);
  skyline(ctx, P, north);

  // ---------------------------------------------------------------- west: the opened-up street
  trench(ctx, P, -9.9, -1.0, 7.0, 0.8, Math.PI / 2, 2);
  scaffold(ctx, P, -12.6, -4.0, 8.0, 1.0, 2, Math.PI / 2, 0.2);
  concreteFrame(ctx, P, L, { x: -14.3, z: -4.0, ry: Math.PI / 2 }, 8.0, 2.6);
  hoarding(ctx, P, -11.8, 1.2, -11.8, 5.6, 2.1, 0x2c4258, 3);
  tarBoiler(pctx, P, L, { x: -9.4, z: 3.5, ry: 0.4 });
  rebarBundle(ctx, P, -11.0, 3.8, 0.08, 4.0);
  timberStack(ctx, P, -10.9, -6.0, 0.1, true);

  // ---------------------------------------------------------------- east: asphalt, yard, office
  const asphalt = box(2.3, 0.02, 8.5, P.asphalt, 10.0, STREET + 0.01, -1.5);
  ctx.statics.add(asphalt);
  roller(pctx, P, L, { x: 10.0, z: -2.8, ry: 0.06 });
  lightTower(pctx, P, L, 11.6, 0.4, v3(7, 0, -2), 4.6, false);
  siteOffice(ctx, P, L, 13.2, 3.4, -Math.PI / 2);
  rebarBundle(ctx, P, 12.3, -4.4, -0.06, 4.4, 20);
  blockPallet(ctx, P, 12.2, -1.6, 0.2);
  skip(pctx, P, { x: 9.2, z: 3.9, ry: 0.15 }, P.olive);
  hoarding(ctx, P, 14.4, -9.5, 14.4, 5.6, 2.2, 0x3c4c40, 7);
  jerseyLine(ctx, P, 8.85, 1.8, 8.85, 5.2);

  // ---------------------------------------------------------------- south (camera) sliver: low only
  cones(
    ctx,
    P,
    [
      [-8.6, H / 2 + 1.0],
      [-6.2, H / 2 + 1.25],
      [6.4, H / 2 + 1.2],
      [8.7, H / 2 + 0.95],
      [3.0, H / 2 + 1.6],
    ],
    2,
  );
  sandbags(ctx, P, -5.0, H / 2 + 1.7, -2.4, H / 2 + 1.7);
  barrierLine(ctx, P, -12.5, H / 2 + 1.5, -8.2, H / 2 + 1.05, 0.55);
  cable(ctx, P, [
    [-11, H / 2 + 1.4],
    [-4, H / 2 + 1.1],
    [4, H / 2 + 1.3],
    [12, H / 2 + 0.9],
  ]);

  // ---------------------------------------------------------------- dressing, fire and haze
  if (assets.has('env_barrel')) {
    ctx.instance('env_barrel', [
      { x: 9.5, z: 1.6, ry: 0.3 }, // the night shift's fire drum
      { x: -8.9, z: north - 0.95, ry: 1.2 },
      { x: -8.95, z: 5.0, ry: 2.1 },
      { x: 12.0, z: 2.0, ry: 0.7 },
    ]);
  }
  ctx.ambient.fire(9.5, STREET + 0.95, 1.6, 0.42);
  tripodLamp(ctx, P, L, -9.05, -4.2, -2.3);
  tripodLamp(ctx, P, L, -9.05, 1.9, -2.0);
  tripodLamp(ctx, P, L, 9.05, -5.0, 2.4);
  tripodLamp(ctx, P, L, -6.0, north - 1.5, -2.0);
  tripodLamp(ctx, P, L, 2.4, north - 1.6, -0.8);
  ctx.ambient.smokeColumn(10.0, STREET + 0.2, -0.2, { shade: 0.75, size: 0.55, rate: 2 }); // asphalt steam
  ctx.ambient.smokeColumn(10.2, STREET + 0.2, -4.6, { shade: 0.75, size: 0.5, rate: 1.5 });
  ctx.ambient.dust(0, north - 2.0, 9, 2.2);
  ctx.ambient.dust(-9.8, -1, 2, 7);
  ctx.vehicles('okada', [{ x: 10.5, z: 5.2, ry: -2.6 }]);
  ctx.vehicles('keke', [{ x: 12.6, z: -7.6, ry: 2.9 }]);

  // the site's own white light: the two towers (the only real lights this set adds)
  L.point(nwLamp.x + 0.8, nwLamp.y + 0.4, nwLamp.z + 0.8, 0xfff4e8, 5, 10);
  L.build(ctx);
  const baked = bakeModel(plant);
  baked.userData.grit = 'vehicle';
  ctx.root.add(baked);

  // ---------------------------------------------------------------- the night shift
  const life = ctx.life;
  const crew: Object3D[] = [];
  const hire = (v: Vignette): void => {
    const n = life.group.children.length;
    if (life.add(v) && v.kind === 'worker') crew.push(...life.group.children.slice(n));
  };
  hire({ kind: 'worker', x: 0.2, z: north - 2.4, yaw: 0, toX: 2.6, toZ: north - 2.4 });
  hire({ kind: 'worker', x: -7.6, z: north - 1.6, yaw: 1.2 }); // banksman guiding the bucket
  hire({ kind: 'worker', x: 3.0, y: STREET + 1.64, z: north - 4.6, yaw: 1.6, toX: 8.0, toZ: north - 4.6 });
  hire({ kind: 'worker', x: -9.9, z: -3.2, yaw: 0, toX: -9.9, toZ: -0.4 });
  hire({ kind: 'worker', x: 9.1, z: -1.4, yaw: 0, toX: 9.1, toZ: -4.8 });
  hire({ kind: 'argue', x: 11.3, z: 3.6, yaw: 0.35 }); // the foreman and a tipper driver
  hire({ kind: 'worker', x: 9.0, z: north - 2.0, yaw: 0.9 });
  hire({ kind: 'onlooker', x: 9.9, z: 1.05, yaw: -2.6 });
  hire({ kind: 'worker', x: 4.2, z: north - 2.1, yaw: 0, toX: 8.8, toZ: north - 1.2 });
  hire({ kind: 'worker', x: 3.4, y: STREET + 2.4, z: north - 6.0, yaw: 1.6, toX: 7.4, toZ: north - 6.0 });
  hire({ kind: 'walker', x: 11.2, z: 5.5, yaw: 0, toX: 11.2, toZ: north + 0.5 });
  hire({ kind: 'worker', x: -10.6, z: north - 1.0, yaw: 0.6 });
  hire({ kind: 'onlooker', x: 10.1, z: 2.2, yaw: -2.2 });
  hire({ kind: 'worker', x: -9.7, z: 1.4, yaw: Math.PI, toX: -9.7, toZ: 2.4 });
  dressCrew(crew);
}

export const ROADWORKS_SET: ArenaSet = {
  build,
  // a working site at night: no spectator stands, only the crew (StreetLife) and a few watchers
  crowd: 0,
  crowdEdges: { north: false, east: false, west: false, south: false },
};
