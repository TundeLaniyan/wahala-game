/**
 * Raid look 3 of 3: the UNDER-BRIDGE STOREROOM (parts storeroom, records vault). A row of padlocked lock-up stores and a
 * house storeroom tucked under a concrete flyover: the deck's heavy underside and two fat piers fill the top of the
 * frame, bare bulbs on cables throw warm pools, tyre stacks, sacks and jerrycans fill the corners, a transformer pole
 * leans over the side street. Dim and close, the opposite of the open yard.
 *
 * Presentation only. The deck, piers and stores are north; the camera side keeps to kerb stones, a gutter, single tyres,
 * jerrycans and a plastic chair, all under a metre.
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
import { SiteLights, lampMat, sitePalette, v3 } from './roadworksKit';
import { cones } from './roadworksProps';
import { drum, streetPlane, wire } from './oshodiKit';
import type { Paint } from './oshodiKit';
import { pallet, raidPalette, raidSign, rollerDoor, shelving } from './raidKit';

export const RAID_STOREROOM_LOOK: ArenaLook = {
  // in the shade of the flyover: dim, a little blue from the open sky at the sides, warm bulbs doing the real work
  sky: 0x2c2c32,
  fog: { color: 0x2a2a30, near: 12, far: 50 },
  sun: { color: 0xd8e0f0, intensity: 3.6, position: [-8, 14, 9] },
  hemi: { sky: 0x92a0bc, ground: 0x544a3e, intensity: 1.25 },
  envIntensity: 0.4,
  exposure: 1.28,
  floorTint: 0xc4baac,
  pillarTint: 0xbab2a4,
  softTint: 0xbcb09c,
  slab: 0x4e4a46,
  street: 0x201e1c,
  grit: { tone: 0x625a4e, dirt: 0x3e3830, dust: 0x7a7266 },
  lamps: [
    [-6.4, 3.0, -7.0, 0xffb060],
    [6.4, 3.0, -7.0, 0xffb060],
    [-9.4, 2.4, 2.4, 0xff9c48],
    [9.4, 2.4, 3.0, 0xffa650],
  ],
};

// ------------------------------------------------------------------------------------------- floor

export const RAID_STOREROOM_FLOOR: FloorDrawer = (g, rg, cols, rows) => {
  const w = cols * T;
  const h = rows * T;
  const r = artRng(9303);
  // old cracked concrete, swept dust in the corners, damp patches
  noiseFill(g, w, h, [112, 106, 98], 17, 95);
  noiseFill(rg, w, h, [190, 190, 190], 26, 96);
  for (let py = 0; py < rows; py += 2)
    for (let px = 0; px < cols; px += 2) {
      g.fillStyle =
        r() < 0.5 ? `rgba(90,86,78,${0.1 + r() * 0.12})` : `rgba(160,154,142,${0.06 + r() * 0.08})`;
      g.fillRect(px * T, py * T, 2 * T, 2 * T);
    }
  g.strokeStyle = 'rgba(24,22,20,0.5)';
  g.lineWidth = 4;
  for (let x = 2; x < cols; x += 2) {
    g.beginPath();
    g.moveTo(x * T, 0);
    g.lineTo(x * T, h);
    g.stroke();
  }
  for (let y = 2; y < rows; y += 2) {
    g.beginPath();
    g.moveTo(0, y * T);
    g.lineTo(w, y * T);
    g.stroke();
  }
  for (let i = 0; i < cols * rows * 0.22; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 18 + r() * 60;
    stain(g, x, y, rad, `rgba(20,18,14,${0.25 + r() * 0.3})`);
    stain(rg, x, y, rad * 0.8, `rgba(50,50,50,${0.5 + r() * 0.3})`);
  }
  for (let i = 0; i < 5; i++) tyreTrack(g, r, w, h, 'rgba(24,22,20,0.2)');
  for (let i = 0; i < cols * rows * 0.34; i++)
    crack(g, r, r() * w, r() * h, 3 + Math.floor(r() * 6), 'rgba(16,14,12,0.55)', 2);
  // dust blown into the corners and the old painted bay edge, nearly gone
  for (const [cx, cy] of [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ] as const) {
    const grad = g.createRadialGradient(cx, cy, 1, cx, cy, T * 2.2);
    grad.addColorStop(0, 'rgba(150,140,124,0.5)');
    grad.addColorStop(1, 'rgba(150,140,124,0)');
    g.fillStyle = grad;
    g.fillRect(cx - T * 2.2, cy - T * 2.2, T * 4.4, T * 4.4);
  }
  g.strokeStyle = 'rgba(206,166,40,0.42)';
  g.lineWidth = 10;
  g.setLineDash([110, 24, 40, 30]);
  g.strokeRect(26, 26, w - 52, h - 52);
  g.setLineDash([]);
  seams(g, cols, rows, 'rgba(34,32,28,0.3)', 2);
};

// ---------------------------------------------------------------------------------------- the stores

function groundUnderBridge(ctx: SetContext): void {
  streetPlane(ctx, 'raid:store:ground', { x: 0, z: -5, w: 62, d: 38, ppm: 14 }, (g: Paint, px, s, r) => {
    const W = 62 * s;
    const D = 38 * s;
    g.fillStyle = '#34312d';
    g.fillRect(0, 0, W, D);
    for (let i = 0; i < 9000; i++) {
      const v = 40 + r() * 70;
      g.fillStyle = `rgba(${v},${v - 2},${v - 6},0.7)`;
      g.fillRect(r() * W, r() * D, 2 + r() * 4, 2 + r() * 3);
    }
    // the shadow edge of the flyover deck: a darker band along the north
    const [, b] = px(0, -12);
    const grad = g.createLinearGradient(0, 0, 0, b);
    grad.addColorStop(0, 'rgba(0,0,0,0.5)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, b);
    // damp patches and oil
    for (let i = 0; i < 46; i++) {
      g.fillStyle = `rgba(10,10,12,${0.2 + r() * 0.3})`;
      g.beginPath();
      g.ellipse(r() * W, r() * D, 10 + r() * 44, 6 + r() * 20, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // painted pier numbers and chevrons on the ground, near-erased
    g.fillStyle = 'rgba(206,166,40,0.3)';
    for (const x of [-12, 12]) {
      const [a, c] = px(x, -8.4);
      g.fillRect(a - s * 0.9, c, s * 1.8, s * 0.18);
    }
  });
}

function build(ctx: SetContext): void {
  const { W, H } = ctx;
  const north = -H / 2;
  const P = raidPalette();
  const S = sitePalette();
  const L = new SiteLights();
  groundUnderBridge(ctx);
  const set = new Group();
  const pc: SetContext = { ...ctx, statics: set };

  // ----------------------------------------------------------------------- the flyover (north, overhead)
  const deckZ = north - 7.4;
  pc.statics.add(box(66, 1.5, 12, P.concrete, 0, STREET + 6.3, deckZ));
  pc.statics.add(box(66, 0.5, 0.5, P.concreteDark, 0, STREET + 7.3, deckZ + 6.2)); // the parapet's lip
  for (const x of [-22, -11, 0, 11, 22])
    pc.statics.add(box(0.7, 0.9, 12, P.concreteDark, x, STREET + 5.3, deckZ)); // girders
  // piers: fat, banded, with painted warnings
  for (const x of [-13.5, 13.5]) {
    pc.statics.add(box(2.0, 5.6, 2.0, P.concrete, x, STREET + 2.8, north - 4.6));
    pc.statics.add(box(2.3, 0.7, 2.3, P.concreteDark, x, STREET + 0.35, north - 4.6));
    pc.statics.add(box(2.3, 0.5, 2.3, P.yellow, x, STREET + 1.0, north - 4.6));
    pc.statics.add(box(2.6, 0.7, 2.6, P.concreteDark, x, STREET + 5.55, north - 4.6));
    raidSign(
      ctx,
      `pier${x}`,
      {
        bg: '#e9e6dc',
        fg: '#8a2a22',
        lines: [
          ['NO', 70],
          ['DUMPING', 64],
        ],
        border: '#8a2a22',
        wear: 1.5,
      },
      x,
      2.6,
      north - 3.56,
      1.1,
      0.8,
      0,
    );
  }

  // ----------------------------------------------------------------------- the lock-up stores along the back
  const storeZ = north - 3.0;
  const stores: { x: number; paint: typeof P.sheetGreen; name: string }[] = [
    { x: -9.6, paint: P.sheetGreen, name: 'SPARES' },
    { x: -4.0, paint: P.sheetBlue, name: 'TYRES' },
    { x: 4.0, paint: P.sheetRed, name: 'RECORDS' },
    { x: 9.6, paint: P.sheetGreen, name: 'PARTS' },
  ];
  stores.forEach((s, i) => {
    pc.statics.add(box(4.6, 3.0, 3.4, P.plaster, s.x, STREET + 1.5, storeZ - 1.2));
    pc.statics.add(box(4.9, 0.18, 3.7, s.paint, s.x, STREET + 3.08, storeZ - 1.2));
    rollerDoor(
      pc,
      P,
      { x: s.x, z: storeZ + 0.52, ry: 0 },
      { w: 3.0, h: 2.5, raise: i === 2 ? 0.35 : 0, spill: i === 2 ? 0xffc890 : undefined },
    );
    pc.statics.add(box(0.14, 0.2, 0.08, P.yellow, s.x + 0.9, STREET + 0.9, storeZ + 0.7)); // a padlock on the bar
    raidSign(
      ctx,
      `store${s.name}`,
      { bg: '#e9e6dc', fg: '#1a1a18', lines: [[s.name, 96]], border: '#1a1a18', wear: 1.6 },
      s.x,
      3.5,
      storeZ + 0.62,
      2.2,
      0.5,
      0,
    );
  });
  // tyres and sacks stacked against the stores
  ctx.instance('env_tyrestack', [
    { x: -6.8, y: STREET, z: north - 1.2, ry: 0.3, sx: 0.9, sy: 0.9, sz: 0.9 },
    { x: 6.8, y: STREET, z: north - 1.1, ry: 1.1, sx: 0.8, sy: 0.7, sz: 0.8 },
  ]);
  ctx.instance('prop_soft_sacks', [{ x: -1.8, y: STREET, z: north - 1.2, ry: 0.2 }]);
  ctx.instance('prop_soft_cartons', [{ x: 1.9, y: STREET, z: north - 1.3, ry: -0.2 }]);

  // ----------------------------------------------------------------------- the house storeroom (west) and the pole (east)
  const hx = -(W / 2 + 6.4);
  pc.statics.add(box(5.4, 3.0, 5.0, P.plaster, hx, STREET + 1.5, -1.0));
  pc.statics.add(box(5.8, 0.2, 5.4, P.sheetRed, hx, STREET + 3.1, -1.0));
  pc.statics.add(box(1.0, 2.0, 0.1, P.woodDark, hx + 1.2, STREET + 1.0, -1.0 + 2.55)); // the door
  pc.statics.add(box(0.12, 0.12, 0.08, P.yellow, hx + 1.55, STREET + 1.0, -1.0 + 2.62));
  pc.statics.add(box(0.9, 0.7, 0.08, P.black, hx - 1.2, STREET + 1.7, -1.0 + 2.55)); // barred window
  for (const bx of [-0.3, -0.1, 0.1, 0.3])
    pc.statics.add(box(0.03, 0.7, 0.04, P.steelLight, hx - 1.2 + bx, STREET + 1.7, -1.0 + 2.6));
  pallet(pc, P, { x: hx + 3.4, z: 2.2, ry: 0.3 }, { stack: 2, wrap: true });
  shelving(
    pc,
    P,
    { x: W / 2 + 3.0, z: -2.4, ry: Math.PI / 2 },
    { bays: 3, tiers: 3, load: 0.8, frame: P.green },
  );
  // transformer pole with sagging service wires over the side street
  const poleX = W / 2 + 6.2;
  pc.statics.add(cyl(0.15, 0.2, 8.4, P.woodDark, poleX, STREET + 4.2, -3.4, 8));
  pc.statics.add(box(2.2, 0.12, 0.12, P.steel, poleX, STREET + 8.0, -3.4));
  pc.statics.add(cyl(0.34, 0.34, 0.9, P.steel, poleX + 0.6, STREET + 7.0, -3.4, 10));
  for (const dz of [-0.9, 0, 0.9])
    wire(
      ctx,
      v3(poleX, STREET + 8.0, -3.4 + dz * 0.1),
      v3(poleX - 7, STREET + 7.4, -9 + dz * 0.4),
      0.7,
      P.black,
      0.014,
    );
  wire(ctx, v3(poleX, STREET + 7.8, -3.2), v3(storeZ, STREET + 3.2, storeZ), 0.5, P.black, 0.012);

  // ----------------------------------------------------------------------- bare bulbs on cables
  for (const [x, z] of [
    [-6.4, north - 1.8],
    [0, north - 2.0],
    [6.4, north - 1.8],
    [-10.2, 1.6],
    [10.2, 2.0],
  ] as const) {
    pc.statics.add(box(0.02, 1.4, 0.02, P.black, x, STREET + 4.5, z));
    pc.statics.add(box(0.12, 0.16, 0.12, lampMat(0xffc880, 3), x, STREET + 3.7, z));
    L.glow(x, STREET + 3.65, z, 1.6, 0xffb868, 0.9);
  }
  L.point(0, 3.4, north - 2.0, 0xffb868, 5, 14);

  // ----------------------------------------------------------------------- clutter at the sides
  drum(ctx, P.green, W / 2 + 3.3, 4.2);
  drum(ctx, P.red, W / 2 + 3.8, 4.6);
  drum(ctx, P.green, W / 2 + 3.4, 5.0, { lying: 0.5 });
  pallet(pc, P, { x: -(W / 2 + 2.9), z: 4.4, ry: 0.4 }, { stack: 2 });

  // ----------------------------------------------------------------------- south (camera) side: low only
  for (const [x, z, h] of [
    [-5.6, H / 2 + 1.5, 3],
    [-5.2, H / 2 + 1.9, 2],
    [5.4, H / 2 + 1.6, 2],
  ] as const)
    for (let i = 0; i < h; i++)
      pc.statics.add(cyl(0.34, 0.34, 0.2, P.rubber, x, STREET + 0.1 + i * 0.2, z, 12));
  for (const x of [1.4, 1.75, 2.1])
    pc.statics.add(box(0.3, 0.45, 0.14, P.yellow, x, STREET + 0.23, H / 2 + 1.6)); // jerrycans
  pc.statics.add(box(0.5, 0.05, 0.5, P.blue, -2.6, STREET + 0.45, H / 2 + 1.5)); // a plastic chair
  pc.statics.add(box(0.5, 0.45, 0.05, P.blue, -2.6, STREET + 0.7, H / 2 + 1.28));
  cones(
    pc,
    S,
    [
      [3.4, H / 2 + 1.5],
      [4.2, H / 2 + 1.4],
    ],
    0,
  );

  L.build(ctx);
  const baked = bakeModel(set);
  baked.userData.grit = 'vehicle';
  ctx.root.add(baked);
  ctx.ambient.dust(0, north - 2, 20, 3);
  ctx.ambient.dust(0, 2, 22, 6);

  const life = ctx.life;
  const y = STREET;
  life.add({ kind: 'worker', x: 4.0, y, z: storeZ + 1.6, yaw: 0.1 });
  life.add({ kind: 'argue', x: -8.0, y, z: storeZ + 1.8, yaw: -0.4 });
  life.add({ kind: 'walker', x: -(W / 2 + 3.2), y, z: 3, yaw: 0, toX: -(W / 2 + 3.2), toZ: -4 });
  life.add({ kind: 'onlooker', x: W / 2 + 2.9, y, z: 1.0, yaw: -1.3 });
}

export const RAID_STOREROOM_SET: ArenaSet = {
  build,
  crowd: 0,
  crowdEdges: { north: false, east: false, west: false, south: false },
};
