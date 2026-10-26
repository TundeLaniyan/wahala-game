/**
 * City Rumble Evolution - Ojuelegba Underbridge, five districts (presentation only; the grid, districts
 * and hazards are `src/sim/arenas/rumbleOjuelegba.ts`). Late afternoon round the Ojuelegba flyover.
 *
 * - Board cover: every permanent tile is drawn as the object it is (`ojuelegbaCover.ts`, from the cover map
 *   in `ojuelegbaCoverMap.ts`): piers, parked Danfos, shop buildings, kiosks, walls, the park fence...
 * - Floor (this file, per district): the Western Approach is a worn dual carriageway (lane dashes, yellow
 *   edge lines, the zebra and the hatched box junction under the bridge) between broken kerbside slabs and
 *   a laterite compound; the Pier Court lies in the deck's deep shadow with expansion-joint drip lines
 *   across it above every pier line, stained footings and big cast slabs; the Danfo Park is oily compacted
 *   concrete with painted bays, the aisle arrows and DEPARTURE on the lane; the Shopfront Lane is
 *   interlocking pavers with a gutter along the shop fronts; the Service Loop is cracked hardstanding with
 *   fuel stains, ONE WAY arrows and the hatched loading bays.
 * - Light pockets (`RUMBLE_OJUELEGBA_LOOK.lamps`): fluorescent tubes under the bridge, a sodium lamp over the
 *   park, bulbs in the shop lane and over the generator house.
 * - Surroundings: the flyover deck runs on north of the board on twin columns (OJUELEGBA on its fascia,
 *   Danfos on top: never over the board); the park gate with its board and a queue of Danfos north of the
 *   park; traffic queued in every road mouth; shophouses east and west; stalls and umbrellas on the north
 *   pavement; poles and wires; the south (camera) side keeps okadas, a kerb and hawkers' mats only.
 */
import { DoubleSide, PlaneGeometry } from 'three';
import { getArena } from '../../sim';
import type { ArenaLook } from '../arenaLook';
import { artRng } from '../textures';
import { box, cyl, mat, mesh, uniqueMat } from '../assets/helpers';
import type { CoverFactory } from './boardCover';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import { T, crack, noiseFill, stain, tyreTrack } from './floorKit';
import type { Ctx, FloorDrawer } from './floorKit';
import { Kit } from './marketKit';
import { groundMat, stall } from './marketStalls';
import { buildOjuelegbaCover } from './ojuelegbaCover';
import { flyoverPalette } from './oshodiFlyover';
import { drum, sign, signTexture, umbrella, wire } from './oshodiKit';
import { SiteLights, v3 } from './roadworksKit';
import { shophouseRows } from './shared';
import {
  dash,
  floorWords,
  litter,
  mouthTraffic,
  paintKerbs,
  paintRoads,
  tileWorld,
  zebraTile,
} from './rumbleV2Kit';

const ID = 'rumbleOjuelegba';
/** Tile columns under the flyover deck (the deck itself runs on north, off the board). */
const DECK_X0 = 16;
const DECK_X1 = 28;
/** Board rows of the pier bents (the deck's expansion joints sit over them). */
const JOINT_ROWS = [2, 6, 14, 19];

export const RUMBLE_OJUELEGBA_LOOK: ArenaLook = {
  // late afternoon: a low amber sun from the west, long hard shadows, brown haze
  sky: 0xa08a6c,
  fog: { color: 0x8a7660, near: 20, far: 72 },
  sun: { color: 0xffc488, intensity: 4.2, position: [-16, 17, 9] },
  hemi: { sky: 0xd8bc9c, ground: 0x5a4838, intensity: 1.1 },
  envIntensity: 0.46,
  exposure: 1.12,
  floorTint: 0xb8ac9a,
  pillarTint: 0xc4bcae,
  softTint: 0xc4b6a6,
  slab: 0x6a6258,
  street: 0x2a2622,
  grit: { tone: 0x7a644c, dirt: 0x584a3a, dust: 0x8e7a62 },
  // light pockets per district (world x, y, z): fluorescent tubes under the bridge (north and the pier
  // court), a sodium lamp over the Danfo park, bulbs in the shop lane, a lamp over the generator house
  lamps: [
    [0, 3.0, -12, 0xd8ecff],
    [0, 3.0, -0.5, 0xd8ecff],
    [16.5, 3.4, -8, 0xffa850],
    [-12, 2.8, 9.5, 0xffb060],
    [9.5, 2.8, 9, 0xffa040],
  ],
};

