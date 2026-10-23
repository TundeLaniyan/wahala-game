/**
 * Surulere Power Yard: the POWER ARENA, a high-energy electrical and generator compound under hard,
 * clear midday sun.
 *
 * Presentation only (the grid and the full-line blast rule are `src/sim`). This module owns the
 * arena's light (POWER_YARD_LOOK), its surroundings (POWER_YARD_SET) and its playfield floor
 * (POWER_YARD_FLOOR).
 *
 * North, behind a row of humming switchgear cabinets and a chain-link fence topped with barbed wire,
 * two big oil-filled transformers stand on gravel beds either side of a blast wall, their brown
 * porcelain bushings and HV leads rising to the gantry; the control room sits in the north-west, the
 * bunded diesel tank in the north-east. East, two containerised 500 kVA diesel sets thump out dark
 * exhaust under turning amber beacons, fuel drums between them. West, an H-pole transformer with one
 * fuse holder hanging open and arcing blue, line poles and sagging conductors, and the cable-drum yard.
 * Hi-vis electricians work, argue and haul cable. Danger boards everywhere. Nothing tall on the
 * camera side: only a cable drum on its flange, cones and a trench cover.
 */
import { Group } from 'three';
import type { ArenaLook } from '../arenaLook';
import { bakeModel } from '../assets/merge';
import { artRng } from '../textures';
import { box, mat } from '../assets/helpers';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import { crack, noiseFill, seams, stain, T, tyreTrack } from './floorKit';
import type { FloorDrawer } from './floorKit';
import { SiteLights, sitePalette, v3 } from './roadworksKit';
import { cable, cones } from './roadworksProps';
import { drum, sign, streetPlane, wire } from './oshodiKit';
import type { Paint } from './oshodiKit';
import {
  bollard,
  cableDrum,
  controlRoom,
  dangerTexture,
  dieselTank,
  generatorContainer,
  hPoleTransformer,
  linePole,
  plantPalette,
  powerTransformer,
  securityFence,
  switchgearRow,
} from './powerYardPlant';

export const POWER_YARD_LOOK: ArenaLook = {
  // hard, clear midday: a high white sun throwing crisp, short, blue-filled shadows under a clean sky
  sky: 0x9cb8d4,
  fog: { color: 0xb4c2cc, near: 26, far: 84 },
  sun: { color: 0xffeccc, intensity: 5.8, position: [-8, 17, 8] },
  hemi: { sky: 0xa8c4e4, ground: 0x6e6050, intensity: 0.85 },
  envIntensity: 0.7,
  exposure: 1.12,
  floorTint: 0xd0c8bc,
  pillarTint: 0xd8d2c6,
  softTint: 0xd2c6b4,
  slab: 0x6c6862,
  street: 0x4a4844,
  grit: { tone: 0x8a8272, dirt: 0x4a463e, dust: 0xa09886 },
  lamps: [],
};

// ------------------------------------------------------------------------------------------- floor

