/**
 * City Rumble Evolution - Ojuelegba Underbridge, five districts (presentation only; the grid, districts
 * and hazards are `src/sim/arenas/rumbleOjuelegba.ts`). Late afternoon under the Ojuelegba flyover, which
 * runs east-west over the through road.
 *
 * - Board cover: every permanent tile is drawn as the object it is (`ojuelegbaCover.ts`, from the cover map
 *   in `ojuelegbaCoverMap.ts`): piers, packed Danfos, shops, workshops, kiosks, walls, kerb islands. The
 *   flyover's outer edges and crossheads overhead are cut away round the fighter (`ojuelegbaDeck.ts`).
 * - Floor (this file): the through road (four lanes, centre lines, lane arrows, zebras) under the deck's
 *   shadow band with a hard sun wall at both deck edges, expansion-joint drips over every pier bent and
 *   stained footings; patched asphalt and slab pavements on the approach with painted parking bays; bay lines,
 *   a stop line and DEPARTURE on the bus pocket's strip; pavers and a gutter in the shop lane; oil-stained
 *   hardstanding in the service court. Every authored barrier ('x': empty partitions, parcel stacks) sits in
 *   a painted yellow-and-black frame, so the breakable cover reads as breakable.
 * - Light pockets (`RUMBLE_OJUELEGBA_LOOK.lamps`): LED tubes under the deck (reflected daylight, never a
 *   dark cave), a sodium lamp over the bus pocket, bulbs in the shop lane and over the workshops.
 * - Surroundings: the flyover running on off the board east and west on its piers (Danfos on top); taller
 *   buildings beyond the far (north) edge; traffic queued in every road mouth; the south (camera) side keeps a
 *   kerb, low walls and hawkers' mats only (one incidental okada; commercial okadas are banned here).
 */
import { DoubleSide } from 'three';
import { getArena } from '../../sim';
import type { ArenaLook } from '../arenaLook';
import { artRng } from '../textures';
import { box, cyl, mat, uniqueMat } from '../assets/helpers';
import type { CoverFactory } from './boardCover';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import { T, crack, noiseFill, stain, tyreTrack } from './floorKit';
import type { Ctx, FloorDrawer } from './floorKit';
import { Kit } from './marketKit';
import { groundMat, stall } from './marketStalls';
import { buildOjuelegbaCover } from './ojuelegbaCover';
import { flyoverPalette } from './oshodiFlyover';
import { drum, umbrella, wire } from './oshodiKit';
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
/** Board rows under the deck (the fascia girders stand over rows 11 and 21). */
const DECK_Y0 = 11;
const DECK_Y1 = 21;
/** Board x of the pier bents (the deck's expansion joints sit over them). */
const JOINT_X = [17, 24, 28.5];

export const RUMBLE_OJUELEGBA_LOOK: ArenaLook = {
  // late afternoon: a low amber sun from the west, long hard shadows, brown haze
  sky: 0xa08a6c,
  fog: { color: 0x8a7660, near: 20, far: 72 },
  sun: { color: 0xffc488, intensity: 4.2, position: [-16, 17, 9] },
  hemi: { sky: 0xd8bc9c, ground: 0x6a5848, intensity: 1.2 },
  envIntensity: 0.46,
  exposure: 1.14,
  floorTint: 0xb8ac9a,
  pillarTint: 0xc4bcae,
  softTint: 0xc4b6a6,
  slab: 0x6a6258,
  street: 0x2a2622,
  grit: { tone: 0x7a644c, dirt: 0x584a3a, dust: 0x8e7a62 },
  // light pockets per district (world x, y, z): LED tubes under the deck (west and east of the pier court),
  // a sodium lamp over the bus pocket, bulbs in the shop lane, a lamp over the workshops
  lamps: [
    [-5, 3.4, 0, 0xe8f4ff],
    [5, 3.4, 0, 0xe8f4ff],
    [15.5, 3.2, 6, 0xff9f3a],
    [-11, 2.6, 10, 0xffb060],
    [0, 2.8, -11, 0xffa040],
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
      g.fillStyle =
        r() < 0.55
          ? `rgba(${132 + r() * 20},${84 + r() * 14},${66 + r() * 10},0.55)`
          : `rgba(${128 + r() * 20},${124 + r() * 16},${116 + r() * 12},0.5)`;
      g.fillRect(x * T + i * pw - off + 1, y * T + j * ph + 1, pw - 2, ph - 2);
    }
}