// ------------------------------------------------------------------------------------------- floor

const layout = (): readonly string[] => getArena(ID).layout;

function districtAt(x: number, y: number): string {
  const d = getArena(ID).districts?.find((z) =>
    z.rects.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1),
  );
  return d?.id ?? '';
}

/** Interlocking pavers over one tile (the shop lane). */
function pavers(g: Ctx, r: () => number, x: number, y: number): void {
  const pw = T / 4;
  const ph = T / 8;
  for (let j = 0; j < 8; j++)
    for (let i = 0; i < 5; i++) {
      const off = j % 2 ? pw / 2 : 0;
      const v = r();
      g.fillStyle =
        v < 0.55
          ? `rgba(${132 + r() * 20},${84 + r() * 14},${66 + r() * 10},0.55)`
          : `rgba(${128 + r() * 20},${124 + r() * 16},${116 + r() * 12},0.5)`;
      g.fillRect(x * T + i * pw - off + 1, y * T + j * ph + 1, pw - 2, ph - 2);
    }
}

/** Cast concrete slabs with joints (the pier court, the service yard). */
function slabs(g: Ctx, r: () => number, x: number, y: number, tone: number, joint: string): void {
  g.fillStyle = `rgba(${tone + r() * 12},${tone - 4 + r() * 10},${tone - 12 + r() * 8},0.35)`;
  g.fillRect(x * T, y * T, T, T);
  g.strokeStyle = joint;
  g.lineWidth = 3;
  if (x % 2 === 0) {
    g.beginPath();
    g.moveTo(x * T, y * T);
    g.lineTo(x * T, (y + 1) * T);
    g.stroke();
  }
  if (y % 2 === 0) {
    g.beginPath();
    g.moveTo(x * T, y * T);
    g.lineTo((x + 1) * T, y * T);
    g.stroke();
  }
}

/** Yellow-black hatching over a tile rectangle. */
function hatch(g: Ctx, x0: number, y0: number, x1: number, y1: number, color: string): void {
  g.save();
  g.beginPath();
  g.rect(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T);
  g.clip();
  g.strokeStyle = color;
  g.lineWidth = 9;
  for (let k = -T * 10; k < (x1 - x0 + y1 - y0 + 4) * T; k += 34) {
    g.beginPath();
    g.moveTo(x0 * T + k, y0 * T);
    g.lineTo(x0 * T + k + (y1 - y0 + 1) * T, (y1 + 1) * T);
    g.stroke();
  }
  g.restore();
}

/** A painted direction arrow on a tile (dir: 0 east, 1 south, 2 west, 3 north). */
function arrow(g: Ctx, x: number, y: number, dir: number, color: string): void {
  g.save();
  g.translate((x + 0.5) * T, (y + 0.5) * T);
  g.rotate((dir * Math.PI) / 2);
  g.fillStyle = color;
  g.fillRect(-T * 0.32, -T * 0.06, T * 0.36, T * 0.12);
  g.beginPath();
  g.moveTo(T * 0.04, -T * 0.18);
  g.lineTo(T * 0.34, 0);
  g.lineTo(T * 0.04, T * 0.18);
  g.closePath();
  g.fill();
  g.restore();
}

