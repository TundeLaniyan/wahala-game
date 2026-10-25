/**
 * City Rumble V2 - Oshodi Rush Hour (presentation only; the grid, roads and hazards are
 * `src/sim/arenas/rumbleOshodi.ts`). The flagship stage: the interchange at midday load.
 *
 * Floor: interlocking pavers in the bus-park blocks, sun-bleached tarmac on the two dual carriageways and
 * the two cross roads (yellow centre lines, white edge lines, zebra crossings and yellow box junctions),
 * the red-surfaced BRT corridor along the centre row, and the hard shadow band the flyover deck throws
 * over rows 12-18, with the pier footings stained into it. The corner Danfo bays are painted BUS STOP.
 *
 * Surroundings: the elevated expressway on hammerhead piers crosses the whole north side with a slip road
 * dropping east; a covered footbridge carries hawkers over the west carriageway; a green direction gantry
 * spans the east one; a BRT shelter waits at both ends of the corridor; Danfos, kekes and taxis queue
 * nose-to-tail in every road mouth with their exhaust hanging in the haze; umbrellas, tables and
 * under-bridge stalls line the pavements; conductors call, traders sell, a warden waves traffic through.
 * The camera (south) side keeps kerbs, okadas and hawkers' low mats only.
 */
import { DoubleSide } from 'three';
import type { Material, MeshStandardMaterial } from 'three';
import type { ArenaLook } from '../arenaLook';
import { artRng } from '../textures';
import { box, cyl, mat, uniqueMat } from '../assets/helpers';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import { T, crack, noiseFill, stain, tyreTrack } from './floorKit';
import type { FloorDrawer } from './floorKit';
import { Kit } from './marketKit';
import { groundMat, pushTruck, stall } from './marketStalls';
import { SiteLights, sitePalette } from './roadworksKit';
import { cones } from './roadworksProps';
import { directionGantry, expressway, flyoverPalette, footbridge, slipRoad } from './oshodiFlyover';
import { drum, kerb, sign, signTexture, streetPlane, umbrella } from './oshodiKit';
import type { Paint } from './oshodiKit';
import { dash, floorWords, layoutOf, litter, mouthTraffic, paintKerbs, paintRoads, tileWorld, zebraTile } from './rumbleV2Kit';

const ID = 'rumbleOshodi';

export const RUMBLE_OSHODI_LOOK: ArenaLook = {
  // bright midday: a high white sun through pale exhaust haze that greys the far streets
  sky: 0xd0c8b2,
  fog: { color: 0xc2b8a0, near: 24, far: 82 },
  sun: { color: 0xfff0d0, intensity: 5.0, position: [9, 24, 12] },
  hemi: { sky: 0xeae2cc, ground: 0x857660, intensity: 1.3 },
  envIntensity: 0.55,
  exposure: 1.18,
  floorTint: 0xc8c2b6,
  pillarTint: 0xd2ccbe,
  softTint: 0xcfc2b0,
  slab: 0x7a766c,
  street: 0x46443f,
  grit: { tone: 0x968468, dirt: 0x5e5446, dust: 0xb2a284 },
  lamps: [],
};

// ------------------------------------------------------------------------------------------- floor

