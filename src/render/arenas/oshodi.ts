/**
 * Oshodi Interchange: a junction under the flyovers in bright late-morning traffic haze.
 *
 * Presentation only (the grid, roads and hazards are `src/sim/arenas`). This module owns the arena's
 * light (OSHODI_LOOK), its surroundings (OSHODI_SET) and its playfield floor (OSHODI_FLOOR).
 *
 * The board is a road junction: the two road rows (2, 8) and two road columns (4, 10) are painted
 * carriageway with kerbs, lane lines, zebra crossings and yellow box junctions, and the same four
 * roads run on out of the arena on every side. North, the elevated expressway crosses on hammerhead
 * piers with its slip road dropping east; under it queue the buses and kekes on the service road and
 * the under-bridge traders work in its shade. West, a covered steel footbridge carries hawkers over
 * the road to a crowded island of umbrellas and a loading danfo; east, a keke rank, okadas and the
 * green direction gantry. Conductors call, traders bargain, a hi-vis warden waves traffic through and
 * keke men argue. Exhaust and dust hang in the bright haze. The camera (south) side keeps only kerbs,
 * paint and low hawkers' mats.
 */
import { DoubleSide } from 'three';
import type { Material, MeshStandardMaterial, Vector3 } from 'three';
import { getArena } from '../../sim/arenas';
import type { ArenaLook } from '../arenaLook';
import { artRng } from '../textures';
import { box, cyl, mat, uniqueMat } from '../assets/helpers';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import { T, crack, noiseFill, stain, tyreTrack } from './floorKit';
import type { Ctx, FloorDrawer } from './floorKit';
import { Kit } from './marketKit';
import { groundMat, pushTruck, stall } from './marketStalls';
import { SiteLights, sitePalette, v3 } from './roadworksKit';
import { cones } from './roadworksProps';
import { directionGantry, expressway, flyoverPalette, footbridge, slipRoad } from './oshodiFlyover';
import { drum, kerb, sign, signTexture, streetPlane, umbrella, wire } from './oshodiKit';
import type { Paint } from './oshodiKit';

export const OSHODI_LOOK: ArenaLook = {
  // bright late morning: a high, white-gold sun through pale exhaust haze that greys the distance
  sky: 0xd2ccb8,
  fog: { color: 0xc4bca6, near: 17, far: 54 },
  sun: { color: 0xffeccc, intensity: 5.1, position: [7, 19, 9] },
  hemi: { sky: 0xeae2cc, ground: 0x857660, intensity: 1.35 },
  envIntensity: 0.55,
  exposure: 1.2,
  floorTint: 0xcac4b8,
  pillarTint: 0xd4cec0,
  softTint: 0xcfc2b0,
  slab: 0x7a766c,
  street: 0x46443f,
  grit: { tone: 0x968468, dirt: 0x5e5446, dust: 0xb2a284 },
  // broad daylight: no street lamps on
  lamps: [],
};

/** Road geometry around the junction (world metres). */
const ROAD_Z = [-3, 3];
const ROAD_X = [-3, 3];
const HALF = 1.6;
const SERVICE = { n: -10.1, s: -6.9 };
const DECK = { front: -6.85, back: -13.4 };

// ------------------------------------------------------------------------------------------- floor

/** Interlocking paving blocks (stretcher bond), dusty grey and faded terracotta. */
function pavers(g: Ctx, x0: number, y0: number, w: number, h: number, r: () => number): void {
  const bw = 30;
  const bh = 15;
  for (let y = y0; y < y0 + h; y += bh) {
    const off = (Math.floor((y - y0) / bh) % 2) * (bw / 2);
    for (let x = x0 - off; x < x0 + w; x += bw) {
      const terracotta = r() < 0.12;
      const v = 132 + r() * 24;
      g.fillStyle = terracotta ? `rgb(${v + 4},${v - 22},${v - 36})` : `rgb(${v},${v - 3},${v - 9})`;
      g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
    }
  }
}

/** Painted kerb along one tile edge: pale concrete, black and white blocks, a shadow on the road side. */
function kerbEdge(g: Ctx, x: number, y: number, len: number, horizontal: boolean, roadSide: 1 | -1): void {
  const k = 9;
  for (let i = 0; i < len; i += 32) {
    g.fillStyle = (i / 32) % 2 ? 'rgba(206,202,190,0.92)' : 'rgba(28,28,28,0.9)';
    if (horizontal) g.fillRect(x + i, y - k / 2, Math.min(32, len - i), k);
    else g.fillRect(x - k / 2, y + i, k, Math.min(32, len - i));
  }
  g.fillStyle = 'rgba(14,12,10,0.35)';
  if (horizontal) g.fillRect(x, y + (roadSide > 0 ? k / 2 : -k / 2 - 5), len, 5);
  else g.fillRect(x + (roadSide > 0 ? k / 2 : -k / 2 - 5), y, 5, len);
}

