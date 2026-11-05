/**
 * Raid look 1 of 3: the WAREHOUSE INTERIOR (Dispatch Depot, standby plant). A raised loading platform in a big goods shed
 * at the end of a shift: cold fluorescent light, dust in the air, steel racking three tiers high down both sides and along
 * the back wall, roller doors half open on a glare of yard light, pallets, a forklift, yellow safety lines.
 *
 * Presentation only. North (behind the board) is tall; the sides step down; the camera (south) side stays low:
 * a few pallets, cones, a hand truck and a wet-floor board, all under a metre.
 */
import type { ArenaLook } from '../arenaLook';
import { bakeModel } from '../assets/merge';
import { Group } from 'three';
import { artRng } from '../textures';
import { box, cyl } from '../assets/helpers';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import { crack, noiseFill, seams, stain, T, tyreTrack } from './floorKit';
import type { FloorDrawer } from './floorKit';
import { SiteLights } from './roadworksKit';
import { cones } from './roadworksProps';
import { sitePalette } from './roadworksKit';
import { streetPlane } from './oshodiKit';
import type { Paint } from './oshodiKit';
import {
  BAY_SIGN,
  DEPOT_SIGN,
  KEEP_CLEAR_SIGN,
  container,
  forklift,
  pallet,
  raidPalette,
  raidSign,
  rollerDoor,
  shelving,
  stripLight,
} from './raidKit';

export const RAID_WAREHOUSE_LOOK: ArenaLook = {
  // interior: a dark roof overhead, cold tube light, a little warm spill from the half-open doors
  sky: 0x161a1e,
  fog: { color: 0x20272b, near: 16, far: 62 },
  sun: { color: 0xdfeaf6, intensity: 3.3, position: [-6, 15, 7] },
  hemi: { sky: 0x93a8b4, ground: 0x3c3a34, intensity: 0.95 },
  envIntensity: 0.4,
  exposure: 1.1,
  floorTint: 0xb8b4aa,
  pillarTint: 0xc2bdb0,
  softTint: 0xc4baa8,
  slab: 0x5c5a56,
  street: 0x34322e,
  grit: { tone: 0x6a6a64, dirt: 0x44413a, dust: 0x8a8880 },
  lamps: [
    [-7.6, 3.4, -6.4, 0xcfe0ff],
    [7.6, 3.4, -6.4, 0xcfe0ff],
    [-8.4, 2.8, 4.2, 0xffe2b0],
    [8.4, 2.8, 4.2, 0xffe2b0],
  ],
};

// ------------------------------------------------------------------------------------------- floor

