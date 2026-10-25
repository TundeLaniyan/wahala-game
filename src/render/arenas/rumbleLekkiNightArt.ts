/**
 * City Rumble V2 - Lekki Nightworks (presentation only; the grid and hazards are
 * `src/sim/arenas/rumbleLekkiNight.ts`). The Lekki expressway works on the night shift, in the
 * founder-approved Lekki Roadworks look: cold white floodlights over raw cement and wet ground, sodium
 * work lamps, amber beacons, a black sky with the lit Lekki towers far off.
 *
 * Floor: the open dig is bare laterite and sand with spoil smears, excavator track marks and wet
 * hollows that catch the floodlights; the scaffold-maze corners stand on poured slabs with formwork
 * stains; the haul road (rows 10 / 20) and the site entrances (columns 12 / 28) are rolled gravel
 * with deep ruts; spray-painted survey marks and dropped rebar everywhere.
 *
 * Surroundings (all reused from the Lekki Roadworks kit): north, an excavator loading a tipper skip,
 * the half-built frame behind scaffold and debris netting, the tower crane whose drops are the stage
 * hazard, and the Lekki skyline; west, the shored trench, a second excavator and the tar boiler;
 * east, the roller on steaming new asphalt, the site office and the materials yard; lighting towers
 * and sodium poles round the whole site; the hi-vis crew digging, hauling and arguing. The camera side
 * keeps cones, sandbags, a barrier line and cable.
 */
import { CircleGeometry, Group, PlaneGeometry } from 'three';
import type { Mesh, Object3D } from 'three';
import { MeshStandardMaterial } from 'three';
import type { ArenaLook } from '../arenaLook';
import { artRng } from '../textures';
import { bakeModel } from '../assets/merge';
import { box, cyl, mat, mesh } from '../assets/helpers';
import type { Vignette } from '../life/StreetLife';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import { T, crack, noiseFill, stain } from './floorKit';
import type { FloorDrawer } from './floorKit';
import { SiteLights, lampMat, sitePalette, uvScale, v3 } from './roadworksKit';
import type { SitePalette } from './roadworksKit';
import { siteGroundTexture } from './roadworksTextures';
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
import { layoutOf, tileWorld } from './rumbleV2Kit';

const ID = 'rumbleLekkiNight';

export const RUMBLE_LEKKI_NIGHT_LOOK: ArenaLook = {
  // the approved Lekki Roadworks night: cold white key light, sodium lamps, black sky
  sky: 0x121722,
  fog: { color: 0x1a202c, near: 16, far: 60 },
  sun: { color: 0xdde6ff, intensity: 4.1, position: [-6, 20, 11] },
  hemi: { sky: 0x5a6890, ground: 0x2e261c, intensity: 0.95 },
  envIntensity: 0.36,
  exposure: 1.08,
  floorTint: 0x9a948a,
  pillarTint: 0xb6b4b0,
  softTint: 0xbcb6aa,
  slab: 0x4a4846,
  street: 0x16161a,
  grit: { tone: 0x6c6a66, dirt: 0x46423e, dust: 0x8a8680 },
  lamps: [
    [-22.5, 3.4, -17.5, 0xffa040],
    [22.5, 3.4, -17.5, 0xffa040],
    [-22.8, 3.0, 0, 0xff9a36],
    [22.8, 3.0, 0, 0xff9a36],
    [-21.5, 2.6, 17.2, 0xff9a36],
    [21.5, 2.6, 17.2, 0xff9a36],
  ],
};

// ------------------------------------------------------------------------------------------- floor