export const POWER_YARD_FLOOR: FloorDrawer = (g, rg, cols, rows) => {
  const w = cols * T;
  const h = rows * T;
  const r = artRng(7707);
  // power-floated concrete hardstanding: pale, with a fine aggregate speckle
  noiseFill(g, w, h, [128, 124, 116], 16, 71);
  noiseFill(rg, w, h, [196, 196, 196], 26, 72);
  for (let i = 0; i < w * h * 0.003; i++) {
    const v = r() < 0.5 ? 168 + r() * 30 : 96 + r() * 20;
    g.fillStyle = `rgba(${v},${v - 1},${v - 4},0.45)`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
  // bays poured in 3 x 3 panels: slightly different shades, saw-cut joints between them
  for (let py = 0; py < rows; py += 3)
    for (let px = 0; px < cols; px += 3) {
      g.fillStyle =
        r() < 0.5 ? `rgba(120,116,108,${0.08 + r() * 0.1})` : `rgba(176,172,164,${0.06 + r() * 0.08})`;
      g.fillRect(px * T, py * T, 3 * T, 3 * T);
    }
  g.strokeStyle = 'rgba(30,28,26,0.55)';
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
  // diesel and transformer-oil stains, dark and glossy
  for (let i = 0; i < cols * rows * 0.22; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 18 + r() * 60;
    stain(g, x, y, rad, `rgba(28,24,18,${0.28 + r() * 0.3})`);
    stain(rg, x, y, rad * 0.8, `rgba(50,50,50,${0.5 + r() * 0.3})`);
  }
  // forklift and trolley tracks, scuffed cable drag marks, hairline cracks
  for (let i = 0; i < 6; i++) tyreTrack(g, r, w, h, 'rgba(30,28,26,0.18)');
  g.strokeStyle = 'rgba(40,36,30,0.25)';
  g.lineWidth = 7;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    let x = r() * w;
    let y = r() * h;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (r() - 0.3) * 220;
      y += (r() - 0.5) * 140;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0; i < cols * rows * 0.2; i++)
    crack(g, r, r() * w, r() * h, 3 + Math.floor(r() * 6), 'rgba(20,18,16,0.55)', 1.8);
  // the yellow safety walkway line around the edge, worn through where the plant is dragged
  g.lineWidth = 12;
  g.setLineDash([180, 8, 60, 14]);
  g.strokeStyle = 'rgba(206,166,40,0.7)';
  g.strokeRect(22, 22, w - 44, h - 44);
  g.setLineDash([]);
  // hazard hatching in the four corners of the yard (outside the spawn tiles' centre)
  const hatch = (x: number, y: number, bw: number, bh: number): void => {
    g.save();
    g.beginPath();
    g.rect(x, y, bw, bh);
    g.clip();
    g.fillStyle = 'rgba(206,166,40,0.62)';
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
  // stencilled warnings, half scuffed away
  g.save();
  g.fillStyle = 'rgba(168,40,28,0.5)';
  g.font = 'bold 40px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('DANGER  HIGH VOLTAGE', w / 2, T * 0.62);
  g.fillText('KEEP CLEAR', w / 2, h - T * 0.38);
  g.restore();
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(146,143,136,${0.4 + r() * 0.4})`;
    g.fillRect(
      w / 2 - 260 + r() * 520,
      r() < 0.5 ? T * 0.3 + r() * 50 : h - T * 0.7 + r() * 50,
      4 + r() * 12,
      2 + r() * 5,
    );
  }
  // copper earth tape fixed across the yard (the earthing grid surfaces at the joints)
  g.strokeStyle = 'rgba(150,92,48,0.5)';
  g.lineWidth = 4;
  for (const y of [3, 6, 9]) {
    g.beginPath();
    g.moveTo(0, y * T - 2);
    g.lineTo(T * 0.6, y * T - 2);
    g.moveTo(w - T * 0.6, y * T - 2);
    g.lineTo(w, y * T - 2);
    g.stroke();
  }
  // faint tile seams keep the grid readable
  seams(g, cols, rows, 'rgba(40,38,34,0.28)', 2);
};

// --------------------------------------------------------------------------------------- the yard

/** The compound's ground: concrete aprons, gravel beds, an asphalt service road, yellow lines. */
function yardGround(ctx: SetContext): void {
  streetPlane(ctx, 'py:ground', { x: 0, z: -3, w: 52, d: 30, ppm: 24 }, (g: Paint, px, s, r) => {
    const rect = (x0: number, z0: number, x1: number, z1: number, fill: string): void => {
      const [a, b] = px(x0, z0);
      const [c, d] = px(x1, z1);
      g.fillStyle = fill;
      g.fillRect(a, b, c - a, d - b);
    };
    const W = 52 * s;
    const D = 30 * s;
    g.fillStyle = '#625e58';
    g.fillRect(0, 0, W, D);
    // concrete aprons in poured bays
    for (let x = -26; x < 26; x += 4)
      for (let z = -18; z < 12; z += 4)
        rect(x, z, x + 4, z + 4, `rgba(${r() < 0.5 ? '60,58,54' : '170,166,156'},${0.06 + r() * 0.08})`);
    g.strokeStyle = 'rgba(30,28,26,0.4)';
    g.lineWidth = 2;
    for (let x = -26; x < 26; x += 4) {
      const [a] = px(x, 0);
      g.beginPath();
      g.moveTo(a, 0);
      g.lineTo(a, D);
      g.stroke();
    }
    for (let z = -18; z < 12; z += 4) {
      const [, b] = px(0, z);
      g.beginPath();
      g.moveTo(0, b);
      g.lineTo(W, b);
      g.stroke();
    }
    // the substation's gravel beds behind the fence
    const gravel = (x0: number, z0: number, x1: number, z1: number): void => {
      rect(x0, z0, x1, z1, '#5e5a54');
      const [a, b] = px(x0, z0);
      const [c, d] = px(x1, z1);
      for (let i = 0; i < ((c - a) * (d - b)) / 6; i++) {
        const v = 70 + r() * 70;
        g.fillStyle = `rgba(${v},${v - 2},${v - 6},0.8)`;
        g.fillRect(a + r() * (c - a), b + r() * (d - b), 2 + r() * 3, 2 + r() * 2);
      }
    };
    gravel(-9, -18, 9, -8.2);
    // an asphalt service road in from the east, tyre-marked
    rect(8.4, -6, 26, -4.2, '#3e3c38');
    rect(13.2, -18, 15.0, 12, '#3e3c38');
    // yellow walkway lines and hatched keep-clear boxes in front of the plant
    g.strokeStyle = 'rgba(206,166,40,0.7)';
    g.lineWidth = Math.max(3, s * 0.1);
    const box_ = (x0: number, z0: number, x1: number, z1: number): void => {
      const [a, b] = px(x0, z0);
      const [c, d] = px(x1, z1);
      g.strokeRect(a, b, c - a, d - b);
    };
    box_(8.9, -5.2, 12.3, 5.8);
    box_(-12.4, -7.2, -9.0, -5.9);
    box_(-8.8, -7.5, 8.8, -6.4);
    // oil and diesel: under the gensets, round the tank and the drums
    for (const [x, z, n] of [
      [10.6, -2.4, 14],
      [10.6, 3.2, 12],
      [11.0, -8.6, 10],
      [-9.4, -0.9, 8],
      [0, -10, 10],
    ] as const)
      for (let i = 0; i < n; i++) {
        const [a, b] = px(x + (r() - 0.5) * 3, z + (r() - 0.5) * 4);
        g.fillStyle = `rgba(20,18,14,${0.15 + r() * 0.25})`;
        g.beginPath();
        g.ellipse(a, b, 8 + r() * 30, 6 + r() * 18, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(40,36,30,${r() * 0.25})` : `rgba(190,186,176,${r() * 0.2})`;
      g.fillRect(r() * W, r() * D, 2 + r() * 6, 1 + r() * 4);
    }
  });
}