export const RAID_WAREHOUSE_FLOOR: FloorDrawer = (g, rg, cols, rows) => {
  const w = cols * T;
  const h = rows * T;
  const r = artRng(9101);
  noiseFill(g, w, h, [132, 128, 120], 15, 91);
  noiseFill(rg, w, h, [196, 196, 196], 24, 92);
  // power-floated concrete in saw-cut bays, a little different in shade
  for (let py = 0; py < rows; py += 3)
    for (let px = 0; px < cols; px += 3) {
      g.fillStyle =
        r() < 0.5 ? `rgba(110,106,98,${0.1 + r() * 0.1})` : `rgba(180,176,166,${0.06 + r() * 0.08})`;
      g.fillRect(px * T, py * T, 3 * T, 3 * T);
    }
  g.strokeStyle = 'rgba(30,28,26,0.5)';
  g.lineWidth = 4;
  for (let x = 3; x < cols; x += 3) {
    g.beginPath();
    g.moveTo(x * T, 0);
    g.lineTo(x * T, h);
    g.stroke();
  }
  for (let y = 3; y < rows; y += 3) {
    g.beginPath();
    g.moveTo(0, y * T);
    g.lineTo(w, y * T);
    g.stroke();
  }
  // forklift tyre tracks, oil spots, hairline cracks
  for (let i = 0; i < 7; i++) tyreTrack(g, r, w, h, 'rgba(26,24,22,0.2)');
  for (let i = 0; i < cols * rows * 0.16; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 14 + r() * 40;
    stain(g, x, y, rad, `rgba(24,22,18,${0.25 + r() * 0.3})`);
    stain(rg, x, y, rad * 0.8, `rgba(50,50,50,${0.5 + r() * 0.3})`);
  }
  for (let i = 0; i < cols * rows * 0.18; i++)
    crack(g, r, r() * w, r() * h, 3 + Math.floor(r() * 5), 'rgba(20,18,16,0.5)', 1.8);
  // yellow pedestrian walkway round the edge, worn through, and stencilled bay boxes at the side walls
  g.lineWidth = 12;
  g.setLineDash([170, 10, 60, 14]);
  g.strokeStyle = 'rgba(206,166,40,0.68)';
  g.strokeRect(22, 22, w - 44, h - 44);
  g.setLineDash([]);
  g.strokeStyle = 'rgba(236,232,220,0.5)';
  g.lineWidth = 7;
  for (const [bx, by] of [
    [0.4, 1.2],
    [0.4, 5.2],
    [cols - 1.4, 1.2],
    [cols - 1.4, 5.2],
  ] as const)
    g.strokeRect(bx * T, by * T, 1 * T, 2.4 * T);
  // hazard chevrons in the four corners
  const hatch = (x: number, y: number, bw: number, bh: number): void => {
    g.save();
    g.beginPath();
    g.rect(x, y, bw, bh);
    g.clip();
    g.fillStyle = 'rgba(206,166,40,0.6)';
    g.fillRect(x, y, bw, bh);
    g.fillStyle = 'rgba(24,22,20,0.7)';
    for (let k = -bh; k < bw + bh; k += 28) {
      g.beginPath();
      g.moveTo(x + k, y);
      g.lineTo(x + k + 14, y);
      g.lineTo(x + k + 14 - bh, y + bh);
      g.lineTo(x + k - bh, y + bh);
      g.closePath();
      g.fill();
    }
    g.restore();
  };
  hatch(6, 6, 90, 14);
  hatch(w - 96, 6, 90, 14);
  hatch(6, h - 20, 90, 14);
  hatch(w - 96, h - 20, 90, 14);
  g.save();
  g.fillStyle = 'rgba(236,232,220,0.38)';
  g.font = 'bold 38px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('DISPATCH BAY', w / 2, T * 0.6);
  g.restore();
  seams(g, cols, rows, 'rgba(40,38,34,0.28)', 2);
};

// -------------------------------------------------------------------------------------------- the shed

