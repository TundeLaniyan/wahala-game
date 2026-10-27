/**
 * City Rumble Evolution - Ojuelegba Underbridge, five districts (presentation only; the grid, districts
 * and hazards are `src/sim/arenas/rumbleOjuelegba.ts`). Late afternoon under the Ojuelegba flyover, which
 * runs north-south over the pier court and the through road beneath it.
 *
 * - Board cover: every permanent tile is drawn as the object it is (`ojuelegbaCover.ts`, from the cover map
 *   in `ojuelegbaCoverMap.ts`): piers, packed Danfos, shops, workshops, kiosks, walls, kerb islands. The
 *   flyover's outer edges and crossheads overhead are cut away round the fighter (`ojuelegbaDeck.ts`).
 * - Floor (this file): the through road (four lanes, centre lines, lane arrows, zebras) passing under the
 *   deck's shadow band with a hard sun wall at both deck edges, expansion-joint drips over every pier bent and
 *   stained footings; patched asphalt and slab pavements on the approach with painted parking bays; bay lines,
 *   a stop line and DEPARTURE on the bus pocket's strip; pavers and a gutter in the shop lane; oil-stained
 *   hardstanding in the service court. Every authored barrier ('x': empty partitions, parcel stacks) sits in
 *   a painted yellow-and-black frame, so the breakable cover reads as breakable.
 * - Light pockets (`RUMBLE_OJUELEGBA_LOOK.lamps`): LED tubes under the deck (reflected daylight, never a
 *   dark cave), a sodium lamp over the bus pocket, bulbs in the shop lane and over the workshops.
 * - Surroundings: the flyover running on north of the board on its twin columns (its moving traffic, the
 *   road mouths' traffic and the crowds are the living environment, `render/env/ojuelegbaEnv.ts`); taller
 *   buildings beyond the far (north) edge and down the sides; the south (camera) side keeps a kerb and
 *   hawkers' mats only (one incidental okada; commercial okadas are banned here).
 */
import { DoubleSide } from 'three';
import { getArena } from '../../sim';
import type { ArenaLook } from '../arenaLook';
import { artRng } from '../textures';
import { mat, uniqueMat } from '../assets/helpers';
import { assets } from '../assets/library';
import type { CoverFactory } from './boardCover';
import type { ArenaSet, Placement, SetContext } from './common';
import { STREET } from './common';
import { T, crack, noiseFill, stain, tyreTrack } from './floorKit';
import type { Ctx, FloorDrawer } from './floorKit';
import { Kit } from './marketKit';
import { groundMat, stall } from './marketStalls';
import { buildOjuelegbaCover } from './ojuelegbaCover';
import { DECK_END, DECK_X0, DECK_X1 } from './ojuelegbaDeck';
import { barracksCorridor, flyover, linkBridge } from './ojuelegbaLandmarks';
import { drum, umbrella, wire } from './oshodiKit';
import { SiteLights, v3 } from './roadworksKit';
import { shophouseRows } from './shared';
import { dash, floorWords, litter, paintKerbs, paintRoads, tileWorld, zebraTile } from './rumbleV2Kit';

const ID = 'rumbleOjuelegba';
/** Board rows of the deck's expansion joints (over the two pier bents and one span in the service loop). */
const JOINT_Y = [6, 13, 20];