export const RUMBLE_OJUELEGBA_FLOOR: FloorDrawer = (g, rg, cols, rows) => {
  const L = layout();
  const r = artRng(5301);
  const w = cols * T;
  const h = rows * T;
  const at = (x: number, y: number): string => L[y]?.[x] ?? '#';
  noiseFill(g, g.canvas.width, g.canvas.height, [150, 140, 124], 22, 51);
  noiseFill(rg, rg.canvas.width, rg.canvas.height, [218, 218, 218], 20, 52);

  // ---- district ground
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const c = at(x, y);
      if (c === '=') continue;
      const d = districtAt(x, y);
      if (d === 'shopfrontLane' && y >= 24) pavers(g, r, x, y);
      else if (d === 'pierCourt' && (c === '_' || (y >= 11 && y <= 20)))
        slabs(g, r, x, y, 128, 'rgba(40,36,30,0.45)');
      else if (d === 'serviceLoop') slabs(g, r, x, y, 120, 'rgba(36,34,30,0.5)');
      else if (d === 'danfoPark') {
        // oily compacted concrete
        g.fillStyle = `rgba(${96 + r() * 16},${90 + r() * 12},${80 + r() * 10},0.4)`;
        g.fillRect(x * T, y * T, T, T);
        if (r() < 0.35) stain(g, (x + r()) * T, (y + r()) * T, 20 + r() * 40, 'rgba(10,10,12,0.4)');
      } else if (d === 'westApproach' && y <= 1 && x <= 10) {
        // the compound yard behind the wall: laterite
        g.fillStyle = `rgba(${150 + r() * 20},${92 + r() * 14},${58 + r() * 10},0.5)`;
        g.fillRect(x * T, y * T, T, T);
      } else if (r() < 0.6) {
        // broken kerbside slabs, sand drifting in
        g.fillStyle = `rgba(${120 + r() * 30},${110 + r() * 24},${90 + r() * 20},0.32)`;
        g.fillRect(x * T + r() * 30, y * T + r() * 30, 40 + r() * 60, 30 + r() * 50);
      }
    }

  // ---- roads
  paintRoads(g, rg, L, r, [60, 58, 55]);
  paintKerbs(g, L, 'rgba(206,200,184,0.85)', 'rgba(30,30,30,0.9)');
  // the carriageway: lane dashes, yellow edge lines, a zebra, the box junction under the bridge
  dash(g, 0, 8, 21, 8, 'rgba(230,226,212,0.7)', 6, 0.7, 0.5);
  dash(g, 0, 11, 21, 11, 'rgba(230,226,212,0.7)', 6, 0.7, 0.5);
  g.fillStyle = 'rgba(214,176,52,0.75)';
  g.fillRect(0, 7 * T + 8, 21 * T, 6);
  g.fillRect(0, 12 * T - 14, 21 * T, 6);
  for (let y = 7; y <= 11; y++) if (at(18, y) === '=') zebraTile(g, 18, y, true, 0.62);
  hatch(g, 21, 7, 23, 11, 'rgba(226,186,40,0.55)');
  dash(g, 22, 0, 22, 7, 'rgba(230,226,212,0.6)', 6, 0.7, 0.5);
  dash(g, 23, 0, 23, 7, 'rgba(230,226,212,0.6)', 6, 0.7, 0.5);
  for (const x of [4, 13]) {
    arrow(g, x, 10, 0, 'rgba(232,228,214,0.55)');
    arrow(g, x, 8, 2, 'rgba(232,228,214,0.55)');
  }
  // the park aisle and the departure lane
  for (let y = 2; y <= 14; y += 4) {
    arrow(g, 38, y, 1, 'rgba(240,236,220,0.6)');
    arrow(g, 39, y + 2, 1, 'rgba(240,236,220,0.6)');
  }
  arrow(g, 42, 17, 0, 'rgba(240,236,220,0.6)');
  arrow(g, 41, 18, 0, 'rgba(240,236,220,0.6)');
  floorWords(g, 'DEPARTURE', 41.5, 17.5, 0.42, 'rgba(242,206,64,0.75)');
  // service loop: one-way round the yard
  for (const [x, y, d] of [
    [30, 22, 0],
    [38, 22, 0],
    [42, 25, 1],
    [36, 30, 2],
    [29, 30, 2],
    [27, 26, 3],
  ] as const)
    arrow(g, x, y, d, 'rgba(240,236,220,0.5)');
  floorWords(g, 'ONE WAY', 33.5, 22.5, 0.3, 'rgba(240,236,220,0.6)');

  // ---- the Danfo park: bays painted between the buses, numbers at the aisle end
  g.strokeStyle = 'rgba(232,228,212,0.7)';
  g.lineWidth = 6;
  for (const [x0, x1] of [
    [34, 37],
    [40, 43],
  ] as const)
    for (let y = 1; y <= 16; y++) {
      g.beginPath();
      g.moveTo(x0 * T + 10, y * T);
      g.lineTo((x1 + 1) * T - 10, y * T);
      g.stroke();
    }
  for (let y = 1; y <= 15; y++) {
    floorWords(g, `${y}`, 37.5, y + 0.5, 0.26, 'rgba(242,206,64,0.55)');
    floorWords(g, `${y + 20}`, 40.5, y + 0.5, 0.26, 'rgba(242,206,64,0.55)');
  }
  for (let i = 0; i < 18; i++) tyreTrack(g, r, w, h, 'rgba(20,18,16,0.12)');

  // ---- the service yard: hatched loading bays, fuel round the generator house, drain covers
  hatch(g, 37, 24, 39, 28, 'rgba(226,186,40,0.5)');
  floorWords(g, 'LOADING', 38.5, 26.5, 0.32, 'rgba(240,236,220,0.75)', -Math.PI / 2);
  for (let i = 0; i < 9; i++)
    stain(g, (28 + r() * 6) * T, (23 + r() * 5) * T, 30 + r() * 50, 'rgba(14,12,10,0.4)');
  for (const [x, y] of [
    [33, 26],
    [29, 28],
    [31, 23],
  ] as const) {
    g.fillStyle = 'rgba(30,30,32,0.85)';
    g.fillRect(x * T + 30, y * T + 30, T - 60, T - 60);
    g.strokeStyle = 'rgba(120,116,108,0.7)';
    g.lineWidth = 3;
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.moveTo(x * T + 36 + k * 13, y * T + 32);
      g.lineTo(x * T + 36 + k * 13, (y + 1) * T - 32);
      g.stroke();
    }
  }

  // ---- the shop lane: a gutter along the shop fronts, spills
  g.fillStyle = 'rgba(30,28,24,0.6)';
  g.fillRect(0, 24 * T + 2, 25 * T, 12);
  for (let x = 1; x < 25; x += 3) {
    g.fillStyle = 'rgba(16,16,18,0.8)';
    g.fillRect(x * T + 20, 24 * T, 30, 18);
  }
  for (let i = 0; i < 20; i++)
    stain(g, r() * 25 * T, (24 + r() * 8) * T, 18 + r() * 40, 'rgba(60,44,30,0.25)');

  // ---- under the bridge: the deck's shadow, expansion-joint drips over each pier line, footings
  const x0 = DECK_X0 * T;
  const x1 = (DECK_X1 + 1) * T;
  for (let y = 0; y < rows; y++)
    for (let x = DECK_X0; x <= DECK_X1; x++)
      if (at(x, y) === '#' && districtAt(x, y) === 'pierCourt') {
        stain(g, (x + 0.5) * T, (y + 0.5) * T, T * 1.1, 'rgba(26,22,18,0.28)');
        stain(g, (x + 0.5) * T, (y + 1.2) * T, T * 0.55, 'rgba(10,10,10,0.3)');
      }
  for (const jy of JOINT_ROWS) {
    g.fillStyle = 'rgba(8,8,8,0.34)';
    g.fillRect(x0, jy * T - 7, x1 - x0, 14);
    for (let i = 0; i < 16; i++)
      stain(g, x0 + r() * (x1 - x0), jy * T + (r() - 0.3) * T * 0.8, 14 + r() * 26, 'rgba(12,12,14,0.35)');
  }
  const grad = g.createLinearGradient(x0 - T * 0.8, 0, x1 + T * 0.8, 0);
  grad.addColorStop(0, 'rgba(16,14,12,0)');
  grad.addColorStop(0.06, 'rgba(16,14,12,0.34)');
  grad.addColorStop(0.5, 'rgba(16,14,12,0.42)');
  grad.addColorStop(0.94, 'rgba(16,14,12,0.34)');
  grad.addColorStop(1, 'rgba(16,14,12,0)');
  g.fillStyle = grad;
  g.fillRect(x0 - T * 0.8, 0, x1 - x0 + T * 1.6, 21 * T);
  // the low sun slips in along the deck's west edge
  g.fillStyle = 'rgba(255,200,130,0.1)';
  g.fillRect(x0 - T * 0.9, 0, T * 0.5, 21 * T);
  floorWords(g, 'OJUELEGBA', 22.5, 17, 0.62, 'rgba(232,226,210,0.2)');
  floorWords(g, 'BUS STOP', 22.5, 14.55, 0.3, 'rgba(242,206,64,0.6)');

  for (let i = 0; i < cols * rows * 0.28; i++)
    crack(g, r, r() * w, r() * h, 3 + Math.floor(r() * 7), 'rgba(18,16,14,0.5)', 2);
  litter(g, r, cols, rows, 0.8);
};

