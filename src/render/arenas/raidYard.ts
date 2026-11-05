/**
 * Raid look 2 of 3: the RAIL / GOODS YARD (rail yard goods, junction tool shed). A cinder-and-ballast marshalling yard in
 * the low sun of late afternoon: two tracks along the back with a rusted boxcar and a flat wagon parked on them, a
 * semaphore signal, a floodlight tower, sheet-iron fencing, stacked sacks under tarpaulins, drums, timber and a pile of
 * sleepers. The board is the loading apron between the tracks and the yard gate.
 *
 * Presentation only. Tall things (wagons, signal, tower, fence) are north and far east / west; the camera side keeps to
 * a buffer stop, sleepers, cones and a points lever, all under a metre.
 */
import { Group } from 'three';
import type { ArenaLook } from '../arenaLook';
import { bakeModel } from '../assets/merge';
import { artRng } from '../textures';
import { box, cyl } from '../assets/helpers';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import { crack, noiseFill, seams, stain, T, tyreTrack } from './floorKit';
import type { FloorDrawer } from './floorKit';
import { SiteLights, lampMat, sitePalette } from './roadworksKit';
import { cones } from './roadworksProps';
import { drum, streetPlane } from './oshodiKit';
import type { Paint } from './oshodiKit';
import { KEEP_CLEAR_SIGN, container, pallet, raidPalette, raidSign } from './raidKit';
import type { RaidPalette } from './raidKit';

export const RAID_YARD_LOOK: ArenaLook = {
  // late afternoon through yard smoke: a low orange sun, long hard shadows, grey-brown air
  sky: 0x8a7a68,
  fog: { color: 0x86766a, near: 15, far: 58 },
  sun: { color: 0xffbe84, intensity: 3.7, position: [-9, 10, 8] },
  hemi: { sky: 0xc4ae94, ground: 0x4c3e32, intensity: 0.88 },
  envIntensity: 0.42,
  exposure: 1.05,
  floorTint: 0xb5aa98,
  pillarTint: 0xc4baa8,
  softTint: 0xc2b4a0,
  slab: 0x625a4e,
  street: 0x2e2822,
  grit: { tone: 0x7a6650, dirt: 0x4e4234, dust: 0x927e66 },
  lamps: [
    [9.2, 3.0, -6.8, 0xffa04a],
    [-9.4, 3.0, -5.8, 0xffa850],
    [9.4, 2.6, 4.0, 0xffa04a],
    [-9.4, 2.6, 4.4, 0xff9a40],
  ],
};

// ------------------------------------------------------------------------------------------- floor

export const RAID_YARD_FLOOR: FloorDrawer = (g, rg, cols, rows) => {
  const w = cols * T;
  const h = rows * T;
  const r = artRng(9202);
  // packed cinder and crushed stone, darker where the wagons drip
  noiseFill(g, w, h, [118, 108, 94], 20, 93);
  noiseFill(rg, w, h, [206, 206, 206], 26, 94);
  for (let i = 0; i < w * h * 0.006; i++) {
    const v = r() < 0.5 ? 150 + r() * 50 : 70 + r() * 30;
    g.fillStyle = `rgba(${v},${v - 6},${v - 16},0.5)`;
    g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2);
  }
  // a concrete loading apron strip down the middle, joints every two tiles
  g.fillStyle = 'rgba(150,146,136,0.38)';
  g.fillRect(0, (rows / 2 - 1.5) * T, w, 3 * T);
  g.strokeStyle = 'rgba(30,28,24,0.4)';
  g.lineWidth = 3;
  for (let x = 2; x < cols; x += 2) {
    g.beginPath();
    g.moveTo(x * T, (rows / 2 - 1.5) * T);
    g.lineTo(x * T, (rows / 2 + 1.5) * T);
    g.stroke();
  }
  for (let i = 0; i < cols * rows * 0.2; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 16 + r() * 50;
    stain(g, x, y, rad, `rgba(26,22,16,${0.25 + r() * 0.3})`);
    stain(rg, x, y, rad * 0.8, `rgba(60,60,60,${0.5 + r() * 0.3})`);
  }
  for (let i = 0; i < 6; i++) tyreTrack(g, r, w, h, 'rgba(34,28,22,0.22)');
  // weeds pushing through the ballast
  for (let i = 0; i < cols * rows * 0.5; i++) {
    g.fillStyle = `rgba(${70 + r() * 30},${86 + r() * 30},${38},${0.25 + r() * 0.3})`;
    g.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 5);
  }
  for (let i = 0; i < cols * rows * 0.14; i++)
    crack(g, r, r() * w, r() * h, 3 + Math.floor(r() * 5), 'rgba(24,20,16,0.5)', 1.8);
  // painted safety lines and a stencilled "no standing between wagons" box, half scuffed away
  g.lineWidth = 11;
  g.setLineDash([140, 12, 50, 16]);
  g.strokeStyle = 'rgba(206,166,40,0.62)';
  g.strokeRect(24, 24, w - 48, h - 48);
  g.setLineDash([]);
  g.fillStyle = 'rgba(190,186,176,0.34)';
  g.font = 'bold 38px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('GOODS  APRON', w / 2, T * 0.62);
  seams(g, cols, rows, 'rgba(40,36,30,0.26)', 2);
};