export const RUMBLE_OJUELEGBA_LOOK: ArenaLook = {
  // late afternoon: a low amber sun from the west and long shadows under the deck, in clear dusty air - the
  // flyover and the skyline beyond the board stay readable from the whole-arena view (identity pass)
  sky: 0xb09a78,
  fog: { color: 0xb8a68c, near: 36, far: 160 },
  sun: { color: 0xffcf98, intensity: 4.7, position: [-16, 17, 9] },
  hemi: { sky: 0xe2caa8, ground: 0x7a6858, intensity: 1.35 },
  envIntensity: 0.5,
  exposure: 1.2,
  floorTint: 0xb8ac9a,
  pillarTint: 0xc4bcae,
  softTint: 0xc4b6a6,
  slab: 0x6a6258,
  street: 0x4a4238,
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

/** A black-and-white chequered kerb band along a horizontal road edge (y in tiles), with a lit top edge. */
function bwKerb(g: Ctx, y: number, x0: number, x1: number, skip: readonly [number, number][] = []): void {
  const seg = 52;
  const band = 22;
  const top = y * T - band / 2;
  for (let px = x0 * T, i = 0; px < x1 * T; px += seg, i++) {
    const tile = px / T;
    if (skip.some(([a, b]) => tile >= a && tile < b)) continue;
    const w = Math.min(seg, x1 * T - px);
    g.fillStyle = i % 2 ? 'rgba(222,218,204,0.96)' : 'rgba(22,22,22,0.96)';
    g.fillRect(px, top, w, band);
    g.fillStyle = 'rgba(255,248,226,0.35)';
    g.fillRect(px, top, w, 3);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(px, top + band, w, 4);
  }
}

/** A curved turn arrow in a lane tile: `left` / `right` bends, `straightLeft` / `straightRight` fork. */
function turnArrow(
  g: Ctx,
  x: number,
  y: number,
  dir: number,
  kind: 'left' | 'right' | 'fork',
  color: string,
): void {
  g.save();
  g.translate((x + 0.5) * T, (y + 0.5) * T);
  g.rotate((dir * Math.PI) / 2);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineWidth = T * 0.1;
  const head = (hx: number, hy: number, a: number): void => {
    g.save();
    g.translate(hx, hy);
    g.rotate(a);
    g.beginPath();
    g.moveTo(T * 0.16, 0);
    g.lineTo(-T * 0.06, -T * 0.13);
    g.lineTo(-T * 0.06, T * 0.13);
    g.closePath();
    g.fill();
    g.restore();
  };
  g.beginPath();
  g.moveTo(-T * 0.36, 0);
  g.lineTo(kind === 'fork' ? T * 0.1 : -T * 0.04, 0);
  g.stroke();
  if (kind === 'fork') head(T * 0.2, 0, 0);
  const sgn = kind === 'right' ? 1 : -1; // east-facing arrow: right turn bends to +y
  g.beginPath();
  g.arc(kind === 'fork' ? T * 0.1 : -T * 0.04, sgn * T * 0.22, T * 0.22, (-sgn * Math.PI) / 2, 0, sgn < 0);
  g.stroke();
  head(kind === 'fork' ? T * 0.32 : T * 0.18, sgn * T * 0.22, (sgn * Math.PI) / 2);
  g.restore();
}

/** A yellow box junction: outline with crossed diagonals (tile rectangle, inclusive). */
function boxJunction(g: Ctx, x0: number, y0: number, x1: number, y1: number): void {
  g.strokeStyle = 'rgba(232,188,40,0.9)';
  g.lineWidth = 8;
  const l = x0 * T + 6;
  const t = y0 * T + 6;
  const r = (x1 + 1) * T - 6;
  const b = (y1 + 1) * T - 6;
  g.strokeRect(l, t, r - l, b - t);
  g.lineWidth = 6;
  for (let x = l; x < r; x += T * 0.9) {
    g.beginPath();
    g.moveTo(x, t);
    g.lineTo(Math.min(r, x + (b - t)), Math.min(b, t + (r - x)));
    g.stroke();
  }
}

/** A chevron-hatched painted traffic island on the road centre: white outline, hatching, kerb ends. */
function goreIsland(g: Ctx, x0: number, x1: number, y: number): void {
  const t = (y - 0.5) * T + 18;
  const b = (y + 0.5) * T - 18;
  g.save();
  g.beginPath();
  g.rect(x0 * T, t, (x1 - x0) * T, b - t);
  g.clip();
  g.fillStyle = 'rgba(70,68,62,0.55)';
  g.fillRect(x0 * T, t, (x1 - x0) * T, b - t);
  g.strokeStyle = 'rgba(236,232,218,0.85)';
  g.lineWidth = 8;
  for (let x = x0 * T - T; x < x1 * T; x += 34) {
    g.beginPath();
    g.moveTo(x, b);
    g.lineTo(x + (b - t), t);
    g.stroke();
  }
  g.restore();
  g.strokeStyle = 'rgba(236,232,218,0.9)';
  g.lineWidth = 6;
  g.strokeRect(x0 * T, t, (x1 - x0) * T, b - t);
  for (const ex of [x0 * T - 10, x1 * T - 14]) {
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? 'rgba(222,218,204,0.96)' : 'rgba(22,22,22,0.96)';
      g.fillRect(ex, t + (i * (b - t)) / 4, 24, (b - t) / 4);
    }
  }
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
  // the junction (identity pass): thick black-and-white kerbs along both road edges (the departure strip's
  // mouth left open), turn arrows into the shop approach and the bus pocket, a stop line before each
  // crossing, a yellow box junction under the bridge and a hatched traffic island on the road centre
  bwKerb(g, 15, 0, cols);
  bwKerb(g, 19, 0, cols, [[41, 43]]);
  turnArrow(g, 9, 18, 0, 'right', 'rgba(236,232,218,0.62)'); // south-east lane: right, into the shop approach
  turnArrow(g, 33, 15, 2, 'right', 'rgba(236,232,218,0.62)'); // north-west lane: right, into the bus pocket's north gate
  turnArrow(g, 36, 18, 0, 'fork', 'rgba(236,232,218,0.62)'); // straight on or right
  turnArrow(g, 6, 16, 2, 'left', 'rgba(236,232,218,0.62)');
  g.fillStyle = 'rgba(236,232,218,0.78)';
  for (const [sx, ly0, ly1] of [
    [12.35, 17, 19],
    [31.55, 15, 17],
  ] as const)
    g.fillRect(sx * T, ly0 * T + 4, 12, (ly1 - ly0) * T - 8);
  boxJunction(g, 19, 15, 22, 18);
  goreIsland(g, 23.5, 28.5, 17);
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

  // ---- the OJUELEGBA bus stop (the shelter at row 21 under the bridge): a yellow-and-black queue box in front
  g.fillStyle = 'rgba(232,188,40,0.38)';
  g.fillRect(18 * T + 10, 20 * T + 10, 5 * T - 20, T - 20);
  for (let i = 0; i < 20; i++) {
    g.fillStyle = i % 2 ? 'rgba(22,22,22,0.85)' : 'rgba(232,188,40,0.9)';
    g.fillRect(18 * T + 10 + i * ((5 * T - 20) / 20), 20 * T + 10, (5 * T - 20) / 20, 12);
    g.fillRect(18 * T + 10 + i * ((5 * T - 20) / 20), 21 * T - 22, (5 * T - 20) / 20, 12);
  }
  floorWords(g, 'QUEUE HERE', 20.5, 20.5, 0.2, 'rgba(22,22,22,0.7)');

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

  // ---- under the deck: footing stains, expansion-joint drips across it, the shadow band, the sun walls
  for (let y = 0; y <= DECK_END; y++)
    for (let x = DECK_X0; x <= DECK_X1; x++)
      if (at(x, y) === '#' && districtAt(x, y) === 'pierCourt') {
        stain(g, (x + 0.5) * T, (y + 0.5) * T, T * 1.1, 'rgba(26,22,18,0.26)');
        stain(g, (x + 0.5) * T, (y + 1.2) * T, T * 0.5, 'rgba(10,10,10,0.28)');
      }
  const x0 = DECK_X0 * T + T * 0.2;
  const x1 = (DECK_X1 + 1) * T - T * 0.2;
  const yEnd = (DECK_END + 1) * T;
  for (const jy of JOINT_Y) {
    g.fillStyle = 'rgba(8,8,8,0.3)';
    g.fillRect(x0, jy * T - 7, x1 - x0, 14);
    for (let i = 0; i < 12; i++)
      stain(g, x0 + r() * (x1 - x0), jy * T + (r() - 0.3) * T * 0.8, 14 + r() * 24, 'rgba(12,12,14,0.32)');
  }
  const grad = g.createLinearGradient(x0 - T * 0.6, 0, x1 + T * 0.6, 0);
  grad.addColorStop(0, 'rgba(16,14,12,0)');
  grad.addColorStop(0.05, 'rgba(16,14,12,0.3)');
  grad.addColorStop(0.5, 'rgba(16,14,12,0.34)');
  grad.addColorStop(0.95, 'rgba(16,14,12,0.3)');
  grad.addColorStop(1, 'rgba(16,14,12,0)');
  g.fillStyle = grad;
  g.fillRect(x0 - T * 0.6, 0, x1 - x0 + T * 1.2, yEnd);
  // the hard sun wall along both deck edges, and the light spilling in past the cut end
  g.fillStyle = 'rgba(255,206,140,0.12)';
  g.fillRect(x0 - T * 0.95, 0, T * 0.35, yEnd);
  g.fillRect(x1 + T * 0.6, 0, T * 0.35, yEnd);

  for (let i = 0; i < cols * rows * 0.26; i++)
    crack(g, r, r() * w, r() * h, 3 + Math.floor(r() * 7), 'rgba(18,16,14,0.5)', 2);
  litter(g, r, cols, rows, 0.6);
};