// ------------------------------------------------------------------------------------------ the set

/** The flyover running on north of the board: a box-girder deck on twin columns, Danfos on top. */
function flyover(ctx: SetContext, L: SiteLights): void {
  const { W, H } = ctx;
  const P = flyoverPalette();
  const s = ctx.statics;
  const north = -H / 2;
  const x0 = DECK_X0 - W / 2;
  const x1 = DECK_X1 + 1 - W / 2;
  const width = x1 - x0;
  const cx = (x0 + x1) / 2;
  const soffit = STREET + 5.2;
  const z0 = north - 0.9;
  const z1 = north - 46;
  const len = z0 - z1;
  const zc = (z0 + z1) / 2;
  s.add(box(width - 2, 1.0, len, P.deckDark, cx, soffit + 0.5, zc));
  s.add(box(width, 0.4, len, P.deck, cx, soffit + 1.2, zc));
  const fascia = signTexture(
    'roju:fascia',
    1024,
    128,
    { bg: '#8c867a', fg: '#2e2a24', lines: [['OJUELEGBA', 84]], wear: 1.6 },
    81,
  );
  const fm = uniqueMat(0xffffff, { map: fascia, roughness: 0.95 });
  ctx.own(fm);
  s.add(mesh(new PlaneGeometry(width, 1.3), fm, cx, soffit + 0.75, z0 + 0.012));
  for (const side of [-1, 1]) {
    s.add(box(0.25, 0.8, len, P.parapet, cx + side * (width / 2 - 0.12), soffit + 1.8, zc));
    for (let z = z0 - 3; z > z1; z -= 9)
      s.add(cyl(0.06, 0.08, 3.6, P.steel, cx + side * (width / 2 - 0.2), soffit + 3.2, z, 6));
  }
  // twin columns on hammerhead crossheads every 9 m, the same piers as on the board
  for (let z = z0 - 3.2; z > z1 + 2; z -= 9) {
    for (const dx of [-4.5, 4.5]) {
      s.add(cyl(0.62, 0.7, 5.2, P.pier, cx + dx, STREET + 2.6, z, 8));
      s.add(box(1.7, 0.3, 1.7, P.deckDark, cx + dx, STREET + 0.15, z));
    }
    s.add(box(width - 1, 0.8, 1.4, P.pier, cx, soffit - 0.4, z));
  }
  ctx.vehicles('danfo', [
    { x: cx - 2.4, y: soffit + 1.4, z: north - 6, ry: Math.PI },
    { x: cx + 2.2, y: soffit + 1.4, z: north - 14, ry: 0 },
    { x: cx - 2.6, y: soffit + 1.4, z: north - 22, ry: Math.PI },
  ]);
  ctx.vehicles('taxi', [{ x: cx + 2.5, y: soffit + 1.4, z: north - 4.5, ry: 0 }]);
  L.glow(cx - 4.5, STREET + 2.6, north - 3.0, 0.9, 0xe0f0ff, 0.5);
  L.glow(cx + 4.5, STREET + 2.6, north - 3.0, 0.9, 0xe0f0ff, 0.5);
}