/** Cast concrete slabs with joints (pavements, the service court). */
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

/** Yellow hatching over a tile rectangle. */
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

/** The painted frame round a breakable barrier: yellow-and-black chevrons on the tile edge. */
function barrierFrame(g: Ctx, x: number, y: number): void {
  const k = 12;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? 'rgba(20,20,20,0.85)' : 'rgba(236,190,30,0.85)';
    const t = (i * T) / 8;
    g.fillRect(x * T + t, y * T, T / 8, k);
    g.fillRect(x * T + t, (y + 1) * T - k, T / 8, k);
    g.fillRect(x * T, y * T + t, k, T / 8);
    g.fillRect((x + 1) * T - k, y * T + t, k, T / 8);
  }
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
      if (c === '=' || c === '#') continue;
      const d = districtAt(x, y);
      if (d === 'shopfrontLane') pavers(g, r, x, y);
      else if (d === 'serviceLoop') {
        slabs(g, r, x, y, 116, 'rgba(36,34,30,0.5)');
        if (r() < 0.25) stain(g, (x + r()) * T, (y + r()) * T, 24 + r() * 44, 'rgba(12,10,8,0.38)');
      } else if (d === 'danfoPark') {
        // oily compacted concrete of the bus pocket
        g.fillStyle = `rgba(${96 + r() * 16},${90 + r() * 12},${80 + r() * 10},0.4)`;
        g.fillRect(x * T, y * T, T, T);
        if (r() < 0.35) stain(g, (x + r()) * T, (y + r()) * T, 20 + r() * 40, 'rgba(10,10,12,0.4)');
      } else slabs(g, r, x, y, 132, 'rgba(46,40,34,0.42)'); // pavements of the approach and the pier court
    }

  // ---- the through road and the departure strip
  paintRoads(g, rg, L, r, [60, 58, 55]);
  // asphalt patches: squarer, darker repairs
  for (let i = 0; i < 26; i++) {
    const px = Math.floor(r() * cols);
    const py = 15 + Math.floor(r() * 4);
    g.fillStyle = `rgba(${34 + r() * 10},${33 + r() * 10},${32 + r() * 8},0.7)`;
    g.fillRect(px * T + r() * 30, py * T + r() * 30, 50 + r() * 70, 40 + r() * 50);
  }
  paintKerbs(g, L, 'rgba(206,200,184,0.85)', 'rgba(30,30,30,0.9)');
  // double yellow centre line, white lane dashes, yellow edge lines
  g.fillStyle = 'rgba(222,180,44,0.8)';
  g.fillRect(0, 17 * T - 12, w, 6);
  g.fillRect(0, 17 * T + 6, w, 6);
  g.fillRect(0, 15 * T + 8, w, 5);
  g.fillRect(0, 19 * T - 13, w, 5);
  dash(g, 0, 16, cols, 16, 'rgba(230,226,212,0.7)', 6, 0.7, 0.5);
  dash(g, 0, 18, cols, 18, 'rgba(230,226,212,0.7)', 6, 0.7, 0.5);
  for (const x of [4, 12, 33]) {
    arrow(g, x, 17, 0, 'rgba(232,228,214,0.55)');
    arrow(g, x + 2, 18, 0, 'rgba(232,228,214,0.55)');
    arrow(g, x + 1, 15, 2, 'rgba(232,228,214,0.55)');
    arrow(g, x + 3, 16, 2, 'rgba(232,228,214,0.55)');
  }
  // zebras where the approach and the pocket cross the road, and across the clear bay under the bridge
  for (const x of [13, 20, 30]) for (let y = 15; y <= 18; y++) zebraTile(g, x, y, false, 0.6);
  // the departure strip: arrows up, a stop line at the road, DEPARTURE along it, a hatched mouth
  for (let y = 21; y <= 31; y += 3) {
    arrow(g, 41, y, 3, 'rgba(240,236,220,0.6)');
    arrow(g, 42, y + 1, 3, 'rgba(240,236,220,0.6)');
  }
  g.fillStyle = 'rgba(236,232,220,0.8)';
  g.fillRect(41 * T, 19 * T + 6, 2 * T, 10);
  floorWords(g, 'DEPARTURE', 42, 25.5, 0.36, 'rgba(242,206,64,0.75)', -Math.PI / 2);
  hatch(g, 41, 19, 42, 19, 'rgba(226,186,40,0.45)');

  // ---- the bus pocket: bay lines round the parked buses, numbers at the bay mouths
  g.strokeStyle = 'rgba(232,228,212,0.7)';
  g.lineWidth = 6;
  for (let x = 33; x <= 37; x++)
    for (const [y0, y1] of [
      [20, 22],
      [23, 25],
    ] as const) {
      g.beginPath();
      g.moveTo(x * T, y0 * T + 8);
      g.lineTo(x * T, y1 * T - 8);
      g.stroke();
    }
  for (let x = 33; x <= 36; x++) {
    floorWords(g, `${x - 32}`, x + 0.5, 22.4, 0.24, 'rgba(242,206,64,0.55)');
    floorWords(g, `${x - 28}`, x + 0.5, 25.4, 0.24, 'rgba(242,206,64,0.55)');
  }
  for (const y of [12, 14]) {
    g.beginPath();
    g.moveTo(31 * T, y * T);
    g.lineTo(37 * T, y * T);
    g.stroke();
  }
  floorWords(g, 'LOADING', 39, 12.5, 0.32, 'rgba(240,236,220,0.6)');
  for (let i = 0; i < 16; i++) tyreTrack(g, r, w, h, 'rgba(20,18,16,0.12)');

  // ---- the approach: two painted parking recesses
  for (const y of [12, 20]) {
    g.strokeStyle = 'rgba(236,232,220,0.75)';
    g.lineWidth = 6;
    g.strokeRect(10 * T + 6, y * T + 6, 2 * T - 12, T - 12);
    floorWords(g, 'P', 11, y + 0.5, 0.5, 'rgba(236,232,220,0.6)');
  }

  // ---- the shop lane: a gutter along the shop fronts with grates, spills
  g.fillStyle = 'rgba(30,28,24,0.6)';
  g.fillRect(7 * T, 24 * T + 2, 7 * T, 12);
  g.fillRect(14 * T, 25 * T + 2, 17 * T, 12);
  for (let x = 8; x < 31; x += 3) {
    g.fillStyle = 'rgba(16,16,18,0.8)';
    g.fillRect(x * T + 20, (x < 14 ? 24 : 25) * T, 30, 18);
  }
  for (let i = 0; i < 18; i++)
    stain(g, r() * 31 * T, (24 + r() * 7) * T, 18 + r() * 40, 'rgba(60,44,30,0.25)');

  // ---- the service court: oil under the workshops, a NO PARKING stencil at the yard gate
  for (let i = 0; i < 14; i++)
    stain(g, (10 + r() * 25) * T, (6 + r() * 2.5) * T, 30 + r() * 50, 'rgba(14,12,10,0.4)');
  floorWords(g, 'NO PARKING', 22.5, 8.5, 0.3, 'rgba(236,232,220,0.55)');

  // ---- every authored barrier in a painted frame (breakable, and it says so)
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (at(x, y) === 'x') barrierFrame(g, x, y);

  // ---- under the deck: footing stains, expansion-joint drips over each bent, the shadow band
  for (let y = DECK_Y0; y <= DECK_Y1; y++)
    for (let x = 14; x <= 30; x++)
      if (at(x, y) === '#') {
        stain(g, (x + 0.5) * T, (y + 0.5) * T, T * 1.1, 'rgba(26,22,18,0.26)');
        stain(g, (x + 0.5) * T, (y + 1.2) * T, T * 0.5, 'rgba(10,10,10,0.28)');
      }
  for (const jx of JOINT_X) {
    g.fillStyle = 'rgba(8,8,8,0.3)';
    g.fillRect(jx * T - 7, DECK_Y0 * T, 14, (DECK_Y1 - DECK_Y0 + 1) * T);
    for (let i = 0; i < 12; i++)
      stain(
        g,
        jx * T + (r() - 0.5) * T * 0.8,
        (DECK_Y0 + r() * 10) * T,
        14 + r() * 24,
        'rgba(12,12,14,0.32)',
      );
  }
  const y0 = DECK_Y0 * T + T * 0.3;
  const y1 = (DECK_Y1 + 1) * T - T * 0.3;
  const grad = g.createLinearGradient(0, y0 - T * 0.6, 0, y1 + T * 0.6);
  grad.addColorStop(0, 'rgba(16,14,12,0)');
  grad.addColorStop(0.05, 'rgba(16,14,12,0.3)');
  grad.addColorStop(0.5, 'rgba(16,14,12,0.34)');
  grad.addColorStop(0.95, 'rgba(16,14,12,0.3)');
  grad.addColorStop(1, 'rgba(16,14,12,0)');
  g.fillStyle = grad;
  g.fillRect(0, y0 - T * 0.6, w, y1 - y0 + T * 1.2);
  // the hard sun wall along both deck edges
  g.fillStyle = 'rgba(255,206,140,0.12)';
  g.fillRect(0, y0 - T * 0.95, w, T * 0.35);
  g.fillRect(0, y1 + T * 0.6, w, T * 0.35);

  for (let i = 0; i < cols * rows * 0.26; i++)
    crack(g, r, r() * w, r() * h, 3 + Math.floor(r() * 7), 'rgba(18,16,14,0.5)', 2);
  litter(g, r, cols, rows, 0.6);
};