/** Zebra bars across a road tile; `alongX` = the road runs along x. */
function zebra(g: Ctx, tx: number, ty: number, alongX: boolean, r: () => number): void {
  const x0 = tx * T;
  const y0 = ty * T;
  for (let k = 0; k < 5; k++) {
    g.fillStyle = `rgba(214,210,196,${0.55 + r() * 0.25})`;
    if (alongX) g.fillRect(x0 + T * 0.2, y0 + 10 + k * 23, T * 0.6, 12);
    else g.fillRect(x0 + 10 + k * 23, y0 + T * 0.2, 12, T * 0.6);
  }
}

export const OSHODI_FLOOR: FloorDrawer = (g, rg, cols, rows) => {
  const w = cols * T;
  const h = rows * T;
  const r = artRng(4401);
  const layout = getArena('oshodiInterchange').layout;
  const road = (x: number, y: number): boolean => layout[y]?.[x] === '=';
  // the pavement: interlocking blocks with dust in the joints
  g.fillStyle = '#5e5a52';
  g.fillRect(0, 0, w, h);
  pavers(g, 0, 0, w, h, r);
  noiseFill(rg, w, h, [215, 215, 215], 22, 45);
  // dust and grime over the blocks
  for (let i = 0; i < 40; i++)
    stain(g, r() * w, r() * h, 60 + r() * 160, `rgba(120,104,82,${0.1 + r() * 0.12})`);
  for (let i = 0; i < 30; i++)
    stain(g, r() * w, r() * h, 30 + r() * 80, `rgba(30,26,22,${0.15 + r() * 0.2})`);
  // a few sunken, patched and missing blocks
  for (let i = 0; i < 26; i++) {
    const x = r() * w;
    const y = r() * h;
    g.fillStyle = r() < 0.5 ? 'rgba(60,56,50,0.65)' : 'rgba(150,146,136,0.45)';
    g.fillRect(x, y, 30 + r() * 60, 15 + r() * 30);
  }
  // the carriageway: tarmac on every road tile
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (!road(x, y)) continue;
      g.fillStyle = 'rgb(66,65,63)';
      g.fillRect(x * T, y * T, T, T);
      rg.fillStyle = 'rgb(175,175,175)';
      rg.fillRect(x * T, y * T, T, T);
    }
  // asphalt grain on the roads (light stones in dark binder)
  for (let i = 0; i < w * h * 0.004; i++) {
    const x = Math.floor(r() * w);
    const y = Math.floor(r() * h);
    if (!road(Math.floor(x / T), Math.floor(y / T))) continue;
    const v = r() < 0.5 ? 100 + r() * 50 : 36 + r() * 16;
    g.fillStyle = `rgba(${v},${v},${v - 3},0.55)`;
    g.fillRect(x, y, 1 + r() * 2, 1 + r() * 2);
  }
  // rubber and oil down the middle of each lane, patches and potholes filled with cold tar
  for (const y of [2, 8]) {
    g.fillStyle = 'rgba(26,24,22,0.32)';
    g.fillRect(0, y * T + T * 0.3, w, T * 0.4);
  }
  for (const x of [4, 10]) {
    g.fillStyle = 'rgba(26,24,22,0.32)';
    g.fillRect(x * T + T * 0.3, 0, T * 0.4, h);
  }
  for (let i = 0; i < 14; i++) {
    const vertical = i % 2 === 0;
    const cx = vertical ? [4, 10][i % 4 < 2 ? 0 : 1]! * T + r() * T * 0.6 : r() * (w - 80);
    const cy = vertical ? r() * (h - 80) : [2, 8][i % 4 < 2 ? 0 : 1]! * T + r() * T * 0.6;
    g.fillStyle = 'rgba(20,20,22,0.55)';
    g.fillRect(cx, cy, 30 + r() * 50, 22 + r() * 40);
    rg.fillStyle = 'rgba(110,110,110,0.7)';
    rg.fillRect(cx, cy, 30 + r() * 50, 22 + r() * 40);
  }
  for (let i = 0; i < 26; i++) {
    const x = r() * w;
    const y = r() * h;
    if (!road(Math.floor(x / T), Math.floor(y / T))) continue;
    stain(g, x, y, 14 + r() * 40, `rgba(10,10,10,${0.35 + r() * 0.3})`);
    stain(rg, x, y, 12 + r() * 30, 'rgba(40,40,40,0.75)');
  }
  // lane markings: worn dashed centre lines, solid edge lines where the road meets the pavement
  g.lineCap = 'butt';
  g.setLineDash([40, 34]);
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(200,164,52,0.7)';
  for (const y of [2, 8]) {
    g.beginPath();
    g.moveTo(0, y * T + T / 2);
    g.lineTo(w, y * T + T / 2);
    g.stroke();
  }
  for (const x of [4, 10]) {
    g.beginPath();
    g.moveTo(x * T + T / 2, 0);
    g.lineTo(x * T + T / 2, h);
    g.stroke();
  }
  g.setLineDash([]);
  // kerbs on every road edge that faces a pavement tile (and edge lines just inside them)
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (!road(x, y)) continue;
      const edges: [number, number, number, number, boolean, 1 | -1][] = [
        [x, y - 1, x * T, y * T, true, 1],
        [x, y + 1, x * T, (y + 1) * T, true, -1],
        [x - 1, y, x * T, y * T, false, 1],
        [x + 1, y, (x + 1) * T, y * T, false, -1],
      ];
      for (const [nx, ny, px, py, horizontal, side] of edges) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || road(nx, ny)) continue;
        g.fillStyle = 'rgba(214,210,198,0.55)';
        if (horizontal) g.fillRect(px, py + side * 12 - (side < 0 ? 4 : 0), T, 4);
        else g.fillRect(px + side * 12 - (side < 0 ? 4 : 0), py, 4, T);
        kerbEdge(g, px, py, T, horizontal, side);
      }
    }
  // yellow box junctions where the roads cross
  for (const [jx, jy] of [
    [4, 2],
    [10, 2],
    [4, 8],
    [10, 8],
  ] as const) {
    const x0 = jx * T + 8;
    const y0 = jy * T + 8;
    g.save();
    g.beginPath();
    g.rect(x0, y0, T - 16, T - 16);
    g.clip();
    g.strokeStyle = 'rgba(206,168,48,0.62)';
    g.lineWidth = 6;
    for (let k = -T; k < T * 2; k += 26) {
      g.beginPath();
      g.moveTo(x0 + k, y0);
      g.lineTo(x0 + k + T, y0 + T);
      g.moveTo(x0 + k + T, y0);
      g.lineTo(x0 + k, y0 + T);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = 'rgba(206,168,48,0.75)';
    g.lineWidth = 6;
    g.strokeRect(x0, y0, T - 16, T - 16);
  }
  // zebra crossings mid-block on every road, with stop lines before the junctions
  zebra(g, 7, 2, true, r);
  zebra(g, 7, 8, true, r);
  zebra(g, 4, 5, false, r);
  zebra(g, 10, 5, false, r);
  g.fillStyle = 'rgba(214,210,196,0.6)';
  for (const [x, y] of [
    [3, 2],
    [11, 2],
    [3, 8],
    [11, 8],
  ] as const)
    g.fillRect(x * T + (x < 7 ? T - 10 : 4), y * T + 6, 6, T - 12);
  for (const [x, y] of [
    [4, 1],
    [10, 1],
    [4, 9],
    [10, 9],
  ] as const)
    g.fillRect(x * T + 6, y * T + (y < 5 ? T - 10 : 4), T - 12, 6);
  // tyre smears, cracks and litter (pure-water sachets, receipts, bottle tops)
  for (let i = 0; i < 8; i++) tyreTrack(g, r, w, h, 'rgba(24,22,20,0.2)');
  for (let i = 0; i < cols * rows * 0.25; i++)
    crack(g, r, r() * w, r() * h, 3 + Math.floor(r() * 7), 'rgba(18,16,14,0.6)', 2);
  for (let i = 0; i < 320; i++) {
    g.fillStyle = r() < 0.6 ? `rgba(206,206,196,${0.25 + r() * 0.35})` : `rgba(140,60,40,${0.2 + r() * 0.3})`;
    g.fillRect(r() * w, r() * h, 3 + r() * 8, 2 + r() * 5);
  }
};