function build(ctx: SetContext): void {
  const { W, H } = ctx;
  const { wx, wz } = tileWorld(W, H);
  const L0 = layout();
  const north = -H / 2;
  const S = STREET;
  const L = new SiteLights();
  const kit = new Kit(ctx);

  flyover(ctx, L);
  shophouseRows(ctx, { east: true, west: true, seed: 2, close: 0.2 });

  // the park gate north of the Danfo park: two posts and its board, buses queueing to load
  const gate = signTexture('roju:parkgate', 512, 128, {
    bg: '#1e3a26',
    fg: '#f2e6c0',
    lines: [
      ['OJUELEGBA PARK', 52],
      ['LOADING: OSHODI - YABA - CMS', 26],
    ],
    border: '#f2c21a',
    wear: 1.3,
  });
  sign(ctx, gate, wx(38.5), 3.1, north - 1.4, 2.6, 0.65, 0, { posts: 2 });
  sign(
    ctx,
    signTexture('roju:busstop', 256, 256, {
      bg: '#c8a43a',
      fg: '#1c1a16',
      lines: [
        ['BUS', 60],
        ['STOP', 60],
        ['OJUELEGBA', 28],
      ],
      border: '#1c1a16',
    }),
    wx(17),
    2.4,
    north - 1.6,
    0.7,
    0.7,
    0,
    { posts: 1 },
  );

  // stalls and umbrellas along the north pavement either side of the bridge and the park gate
  const cloth = [0xa8442e, 0xc8a844, 0x2e5a86, 0x3a744a, 0xd2ccb8].map((c) => {
    const m = uniqueMat(c, { roughness: 0.88 });
    m.side = DoubleSide;
    ctx.own(m);
    return m;
  });
  const umbrellas: [number, number][] = [
    [wx(3), north - 1.6],
    [wx(9), north - 1.8],
    [wx(31), north - 1.7],
    [wx(43), north - 1.6],
    [-W / 2 - 2.2, wz(14)],
    [W / 2 + 2.2, wz(10)],
    [-W / 2 - 2.3, wz(29)],
    [W / 2 + 2.3, wz(3)],
  ];
  umbrellas.forEach(([x, z], i) => umbrella(ctx, x, z, 0.9, cloth[i % 5]!, cloth[(i + 2) % 5]!, { h: 2.0 }));
  kit.statics.updateMatrixWorld();
  [wx(2), wx(6), wx(11), wx(30), wx(34), wx(43)].forEach((x, k) =>
    stall(
      kit,
      { x, y: S, z: north - 3.4, ry: 0 },
      {
        w: 2.2,
        d: 1.2,
        goods: (['provisions', 'basins', 'cloth', 'grain'] as const)[k % 4]!,
        roof: k % 2 ? 'sheet' : 'tarp',
        front: 2.0,
        back: 2.3,
        seed: 11 + k * 4,
        sign: k % 2 ? k + 2 : undefined,
      },
    ),
  );
  // a vulcaniser's tyres by the west carriageway; the generator's diesel drums by the east spur
  ctx.instance('env_tyrestack', [
    { x: -W / 2 - 1.8, y: S, z: wz(5), ry: 0.3, sx: 0.8, sy: 0.7, sz: 0.8 },
    { x: -W / 2 - 2.6, y: S, z: wz(4), ry: 1.1, sx: 0.8, sy: 0.5, sz: 0.8 },
    { x: W / 2 + 1.9, y: S, z: wz(29), ry: 0.6, sx: 0.8, sy: 0.6, sz: 0.8 },
  ]);
  drum(ctx, mat(0x8a2e22, { roughness: 0.75, metalness: 0.3 }), -W / 2 - 1.6, wz(6));
  drum(ctx, mat(0x2e4a7a, { roughness: 0.75, metalness: 0.3 }), W / 2 + 1.5, wz(24));
  // traffic queued in every road mouth (the south mouths get okadas only), more buses at the park gate
  mouthTraffic(ctx, L0, { kinds: ['danfo', 'taxi', 'keke', 'danfo', 'taxi'], depth: 2 });
  ctx.vehicles('danfo', [
    { x: wx(37) - 0.4, y: S, z: north - 4.8, ry: 0 },
    { x: wx(40) + 0.6, y: S, z: north - 5.2, ry: 0.05 },
  ]);
  ctx.vehicles('okada', [
    { x: wx(5), y: S, z: H / 2 + 1.3, ry: 1.6 },
    { x: wx(6), y: S, z: H / 2 + 1.35, ry: 1.5 },
    { x: wx(28), y: S, z: H / 2 + 1.3, ry: -1.4 },
    { x: wx(41), y: S, z: H / 2 + 1.3, ry: 1.4 },
    { x: -W / 2 - 1.5, y: S, z: wz(19), ry: 2.6 },
  ]);
  groundMat(kit, { x: -12, y: S, z: H / 2 + 1.5, ry: 0 }, 3);
  groundMat(kit, { x: 4, y: S, z: H / 2 + 1.5, ry: 0.1 }, 6);
  kit.finish();

  // poles and a tangle of service wires over the side streets
  const poles = [
    { x: -W / 2 - 4.2, z: wz(1), ry: Math.PI / 2 },
    { x: -W / 2 - 4.2, z: wz(16), ry: Math.PI / 2 },
    { x: W / 2 + 4.2, z: wz(14), ry: -Math.PI / 2 },
    { x: W / 2 + 4.2, z: wz(31), ry: -Math.PI / 2 },
  ];
  ctx.instance(
    'env_poles',
    poles.map((p) => ({ ...p, y: S })),
  );
  const cable = mat(0x1c1c1c, { roughness: 0.6 });
  for (const [a, b] of [
    [0, 1],
    [2, 3],
  ] as const)
    for (const side of [-1, 1]) {
      const pa = poles[a]!;
      const pb = poles[b]!;
      wire(
        ctx,
        v3(pa.x, S + 3.45, pa.z + side * 0.8),
        v3(pb.x, S + 3.45, pb.z + side * 0.8),
        0.8,
        cable,
        0.02,
      );
    }

  // dust and exhaust under the bridge and along the roads
  ctx.ambient.dust(wx(22), north - 2.5, 7, 2);
  for (const z of [wz(9), wz(17.5)]) {
    ctx.ambient.dust(-W / 2 - 5, z, 4, 1.4);
    ctx.ambient.dust(W / 2 + 5, z, 4, 1.4);
  }
  ctx.ambient.smokeColumn(W / 2 + 3, S + 0.5, north - 2, { shade: 0.8, size: 0.6, rate: 3 }); // roasting corn
  L.build(ctx);

  const life = ctx.life;
  life.add({ y: S, kind: 'conductor', x: wx(37), z: north - 1.3, yaw: 0.2, toX: wx(34), toZ: north - 1.3 }); // calling passengers at the gate
  life.add({
    y: S,
    kind: 'conductor',
    x: W / 2 + 2.4,
    z: wz(17.5),
    yaw: -1.3,
    toX: W / 2 + 5,
    toZ: wz(17.5),
  });
  life.add({ y: S, kind: 'onlooker', x: wx(15), z: north - 2.2, yaw: 0.2 }); // waiting for a bus
  life.add({ y: S, kind: 'onlooker', x: wx(26), z: north - 2.1, yaw: -0.3 });
  life.add({ y: S, kind: 'seller', x: wx(22) + 1.2, z: north - 2.6, yaw: 0 });
  life.add({ y: S, kind: 'argue', x: -W / 2 - 2.2, z: wz(11.5), yaw: 1.2 }); // driver and passenger over the change
  life.add({ y: S, kind: 'walker', x: -14, z: north - 0.8, yaw: 0, toX: -3, toZ: north - 0.8 });
  life.add({ y: S, kind: 'seller', x: -W / 2 - 1.2, z: wz(14), yaw: Math.PI / 2 });
  life.add({ y: S, kind: 'worker', x: -W / 2 - 2.4, z: wz(5), yaw: 1.4 }); // the vulcaniser
  life.add({ y: S, kind: 'walker', x: W / 2 + 1.1, z: wz(2), yaw: 0, toX: W / 2 + 1.1, toZ: wz(14) });
  life.add({ y: S, kind: 'worker', x: W / 2 + 1.6, z: wz(25), yaw: -1.4 }); // the generator man
  life.add({ y: S, kind: 'onlooker', x: wx(41), z: north - 1.4, yaw: -0.5 });
  life.add({ y: S, kind: 'walker', x: 4, z: north - 1.1, yaw: 0, toX: 15, toZ: north - 1.1 });
  life.add({ y: S, kind: 'seller', x: -W / 2 - 1.4, z: wz(26.5), yaw: Math.PI / 2 }); // at the shop lane mouth
}

export const RUMBLE_OJUELEGBA_SET: ArenaSet = {
  build,
  crowd: 0.3,
  crowdEdges: { north: false, east: true, west: true, south: false },
};

/** The board's permanent cover: piers, parked Danfos, shops, kiosks, walls (`ojuelegbaCover.ts`). */
export const RUMBLE_OJUELEGBA_COVER: CoverFactory = (board) =>
  board.width === 45 && board.height === 33 ? buildOjuelegbaCover(board) : null;