export const RUMBLE_LEKKI_NIGHT_FLOOR: FloorDrawer = (g, rg, cols, rows) => {
  const layout = layoutOf(ID);
  const r = artRng(5501);
  const w = cols * T;
  const h = rows * T;
  const at = (x: number, y: number): string => layout[y]?.[x] ?? '#';
  // bare laterite and sand, mid-tone so the board reads under the floodlights
  noiseFill(g, g.canvas.width, g.canvas.height, [118, 96, 78], 24, 61);
  noiseFill(rg, rg.canvas.width, rg.canvas.height, [228, 228, 228], 18, 62);
  for (let i = 0; i < cols * rows * 0.4; i++) {
    const sand = r() < 0.5;
    stain(
      g,
      r() * w,
      r() * h,
      40 + r() * 140,
      sand ? `rgba(170,150,116,${0.1 + r() * 0.12})` : `rgba(120,58,34,${0.08 + r() * 0.1})`,
    );
  }
  // poured slabs under the scaffold mazes (the four corners), stained by formwork oil
  const W = cols;
  const H = rows;
  for (const [fx, fy] of [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ] as const) {
    const x0 = fx ? W - 11 : 0;
    const y0 = fy ? H - 10 : 0;
    g.fillStyle = 'rgba(120,118,112,0.62)';
    g.fillRect(x0 * T, y0 * T, 11 * T, 10 * T);
    for (let k = 0; k < 12; k++)
      stain(g, (x0 + r() * 11) * T, (y0 + r() * 10) * T, 30 + r() * 70, 'rgba(40,36,30,0.25)');
    g.strokeStyle = 'rgba(60,58,54,0.5)';
    g.lineWidth = 3;
    for (let k = 1; k < 4; k++) {
      g.beginPath();
      g.moveTo((x0 + (k * 11) / 4) * T, y0 * T);
      g.lineTo((x0 + (k * 11) / 4) * T, (y0 + 10) * T);
      g.stroke();
    }
  }
  // the haul road and the site entrances: rolled gravel with deep ruts
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (at(x, y) !== '=') continue;
      g.fillStyle = `rgba(${88 + r() * 10},${84 + r() * 8},${78 + r() * 8},0.85)`;
      g.fillRect(x * T, y * T, T, T);
      for (let k = 0; k < 40; k++) {
        const v = 60 + r() * 90;
        g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.55)`;
        g.fillRect(x * T + r() * T, y * T + r() * T, 2 + r() * 4, 2 + r() * 3);
      }
      const horiz = at(x - 1, y) === '=' || at(x + 1, y) === '=';
      g.fillStyle = 'rgba(30,26,22,0.45)';
      if (horiz) {
        g.fillRect(x * T, y * T + T * 0.22, T, 12);
        g.fillRect(x * T, y * T + T * 0.68, T, 12);
      } else {
        g.fillRect(x * T + T * 0.22, y * T, 12, T);
        g.fillRect(x * T + T * 0.68, y * T, 12, T);
      }
    }
  // excavator track marks across the dig
  g.strokeStyle = 'rgba(40,30,24,0.28)';
  g.lineWidth = 16;
  for (let i = 0; i < 10; i++) {
    const x = r() * w;
    const y = r() * h;
    const a = r() * Math.PI;
    for (const off of [-22, 22]) {
      g.setLineDash([10, 7]);
      g.beginPath();
      g.moveTo(x + Math.sin(a) * off, y - Math.cos(a) * off);
      g.lineTo(x + Math.cos(a) * 600 + Math.sin(a) * off, y + Math.sin(a) * 600 - Math.cos(a) * off);
      g.stroke();
    }
  }
  g.setLineDash([]);
  // wet hollows: dark, glossy (they catch the floodlights)
  for (let i = 0; i < cols * rows * 0.06; i++) {
    const x = r() * w;
    const y = r() * h;
    const rx = 26 + r() * 80;
    const ry = 14 + r() * 40;
    g.fillStyle = 'rgba(20,22,26,0.5)';
    g.beginPath();
    g.ellipse(x, y, rx, ry, r() * 3, 0, Math.PI * 2);
    g.fill();
    rg.fillStyle = 'rgba(12,12,12,0.95)';
    rg.beginPath();
    rg.ellipse(x, y, rx * 0.9, ry * 0.9, 0, 0, Math.PI * 2);
    rg.fill();
  }
  // spray-painted survey marks and dropped rebar
  g.lineCap = 'round';
  for (let i = 0; i < cols * rows * 0.05; i++) {
    g.strokeStyle =
      r() < 0.6 ? `rgba(196,92,30,${0.45 + r() * 0.2})` : `rgba(196,194,176,${0.35 + r() * 0.15})`;
    g.lineWidth = 6;
    const x = r() * w;
    const y = r() * h;
    g.beginPath();
    g.moveTo(x - 26, y);
    g.lineTo(x + 26, y);
    g.moveTo(x, y - 26);
    g.lineTo(x, y + 26);
    g.stroke();
  }
  g.lineWidth = 3;
  for (let i = 0; i < cols * rows * 0.12; i++) {
    g.strokeStyle = 'rgba(96,52,30,0.7)';
    const x = r() * w;
    const y = r() * h;
    const a = r() * Math.PI;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * 60, y + Math.sin(a) * 60);
    g.stroke();
  }
  for (let i = 0; i < cols * rows * 0.25; i++)
    crack(g, r, r() * w, r() * h, 3 + Math.floor(r() * 6), 'rgba(30,22,16,0.5)', 2);
};

// ------------------------------------------------------------------------------------------ the set

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
  const hx = x + Math.sin(dir) * 0.45;
  const hz = z + Math.cos(dir) * 0.45;
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

function siteGround(ctx: SetContext, P: SitePalette): void {
  const { W, H } = ctx;
  const ground = mesh(
    uvScale(new PlaneGeometry(W + 40, H + 30), (W + 40) / 4, (H + 30) / 4),
    mat(0xb4ab9c, { map: siteGroundTexture(), roughness: 0.95, flat: false }),
    0,
    STREET + 0.004,
    -6,
  );
  ground.rotation.x = -Math.PI / 2;
  ctx.statics.add(ground);
  const r = ctx.rng;
  for (let i = 0; i < 18; i++) {
    const side = i % 3;
    const x = side === 0 ? (r() - 0.5) * W : (side === 1 ? -1 : 1) * (W / 2 + 1.5 + r() * 6);
    const z = side === 0 ? -H / 2 - 1.5 - r() * 6 : (r() - 0.5) * H;
    const p = mesh(new CircleGeometry(1, 14), P.water, x, STREET + 0.009, z);
    p.rotation.x = -Math.PI / 2;
    p.scale.set(0.5 + r() * 0.8, 0.3 + r() * 0.4, 1);
    ctx.statics.add(p);
  }
}

/** Hi-vis coveralls for the crew (kept vivid: retroreflective at night). */
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
  const { W, H } = ctx;
  const { wx, wz } = tileWorld(W, H);
  const north = -H / 2;
  const south = H / 2;
  const P = sitePalette();
  const L = new SiteLights();
  const plant = new Group();
  const pctx: SetContext = { ...ctx, statics: plant };
  siteGround(ctx, P);

  // ---------------------------------------------------------------- north: the dig, the frame, the crane
  trench(ctx, P, -9, north - 2.3, 9, 0.9, 0, 1);
  excavator(pctx, P, L, { x: -14, z: north - 4.2, ry: -Math.PI / 2 + 0.12 }, 0.15, 'load');
  skip(pctx, P, { x: -18.5, z: north - 3.0, ry: 0.12 });
  concreteFrame(ctx, P, L, { x: 9, z: north - 5.4, ry: 0 }, 12, 2.6);
  scaffold(ctx, P, 9, north - 4.2, 12, 1.0, 2, 0, 0.35);
  pipeStack(ctx, P, -2.5, north - 2.4, Math.PI / 2 + 0.08);
  blockPallet(ctx, P, 2.6, north - 2.75, 0.1);
  blockPallet(ctx, P, 3.8, north - 2.7, -0.05, 0.6);
  wheelbarrow(ctx, P, 1.0, north - 1.75, 2.4);
  siteBoard(ctx, P, -5.5, north - 1.9, 0.2);
  towerCrane(ctx, P, L, -3, north - 12, -0.35);
  towerCrane(ctx, P, L, 16, north - 14, 0.6);
  skyline(ctx, P, north - 4);
  const nwLamp = lightTower(pctx, P, L, -21.6, north - 1.4, v3(-12, 0, -6), 4.8);
  const gen = generatorSet(pctx, P, L, { x: -23.6, z: north - 3.3, ry: 0.35 });
  cable(ctx, P, [
    [gen.x, gen.z],
    [-22.5, north - 2.2],
    [-21.6, north - 1.4],
  ]);
  lightTower(pctx, P, L, 21.6, north - 1.4, v3(12, 0, -6), 4.8, false);
  concreteMixer(pctx, P, { x: 19.0, z: north - 2.0, ry: -1.9 });
  heap(ctx, P.sand, 22.4, north - 4.0, 1.3, 1.0, 2);
  heap(ctx, P.gravel, 24.0, north - 2.0, 1.0, 0.75, 5);
  cementBags(ctx, P, 17.6, north - 3.6, 0.3);
  sodiumPole(ctx, P, L, -8.5, north - 1.3, 3.3, 2.6);
  sodiumPole(ctx, P, L, 6.5, north - 1.3, 3.3, -2.6);

  // ---------------------------------------------------------------- west: the opened-up street
  trench(ctx, P, -W / 2 - 2.0, wz(16), 9.0, 0.8, Math.PI / 2, 2);
  excavator(pctx, P, L, { x: -W / 2 - 5.0, z: wz(6), ry: 0.2 }, 0.1, 'dig');
  scaffold(ctx, P, -W / 2 - 4.2, wz(24), 8.0, 1.0, 2, Math.PI / 2, 0.2);
  concreteFrame(ctx, P, L, { x: -W / 2 - 6.0, z: wz(24), ry: Math.PI / 2 }, 8.0, 2.6);
  tarBoiler(pctx, P, L, { x: -W / 2 - 1.6, z: wz(11), ry: 0.4 });
  rebarBundle(ctx, P, -W / 2 - 2.8, wz(28), 0.08, 4.0);
  timberStack(ctx, P, -W / 2 - 2.6, wz(2), 0.1, true);
  sodiumPole(ctx, P, L, -W / 2 - 2.6, wz(20), 3.3, -Math.PI / 2);
  lightTower(pctx, P, L, -W / 2 - 1.5, wz(8), v3(-8, 0, 0), 4.6, false);

  // ---------------------------------------------------------------- east: asphalt, yard, office
  ctx.statics.add(box(2.3, 0.02, 12, P.asphalt, W / 2 + 2.4, STREET + 0.01, wz(10)));
  roller(pctx, P, L, { x: W / 2 + 2.4, z: wz(8), ry: 0.06 });
  siteOffice(ctx, P, L, W / 2 + 4.6, wz(22), -Math.PI / 2);
  rebarBundle(ctx, P, W / 2 + 1.8, wz(17), -0.06, 4.4, 20);
  blockPallet(ctx, P, W / 2 + 1.7, wz(26), 0.2);
  skip(pctx, P, { x: W / 2 + 2.0, z: wz(2.5), ry: 0.15 }, P.olive);
  hoarding(ctx, P, W / 2 + 6.2, wz(0), W / 2 + 6.2, wz(30), 2.2, 0x3c4c40, 7);
  jerseyLine(ctx, P, W / 2 + 0.95, wz(13), W / 2 + 0.95, wz(19));
  sodiumPole(ctx, P, L, W / 2 + 2.6, wz(12), 3.3, Math.PI / 2);
  lightTower(pctx, P, L, W / 2 + 1.5, wz(24), v3(8, 0, 0), 4.6, false);
  hoarding(ctx, P, -W / 2 - 8.2, wz(0), -W / 2 - 8.2, wz(30), 2.1, 0x2c4258, 3);

  // ---------------------------------------------------------------- south (camera) sliver: low only
  cones(
    ctx,
    P,
    [
      [wx(5), south + 1.0],
      [wx(9), south + 1.25],
      [wx(31), south + 1.2],
      [wx(36), south + 0.95],
      [wx(20), south + 1.6],
    ],
    2,
  );
  sandbags(ctx, P, wx(13), south + 1.7, wx(17), south + 1.7);
  barrierLine(ctx, P, wx(23), south + 1.5, wx(28), south + 1.05, 0.55);
  cable(ctx, P, [
    [wx(1), south + 1.4],
    [wx(12), south + 1.1],
    [wx(26), south + 1.3],
    [wx(40), south + 0.9],
  ]);

  // ---------------------------------------------------------------- fire drum, steam, haze
  ctx.instance('env_barrel', [
    { x: W / 2 + 1.5, z: wz(5), ry: 0.3 },
    { x: -W / 2 - 1.2, z: north - 0.95, ry: 1.2 },
    { x: -W / 2 - 1.3, z: wz(26), ry: 2.1 },
  ]);
  ctx.ambient.fire(W / 2 + 1.5, STREET + 0.95, wz(5), 0.42);
  ctx.ambient.smokeColumn(W / 2 + 2.4, STREET + 0.2, wz(9), { shade: 0.75, size: 0.55, rate: 2 }); // asphalt steam
  ctx.ambient.dust(0, north - 2.0, 18, 2.2);
  ctx.ambient.dust(-W / 2 - 2, wz(16), 2, 9);
  ctx.vehicles('okada', [
    { x: W / 2 + 1.6, y: STREET, z: wz(29), ry: -2.6 },
    { x: W / 2 + 2.3, y: STREET, z: wz(29.6), ry: -2.4 },
    { x: -W / 2 - 1.6, y: STREET, z: wz(13.5), ry: 0.3 },
  ]);
  ctx.vehicles('keke', [{ x: -W / 2 - 2.4, y: STREET, z: wz(30.5), ry: 2.9 }]);
  ctx.vehicles('danfo', [{ x: W / 2 + 4.5, y: STREET, z: north - 2.5, ry: -Math.PI / 2 }], { idle: true }); // the crew bus

  L.point(nwLamp.x + 0.8, nwLamp.y + 0.4, nwLamp.z + 0.8, 0xfff4e8, 5, 12);
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
  const S = STREET;
  hire({ y: S, kind: 'worker', x: -8, z: north - 2.4, yaw: 0, toX: -4, toZ: north - 2.4 });
  hire({ y: S, kind: 'worker', x: -17, z: north - 1.6, yaw: 1.2 }); // banksman guiding the bucket
  hire({ kind: 'worker', x: 5, y: S + 1.64, z: north - 4.7, yaw: 1.6, toX: 13, toZ: north - 4.7 });
  hire({ y: S, kind: 'worker', x: -W / 2 - 2.0, z: wz(13), yaw: 0, toX: -W / 2 - 2.0, toZ: wz(19) });
  hire({ y: S, kind: 'worker', x: W / 2 + 1.4, z: wz(7), yaw: 0, toX: W / 2 + 1.4, toZ: wz(12) });
  hire({ y: S, kind: 'argue', x: W / 2 + 2.6, z: wz(20), yaw: 0.35 }); // the foreman and a tipper driver
  hire({ y: S, kind: 'worker', x: 18, z: north - 1.2, yaw: 0.9 });
  hire({ y: S, kind: 'onlooker', x: W / 2 + 1.9, z: wz(5.8), yaw: -2.6 }); // warming hands at the drum
  hire({ kind: 'worker', x: 6, y: S + 2.4, z: north - 6.1, yaw: 1.6, toX: 12, toZ: north - 6.1 });
  hire({ y: S, kind: 'walker', x: W / 2 + 1.1, z: wz(28), yaw: 0, toX: W / 2 + 1.1, toZ: wz(15) });
  hire({ y: S, kind: 'worker', x: -W / 2 - 1.6, z: wz(9), yaw: 0.6 });
  hire({ y: S, kind: 'worker', x: 0, z: north - 1.5, yaw: 0, toX: 4, toZ: north - 1.2 });
  dressCrew(crew);
}

export const RUMBLE_LEKKI_NIGHT_SET: ArenaSet = {
  build,
  // a working site at night: no spectator stands, only the crew
  crowd: 0,
  crowdEdges: { north: false, east: false, west: false, south: false },
};