export const RUMBLE_OSHODI_FLOOR: FloorDrawer = (g, rg, cols, rows) => {
  const layout = layoutOf(ID);
  const r = artRng(5101);
  const w = cols * T;
  const h = rows * T;
  noiseFill(g, g.canvas.width, g.canvas.height, [150, 146, 138], 20, 31);
  noiseFill(rg, rg.canvas.width, rg.canvas.height, [216, 216, 216], 22, 32);
  // interlocking pavers (stretcher bond) on the blocks, a few terracotta and sunken ones
  for (let y = 0; y < h; y += 30) {
    const off = (Math.floor(y / 30) % 2) * 30;
    for (let x = -off; x < w; x += 60) {
      const v = 128 + r() * 26;
      g.fillStyle = r() < 0.1 ? `rgba(${v + 6},${v - 22},${v - 38},0.55)` : `rgba(${v},${v - 3},${v - 10},0.45)`;
      g.fillRect(x + 2, y + 2, 56, 26);
    }
  }
  for (let i = 0; i < cols * rows * 0.2; i++)
    stain(g, r() * w, r() * h, 40 + r() * 120, `rgba(110,96,76,${0.08 + r() * 0.1})`);
  paintRoads(g, rg, layout, r, [70, 68, 64]);
  // the BRT corridor (row 15): red-surfaced, solid white edges, BRT ONLY every few tiles
  const brt = 15;
  g.fillStyle = 'rgba(128,46,36,0.55)';
  g.fillRect(0, brt * T, w, T);
  g.fillStyle = 'rgba(226,222,208,0.75)';
  g.fillRect(0, brt * T + 4, w, 6);
  g.fillRect(0, (brt + 1) * T - 10, w, 6);
  for (let x = 3; x < cols - 2; x += 8) floorWords(g, 'BRT ONLY', x + 0.5, brt + 0.55, 0.32, 'rgba(232,226,210,0.7)');
  // carriageways: yellow double centre line, white dashed lane edges
  for (const y of [7, 24]) {
    g.fillStyle = 'rgba(214,176,52,0.8)';
    g.fillRect(0, y * T - 7, w, 4);
    g.fillRect(0, y * T + 3, w, 4);
    dash(g, 0, y - 1 + 0.06, cols, y - 1 + 0.06, 'rgba(226,222,208,0.65)', 5, 0.9, 0.3);
    dash(g, 0, y + 1 - 0.06, cols, y + 1 - 0.06, 'rgba(226,222,208,0.65)', 5, 0.9, 0.3);
  }
  for (const x of [11, 30]) {
    g.fillStyle = 'rgba(214,176,52,0.8)';
    g.fillRect(x * T - 7, 0, 4, h);
    g.fillRect(x * T + 3, 0, 4, h);
  }
  // rubber lines down each lane
  for (const y of [6, 7, 23, 24, 15]) {
    g.fillStyle = 'rgba(24,22,20,0.25)';
    g.fillRect(0, y * T + T * 0.25, w, T * 0.18);
    g.fillRect(0, y * T + T * 0.6, w, T * 0.16);
  }
  paintKerbs(g, layout);
  // yellow box junctions where carriageway and cross road meet
  g.strokeStyle = 'rgba(214,176,52,0.6)';
  g.lineWidth = 6;
  for (const [x0, y0] of [
    [10, 6],
    [29, 6],
    [10, 23],
    [29, 23],
    [10, 15],
    [29, 15],
  ] as const) {
    const bw = 2 * T;
    const bh = (y0 === 15 ? 1 : 2) * T;
    g.save();
    g.beginPath();
    g.rect(x0 * T + 6, y0 * T + 6, bw - 12, bh - 12);
    g.clip();
    for (let k = -bh; k < bw + bh; k += 30) {
      g.beginPath();
      g.moveTo(x0 * T + k, y0 * T);
      g.lineTo(x0 * T + k + bh, y0 * T + bh);
      g.moveTo(x0 * T + k + bh, y0 * T);
      g.lineTo(x0 * T + k, y0 * T + bh);
      g.stroke();
    }
    g.restore();
    g.strokeRect(x0 * T + 6, y0 * T + 6, bw - 12, bh - 12);
  }
  // zebra crossings either side of every junction
  for (const y of [6, 7, 23, 24]) for (const x of [8, 13, 27, 32]) zebraTile(g, x, y, true);
  for (const x of [10, 11, 29, 30]) for (const y of [4, 9, 21, 26]) zebraTile(g, x, y, false);
  // the corner Danfo bays: yellow bay box and BUS STOP
  for (const [x0, y] of [
    [0, 3],
    [35, 3],
    [0, 27],
    [35, 27],
  ] as const) {
    g.strokeStyle = 'rgba(214,176,52,0.85)';
    g.lineWidth = 7;
    g.strokeRect(x0 * T + 6, y * T + 6, 6 * T - 12, T - 12);
    floorWords(g, 'BUS STOP', x0 + 3, y + 0.55, 0.36, 'rgba(214,176,52,0.75)');
  }
  // the flyover deck's shadow over rows 12-18: soft edges, darker under the middle
  const top = 12 * T;
  const bot = 19 * T;
  const grad = g.createLinearGradient(0, top - T * 0.6, 0, bot + T * 0.6);
  grad.addColorStop(0, 'rgba(20,18,16,0)');
  grad.addColorStop(0.12, 'rgba(20,18,16,0.32)');
  grad.addColorStop(0.5, 'rgba(20,18,16,0.4)');
  grad.addColorStop(0.88, 'rgba(20,18,16,0.32)');
  grad.addColorStop(1, 'rgba(20,18,16,0)');
  g.fillStyle = grad;
  g.fillRect(0, top - T * 0.6, w, bot - top + T * 1.2);
  // drainage stains under the deck joints, pier footings and oil everywhere traffic waits
  for (let x = 2; x < cols; x += 5) stain(g, x * T, 15.5 * T, T * 1.4, 'rgba(10,10,10,0.25)');
  for (let i = 0; i < 14; i++) tyreTrack(g, r, w, h, 'rgba(20,18,16,0.16)');
  for (let i = 0; i < cols * rows * 0.22; i++)
    crack(g, r, r() * w, r() * h, 3 + Math.floor(r() * 6), 'rgba(18,16,14,0.5)', 2);
  litter(g, r, cols, rows, 0.7);
};