// ------------------------------------------------------------------------------------------ the set

/**
 * Shophouses down the east and west side streets, leaving open what lives there (the living environment):
 * the through road's mouths (rows 13-20) on both sides, the traders beyond the shop lane (west, rows 21-31)
 * and the mechanics and touts beyond the service loop and the bus pocket (east, rows 1-9 and 18-27).
 */
function sideStreets(ctx: SetContext): void {
  const { W, H } = ctx;
  const ids = assets.loadedIds('env_building_');
  if (ids.length === 0) return;
  const { wz } = tileWorld(W, H);
  const byVariant = ids.map(() => [] as Placement[]);
  let n = 0;
  const free = (z: number, west: boolean): boolean => {
    const near = (y0: number, y1: number): boolean => z > wz(y0) - 2 && z < wz(y1) + 2;
    if (near(13, 20)) return true;
    return west ? near(21, 31) : near(1, 9) || near(18, 27);
  };
  for (let z = -H / 2 - 2.5; z < H / 2 + 5; z += 3.5)
    for (const west of [true, false]) {
      if (free(z, west)) continue;
      const x = west ? -W / 2 - 3.75 : W / 2 + 4.55;
      byVariant[n++ % ids.length]!.push({
        x,
        z,
        ry: west ? Math.PI / 2 : -Math.PI / 2,
        sx: 1.17,
        sy: 1.2,
        sz: 1.17,
      });
    }
  ids.forEach((id, k) => ctx.instance(id, byVariant[k]!));
}