function shedFloor(ctx: SetContext): void {
  streetPlane(ctx, 'raid:wh:floor', { x: 0, z: -4, w: 60, d: 36, ppm: 14 }, (g: Paint, px, s, r) => {
    const W = 60 * s;
    const D = 36 * s;
    g.fillStyle = '#4d4b46';
    g.fillRect(0, 0, W, D);
    for (let x = -30; x < 30; x += 4)
      for (let z = -22; z < 14; z += 4) {
        const [a, b] = px(x, z);
        g.fillStyle = `rgba(${r() < 0.5 ? '40,38,34' : '150,146,136'},${0.05 + r() * 0.07})`;
        g.fillRect(a, b, 4 * s, 4 * s);
      }
    g.strokeStyle = 'rgba(20,18,16,0.45)';
    g.lineWidth = 2;
    for (let x = -30; x <= 30; x += 4) {
      const [a] = px(x, 0);
      g.beginPath();
      g.moveTo(a, 0);
      g.lineTo(a, D);
      g.stroke();
    }
    // a yellow aisle line down each flank and across the back, stencilled forklift lanes
    g.strokeStyle = 'rgba(206,166,40,0.7)';
    g.lineWidth = Math.max(3, s * 0.12);
    for (const x of [-9.5, 9.5]) {
      const [a, b0] = px(x, -22);
      const [, b1] = px(x, 14);
      g.beginPath();
      g.moveTo(a, b0);
      g.lineTo(a, b1);
      g.stroke();
    }
    for (let i = 0; i < 1000; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(24,22,18,${r() * 0.25})` : `rgba(190,186,176,${r() * 0.18})`;
      g.fillRect(r() * W, r() * D, 2 + r() * 6, 1 + r() * 4);
    }
    for (let i = 0; i < 26; i++) {
      const x = r() * W;
      const z = r() * D;
      g.fillStyle = `rgba(16,14,10,${0.2 + r() * 0.25})`;
      g.beginPath();
      g.ellipse(x, z, 6 + r() * 26, 4 + r() * 16, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function build(ctx: SetContext): void {
  const { W, H } = ctx;
  const north = -H / 2;
  const P = raidPalette();
  const S = sitePalette();
  const L = new SiteLights();
  shedFloor(ctx);
  const set = new Group();
  const pc: SetContext = { ...ctx, statics: set };

  // ----------------------------------------------------------------------- back wall, doors, sign, lights
  const wallZ = north - 5.4;
  pc.statics.add(box(46, 7.4, 0.6, P.concrete, 0, STREET + 3.7, wallZ));
  pc.statics.add(box(46, 2.3, 0.7, P.concreteDark, 0, STREET + 1.15, wallZ + 0.04));
  // corrugated upper cladding
  pc.statics.add(box(46, 3.4, 0.2, P.sheetBlue, 0, STREET + 5.5, wallZ + 0.4));
  const doorXs = [-10.4, -4.4, 4.4, 10.4];
  doorXs.forEach((x, i) => {
    rollerDoor(
      pc,
      P,
      { x, z: wallZ + 0.36, ry: 0 },
      { w: 3.4, h: 3.5, raise: [0.62, 0.15, 0.48, 0.8][i], spill: i % 2 ? 0xfff0cc : 0xe4f0ff },
    );
    raidSign(ctx, `bay${i + 1}`, BAY_SIGN(i + 1), x, 4.5, wallZ + 0.52, 1.5, 0.62, 0);
  });
  raidSign(ctx, 'depot', DEPOT_SIGN, 0, 5.4, wallZ + 0.52, 3.2, 1.1, 0);
  raidSign(ctx, 'clear', KEEP_CLEAR_SIGN, 7.2, 1.6, wallZ + 0.52, 0.9, 0.9, 0);
  for (let x = -16; x <= 16; x += 4)
    stripLight(pc, L, P, { x, z: wallZ + 0.62, ry: 0 }, { y: 4.9, len: 1.6 });
  L.point(0, 3.6, north - 2.4, 0xcfe0ff, 5, 16);

  // ----------------------------------------------------------------------- racking behind the north wall
  shelving(pc, P, { x: -8.4, z: north - 1.6, ry: 0 }, { bays: 5, tiers: 4, load: 0.9 });
  shelving(pc, P, { x: 8.4, z: north - 1.6, ry: 0 }, { bays: 5, tiers: 4, load: 0.8, frame: P.green });
  // an aisle between them with a pallet loading out, and a dispatch desk (a bench with a monitor)
  pallet(pc, P, { x: 0.4, z: north - 2.1, ry: 0.1 }, { stack: 3, wrap: true });
  pc.statics.add(box(2.2, 0.9, 0.9, P.steel, -1.8, STREET + 0.45, north - 3.4));
  pc.statics.add(box(0.6, 0.4, 0.06, P.glass, -1.8, STREET + 1.2, north - 3.5));
  // second rank of racking, taller, with the container store beyond it
  shelving(pc, P, { x: -12.8, z: north - 3.4, ry: 0 }, { bays: 4, tiers: 4, load: 0.7 });
  shelving(pc, P, { x: 12.8, z: north - 3.4, ry: 0 }, { bays: 4, tiers: 4, load: 0.7 });

  // ----------------------------------------------------------------------- the side aisles (step down to the camera)
  const sideBays = Math.max(2, Math.floor((H - 3.5) / 1.8));
  for (const s of [-1, 1]) {
    const x = s * (W / 2 + 2.5);
    shelving(
      pc,
      P,
      { x, z: -H / 2 + (sideBays * 1.8) / 2 + 0.3, ry: s * (Math.PI / 2) },
      { bays: sideBays, tiers: 3, load: 0.85, frame: s < 0 ? P.blue : P.green },
    );
    // a lower second row beyond, two tiers
    shelving(
      pc,
      P,
      { x: s * (W / 2 + 4.3), z: -H / 2 + (sideBays * 1.8) / 2 + 0.6, ry: s * (Math.PI / 2) },
      { bays: sideBays, tiers: 2, load: 0.7 },
    );
  }
  // concrete columns with hazard bases
  for (const [x, z] of [
    [-(W / 2 + 6.2), north - 0.6],
    [W / 2 + 6.2, north - 0.6],
    [-(W / 2 + 6.2), 2.4],
    [W / 2 + 6.2, 2.4],
  ] as const) {
    pc.statics.add(box(0.7, 6.8, 0.7, P.concrete, x, STREET + 3.4, z));
    pc.statics.add(box(0.78, 0.9, 0.78, P.yellow, x, STREET + 0.45, z));
    pc.statics.add(box(0.8, 0.12, 0.8, P.black, x, STREET + 0.6, z));
  }

  // ----------------------------------------------------------------------- plant and clutter beyond the walls
  forklift(pc, P, { x: W / 2 + 3.6, z: 1.4, ry: -Math.PI / 2 }, { raised: 0.5, load: true });
  forklift(pc, P, { x: -(W / 2 + 6.6), z: -2.6, ry: Math.PI / 2 + 0.3 }, { raised: 0.1 });
  container(pc, P, { x: -(W / 2 + 9), z: north - 4, ry: 0 }, P.blue, { stack: 2 });
  container(pc, P, { x: W / 2 + 9, z: north - 4, ry: 0 }, P.red);
  for (const [x, z, st] of [
    [-(W / 2 + 3.2), 2.3, 2],
    [W / 2 + 5.6, -3.2, 3],
    [-(W / 2 + 5.2), north + 1, 3],
    [W / 2 + 3.4, north + 1.6, 2],
  ] as const)
    pallet(pc, P, { x, z, ry: (x + z) * 0.3 }, { stack: st, wrap: st > 2 });
  // drums and a spill kit by the east aisle
  for (const [x, z] of [
    [W / 2 + 3.0, 4.0],
    [W / 2 + 3.5, 4.4],
    [W / 2 + 2.9, 4.9],
  ] as const) {
    pc.statics.add(cyl(0.29, 0.29, 0.88, P.blue, x, STREET + 0.44, z, 12));
  }

  // ----------------------------------------------------------------------- south (camera) side: low only
  pallet(pc, P, { x: -5.4, z: H / 2 + 1.5, ry: 0.2 }, { stack: 1 });
  pallet(pc, P, { x: -4.2, z: H / 2 + 1.7, ry: -0.1 });
  pallet(pc, P, { x: 6.6, z: H / 2 + 1.6, ry: 0.1 }, { stack: 1, wrap: true });
  cones(
    pc,
    S,
    [
      [3.4, H / 2 + 1.3],
      [4.4, H / 2 + 1.5],
      [-2.8, H / 2 + 1.4],
    ],
    1,
  );
  // a hand truck and a yellow wet-floor board
  pc.statics.add(box(0.4, 0.05, 0.3, P.steel, 2.0, STREET + 0.03, H / 2 + 1.6));
  pc.statics.add(box(0.05, 0.9, 0.05, P.blue, 1.84, STREET + 0.45, H / 2 + 1.6));
  pc.statics.add(box(0.05, 0.9, 0.05, P.blue, 2.16, STREET + 0.45, H / 2 + 1.6));
  pc.statics.add(box(0.42, 0.62, 0.05, P.yellow, -1.2, STREET + 0.31, H / 2 + 1.6));

  L.build(ctx);
  const baked = bakeModel(set);
  baked.userData.grit = 'vehicle';
  ctx.root.add(baked);
  ctx.ambient.dust(0, north - 1.0, 18, 3);
  ctx.ambient.dust(0, 2, 22, 6);

  // ----------------------------------------------------------------------- the crew
  const life = ctx.life;
  const y = STREET;
  life.add({ kind: 'worker', x: 0.2, y, z: north - 3.0, yaw: 0.2 });
  life.add({ kind: 'walker', x: -6, y, z: north - 2.4, yaw: 0, toX: 6, toZ: north - 2.4 });
  life.add({ kind: 'worker', x: W / 2 + 3.0, y, z: 0.2, yaw: 1.4 });
  life.add({ kind: 'argue', x: -(W / 2 + 3.5), y, z: -1.6, yaw: 1.2 });
  life.add({ kind: 'onlooker', x: W / 2 + 2.9, y, z: north + 2.6, yaw: -1.3 });
}

export const RAID_WAREHOUSE_SET: ArenaSet = {
  build,
  crowd: 0,
  crowdEdges: { north: false, east: false, west: false, south: false },
};