// ------------------------------------------------------------------------------------------ the set

function street(ctx: SetContext, layout: readonly string[]): void {
  const { W, H } = ctx;
  const { wx, wz } = tileWorld(W, H);
  const roadRows = [6, 7, 15, 23, 24].map(wz);
  const roadCols = [10, 11, 29, 30].map(wx);
  streetPlane(ctx, 'rosh:street', { x: 0, z: -4, w: 100, d: 68, ppm: 10 }, (g: Paint, px, s, r) => {
    const rect = (x0: number, z0: number, x1: number, z1: number, fill: string): void => {
      const [a, b] = px(x0, z0);
      const [c, d] = px(x1, z1);
      g.fillStyle = fill;
      g.fillRect(a, b, c - a, d - b);
    };
    rect(-50, -38, 50, 30, '#8a8274');
    for (let i = 0; i < 3000; i++) {
      const v = 96 + r() * 40;
      g.fillStyle = `rgba(${v + 6},${v},${v - 10},0.35)`;
      const [x, y] = px(-50 + r() * 100, -38 + r() * 68);
      g.fillRect(x, y, 3 + r() * 10, 2 + r() * 6);
    }
    // the roads carry on past the board in every direction
    for (const z of roadRows) rect(-50, z - 0.5, 50, z + 0.5, '#4c4a46');
    for (const x of roadCols) rect(x - 0.5, -38, x + 0.5, 30, '#4c4a46');
    rect(-50, -H / 2 - 9.5, 50, -H / 2 - 1.2, '#4a4844'); // service road under the expressway
    for (let i = 0; i < 9000; i++) {
      const v = r() < 0.5 ? 92 + r() * 40 : 30 + r() * 14;
      g.fillStyle = `rgba(${v},${v},${v - 2},0.25)`;
      const [x, y] = px(-50 + r() * 100, -38 + r() * 68);
      g.fillRect(x, y, 1 + r() * 2, 1 + r() * 2);
    }
    g.fillStyle = 'rgba(214,176,52,0.7)';
    for (const z of [wz(7) - 0.5, wz(24) - 0.5]) rect(-50, z - 0.05, 50, z + 0.05, 'rgba(214,176,52,0.7)');
    rect(-50, wz(15) - 0.5, 50, wz(15) + 0.5, 'rgba(128,46,36,0.5)');
    for (let i = 0; i < 260; i++) {
      const [x, y] = px(-50 + r() * 100, -38 + r() * 68);
      g.fillStyle = `rgba(${r() < 0.5 ? '20,18,16' : '150,132,104'},${0.06 + r() * 0.1})`;
      g.beginPath();
      g.ellipse(x, y, (2 + r() * 7) * s, (1 + r() * 3) * s, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
  void layout;
  // kerbs where the side roads leave the board (black and white), low on the camera side
  const ka = mat(0xc4c0b4, { roughness: 0.9 });
  const kb = mat(0x222220, { roughness: 0.9 });
  for (const z of [wz(6) - 0.5, wz(7) + 0.5, wz(23) - 0.5, wz(24) + 0.5]) {
    kerb(ctx, -40, z, -W / 2 - 1.6, z, ka, kb);
    kerb(ctx, W / 2 + 1.6, z, 40, z, ka, kb);
  }
}

function traders(ctx: SetContext, kit: Kit): void {
  const { W, H } = ctx;
  const { wz } = tileWorld(W, H);
  const cloth: MeshStandardMaterial[] = [0xa8442e, 0xc8a844, 0x2e5a86, 0xd2ccb8, 0x3a744a, 0xb8622c].map((hex) => {
    const m = uniqueMat(hex, { roughness: 0.88 });
    m.side = DoubleSide;
    ctx.own(m);
    return m;
  });
  const c = (n: number): Material => cloth[n % cloth.length]!;
  const wood = mat(0x6e5440, { roughness: 0.95 });
  const table = (x: number, z: number, n: number): void => {
    ctx.statics.add(box(1.1, 0.05, 0.6, wood, x, STREET + 0.78, z));
    for (const [dx, dz] of [
      [-0.48, -0.25],
      [0.48, -0.25],
      [-0.48, 0.25],
      [0.48, 0.25],
    ] as const)
      ctx.statics.add(box(0.05, 0.76, 0.05, wood, x + dx, STREET + 0.38, z + dz));
    for (let k = 0; k < 5; k++) ctx.statics.add(box(0.16, 0.08 + ((k + n) % 3) * 0.05, 0.4, c(k + n), x - 0.4 + k * 0.2, STREET + 0.85, z));
  };
  // umbrellas and tables on the pavements beyond the west and east edges, between the road mouths
  const blocks = [wz(1.5), wz(4.5), wz(11), wz(19), wz(25.5), wz(29)];
  let n = 0;
  for (const z of blocks) {
    for (const side of [-1, 1]) {
      const x = side * (W / 2 + 2.1 + (n % 2) * 0.6);
      umbrella(ctx, x, z, 0.95, c(n), c(n + 3), { h: 2.0 });
      if (n % 2 === 0) table(x + side * 0.2, z + 0.3, n);
      n++;
    }
  }
  const cooler = mat(0x2e5c9a, { roughness: 0.6 });
  ctx.statics.add(box(0.55, 0.42, 0.4, cooler, -W / 2 - 1.6, STREET + 0.21, wz(12)));
  ctx.statics.add(box(0.55, 0.42, 0.4, cooler, W / 2 + 1.7, STREET + 0.21, wz(20)));
  // a suya spot by the west BRT shelter
  drum(ctx, mat(0x3a3430, { roughness: 0.8, metalness: 0.4 }), -W / 2 - 2.4, wz(13));
  ctx.ambient.smokeColumn(-W / 2 - 2.4, STREET + 1.0, wz(13), { shade: 0.85, size: 0.5, rate: 3 });
  // the under-bridge market between the expressway piers
  kit.statics.updateMatrixWorld();
  const deckZ = -H / 2 - 5.2;
  const goods = ['provisions', 'basins', 'cloth', 'grain'] as const;
  [-22, -12.5, -6.5, 6.5, 12.5, 22].forEach((x, k) =>
    stall(kit, { x, y: STREET, z: deckZ, ry: 0 }, {
      w: 2.0,
      d: 1.2,
      goods: goods[k % 4]!,
      roof: k % 2 ? 'tarp' : 'sheet',
      front: 2.0,
      back: 2.2,
      seed: 3 + k * 3,
      sign: k % 3 === 0 ? 4 + k : undefined,
    }),
  );
  pushTruck(kit, { x: 0.8, y: STREET, z: deckZ - 0.4, ry: 0.2 }, 'sacks', 4);
  // camera side: hawkers' low mats only
  groundMat(kit, { x: -12.0, y: STREET, z: H / 2 + 1.5, ry: 0 }, 2);
  groundMat(kit, { x: 14.0, y: STREET, z: H / 2 + 1.4, ry: 0.1 }, 5);
}

function build(ctx: SetContext): void {
  const { W, H } = ctx;
  const { wx, wz } = tileWorld(W, H);
  const layout = layoutOf(ID);
  const north = -H / 2;
  const P = flyoverPalette();
  const L = new SiteLights();
  const kit = new Kit(ctx);
  street(ctx, layout);

  // ------------------------------------------------------------ north: the expressway and its slip road
  expressway(ctx, P, { front: north - 2.4, back: north - 9.6, soffit: 3.4, depth: 1.3, piers: [-27, -17, -3.5, 3.5, 17, 27] });
  const east = slipRoad(ctx, P, { x0: W / 2 + 1, x1: W / 2 + 17, zs: north - 0.6, zn: north - 2.35, top: 4.6 });
  ctx.vehicles('danfo', [{ x: W / 2 + 6, y: east(W / 2 + 6) + 0.03, z: north - 1.45, ry: Math.PI / 2, rx: Math.atan(4.6 / 16) }], { idle: true });
  // fluorescent tubes on the piers light the under-bridge market
  for (const x of [-17, -3.5, 3.5, 17]) L.glow(x, STREET + 2.4, north - 5.4, 0.9, 0xe8f4ff, 0.5);

  // ------------------------------------------------------------ west: footbridge; east: gantry
  const banner = signTexture('rosh:banner', 512, 96, {
    bg: '#c8b88a',
    fg: '#6a1c16',
    lines: [['OSHODI • ISOLO • IKEJA • MILE 2', 40]],
    wear: 1.3,
  });
  footbridge(ctx, P, { x: -W / 2 - 4.6, z0: wz(4.5), z1: wz(9.5), h: 3.3, stairs: 4.4, banner });
  directionGantry(ctx, P, W / 2 + 3.6, wz(22.2), wz(25), 3.4, -Math.PI / 2);
  // BRT shelters at both ends of the corridor: a steel canopy, a bench, the blue sign
  const steel = mat(0x5a6470, { roughness: 0.5, metalness: 0.6 });
  const brtSign = signTexture('rosh:brt', 256, 128, { bg: '#1e4a8a', fg: '#f0ece0', lines: [['BRT', 54], ['OSHODI', 26]], border: '#f0ece0' });
  for (const side of [-1, 1]) {
    const x = side * (W / 2 + 3.4);
    const z = wz(15) + 1.6;
    for (const dx of [-1.4, 1.4]) ctx.statics.add(box(0.1, 2.4, 0.1, steel, x + dx, STREET + 1.2, z + 0.4));
    ctx.statics.add(box(3.2, 0.08, 1.4, steel, x, STREET + 2.42, z));
    ctx.statics.add(box(2.4, 0.06, 0.4, mat(0x2e3a48, { roughness: 0.6 }), x, STREET + 0.46, z + 0.2));
    sign(ctx, brtSign, x + side * -1.7, 2.1, z - 0.3, 0.9, 0.45, side * -Math.PI / 2, { posts: 1, postMat: steel });
  }
  // traffic lights at the junction mouths, one lamp lit on each
  const pole = mat(0x4c4e4c, { roughness: 0.55, metalness: 0.6 });
  const lights: [number, number, number][] = [
    [wx(9) - 0.3, north - 0.9, 0xff3a2a],
    [wx(31) + 0.3, north - 0.9, 0x40ff80],
    [-W / 2 - 0.9, wz(5), 0xffb030],
    [W / 2 + 0.9, wz(22), 0xff3a2a],
  ];
  for (const [x, z, col] of lights) {
    ctx.statics.add(cyl(0.06, 0.07, 2.8, pole, x, STREET + 1.4, z, 6));
    ctx.statics.add(box(0.26, 0.72, 0.22, mat(0x1e1e1c, { roughness: 0.6 }), x, STREET + 2.55, z));
    L.glow(x, STREET + 2.6, z + 0.13, 0.35, col, 0.6);
  }
  // road clutter: a drum divider, cones, a broken barrier
  const red = mat(0x8a2e22, { roughness: 0.75, metalness: 0.3 });
  const white = mat(0xbab4a6, { roughness: 0.75, metalness: 0.3 });
  drum(ctx, red, -W / 2 - 1.4, wz(15) - 1.0, { band: white });
  drum(ctx, white, W / 2 + 1.4, wz(15) + 1.0, { band: red });
  cones(ctx, sitePalette(), [
    [wx(12) + 0.4, north - 1.2],
    [wx(28) - 0.4, north - 1.3],
    [-W / 2 - 1.2, wz(26)],
  ], 1);

  // ------------------------------------------------------------ traffic in every road mouth
  mouthTraffic(ctx, layout, { kinds: ['danfo', 'keke', 'danfo', 'taxi', 'danfo', 'keke'], depth: 2 });
  ctx.vehicles('okada', [
    { x: -W / 2 - 1.5, y: STREET, z: wz(2), ry: 2.5 },
    { x: -W / 2 - 1.6, y: STREET, z: wz(2.8), ry: 2.6 },
    { x: W / 2 + 1.5, y: STREET, z: wz(18.5), ry: -2.4 },
    { x: wx(6), y: STREET, z: H / 2 + 1.3, ry: 1.5 },
    { x: wx(34), y: STREET, z: H / 2 + 1.3, ry: -1.4 },
  ]);

  traders(ctx, kit);
  kit.finish();

  // ------------------------------------------------------------ atmosphere: exhaust haze, dust
  ctx.ambient.dust(0, north - 5, 24, 3);
  for (const z of [wz(6.5), wz(23.5), wz(15)]) {
    ctx.ambient.dust(-W / 2 - 6, z, 4, 1.2);
    ctx.ambient.dust(W / 2 + 6, z, 4, 1.2);
  }
  L.build(ctx);

  // ------------------------------------------------------------ street life
  const life = ctx.life;
  const y = STREET;
  life.add({ y, kind: 'conductor', x: -W / 2 - 2.0, z: wz(5.4), yaw: 1.2, toX: -W / 2 - 4.5, toZ: wz(5.4) });
  life.add({ y, kind: 'conductor', x: wx(12.4), z: north - 1.4, yaw: 0.1, toX: wx(13.6), toZ: north - 1.5 });
  life.add({ y, kind: 'seller', x: -W / 2 - 2.5, z: wz(11.4), yaw: Math.PI / 2 });
  life.add({ y, kind: 'seller', x: W / 2 + 2.4, z: wz(19.4), yaw: -Math.PI / 2 });
  life.add({ y, kind: 'worker', x: wx(20), z: north - 1.2, yaw: 0.2 }); // the traffic warden
  life.add({ kind: 'walker', x: -W / 2 - 4.6, y: STREET + 3.36, z: wz(5), yaw: 0, toX: -W / 2 - 4.6, toZ: wz(9) });
  life.add({ y, kind: 'argue', x: W / 2 + 2.3, z: wz(4.4), yaw: 1.1 }); // keke men over a fare
  life.add({ y, kind: 'onlooker', x: W / 2 + 2.0, z: wz(12.6), yaw: -1.7 });
  life.add({ y, kind: 'walker', x: -14, z: north - 1.0, yaw: 0, toX: 14, toZ: north - 1.0 });
  life.add({ y, kind: 'conductor', x: W / 2 + 2.2, z: wz(26.4), yaw: -1.4, toX: W / 2 + 4.6, toZ: wz(26.4) });
  life.add({ y, kind: 'seller', x: -6.5, z: north - 4.2, yaw: 0 });
  life.add({ y, kind: 'walker', x: -W / 2 - 1.8, z: wz(18), yaw: 0, toX: -W / 2 - 1.8, toZ: wz(28) });
  life.add({ y, kind: 'onlooker', x: -W / 2 - 3.2, z: wz(16.4), yaw: 1.5 }); // waiting for the BRT
  life.add({ y, kind: 'seller', x: 12.5, z: north - 4.3, yaw: 0.2 });
}

export const RUMBLE_OSHODI_SET: ArenaSet = {
  build,
  crowd: 0,
  crowdEdges: { north: false, east: false, west: false, south: false },
};