function build(ctx: SetContext): void {
  const { W, H } = ctx;
  const { wx, wz } = tileWorld(W, H);
  const north = -H / 2;
  const S = STREET;
  const L = new SiteLights();
  const kit = new Kit(ctx);

  flyover(ctx, L);
  linkBridge(ctx);
  barracksCorridor(ctx);
  // tall buildings beyond the far edge and down the side streets
  shophouseRows(ctx, { north: true, seed: 2, close: 0.2 });
  sideStreets(ctx);

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
  // the road mouths' traffic is the living environment's moving traffic (render/env/ojuelegbaEnv.ts); parked
  // here: Danfos waiting for passengers beyond the bus pocket's edge, a taxi at the mechanics', two in the side
  // street beyond the shop lane
  ctx.vehicles(
    'danfo',
    [
      { x: W / 2 + 6.6, y: S, z: wz(21.5), ry: Math.PI },
      { x: W / 2 + 6.7, y: S, z: wz(25), ry: Math.PI },
    ],
    { idle: true },
  );
  ctx.vehicles('taxi', [
    { x: W / 2 + 6.4, y: S, z: wz(4.5), ry: 0.1 },
    { x: -W / 2 - 3.6, y: S, z: wz(24), ry: 0 },
    { x: -W / 2 - 3.7, y: S, z: wz(29), ry: 0.05 },
  ]);
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
  life.add({ y: S, kind: 'argue', x: -W / 2 - 1.0, z: wz(13.5), yaw: 1.2 }); // driver and passenger over the change
  life.add({ y: S, kind: 'seller', x: -W / 2 - 1.2, z: wz(20), yaw: Math.PI / 2 });
  life.add({ y: S, kind: 'seller', x: -W / 2 - 1.4, z: wz(26.5), yaw: Math.PI / 2 }); // at the shop lane mouth
  life.add({ y: S, kind: 'worker', x: -W / 2 - 2.4, z: wz(4), yaw: 1.4 }); // the vulcaniser
  life.add({ y: S, kind: 'worker', x: W / 2 + 1.6, z: wz(6), yaw: -1.4 }); // the generator man
  life.add({ y: S, kind: 'walker', x: W / 2 + 1.1, z: wz(22), yaw: 0, toX: W / 2 + 1.1, toZ: wz(31) });
  life.add({ y: S, kind: 'walker', x: -W / 2 - 1.1, z: wz(30), yaw: 0, toX: -W / 2 - 1.1, toZ: wz(22) });
  life.add({ y: S, kind: 'onlooker', x: W / 2 + 1.8, z: wz(13), yaw: -1.6 });
  life.add({ y: S, kind: 'onlooker', x: -W / 2 - 0.9, z: wz(19.5), yaw: 1.6 });
}

export const RUMBLE_OJUELEGBA_SET: ArenaSet = {
  build,
  crowd: 0.3,
  crowdEdges: { north: false, east: true, west: true, south: false },
};

/** The board's permanent cover: piers, parked Danfos, shops, workshops, walls (`ojuelegbaCover.ts`). */
export const RUMBLE_OJUELEGBA_COVER: CoverFactory = (board) =>
  board.width === 45 && board.height === 33 ? buildOjuelegbaCover(board) : null;