// ------------------------------------------------------------------------------------------ the set

/** The flyover running on off the board east and west: deck, parapets and piers; Danfos on top. */
function flyover(ctx: SetContext, L: SiteLights): void {
  const { W, H } = ctx;
  const P = flyoverPalette();
  const s = ctx.statics;
  const { wz } = tileWorld(W, H);
  const zN = wz(DECK_Y0) - 0.2;
  const zS = wz(DECK_Y1) + 0.2;
  const zc = (zN + zS) / 2;
  const width = zS - zN + 0.4;
  const soffit = 4.4;
  for (const side of [-1, 1]) {
    const x0 = side * (W / 2 + 0.45);
    const x1 = side * (W / 2 + 34);
    const len = Math.abs(x1 - x0);
    const cx = (x0 + x1) / 2;
    s.add(box(len, 0.9, width - 1.2, P.deckDark, cx, soffit + 0.45, zc));
    s.add(box(len, 0.4, width, P.deck, cx, soffit + 1.05, zc));
    for (const z of [zN, zS]) s.add(box(len, 0.75, 0.42, P.parapet, cx, soffit + 0.38, z));
    // piers every 8 m, in pairs either side of the road below
    for (let x = x0 + side * 5; Math.abs(x) < Math.abs(x1) - 2; x += side * 8) {
      for (const z of [zN + 1, zS - 1]) {
        s.add(cyl(0.7, 0.78, soffit - STREET, P.pier, x, STREET + (soffit - STREET) / 2, z, 8));
        s.add(box(1.8, 0.3, 1.8, P.deckDark, x, STREET + 0.15, z));
      }
      s.add(box(1.3, 0.62, width - 0.6, P.pier, x, soffit - 0.3, zc));
    }
    ctx.vehicles('danfo', [
      { x: cx - side * 6, y: soffit + 1.25, z: zc - 2, ry: side > 0 ? -Math.PI / 2 : Math.PI / 2 },
      { x: cx + side * 4, y: soffit + 1.25, z: zc + 2, ry: side > 0 ? Math.PI / 2 : -Math.PI / 2 },
    ]);
    L.glow(x0 + side * 2, STREET + 2.8, zN + 1.2, 0.9, 0xe8f4ff, 0.5);
  }
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
  // tall buildings beyond the far edge and down the side streets
  shophouseRows(ctx, { north: true, east: true, west: true, seed: 2, close: 0.2 });

  const cloth = [0xa8442e, 0xc8a844, 0x2e5a86, 0x3a744a, 0xd2ccb8].map((c) => {
    const m = uniqueMat(c, { roughness: 0.88 });
    m.side = DoubleSide;
    ctx.own(m);
    return m;
  });
  // traders beyond the edges: umbrellas and stalls on the side pavements
  const umbrellas: [number, number][] = [
    [-W / 2 - 2.2, wz(7)],
    [-W / 2 - 2.3, wz(25)],
    [W / 2 + 2.2, wz(23)],
    [W / 2 + 2.3, wz(29)],
  ];
  umbrellas.forEach(([x, z], i) => umbrella(ctx, x, z, 0.9, cloth[i % 5]!, cloth[(i + 2) % 5]!, { h: 2.0 }));
  kit.statics.updateMatrixWorld();
  [wz(24), wz(28)].forEach((z, k) =>
    stall(
      kit,
      { x: -W / 2 - 2.4, y: S, z, ry: Math.PI / 2 },
      {
        w: 2.2,
        d: 1.2,
        goods: (['provisions', 'basins'] as const)[k]!,
        roof: k % 2 ? 'sheet' : 'tarp',
        front: 2.0,
        back: 2.3,
        seed: 11 + k * 4,
        sign: k + 2,
      },
    ),
  );
  ctx.instance('env_tyrestack', [
    { x: -W / 2 - 1.8, y: S, z: wz(4), ry: 0.3, sx: 0.8, sy: 0.7, sz: 0.8 },
    { x: W / 2 + 1.9, y: S, z: wz(5), ry: 0.6, sx: 0.8, sy: 0.6, sz: 0.8 },
  ]);
  drum(ctx, mat(0x8a2e22, { roughness: 0.75, metalness: 0.3 }), W / 2 + 1.6, wz(7));
  // traffic queued in every road mouth (the south mouth of the strip: the depot gate, buses waiting)
  mouthTraffic(ctx, L0, { kinds: ['danfo', 'taxi', 'keke', 'danfo', 'taxi'], depth: 2 });
  ctx.vehicles('okada', [{ x: wx(9), y: S, z: H / 2 + 1.3, ry: 1.6 }]); // one incidental bike, no okada rank
  groundMat(kit, { x: -12, y: S, z: H / 2 + 1.5, ry: 0 }, 3);
  groundMat(kit, { x: 6, y: S, z: H / 2 + 1.5, ry: 0.1 }, 6);
  kit.finish();

  // poles and service wires over the side streets
  const poles = [
    { x: -W / 2 - 4.2, z: wz(2), ry: Math.PI / 2 },
    { x: -W / 2 - 4.2, z: wz(28), ry: Math.PI / 2 },
    { x: W / 2 + 4.2, z: wz(2), ry: -Math.PI / 2 },
    { x: W / 2 + 4.2, z: wz(28), ry: -Math.PI / 2 },
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

  // dust and exhaust along the road mouths, a roasting-corn fire by the west mouth
  for (const z of [wz(15.5), wz(17.5)]) {
    ctx.ambient.dust(-W / 2 - 5, z, 4, 1.4);
    ctx.ambient.dust(W / 2 + 5, z, 4, 1.4);
  }
  ctx.ambient.dust(0, north - 2.5, 8, 1.6);
  ctx.ambient.smokeColumn(-W / 2 - 3, S + 0.5, wz(21.5), { shade: 0.8, size: 0.6, rate: 3 });
  L.build(ctx);

  const life = ctx.life;
  life.add({
    y: S,
    kind: 'conductor',
    x: W / 2 + 2.4,
    z: wz(19.5),
    yaw: -1.3,
    toX: W / 2 + 5,
    toZ: wz(19.5),
  }); // calling the next bus
  life.add({ y: S, kind: 'argue', x: -W / 2 - 2.2, z: wz(13.5), yaw: 1.2 }); // driver and passenger over the change
  life.add({ y: S, kind: 'seller', x: -W / 2 - 1.2, z: wz(20), yaw: Math.PI / 2 });
  life.add({ y: S, kind: 'seller', x: -W / 2 - 1.4, z: wz(26.5), yaw: Math.PI / 2 }); // at the shop lane mouth
  life.add({ y: S, kind: 'worker', x: -W / 2 - 2.4, z: wz(4), yaw: 1.4 }); // the vulcaniser
  life.add({ y: S, kind: 'worker', x: W / 2 + 1.6, z: wz(6), yaw: -1.4 }); // the generator man
  life.add({ y: S, kind: 'walker', x: W / 2 + 1.1, z: wz(22), yaw: 0, toX: W / 2 + 1.1, toZ: wz(31) });
  life.add({ y: S, kind: 'walker', x: -W / 2 - 1.1, z: wz(30), yaw: 0, toX: -W / 2 - 1.1, toZ: wz(22) });
  life.add({ y: S, kind: 'onlooker', x: W / 2 + 1.8, z: wz(13), yaw: -1.6 });
  life.add({ y: S, kind: 'onlooker', x: -W / 2 - 1.8, z: wz(19.5), yaw: 1.6 });
}

export const RUMBLE_OJUELEGBA_SET: ArenaSet = {
  build,
  crowd: 0.3,
  crowdEdges: { north: false, east: true, west: true, south: false },
};

/** The board's permanent cover: piers, parked Danfos, shops, workshops, walls (`ojuelegbaCover.ts`). */
export const RUMBLE_OJUELEGBA_COVER: CoverFactory = (board) =>
  board.width === 45 && board.height === 33 ? buildOjuelegbaCover(board) : null;