function build(ctx: SetContext): void {
  const { H } = ctx;
  const north = -H / 2;
  const P = plantPalette();
  const site = sitePalette();
  const L = new SiteLights();
  const hv = dangerTexture('hv');
  yardGround(ctx);
  // the plant is baked on its own and weathered like machinery: its paint stays stronger than the
  // dusty scenery (yellow gensets, green transformers, red danger boards)
  const plantGroup = new Group();
  const pc: SetContext = { ...ctx, statics: plantGroup };

  // ------------------------------------------------------------ north: switchgear, fence, transformers
  switchgearRow(pc, P, { x: -4.3, z: north - 1.45, ry: 0 }, 5, hv);
  switchgearRow(pc, P, { x: 4.3, z: north - 1.45, ry: 0 }, 5, hv);
  securityFence(ctx, P, [
    [-15, north - 2.45],
    [-1.4, north - 2.45],
  ]);
  securityFence(ctx, P, [
    [1.4, north - 2.45],
    [15, north - 2.45],
  ]);
  // the gate: two leaves swung open, a danger board on each
  for (const side of [-1, 1]) {
    const leaf = box(1.3, 2.0, 0.05, P.galv, side * 1.4 - side * 0.55, STREET + 1.05, north - 2.45 + 0.5);
    leaf.rotation.y = side * 0.95;
    ctx.statics.add(leaf);
  }
  for (const x of [-12.2, -7.6, -2.6, 2.6, 12.2]) sign(ctx, hv, x, 1.3, north - 2.38, 0.86, 0.64, 0);
  sign(ctx, dangerTexture('auth'), 7.6, 1.3, north - 2.38, 0.8, 0.5, 0);
  const tipsW = powerTransformer(pc, P, { x: -4.7, z: north - 4.6, ry: 0 });
  const tipsE = powerTransformer(pc, P, { x: 4.7, z: north - 4.6, ry: 0 });
  // the blast wall between them
  ctx.statics.add(box(0.35, 3.4, 3.2, P.concrete, 0, STREET + 1.7, north - 4.6));
  // HV leads from the bushings rising north to the incoming gantry
  const lead = P.copper;
  for (const t of [...tipsW, ...tipsE])
    wire(ctx, t, v3(t.x * 1.1, STREET + 7.5, north - 9), 0.35, lead, 0.018);
  // incoming line poles behind (their tops leave the frame)
  for (const x of [-11, 11]) linePole(ctx, P, x, north - 7, 7.5, 0, 2);

  // NW: the control room; NE: the bunded diesel tank
  controlRoom(pc, P, L, { x: -11.4, z: north - 3.4, ry: 0 }, dangerTexture('control'), dangerTexture('auth'));
  dieselTank(pc, P, { x: 11.2, z: north - 3.3, ry: 0 }, dangerTexture('fuel'));

  // ------------------------------------------------------------ east: the generator sets
  generatorContainer(pc, P, L, { x: 10.6, z: -2.2, ry: 0 }, { len: 4.6, paint: P.canopyAlt });
  generatorContainer(pc, P, L, { x: 10.6, z: 3.3, ry: Math.PI }, { len: 4.2, paint: P.canopy, open: true });
  // fuel drums on a spill pallet between them, a jerrycan, hoses and the output cables
  ctx.statics.add(box(1.4, 0.1, 1.0, P.yellow, 9.2, STREET + 0.05, 0.55));
  drum(ctx, P.blueDrum, 8.95, 0.3);
  drum(ctx, P.redDrum, 9.55, 0.35);
  drum(ctx, P.blueDrum, 9.25, 0.85);
  drum(ctx, P.redDrum, 12.2, 0.6, { lying: 0.3 });
  cable(ctx, site, [
    [9.5, -0.2],
    [8.7, -0.6],
    [8.6, -3.5],
    [8.6, -6.1],
  ]);
  cable(ctx, site, [
    [9.4, 1.2],
    [8.75, 1.6],
    [8.7, 5.9],
  ]);

  // ------------------------------------------------------------ west: H-pole transformer, lines, drums
  const hTips = hPoleTransformer(pc, P, L, { x: -10.7, z: -2.4, ry: Math.PI / 2 }, hv);
  const pS = linePole(ctx, P, -10.9, 4.3, 6.4, Math.PI / 2);
  const pN = linePole(ctx, P, -12.6, north - 4.2, 7.0, Math.PI / 2);
  const conductor = mat(0x2a2a28, { roughness: 0.5, metalness: 0.5 });
  hTips.forEach((t, k) => {
    wire(ctx, t, pS[k]!, 0.45, conductor, 0.024);
    wire(ctx, t, pN[k]!, 0.55, conductor, 0.024);
  });
  // the east line: concrete poles along the service road carrying three conductors north
  const eastPoles = [-9.5, -3.0, 3.5].map((z) => linePole(ctx, P, 13.4, z, 7.2, Math.PI / 2));
  for (let i = 0; i + 1 < eastPoles.length; i++)
    eastPoles[i]!.forEach((t, k) => wire(ctx, t, eastPoles[i + 1]![k]!, 0.5, conductor, 0.024));
  // and a drop from it over the gensets to the switchgear (the feeder the yard backs up)
  eastPoles[0]!.forEach((t, k) =>
    wire(ctx, t, v3(4.3 + k * 1.06, STREET + 1.9, north - 1.3), 0.6, conductor, 0.02),
  );
  // the service drop across the west street to the control room
  wire(ctx, v3(-10.7, STREET + 4.3, -2.6), v3(-10.0, STREET + 2.7, north - 1.9), 0.25, conductor, 0.01);
  cableDrum(ctx, P, { x: -9.5, z: 1.5, ry: 0.15 }, 0.75, 0.8);
  cableDrum(ctx, P, { x: -11.4, z: 1.2, ry: -0.3 }, 0.6, 0.7);
  cableDrum(ctx, P, { x: -12.2, z: -0.4, ry: 0.9 }, 0.75, 0.8);
  cableDrum(ctx, P, { x: -9.5, z: -5.0, ry: 0.4 }, 0.55, 0.65, true);
  // cable pulled off the big drum and across the ground to a joint pit
  cable(ctx, site, [
    [-9.5, 2.1],
    [-9.0, 3.2],
    [-9.2, 4.6],
    [-8.6, 5.6],
  ]);
  ctx.statics.add(box(0.9, 0.05, 0.6, P.steel, -8.6, STREET + 0.03, 5.85)); // the joint pit cover
  drum(ctx, P.redDrum, -9.0, -1.1);
  drum(ctx, P.blueDrum, -9.55, -0.7);
  drum(ctx, P.redDrum, -9.25, -1.65, { lying: 1.2 });

  // yellow bollards guarding the plant
  for (const [x, z] of [
    [-7.2, north - 3.0],
    [-2.2, north - 3.0],
    [2.2, north - 3.0],
    [7.2, north - 3.0],
    [9.0, -5.0],
    [12.2, -5.0],
    [9.1, 5.7],
    [12.2, 5.7],
    [9.6, north - 0.75],
    [12.8, north - 0.75],
  ] as const)
    bollard(pc, P, x, z);

  // ------------------------------------------------------------ south (camera) side: low only
  cableDrum(ctx, P, { x: -5.2, z: H / 2 + 1.6, ry: 0 }, 0.45, 0.55, true);
  cones(
    ctx,
    site,
    [
      [3.4, H / 2 + 1.3],
      [4.4, H / 2 + 1.5],
      [-2.6, H / 2 + 1.4],
    ],
    2,
  );
  ctx.statics.add(box(1.8, 0.05, 0.5, P.galv, 6.4, STREET + 0.03, H / 2 + 1.5)); // trench cover plates

  // ------------------------------------------------------------ charge in the air
  // a junction box on the fence spitting sparks, indicator lamps on the cabinets
  ctx.statics.add(box(0.5, 0.6, 0.25, P.cabinet, 7.0, STREET + 1.3, north - 2.3));
  L.beacon(7.0, STREET + 1.45, north - 2.12, 0xb8e4ff, 1.3, 'arc');
  // a damaged cable joint on the west street spitting at the pit, and a bushing flashing over
  L.beacon(-8.6, STREET + 0.25, 5.85, 0xb8e4ff, 1.2, 'arc');
  L.beacon(tipsE[0]!.x, tipsE[0]!.y + 0.05, tipsE[0]!.z, 0xc8ecff, 1.4, 'arc');
  L.build(ctx);
  const baked = bakeModel(plantGroup);
  baked.userData.grit = 'vehicle';
  ctx.root.add(baked);
  ctx.ambient.dust(0, north - 1.0, 14, 1.2);
  ctx.ambient.dust(10.5, 0.5, 2.0, 9);

  // ------------------------------------------------------------ the crew (most visible first)
  const life = ctx.life;
  const y = STREET;
  life.add({ kind: 'worker', x: 9.0, y, z: -1.0, yaw: 1.6 }); // at the genset panel
  life.add({ kind: 'worker', x: -9.3, y, z: 2.6, yaw: 0, toX: -9.0, toZ: 5.2 }); // hauling cable
  life.add({ kind: 'argue', x: -10.2, y, z: north - 1.45, yaw: 1.3 }); // the shift engineer and a fitter
  life.add({ kind: 'worker', x: -9.4, y, z: -2.6, yaw: -1.6 }); // under the H-pole
  life.add({ kind: 'onlooker', x: 0.4, y, z: north - 2.0, yaw: 0.1 }); // the gateman
  life.add({ kind: 'worker', x: 9.3, y, z: 2.6, yaw: 1.4 }); // in the open genset door
  life.add({ kind: 'walker', x: -6, y, z: north - 2.1, yaw: 0, toX: -1.8, toZ: north - 2.1 });
  life.add({ kind: 'worker', x: 9.6, y, z: north - 1.6, yaw: 0.6 }); // at the fuel pump
  life.add({ kind: 'onlooker', x: 12.1, y, z: -0.2, yaw: -1.4 });
  life.add({ kind: 'worker', x: -12.3, y, z: 2.6, yaw: 0.5 });
  life.add({ kind: 'walker', x: 8.9, y, z: 5.6, yaw: 0, toX: 8.9, toZ: -5.0 });
}

export const POWER_YARD_SET: ArenaSet = {
  build,
  // a working compound: no spectator stands, only the crew (StreetLife)
  crowd: 0,
  crowdEdges: { north: false, east: false, west: false, south: false },
};