// -------------------------------------------------------------------------------------------- the yard

function yardGround(ctx: SetContext): void {
  streetPlane(ctx, 'raid:yard:ground', { x: 0, z: -6, w: 64, d: 40, ppm: 14 }, (g: Paint, px, s, r) => {
    const W = 64 * s;
    const D = 40 * s;
    g.fillStyle = '#4a4034';
    g.fillRect(0, 0, W, D);
    for (let i = 0; i < 9000; i++) {
      const v = 60 + r() * 90;
      g.fillStyle = `rgba(${v},${v - 6},${v - 18},0.7)`;
      g.fillRect(r() * W, r() * D, 2 + r() * 3, 2 + r() * 2);
    }
    // ballast beds under the two tracks
    for (const z of [-3.6, -7.2]) {
      const [, b0] = px(0, z - 1.5);
      const [, b1] = px(0, z + 1.5);
      g.fillStyle = 'rgba(86,82,76,0.8)';
      g.fillRect(0, b0, W, b1 - b0);
      for (let i = 0; i < 4200; i++) {
        const v = 90 + r() * 80;
        g.fillStyle = `rgba(${v},${v - 2},${v - 6},0.8)`;
        g.fillRect(r() * W, b0 + r() * (b1 - b0), 2 + r() * 3, 2 + r() * 2);
      }
    }
    // cinder paths, oil, weeds
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(18,14,10,${0.2 + r() * 0.25})`;
      g.beginPath();
      g.ellipse(r() * W, r() * D, 8 + r() * 36, 5 + r() * 18, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = `rgba(${60 + r() * 30},${80 + r() * 30},36,${0.25 + r() * 0.3})`;
      g.fillRect(r() * W, r() * D, 2 + r() * 4, 2 + r() * 5);
    }
  });
}

/** A length of track along x at `z`: sleepers every 0.66 m and two rails, from x0 to x1. */
function track(ctx: SetContext, P: RaidPalette, z: number, x0: number, x1: number): void {
  for (let x = x0; x <= x1; x += 0.66) {
    ctx.statics.add(box(0.24, 0.16, 2.5, P.woodDark, x, STREET + 0.08, z));
  }
  for (const dz of [-0.72, 0.72]) {
    ctx.statics.add(box(x1 - x0, 0.17, 0.08, P.steel, (x0 + x1) / 2, STREET + 0.24, z + dz));
    ctx.statics.add(box(x1 - x0, 0.04, 0.2, P.steelLight, (x0 + x1) / 2, STREET + 0.155, z + dz));
  }
}

/** A railway wagon on `z`: a boxcar (sliding door, sheet sides) or a flat wagon with containers. */
function wagon(
  ctx: SetContext,
  P: RaidPalette,
  x: number,
  z: number,
  kind: 'box' | 'flat',
  paint: typeof P.sheetRed,
): void {
  const g = new Group();
  // underframe and two bogies
  g.add(box(9.6, 0.4, 2.6, P.black, 0, 1.0, 0));
  for (const bx of [-3.2, 3.2]) {
    g.add(box(2.3, 0.3, 1.9, P.steel, bx, 0.62, 0));
    for (const wx of [-0.8, 0.8])
      for (const wz of [-0.72, 0.72]) {
        const w = cyl(0.46, 0.46, 0.1, P.steel, bx + wx, 0.46, wz, 14);
        w.rotation.x = Math.PI / 2;
        g.add(w);
      }
  }
  if (kind === 'box') {
    g.add(box(9.2, 2.7, 2.5, paint, 0, 2.5, 0));
    g.add(box(9.4, 0.14, 2.7, P.rust, 0, 3.9, 0)); // roof lip
    g.add(box(1.9, 2.3, 0.14, P.rust, 0.6, 2.4, 1.3)); // sliding door
    g.add(box(2.1, 0.08, 0.18, P.steelLight, 0.6, 3.6, 1.32));
    g.add(box(0.5, 0.12, 0.1, P.yellow, 0.6, 1.4, 1.38));
  } else {
    g.add(box(9.4, 0.18, 2.7, P.woodDark, 0, 1.28, 0));
    for (const sx of [-4.7, 4.7]) g.add(box(0.12, 0.7, 2.7, P.steel, sx, 1.6, 0));
  }
  g.position.set(x, STREET, z);
  ctx.statics.add(g);
}

/** A semaphore signal: lattice mast, a red/white arm, a lamp. */
function signal(ctx: SetContext, P: RaidPalette, L: SiteLights, x: number, z: number): void {
  const g = new Group();
  g.add(box(0.2, 6.4, 0.2, P.steel, 0, 3.2, 0));
  g.add(box(0.7, 0.16, 0.16, P.steel, 0, 6.3, 0));
  const arm = box(1.5, 0.24, 0.05, P.red, 0.75, 6.0, 0.14);
  arm.rotation.z = -0.5;
  g.add(arm);
  g.add(box(0.3, 0.46, 0.2, P.black, 0, 5.1, 0.06));
  g.add(box(0.12, 0.12, 0.04, lampMat(0xff3a1c, 2.8), 0, 5.2, 0.18));
  g.position.set(x, STREET, z);
  ctx.statics.add(g);
  L.glow(x, STREET + 5.2, z + 0.2, 0.9, 0xff4a2c, 0.8);
}

function build(ctx: SetContext): void {
  const { W, H } = ctx;
  const north = -H / 2;
  const P = raidPalette();
  const S = sitePalette();
  const L = new SiteLights();
  yardGround(ctx);
  const set = new Group();
  const pc: SetContext = { ...ctx, statics: set };

  // ----------------------------------------------------------------------- tracks and wagons (north, tall)
  const t1 = north - 3.8;
  const t2 = north - 7.4;
  track(pc, P, t1, -32, 32);
  track(pc, P, t2, -32, 32);
  wagon(pc, P, -8.6, t1, 'box', P.sheetRed);
  wagon(pc, P, 8.0, t1, 'flat', P.sheetRed);
  container(pc, P, { x: 8.0, z: t1, ry: Math.PI / 2 }, P.blue);
  wagon(pc, P, 14.2, t2, 'box', P.sheetGreen);
  wagon(pc, P, -2.6, t2, 'box', P.sheetBlue);
  // buffer stops at the ends of the tracks
  for (const [x, z] of [
    [-26, t1],
    [26, t1],
    [-26, t2],
    [26, t2],
  ] as const) {
    pc.statics.add(box(0.5, 1.1, 2.2, P.red, x, STREET + 0.55, z));
    pc.statics.add(box(0.7, 0.14, 0.7, P.steelLight, x + (x < 0 ? 0.5 : -0.5), STREET + 0.9, z - 0.6));
    pc.statics.add(box(0.7, 0.14, 0.7, P.steelLight, x + (x < 0 ? 0.5 : -0.5), STREET + 0.9, z + 0.6));
  }
  signal(pc, P, L, 1.6, north - 5.6);

  // ----------------------------------------------------------------------- back fence, tower, gate
  const fenceZ = north - 11.6;
  pc.statics.add(box(60, 3.2, 0.14, P.sheetGreen, 0, STREET + 1.6, fenceZ));
  for (let x = -29; x <= 29; x += 3)
    pc.statics.add(box(0.12, 3.5, 0.12, P.steel, x, STREET + 1.75, fenceZ + 0.1));
  raidSign(
    ctx,
    'yardsign',
    {
      bg: '#c9a21c',
      fg: '#1a1a18',
      lines: [
        ['GOODS YARD', 84],
        ['NO ENTRY', 56],
      ],
      border: '#1a1a18',
      wear: 1.4,
    },
    -5,
    2.3,
    fenceZ + 0.12,
    2.0,
    0.9,
    0,
  );
  raidSign(ctx, 'yardclear', KEEP_CLEAR_SIGN, 5, 2.0, fenceZ + 0.12, 0.9, 0.9, 0);
  // the floodlight tower, north-east
  const tx = W / 2 + 6.8;
  const tz = north - 1.4;
  pc.statics.add(box(0.28, 10, 0.28, P.steel, tx, STREET + 5, tz));
  pc.statics.add(box(2.4, 0.12, 0.5, P.steel, tx, STREET + 10.1, tz));
  for (let i = -2; i <= 2; i++)
    pc.statics.add(box(0.36, 0.3, 0.2, lampMat(0xffe8c0, 2.8), tx + i * 0.46, STREET + 9.9, tz + 0.1));
  L.glow(tx, STREET + 9.8, tz + 0.3, 3.2, 0xffd9a0, 0.9);
  L.point(tx - 1.2, 6, tz + 2, 0xffe0b0, 6, 22);

  // ----------------------------------------------------------------------- goods beside the apron
  for (const s of [-1, 1]) {
    const x = s * (W / 2 + 3.0);
    // stacked sacks under a tarpaulin, drums and timber
    pc.statics.add(box(2.2, 1.3, 2.8, P.sheetBlue, x, STREET + 0.65, north + 2.2));
    pc.statics.add(box(2.3, 0.1, 2.9, P.black, x, STREET + 1.33, north + 2.2));
    pallet(pc, P, { x: x + s * 1.9, z: north + 3.0, ry: 0.3 * s }, { stack: 3, wrap: true });
    pallet(pc, P, { x: x + s * 0.4, z: 1.0, ry: -0.2 * s }, { stack: 2 });
    drum(ctx, P.red, x - s * 0.2, 3.3);
    drum(ctx, P.blue, x + s * 0.4, 3.6);
    drum(ctx, P.red, x, 4.0, { lying: 0.8 });
    // timber stack
    for (let i = 0; i < 4; i++)
      pc.statics.add(
        box(3.0, 0.14, 0.14, P.wood, x + s * 2.6, STREET + 0.1 + i * 0.15, -1.6 + (i % 2) * 0.08),
      );
  }
  container(pc, P, { x: -(W / 2 + 8.4), z: north - 1.0, ry: 0.02 }, P.red, { stack: 2 });
  container(pc, P, { x: W / 2 + 12.4, z: north + 5, ry: Math.PI / 2 }, P.green);

  // ----------------------------------------------------------------------- south (camera) side: low only
  for (let i = 0; i < 6; i++)
    pc.statics.add(
      box(2.4, 0.16, 0.24, P.woodDark, -6.4, STREET + 0.1 + i * 0.17, H / 2 + 1.6 - (i % 2) * 0.04),
    );
  cones(
    pc,
    S,
    [
      [2.6, H / 2 + 1.4],
      [3.6, H / 2 + 1.6],
      [6.8, H / 2 + 1.4],
    ],
    0,
  );
  // a points lever and its box
  pc.statics.add(box(0.5, 0.35, 0.5, P.rust, -1.2, STREET + 0.18, H / 2 + 1.5));
  pc.statics.add(box(0.05, 0.9, 0.05, P.red, -1.1, STREET + 0.75, H / 2 + 1.5));
  pc.statics.add(box(0.2, 0.2, 0.2, P.red, -1.1, STREET + 1.2, H / 2 + 1.5));
  pc.statics.add(box(1.4, 0.5, 0.6, P.sheetBlue, 4.8, STREET + 0.25, H / 2 + 1.9)); // a tool chest

  L.build(ctx);
  const baked = bakeModel(set);
  baked.userData.grit = 'vehicle';
  ctx.root.add(baked);
  ctx.ambient.dust(0, north - 2, 26, 4);
  ctx.ambient.dust(0, 3, 22, 6);

  const life = ctx.life;
  const y = STREET;
  life.add({ kind: 'worker', x: -3.6, y, z: north - 1.6, yaw: 0.3 });
  life.add({ kind: 'walker', x: -6, y, z: t1 + 2.4, yaw: 0, toX: 6, toZ: t1 + 2.4 });
  life.add({ kind: 'argue', x: W / 2 + 4.2, y, z: -2.4, yaw: -1.2 });
  life.add({ kind: 'onlooker', x: -(W / 2 + 3.2), y, z: 1.4, yaw: 1.4 });
  life.add({ kind: 'worker', x: W / 2 + 3.2, y, z: north + 4.4, yaw: -1.2 });
}

export const RAID_YARD_SET: ArenaSet = {
  build,
  crowd: 0,
  crowdEdges: { north: false, east: false, west: false, south: false },
};