// --------------------------------------------------------------------------------------- the street

/** The street around the board: tarmac roads, markings, pavements and the dirt under the bridge. */
function streetGround(ctx: SetContext): void {
  streetPlane(ctx, 'osh:street', { x: 0, z: -3, w: 56, d: 30, ppm: 28 }, (g: Paint, px, s, r) => {
    const rect = (x0: number, z0: number, x1: number, z1: number, fill: string): void => {
      const [a, b] = px(x0, z0);
      const [c, d] = px(x1, z1);
      g.fillStyle = fill;
      g.fillRect(a, b, c - a, d - b);
    };
    const W = 56 * s;
    const D = 30 * s;
    // pavements: dusty concrete with sand along the edges
    g.fillStyle = '#8c8476';
    g.fillRect(0, 0, W, D);
    for (let i = 0; i < 2600; i++) {
      const v = 96 + r() * 40;
      g.fillStyle = `rgba(${v + 6},${v},${v - 10},0.35)`;
      g.fillRect(r() * W, r() * D, 4 + r() * 18, 3 + r() * 10);
    }
    // under the expressway: packed earth, spilt water and rubbish
    rect(-28, -18, 28, SERVICE.n - 0.3, '#5a5044');
    for (let i = 0; i < 90; i++) {
      const [x, y] = px(-28 + r() * 56, -18 + r() * (SERVICE.n + 18));
      g.fillStyle = r() < 0.5 ? 'rgba(30,26,22,0.4)' : 'rgba(140,128,110,0.3)';
      g.beginPath();
      g.ellipse(x, y, 10 + r() * 40, 6 + r() * 20, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // carriageways
    const tar = '#55534e'; // sun-bleached tarmac
    rect(-28, SERVICE.n, 28, SERVICE.s, tar);
    for (const z of ROAD_Z) rect(-28, z - HALF, 28, z + HALF, tar);
    for (const x of ROAD_X) rect(x - HALF, -18, x + HALF, 12, tar);
    // tar grain, rubber lines and oil drips
    for (let i = 0; i < 9000; i++) {
      const v = r() < 0.5 ? 92 + r() * 40 : 30 + r() * 14;
      g.fillStyle = `rgba(${v},${v},${v - 2},0.3)`;
      g.fillRect(r() * W, r() * D, 1 + r() * 2, 1 + r() * 2);
    }
    for (const z of ROAD_Z)
      for (const off of [-0.8, 0.8]) rect(-28, z + off - 0.25, 28, z + off + 0.25, 'rgba(22,20,18,0.28)');
    for (let i = 0; i < 70; i++) {
      const z = ROAD_Z[i % 2]! + (r() - 0.5) * 2.4;
      const [x, y] = px(-28 + r() * 56, z);
      g.fillStyle = `rgba(12,12,12,${0.3 + r() * 0.3})`;
      g.beginPath();
      g.ellipse(x, y, 6 + r() * 16, 4 + r() * 8, 0, 0, Math.PI * 2);
      g.fill();
    }
    // lane lines: yellow centre dashes, white edge lines
    g.lineWidth = Math.max(3, s * 0.12);
    g.setLineDash([s * 1.6, s * 1.4]);
    g.strokeStyle = 'rgba(200,164,52,0.75)';
    const line = (x0: number, z0: number, x1: number, z1: number): void => {
      const [a, b] = px(x0, z0);
      const [c, d] = px(x1, z1);
      g.beginPath();
      g.moveTo(a, b);
      g.lineTo(c, d);
      g.stroke();
    };
    for (const z of ROAD_Z) {
      line(-28, z, -8.3, z);
      line(8.3, z, 28, z);
    }
    for (const x of ROAD_X) {
      line(x, -18, x, SERVICE.n);
      line(x, SERVICE.s, x, -6.3);
      line(x, 6.3, x, 12);
    }
    line(-28, (SERVICE.n + SERVICE.s) / 2, 28, (SERVICE.n + SERVICE.s) / 2);
    g.setLineDash([]);
    g.strokeStyle = 'rgba(214,210,198,0.6)';
    g.lineWidth = Math.max(2, s * 0.09);
    for (const z of ROAD_Z)
      for (const e of [-HALF + 0.25, HALF - 0.25]) {
        line(-28, z + e, -8.3, z + e);
        line(8.3, z + e, 28, z + e);
      }
    // zebra crossings just outside the arena on the four roads, and on the service road
    const bars = (cx: number, cz: number, alongX: boolean, n: number): void => {
      for (let k = 0; k < n; k++) {
        const o = -((n - 1) * 0.5) / 2 + k * 0.5;
        if (alongX) rect(cx - 0.7, cz + o - 0.15, cx + 0.7, cz + o + 0.15, 'rgba(216,212,198,0.72)');
        else rect(cx + o - 0.15, cz - 0.7, cx + o + 0.15, cz + 0.7, 'rgba(216,212,198,0.72)');
      }
    };
    for (const z of ROAD_Z) {
      bars(-10.2, z, true, 6);
      bars(10.2, z, true, 6);
    }
    for (const x of ROAD_X) {
      bars(x, 7.6, false, 6);
      bars(x - 6, (SERVICE.n + SERVICE.s) / 2, false, 6);
    }
    // yellow box junctions where the roads cross the service road
    g.strokeStyle = 'rgba(206,168,48,0.6)';
    g.lineWidth = Math.max(3, s * 0.1);
    for (const x of ROAD_X) {
      const [a, b] = px(x - HALF, SERVICE.n);
      const [c, d] = px(x + HALF, SERVICE.s);
      g.save();
      g.beginPath();
      g.rect(a, b, c - a, d - b);
      g.clip();
      for (let k = -100; k < 200; k += s * 0.7) {
        g.beginPath();
        g.moveTo(a + k, b);
        g.lineTo(a + k + (d - b), d);
        g.moveTo(a + k + (d - b), b);
        g.lineTo(a + k, d);
        g.stroke();
      }
      g.restore();
      g.strokeRect(a, b, c - a, d - b);
    }
    // a painted BUS STOP bay on the west road
    {
      const [a, b] = px(-14.5, 1.75);
      g.fillStyle = 'rgba(206,168,48,0.6)';
      g.font = `bold ${Math.round(s * 0.55)}px system-ui, sans-serif`;
      g.fillText('BUS STOP', a, b + s * 0.6);
    }
    // general grime, sand drifts at the kerbs, litter
    for (let i = 0; i < 160; i++) {
      const [x, y] = px(-28 + r() * 56, -18 + r() * 30);
      g.fillStyle = `rgba(${r() < 0.5 ? '20,18,16' : '150,132,104'},${0.08 + r() * 0.12})`;
      g.beginPath();
      g.ellipse(x, y, 20 + r() * 70, 10 + r() * 30, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 1600; i++) {
      g.fillStyle =
        r() < 0.55
          ? `rgba(214,214,204,${0.3 + r() * 0.4})`
          : `rgba(${100 + r() * 100},${40 + r() * 60},30,${0.3 + r() * 0.3})`;
      g.fillRect(r() * W, r() * D, 2 + r() * 4, 1 + r() * 3);
    }
  });

  // kerbs: black and white blocks along every road edge outside the arena
  const ka = mat(0xc4c0b4, { roughness: 0.9 });
  const kb = mat(0x222220, { roughness: 0.9 });
  for (const z of ROAD_Z)
    for (const e of [-HALF, HALF]) {
      kerb(ctx, -26, z + e, -8.4, z + e, ka, kb);
      kerb(ctx, 8.4, z + e, 26, z + e, ka, kb);
    }
  // the service road's kerbs, broken by the four cross roads
  const spans: [number, number][] = [
    [-26, -4.6],
    [-1.4, 1.4],
    [4.6, 26],
  ];
  for (const [a, b] of spans) {
    kerb(ctx, a, SERVICE.s, b, SERVICE.s, ka, kb);
    kerb(ctx, a, SERVICE.n, b, SERVICE.n, ka, kb);
  }
  // camera side: only the kerb line of the south pavement
  for (const [a, b] of [
    [-12, -4.6],
    [-1.4, 1.4],
    [4.6, 12],
  ] as [number, number][])
    kerb(ctx, a, 6.95, b, 6.95, ka, kb, 0.12);
}

/** Trader furniture: umbrellas, cool boxes, tables of goods, a suya grill. */
function traders(ctx: SetContext, kit: Kit): void {
  const s = ctx.statics;
  // sun-faded umbrella canvas (both faces drawn: the valances are seen from outside and in)
  const cloth: MeshStandardMaterial[] = [0xa8442e, 0xc8a844, 0x2e5a86, 0xd2ccb8, 0x3a744a, 0xb8622c].map(
    (hex) => {
      const m = uniqueMat(hex, { roughness: 0.88 });
      m.side = DoubleSide;
      ctx.own(m);
      return m;
    },
  );
  const c = (n: number): Material => cloth[n % cloth.length]!;
  const wood = mat(0x6e5440, { roughness: 0.95 });
  const cooler = mat(0x2e5c9a, { roughness: 0.6 });
  const tray = mat(0x8a8a84, { roughness: 0.5, metalness: 0.5 });
  const table = (x: number, z: number, ry: number, goods: number): void => {
    const g = box(1.1, 0.05, 0.6, wood, x, STREET + 0.78, z);
    g.rotation.y = ry;
    s.add(g);
    for (const [dx, dz] of [
      [-0.48, -0.25],
      [0.48, -0.25],
      [-0.48, 0.25],
      [0.48, 0.25],
    ] as const) {
      const leg = box(
        0.05,
        0.76,
        0.05,
        wood,
        x + Math.cos(ry) * dx + Math.sin(ry) * dz,
        STREET + 0.38,
        z - Math.sin(ry) * dx + Math.cos(ry) * dz,
      );
      s.add(leg);
    }
    for (let k = 0; k < 5; k++) {
      const gx = x + Math.cos(ry) * (-0.4 + k * 0.2);
      const gz = z - Math.sin(ry) * (-0.4 + k * 0.2);
      s.add(box(0.16, 0.08 + ((k + goods) % 3) * 0.05, 0.4, c(k + goods), gx, STREET + 0.85, gz));
    }
  };
  // west island: the umbrellas around the bus stop
  const W = [
    [-9.55, -0.55, 0, 1],
    [-11.6, -0.65, 2, 3],
    [-13.5, -0.5, 4, 0],
    [-15.4, -0.6, 5, 3],
  ] as const;
  for (const [x, z, a, b] of W) umbrella(ctx, x, z, 0.92, c(a), c(b), { h: 1.95 });
  table(-9.5, -0.35, 0.1, 0);
  table(-12.0, -0.45, -0.1, 2);
  s.add(box(0.55, 0.42, 0.4, cooler, -10.55, STREET + 0.21, -0.2)); // pure-water cooler
  s.add(box(0.6, 0.05, 0.45, tray, -10.55, STREET + 0.44, -0.2));
  // a suya spot at the island's east end: grill on a drum, wood smoke
  drum(ctx, mat(0x3a3430, { roughness: 0.8, metalness: 0.4 }), -8.95, 0.9);
  s.add(box(0.7, 0.04, 0.4, mat(0x1c1a18, { roughness: 0.5, metalness: 0.6 }), -8.95, STREET + 0.92, 0.9));
  ctx.ambient.smokeColumn(-8.95, STREET + 1.0, 0.9, { shade: 0.85, size: 0.5, rate: 3 });
  // east pavement south of road B: umbrellas and tables
  umbrella(ctx, 9.9, 5.65, 0.9, c(5), c(3), { h: 1.95 });
  umbrella(ctx, 11.8, 5.95, 0.95, c(1), c(2), { h: 1.95 });
  table(10.1, 5.4, 0, 4);
  // east island: a vulcaniser (tyre repairer) under a faded umbrella
  umbrella(ctx, 13.0, -0.15, 0.9, c(2), c(3), { h: 1.95 });
  ctx.instance('env_tyrestack', [
    { x: 12.4, y: STREET, z: 0.6, ry: 0.3, sx: 0.8, sy: 0.7, sz: 0.8 },
    { x: 13.4, y: STREET, z: -0.9, ry: 1.1, sx: 0.8, sy: 0.5, sz: 0.8 },
  ]);
  // west pavement south of road B, by the footbridge stairs
  umbrella(ctx, -9.4, 5.9, 0.85, c(0), c(3), { h: 1.95 });
  table(-9.4, 5.7, 0.05, 1);
  // under the expressway: the under-bridge market in the shade
  kit.statics.updateMatrixWorld();
  stall(
    kit,
    { x: -10.2, y: STREET, z: -10.7, ry: 0 },
    { w: 2.2, d: 1.3, goods: 'provisions', roof: 'tarp', front: 2.0, back: 2.2, seed: 3, sign: 6 },
  );
  stall(
    kit,
    { x: 10.0, y: STREET, z: -10.7, ry: 0 },
    { w: 2.2, d: 1.3, goods: 'basins', roof: 'patch', front: 2.0, back: 2.2, seed: 6 },
  );
  stall(
    kit,
    { x: -5.8, y: STREET, z: -10.9, ry: 0 },
    { w: 1.5, d: 1.1, goods: 'cloth', roof: 'sheet', front: 1.9, back: 2.1, seed: 9 },
  );
  stall(
    kit,
    { x: 5.9, y: STREET, z: -10.9, ry: 0 },
    { w: 1.5, d: 1.1, goods: 'grain', roof: 'tarp', front: 1.9, back: 2.1, seed: 12 },
  );
  pushTruck(kit, { x: -1.0, y: STREET, z: -11.4, ry: 0.2 }, 'sacks', 4);
  // camera side: hawkers' low mats only (under the wall height)
  groundMat(kit, { x: -6.3, y: STREET, z: 7.6, ry: 0 }, 2);
  groundMat(kit, { x: 6.1, y: STREET, z: 7.5, ry: 0.1 }, 5);
}

/** The keke rank, okadas, the danfos and taxis working the junction. */
function traffic(ctx: SetContext): void {
  const y = STREET;
  // north service road under the expressway: buses idling nose to tail, a taxi, kekes
  ctx.vehicles(
    'danfo',
    [
      { x: -8.8, y, z: -7.9, ry: Math.PI / 2 + 0.02 },
      { x: 8.3, y, z: -9.1, ry: -Math.PI / 2 },
      // west: a bus loading at the island stop; east: one pulling off down road B
      { x: -12.4, y, z: 2.2, ry: -Math.PI / 2 + 0.04 },
      { x: 11.0, y, z: 3.85, ry: Math.PI / 2 - 0.05 },
      // a bus coming down the north road under the bridge
      { x: -2.2, y, z: -12.6, ry: Math.PI - 0.03 },
      // go-slow: buses queued into the junction on the east and west roads
      { x: -11.2, y, z: -3.75, ry: Math.PI / 2 + 0.03 },
      { x: 11.2, y, z: 2.25, ry: -Math.PI / 2 - 0.04 },
    ],
    { idle: true },
  );
  ctx.vehicles(
    'taxi',
    [
      { x: -14.2, y, z: -7.8, ry: Math.PI / 2 },
      { x: 10.3, y, z: -3.75, ry: Math.PI / 2 - 0.02 },
      { x: -16.3, y, z: -3.7, ry: Math.PI / 2 },
      { x: -10.0, y, z: 3.8, ry: Math.PI / 2 + 0.05 },
      { x: 3.8, y, z: -13.0, ry: 0.02 },
    ],
    { idle: true },
  );
  // the keke rank on the east island and kekes waiting under the bridge
  ctx.vehicles('keke', [
    { x: 9.4, y, z: 0.15, ry: -Math.PI / 2 },
    { x: 11.3, y, z: 0.25, ry: -Math.PI / 2 + 0.06 },
    { x: -4.9, y, z: -8.6, ry: Math.PI / 2 },
    { x: 15.0, y, z: -2.35, ry: -Math.PI / 2 },
    { x: -13.4, y, z: 3.75, ry: Math.PI / 2 },
  ]);
  ctx.vehicles('okada', [
    { x: 10.2, y, z: -0.95, ry: 2.5 },
    { x: 10.9, y, z: -1.05, ry: 2.6 },
    { x: 11.6, y, z: -0.95, ry: 2.4 },
    { x: -8.9, y, z: 4.9, ry: -0.5 },
    { x: -9.0, y, z: -2.2, ry: -1.4 },
    { x: 9.1, y, z: 2.4, ry: 1.7 },
    { x: 1.0, y, z: -9.4, ry: 1.4 },
  ]);
}

function build(ctx: SetContext): void {
  const P = flyoverPalette();
  const L = new SiteLights();
  const kit = new Kit(ctx);
  streetGround(ctx);

  // ------------------------------------------------------------ north: the expressway and its piers
  expressway(ctx, P, {
    front: DECK.front,
    back: DECK.back,
    soffit: 2.95,
    depth: 1.25,
    piers: [-13, -7.2, 0, 7.2, 13],
  });
  // the slip road peeling off and dropping east over the NE corner
  const east = slipRoad(ctx, P, { x0: 8.4, x1: 24, zs: -4.6, zn: DECK.front + 0.05, top: 4.2 });
  const west = slipRoad(ctx, P, { x0: -8.4, x1: -24, zs: -4.6, zn: DECK.front + 0.05, top: 4.2 });
  // traffic on the ramps: a danfo coming down east, a taxi climbing west (pitched to the grade)
  const grade = Math.atan(4.2 / 15.6);
  ctx.vehicles('danfo', [{ x: 12.2, y: east(12.2) + 0.03, z: -5.65, ry: Math.PI / 2, rx: grade }], {
    idle: true,
  });
  ctx.vehicles('taxi', [{ x: -12.8, y: west(-12.8) + 0.03, z: -5.75, ry: Math.PI / 2, rx: -grade }]);
  // the expressway's lamp standards on the south parapet (off by day)
  // (their heads are out of frame; only the poles rising from the parapet read)

  // ------------------------------------------------------------ west: the footbridge over road A
  const banner = signTexture('osh:banner', 512, 96, {
    bg: '#c8b88a',
    fg: '#6a1c16',
    lines: [['MEGA CRUSADE • OSHODI • ALL WELCOME', 40]],
    wear: 1.3,
  });
  footbridge(ctx, P, { x: -11.0, z0: 0.3, z1: 5.8, h: 3.15, stairs: 4.4, banner });
  // ------------------------------------------------------------ east: the direction gantry over road A
  directionGantry(ctx, P, 10.4, -4.75, -1.25, 3.3, -Math.PI / 2);

  // street furniture: a bus-stop sign, warning boards, a traffic light pole at each corner
  const pole = mat(0x4c4e4c, { roughness: 0.55, metalness: 0.6 });
  const busStop = signTexture('osh:busstop', 256, 256, {
    bg: '#c8a43a',
    fg: '#1c1a16',
    lines: [
      ['BUS', 64],
      ['STOP', 64],
      ['OSHODI', 30],
    ],
    border: '#1c1a16',
  });
  sign(ctx, busStop, -9.35, 2.3, 1.1, 0.62, 0.62, 0.3, { posts: 1, postMat: pole });
  const warn = signTexture('osh:nopark', 256, 256, {
    bg: '#d8d4c6',
    fg: '#8a1e18',
    lines: [
      ['NO', 52],
      ['PARKING', 44],
      ['TOW AWAY', 30],
    ],
    border: '#8a1e18',
  });
  sign(ctx, warn, 9.0, 1.9, -5.3, 0.5, 0.5, -0.25, { posts: 1, postMat: pole });
  for (const [x, z] of [
    [-8.9, -5.1],
    [8.9, 5.2],
    [-8.9, 5.0],
  ] as const) {
    ctx.statics.add(cyl(0.06, 0.07, 2.8, pole, x, STREET + 1.4, z, 6));
    ctx.statics.add(box(0.26, 0.72, 0.22, mat(0x1e1e1c, { roughness: 0.6 }), x, STREET + 2.55, z + 0.12));
  }
  // the traffic lights' lamps: one red, one amber, one green (dull in the daylight, but lit)
  L.glow(-8.9, STREET + 2.75, -4.95, 0.35, 0xff3a2a, 0.6);
  L.glow(8.9, STREET + 2.55, 5.35, 0.35, 0xffb030, 0.6);
  L.glow(-8.9, STREET + 2.35, 5.15, 0.35, 0x40ff80, 0.6);

  // utility poles and the tangle of service wires slung across the side roads
  const poles: { x: number; z: number; ry: number }[] = [
    { x: 9.7, z: -6.35, ry: Math.PI / 2 },
    { x: -9.7, z: -6.4, ry: Math.PI / 2 },
    { x: 13.6, z: 0.9, ry: Math.PI / 2 },
    { x: -13.8, z: 5.6, ry: Math.PI / 2 },
  ];
  ctx.instance(
    'env_poles',
    poles.map((p) => ({ ...p, y: STREET })),
  );
  const tip = (p: { x: number; z: number; ry: number }, side: number, dy = 0): Vector3 =>
    v3(p.x + Math.cos(p.ry) * side * 1.35, STREET + 3.45 + dy, p.z - Math.sin(p.ry) * side * 1.35);
  const cableBlack = mat(0x1c1c1c, { roughness: 0.6 });
  for (const [a, b, sag] of [
    [poles[0]!, poles[2]!, 0.7],
    [poles[1]!, poles[3]!, 0.8],
  ] as const)
    for (const side of [-1, 1]) wire(ctx, tip(a, side), tip(b, side), sag, cableBlack, 0.02);
  wire(ctx, tip(poles[0]!, -1), v3(14.5, STREET + 3.0, -11), 0.6, cableBlack, 0.02);
  wire(ctx, tip(poles[1]!, 1), v3(-15, STREET + 3.1, -11), 0.6, cableBlack, 0.02);
  wire(ctx, tip(poles[2]!, 1), v3(20, STREET + 3.4, 4), 0.5, cableBlack, 0.02);
  wire(ctx, tip(poles[3]!, -1), v3(-20, STREET + 3.2, 0), 0.5, cableBlack, 0.02);
  // fluorescent tubes on the piers light the under-bridge market
  for (const x of [-13, -7.2, 7.2, 13])
    L.glow(x, STREET + 2.2, (DECK.front + DECK.back) / 2 + 1.0, 0.9, 0xe8f4ff, 0.55);

  // road clutter: drums used as a makeshift divider, cones, a broken barrier
  const drumRed = mat(0x8a2e22, { roughness: 0.75, metalness: 0.3 });
  const drumWhite = mat(0xbab4a6, { roughness: 0.75, metalness: 0.3 });
  drum(ctx, drumRed, 13.6, 1.25, { band: drumWhite });
  drum(ctx, drumWhite, 14.3, 1.25, { band: drumRed });
  drum(ctx, drumRed, -15.2, -1.3, { band: drumWhite, lying: 0.6 });
  const site = sitePalette();
  cones(
    ctx,
    site,
    [
      [9.2, -5.6],
      [9.9, -5.4],
      [-9.1, 4.6],
    ],
    1,
  );

  traders(ctx, kit);
  traffic(ctx);
  kit.finish();

  // ------------------------------------------------------------ atmosphere: exhaust haze, dust
  ctx.ambient.dust(0, (SERVICE.n + SERVICE.s) / 2, 18, 2.6);
  ctx.ambient.dust(-11, -3, 4, 3);
  ctx.ambient.dust(11, 3, 4, 3);
  ctx.ambient.smokeColumn(-12.0, STREET + 0.4, -11.6, { shade: 0.55, size: 0.9, rate: 2 }); // refuse burning under the bridge
  L.build(ctx);

  // ------------------------------------------------------------ street life (most visible first)
  const life = ctx.life;
  life.add({ y: STREET, kind: 'conductor', x: -10.6, z: 1.15, yaw: -0.4, toX: -13.6, toZ: 1.05 });
  life.add({ y: STREET, kind: 'seller', x: -9.6, z: 0.35, yaw: 0.4 });
  life.add({ y: STREET, kind: 'argue', x: 10.4, z: 1.05, yaw: 1.2 }); // keke men over a fare
  life.add({ y: STREET, kind: 'worker', x: 2.9, z: -8.4, yaw: 0.3 }); // the traffic warden in the yellow box
  life.add({ kind: 'walker', x: -11.0, y: STREET + 3.21, z: 0.8, yaw: 0, toX: -11.0, toZ: 5.3 });
  life.add({ y: STREET, kind: 'conductor', x: -6.4, z: -7.3, yaw: 0.2, toX: -4.9, toZ: -7.2 });
  life.add({ y: STREET, kind: 'seller', x: 10.6, z: 5.8, yaw: -0.6 });
  life.add({ y: STREET, kind: 'walker', x: -8.9, z: -6.6, yaw: 0, toX: 8.9, toZ: -6.6 });
  life.add({ y: STREET, kind: 'onlooker', x: 9.0, z: -0.9, yaw: -1.9 });
  life.add({ y: STREET, kind: 'seller', x: -10.2, z: -10.0, yaw: 0 });
  life.add({ y: STREET, kind: 'fight', x: 1.0, z: -11.0, yaw: 1.4 }); // area boys under the bridge
  life.add({ y: STREET, kind: 'walker', x: 9.3, z: 5.0, yaw: 0, toX: 13.5, toZ: 5.0 });
  life.add({ y: STREET, kind: 'onlooker', x: -12.6, z: -0.6, yaw: 0.6 });
  life.add({ y: STREET, kind: 'walker', x: -13.0, z: 5.3, yaw: 0, toX: -9.0, toZ: 5.3 });
}

export const OSHODI_SET: ArenaSet = {
  build,
  // the junction's people are its own street life (no spectator platforms across the side roads)
  crowd: 0,
  crowdEdges: { north: false, east: false, west: false, south: false },
};
