/**
 * Lagos arenas, build 1 - Oshodi Transport Metropolis, six districts (presentation only; the grid, districts and
 * hazards are `src/sim/arenas/rumbleOshodiMetro.ts`). A hazy midday over the layered interchange, with a
 * floodlit night look on the same geometry (`?tod=night`, `render/timeOfDay.ts`).
 *
 * - Board cover: every permanent tile is drawn as the object it is (`oshodiMetroCover.ts`, from the cover map in
 *   `oshodiMetroCoverMap.ts`): terminal wings, parked buses, bay shelters, canopy columns, skywalk piers and the
 *   stair tower, kerb islands with direction signs, signal gantries, the rail-bridge portals, platform posts, the
 *   station, shopfronts, kiosks, stalls, container shops, workshops, the Ground's pavilion.
 * - Floor (this file): four-lane main road with lane paint, arrows, zebras, a box junction and a hatched island;
 *   the two track lanes as ballast with sleepers and steel rails, the level crossing where the road runs over
 *   them (hatched approaches, stop lines, a St Andrew's cross); numbered bus bays with a marked pull-out aisle
 *   each; platform slabs with a yellow safety edge; pavers in the trading streets; skywalk-quarter slabs;
 *   oil-stained works hardstanding; the Cappa Ground's dusty pitch with its lines. Every authored barrier ('x')
 *   sits in a painted yellow-and-black frame, so breakable cover reads as breakable.
 * - Light pockets (`OSHODI_METRO_LOOK.lamps`): canopy tubes, junction lamps, platform lamps, shop LEDs.
 * - Surroundings (`oshodiMetroLandmarks.ts`): terminal canopy and hall, the elevated expressway, skywalk
 *   spans, the rail viaduct and station tower, the skyline, floodlight masts; the living environment (ambient
 *   traffic, crowds, lights) is `render/env/oshodiMetroEnv.ts`.
 */
import { DoubleSide } from 'three';
import { getArena } from '../../sim';
import type { ArenaLook } from '../arenaLook';
import { artRng } from '../textures';
import { mat, uniqueMat } from '../assets/helpers';
import { assets } from '../assets/library';
import { timeOfDay } from '../timeOfDay';
import type { CoverFactory } from './boardCover';
import type { ArenaSet, Placement, SetContext } from './common';
import { STREET } from './common';
import { T, crack, noiseFill, stain, tyreTrack } from './floorKit';
import type { Ctx, FloorDrawer } from './floorKit';
import { buildOshodiMetroCover } from './oshodiMetroCover';
import {
  expressway,
  floodlights,
  railViaduct,
  skyline,
  skywalks,
  terminalCanopy,
} from './oshodiMetroLandmarks';
import { drum, umbrella, wire } from './oshodiKit';
import { SiteLights, v3 } from './roadworksKit';
import { dash, floorWords, litter, paintKerbs, paintRoads, tileWorld, zebraTile } from './rumbleV2Kit';

const ID = 'rumbleOshodiMetro';
const TRACK_X = [36, 37];
const TRACK_Y0 = 10;
const TRACK_Y1 = 22;

// ------------------------------------------------------------------------------------------- looks

/** Hazy midday over the interchange: a high white-gold sun, warm exhaust haze, readable shadow under the canopy. */
export const OSHODI_METRO_LOOK: ArenaLook = {
  sky: 0xb2b4ae,
  fog: { color: 0xbcbcb2, near: 70, far: 260 },
  sun: { color: 0xfff0d2, intensity: 4.6, position: [-10, 22, 12] },
  hemi: { sky: 0xe0ded6, ground: 0x706c66, intensity: 1.4 },
  envIntensity: 0.5,
  exposure: 1.3,
  floorTint: 0xc0bcb0,
  pillarTint: 0xd6d2ca,
  softTint: 0xc6b8a8,
  slab: 0x6c675f,
  street: 0x403f3c,
  grit: { tone: 0x6e6a60, dirt: 0x4c463c, dust: 0x8c867a },
  // canopy tubes (plaza), junction lamp, platform lamps, trading-street bulbs, works lamp
  lamps: [
    [-8, 3.8, -9, 0xe8f4ff],
    [-1, 3.6, 0, 0xffc890],
    [15, 3.6, -4, 0x9ec8ff],
    [15, 3.6, 5, 0x9ec8ff],
    [-17, 2.6, -2, 0xffb060],
    [-3, 2.8, 12, 0xffa040],
  ],
};

/**
 * The same board by night: cold blue sky, floodlit canopy and cool platform lamps, sodium over the expressway
 * and the works. The hemisphere light and the lamp pools keep the playfield and the hazard lanes readable:
 * tests/render/oshodi-metro-art.test.ts pins a minimum ground luminance and a minimum lamp count.
 */
export const OSHODI_METRO_NIGHT_LOOK: ArenaLook = {
  sky: 0x0e1626,
  fog: { color: 0x151e30, near: 55, far: 210 },
  // the floodlit key (cold white floodlights over the interchange), like the approved Lekki night
  sun: { color: 0xc8d8ff, intensity: 3.4, position: [10, 20, 14] },
  hemi: { sky: 0x6a82b4, ground: 0x2c3040, intensity: 1.35 },
  envIntensity: 0.35,
  exposure: 1.2,
  floorTint: 0xb4b6b8,
  pillarTint: 0xd0d0d4,
  softTint: 0xc0b8b0,
  slab: 0x383a40,
  street: 0x16171c,
  grit: { tone: 0x4a4c56, dirt: 0x2c2e36, dust: 0x62646e },
  lamps: [
    [-8, 3.8, -9, 0xe8f4ff],
    [-12, 3.8, -6, 0xe8f4ff],
    [-1, 3.6, 0, 0xffc890],
    [8, 3.8, -1, 0xffa850],
    [15, 3.6, -4, 0x9ec8ff],
    [15, 3.6, 5, 0x9ec8ff],
    [-17, 2.6, -2, 0xffb060],
    [-17, 2.6, 8, 0xffb060],
    [-3, 2.8, 12, 0xffa040],
    [8, 2.8, 12, 0xffa040],
    [20, 6, 12, 0xe8f4ff],
  ],
};

/** The look for the chosen time of day (the registry hands the night look to `arenaLook` when asked). */
export const oshodiMetroLook = (): ArenaLook =>
  timeOfDay() === 'night' ? OSHODI_METRO_NIGHT_LOOK : OSHODI_METRO_LOOK;

// ------------------------------------------------------------------------------------------- floor

const layout = (): readonly string[] => getArena(ID).layout;

function districtAt(x: number, y: number): string {
  const d = getArena(ID).districts?.find((z) =>
    z.rects.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1),
  );
  return d?.id ?? '';
}

const isTrackTile = (x: number, y: number): boolean => TRACK_X.includes(x) && y >= TRACK_Y0 && y <= TRACK_Y1;

function pavers(g: Ctx, r: () => number, x: number, y: number): void {
  const pw = T / 4;
  const ph = T / 8;
  for (let j = 0; j < 8; j++)
    for (let i = 0; i < 5; i++) {
      const off = j % 2 ? pw / 2 : 0;
      g.fillStyle =
        r() < 0.5
          ? `rgba(${132 + r() * 20},${84 + r() * 14},${66 + r() * 10},0.55)`
          : `rgba(${128 + r() * 20},${124 + r() * 16},${116 + r() * 12},0.5)`;
      g.fillRect(x * T + i * pw - off + 1, y * T + j * ph + 1, pw - 2, ph - 2);
    }
}

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

/** Ballast, sleepers and two steel rails along one track tile (the lane runs north-south). */
function trackTile(g: Ctx, r: () => number, x: number, y: number): void {
  g.fillStyle = `rgba(${96 + r() * 18},${92 + r() * 16},${86 + r() * 14},1)`;
  g.fillRect(x * T, y * T, T, T);
  for (let i = 0; i < 70; i++) {
    const c = 70 + r() * 90;
    g.fillStyle = `rgba(${c},${c - 2},${c - 6},0.7)`;
    g.fillRect(x * T + r() * T, y * T + r() * T, 2 + r() * 4, 2 + r() * 3);
  }
  for (let s = 0; s < 4; s++) {
    g.fillStyle = 'rgba(48,40,32,0.92)';
    g.fillRect(x * T + T * 0.1, y * T + s * (T / 4) + 6, T * 0.8, 15);
  }
  for (const rx of [0.28, 0.72]) {
    g.fillStyle = 'rgba(40,40,42,0.9)';
    g.fillRect(x * T + T * rx - 6, y * T, 12, T);
    g.fillStyle = 'rgba(190,194,198,0.85)';
    g.fillRect(x * T + T * rx - 3, y * T, 4, T);
  }
}

export const OSHODI_METRO_FLOOR: FloorDrawer = (g, rg, cols, rows) => {
  const L = layout();
  const r = artRng(7311);
  const w = cols * T;
  const h = rows * T;
  const at = (x: number, y: number): string => L[y]?.[x] ?? '#';
  const isRoad = (x: number, y: number): boolean =>
    at(x, y) === '=' && !(isTrackTile(x, y) && (y < 15 || y > 18));
  noiseFill(g, g.canvas.width, g.canvas.height, [150, 142, 128], 22, 71);
  noiseFill(rg, rg.canvas.width, rg.canvas.height, [218, 218, 218], 20, 72);

  // ---- district ground
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const c = at(x, y);
      if (c === '#' || (c === '=' && isRoad(x, y))) continue;
      if (isTrackTile(x, y) && c === '=') continue; // laid below
      const d = districtAt(x, y);
      if (c === '_') {
        // the Cappa Ground: dusty trodden pitch
        g.fillStyle = `rgba(${96 + r() * 18},${112 + r() * 18},${64 + r() * 14},0.75)`;
        g.fillRect(x * T, y * T, T, T);
        if (r() < 0.3) stain(g, (x + r()) * T, (y + r()) * T, 14 + r() * 30, 'rgba(110,96,60,0.4)');
      } else if (d === 'tradingStreets') pavers(g, r, x, y);
      else if (d === 'skywalkQuarter') slabs(g, r, x, y, 140, 'rgba(50,48,44,0.4)');
      else if (d === 'interchangePlaza') slabs(g, r, x, y, 126, 'rgba(40,38,34,0.45)');
      else if (d === 'railwayEdge') {
        slabs(g, r, x, y, x >= 38 ? 150 : 118, 'rgba(46,42,36,0.4)');
        if (x === 38) {
          // the platform edge: yellow safety band with tactile dots, 0.6 m from the rail
          g.fillStyle = 'rgba(232,188,40,0.88)';
          g.fillRect(x * T, y * T, T * 0.22, T);
          g.fillStyle = 'rgba(110,86,12,0.5)';
          for (let k = 0; k < 5; k++) g.fillRect(x * T + T * 0.08, y * T + 10 + k * 24, 8, 8);
        }
      } else if (d === 'cappaWorks') {
        g.fillStyle = `rgba(${92 + r() * 16},${88 + r() * 12},${80 + r() * 10},0.42)`;
        g.fillRect(x * T, y * T, T, T);
        if (r() < 0.3) stain(g, (x + r()) * T, (y + r()) * T, 20 + r() * 40, 'rgba(10,10,12,0.4)');
      } else slabs(g, r, x, y, 130, 'rgba(46,40,34,0.42)'); // junction pavements
    }

  // ---- the main road (and the bus-bay aisles), then the rails
  paintRoads(g, rg, L, r, [60, 58, 55], isRoad);
  for (let i = 0; i < 30; i++) {
    const px = Math.floor(r() * cols);
    const py = 15 + Math.floor(r() * 4);
    g.fillStyle = `rgba(${34 + r() * 10},${33 + r() * 10},${32 + r() * 8},0.7)`;
    g.fillRect(px * T + r() * 30, py * T + r() * 30, 50 + r() * 70, 40 + r() * 50);
  }
  for (let y = TRACK_Y0; y <= TRACK_Y1; y++)
    for (const x of TRACK_X) if (y < 15 || y > 18) trackTile(g, r, x, y);
  paintKerbs(g, L, 'rgba(206,200,184,0.85)', 'rgba(30,30,30,0.9)', isRoad);

  // ---- main-road paint: double yellow centre, white lane dashes, edge lines, arrows, zebras
  g.fillStyle = 'rgba(222,180,44,0.8)';
  for (let x = 0; x < cols; x++) {
    if (x === 36 || x === 37) continue;
    g.fillRect(x * T, 17 * T - 12, T, 6);
    g.fillRect(x * T, 17 * T + 6, T, 6);
  }
  g.fillRect(0, 15 * T + 8, w, 5);
  g.fillRect(0, 19 * T - 13, w, 5);
  dash(g, 0, 16, 36, 16, 'rgba(230,226,212,0.7)', 6, 0.7, 0.5);
  dash(g, 38, 16, cols, 16, 'rgba(230,226,212,0.7)', 6, 0.7, 0.5);
  dash(g, 0, 18, 36, 18, 'rgba(230,226,212,0.7)', 6, 0.7, 0.5);
  dash(g, 38, 18, cols, 18, 'rgba(230,226,212,0.7)', 6, 0.7, 0.5);
  for (const x of [3, 11, 24, 31]) {
    arrow(g, x, 17, 0, 'rgba(232,228,214,0.55)');
    arrow(g, x + 2, 18, 0, 'rgba(232,228,214,0.55)');
    arrow(g, x + 1, 15, 2, 'rgba(232,228,214,0.55)');
    arrow(g, x + 3, 16, 2, 'rgba(232,228,214,0.55)');
  }
  for (const x of [8, 21, 31]) for (let y = 15; y <= 18; y++) zebraTile(g, x, y, false, 0.6);
  // the yellow box junction at the Expressway Junction (tiles 24-27 x 15-18): outline with crossed diagonals
  boxJunction(g, 24, 15, 27, 18);

  // ---- the level crossing (tiles 36-37 x 15-18): rails inlaid in the asphalt, hatched approaches, stop lines
  for (let y = 15; y <= 18; y++)
    for (const x of TRACK_X)
      for (const rx of [0.28, 0.72]) {
        g.fillStyle = 'rgba(40,40,42,0.9)';
        g.fillRect(x * T + T * rx - 6, y * T, 12, T);
        g.fillStyle = 'rgba(176,180,184,0.8)';
        g.fillRect(x * T + T * rx - 3, y * T, 4, T);
      }
  hatch(g, 36, 15, 37, 18, 'rgba(226,186,40,0.28)');
  g.strokeStyle = 'rgba(236,232,218,0.85)';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(36 * T - 20, 15 * T + 8);
  g.lineTo(36 * T - 20, 17 * T - 8);
  g.moveTo(38 * T + 20, 17 * T + 8);
  g.lineTo(38 * T + 20, 19 * T - 8);
  g.stroke();
  floorWords(g, 'RAIL', 36.5, 16.5, 0.34, 'rgba(236,232,218,0.72)', -Math.PI / 2);
  floorWords(g, 'RAIL', 37.5, 17.5, 0.34, 'rgba(236,232,218,0.72)', Math.PI / 2);
  // a red-and-white warning stripe across each track lane at both portal mouths
  for (const [ty, face] of [
    [TRACK_Y0, 0],
    [TRACK_Y1, 1],
  ] as const)
    for (const x of TRACK_X)
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? 'rgba(236,232,220,0.85)' : 'rgba(184,58,42,0.85)';
        g.fillRect(x * T + (i * T) / 8, (ty + face) * T - (face ? 14 : 0), T / 8, 14);
      }

  // ---- bus bays: bay lines round the parked buses, numbers at the mouths, the marked pull-out aisles
  g.strokeStyle = 'rgba(232,228,212,0.7)';
  g.lineWidth = 6;
  for (const [x0, x1] of [
    [10, 13],
    [16, 19],
  ] as const)
    for (let x = x0; x <= x1 + 1; x += 2) {
      g.beginPath();
      g.moveTo(x * T, 12 * T + 10);
      g.lineTo(x * T, 14 * T - 10);
      g.stroke();
    }
  [10, 12, 16, 18].forEach((x, i) => floorWords(g, `${i + 1}`, x + 1, 13.5, 0.22, 'rgba(242,206,64,0.55)'));
  for (const [ax, y0, y1, dir] of [
    [15, 13, 14, 1],
    [19, 19, 21, 3],
  ] as const) {
    for (let y = y0; y <= y1; y++) arrow(g, ax, y, dir, 'rgba(242,206,64,0.8)');
    hatch(g, ax, y0, ax, y1, 'rgba(226,186,40,0.3)');
  }
  floorWords(g, 'BUS OUT', 15.5, 14.62, 0.2, 'rgba(242,206,64,0.8)');
  floorWords(g, 'BUS OUT', 19.5, 19.3, 0.2, 'rgba(242,206,64,0.8)');

  // ---- the stair tower's queue box, the kiosks' mats: a yellow-and-black queue box in front of the tower
  g.fillStyle = 'rgba(232,188,40,0.34)';
  g.fillRect(23 * T + 10, 9 * T + 10, 3 * T - 20, T - 20);
  for (let i = 0; i < 18; i++) {
    g.fillStyle = i % 2 ? 'rgba(22,22,22,0.85)' : 'rgba(232,188,40,0.9)';
    g.fillRect(23 * T + 10 + i * ((3 * T - 20) / 18), 9 * T + 10, (3 * T - 20) / 18, 11);
  }
  floorWords(g, 'SKYWALK', 24.5, 9.55, 0.2, 'rgba(22,22,22,0.7)');

  // ---- the platform: PLATFORM 1 and 2 stencils, a bench line, the Cappa passage arrow
  floorWords(g, 'PLATFORM 1', 39.5, 12.2, 0.26, 'rgba(22,22,26,0.5)', -Math.PI / 2);
  floorWords(g, 'PLATFORM 2', 39.5, 20.8, 0.26, 'rgba(22,22,26,0.5)', -Math.PI / 2);
  for (const y of [23, 24, 25]) arrow(g, 39, y, 3, 'rgba(236,232,218,0.45)');

  // ---- the Cappa Ground: touchlines, halfway line, centre circle, boxes and goal mouths
  g.strokeStyle = 'rgba(238,234,220,0.8)';
  g.lineWidth = 7;
  g.strokeRect(31 * T + 10, 26 * T + 10, 12 * T - 20, 5 * T - 20);
  g.beginPath();
  g.moveTo(37 * T, 26 * T + 10);
  g.lineTo(37 * T, 31 * T - 10);
  g.stroke();
  g.beginPath();
  g.arc(37 * T, 28.5 * T, 1.0 * T, 0, Math.PI * 2);
  g.stroke();
  g.strokeRect(31 * T + 10, 27 * T + 10, 2 * T, 3 * T - 20);
  g.strokeRect(42 * T - 2 * T - 10, 27 * T + 10, 2 * T, 3 * T - 20);
  floorWords(g, 'CAPPA WORKS GROUND', 34.4, 30.62, 0.17, 'rgba(238,234,220,0.5)');

  // ---- the works: oil under the workshops, a NO PARKING stencil at the gate
  for (let i = 0; i < 14; i++)
    stain(g, (10 + r() * 14) * T, (23 + r() * 6) * T, 30 + r() * 50, 'rgba(14,12,10,0.4)');
  floorWords(g, 'NO PARKING', 17.5, 26.2, 0.26, 'rgba(236,232,220,0.5)');
  for (let i = 0; i < 12; i++) tyreTrack(g, r, w, h, 'rgba(20,18,16,0.12)');

  // ---- every authored barrier in a painted frame (breakable, and it says so)
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (at(x, y) === 'x') barrierFrame(g, x, y);

  for (let i = 0; i < cols * rows * 0.22; i++) {
    const px = r() * w;
    const py = r() * h;
    if (isTrackTile(Math.floor(px / T), Math.floor(py / T))) continue;
    crack(g, r, px, py, 3 + Math.floor(r() * 7), 'rgba(18,16,14,0.5)', 2);
  }
  litter(g, r, cols, rows, 0.5);
};

// ------------------------------------------------------------------------------------------ the set

/**
 * Shophouses along the north edge outside the terminal and the viaduct, and down the side streets, leaving open
 * what lives there (the living environment): the road mouths (rows 14-19), the trading pavement (west, rows
 * 3-12 and 21-26) and the station forecourt and touchline (east, rows 9-15 and 25-31).
 */
function sideStreets(ctx: SetContext): void {
  const { W, H } = ctx;
  const ids = assets.loadedIds('env_building_');
  if (ids.length === 0) return;
  const { wz } = tileWorld(W, H);
  const byVariant = ids.map(() => [] as Placement[]);
  let n = 0;
  const near = (z: number, y0: number, y1: number): boolean => z > wz(y0) - 2 && z < wz(y1) + 2;
  const free = (z: number, west: boolean): boolean => {
    if (near(z, 13, 20)) return true;
    return west ? near(z, 3, 12) || near(z, 21, 26) : near(z, 9, 15) || near(z, 25, 31);
  };
  for (let z = -H / 2 - 2.5; z < H / 2 + 5; z += 3.5)
    for (const west of [true, false]) {
      if (free(z, west)) continue;
      byVariant[n++ % ids.length]!.push({
        x: west ? -W / 2 - 6.4 : W / 2 + 7.2,
        z,
        ry: west ? Math.PI / 2 : -Math.PI / 2,
        sx: 1.17,
        sy: 1.25,
        sz: 1.17,
      });
    }
  // north edge: west of the terminal and east of the station tower only
  for (const x0 of [-W / 2 - 4, 30]) {
    for (let x = x0; x < x0 + 11; x += 3.6)
      byVariant[n++ % ids.length]!.push({ x, z: -H / 2 - 3.9, ry: 0, sx: 1.17, sy: 1.3, sz: 1.17 });
  }
  ids.forEach((id, k) => ctx.instance(id, byVariant[k]!));
}

function build(ctx: SetContext): void {
  const { W, H } = ctx;
  const { wx, wz } = tileWorld(W, H);
  const tod = timeOfDay();
  const L = new SiteLights();
  const S = STREET;

  terminalCanopy(ctx, L, tod);
  expressway(ctx, L);
  skywalks(ctx);
  railViaduct(ctx, L, tod);
  skyline(ctx, L, tod);
  floodlights(ctx, L, tod);
  sideStreets(ctx);

  const cloth = [0xa8442e, 0xc8a844, 0x2e5a86, 0x3a744a, 0xd2ccb8].map((c) => {
    const m = uniqueMat(c, { roughness: 0.88 });
    m.side = DoubleSide;
    ctx.own(m);
    return m;
  });
  // traders beyond the west edge: a sea of umbrellas on the pavement
  const umbrellas: [number, number][] = [
    [-W / 2 - 2.2, wz(4)],
    [-W / 2 - 2.6, wz(7)],
    [-W / 2 - 2.0, wz(10)],
    [-W / 2 - 2.4, wz(22)],
    [-W / 2 - 2.3, wz(25)],
    [W / 2 + 2.3, wz(12)],
    [W / 2 + 2.2, wz(27)],
  ];
  umbrellas.forEach(([x, z], i) => umbrella(ctx, x, z, 0.9, cloth[i % 5]!, cloth[(i + 2) % 5]!, { h: 2.0 }));
  ctx.instance('env_tyrestack', [
    { x: -W / 2 - 1.8, z: wz(1), ry: 0.3, sx: 0.8, sy: 0.7, sz: 0.8 },
    { x: W / 2 + 1.9, z: wz(2), ry: 0.6, sx: 0.8, sy: 0.6, sz: 0.8 },
  ]);
  drum(ctx, mat(0x8a2e22, { roughness: 0.75, metalness: 0.3 }), W / 2 + 1.6, wz(6));
  // parked: Danfos waiting beyond the road mouths and the forecourt, taxis along the touchline and the west pavement
  ctx.vehicles(
    'danfo',
    [
      { x: -W / 2 - 6.4, y: S, z: wz(21.5), ry: 0 },
      { x: -W / 2 - 6.6, y: S, z: wz(13), ry: 0 },
      { x: W / 2 + 6.6, y: S, z: wz(21), ry: Math.PI },
      { x: W / 2 + 6.4, y: S, z: wz(5), ry: Math.PI },
    ],
    { idle: true },
  );
  ctx.vehicles('taxi', [
    { x: W / 2 + 5.6, y: S, z: wz(27), ry: 0.1 },
    { x: -W / 2 - 3.8, y: S, z: wz(14.2), ry: 0 },
    { x: -W / 2 - 3.9, y: S, z: wz(30), ry: 0.05 },
  ]);
  ctx.vehicles('okada', [{ x: wx(30), y: S, z: H / 2 + 1.3, ry: 1.6 }]); // one incidental bike on the camera edge
  L.build(ctx);

  // poles and service wires over the side streets
  const poles = [
    { x: -W / 2 - 4.2, z: wz(1), ry: Math.PI / 2 },
    { x: -W / 2 - 4.2, z: wz(29), ry: Math.PI / 2 },
    { x: W / 2 + 4.8, z: wz(1), ry: -Math.PI / 2 },
    { x: W / 2 + 4.8, z: wz(29), ry: -Math.PI / 2 },
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

  // exhaust at the road mouths, a roasting-corn fire on the west pavement
  for (const z of [wz(15.5), wz(17.5)]) {
    ctx.ambient.dust(-W / 2 - 5, z, 4, 1.4);
    ctx.ambient.dust(W / 2 + 5, z, 4, 1.4);
  }
  ctx.ambient.smokeColumn(-W / 2 - 3, S + 0.5, wz(11), { shade: 0.8, size: 0.6, rate: 3 });

  // background people: traders, a conductor calling the next bus, passengers, a vendor, the generator man
  const life = ctx.life;
  life.add({
    y: S,
    kind: 'conductor',
    x: -W / 2 - 1.2,
    z: wz(14.2),
    yaw: 1.3,
    toX: -W / 2 - 3.6,
    toZ: wz(14.2),
  });
  life.add({ y: S, kind: 'argue', x: -W / 2 - 1.0, z: wz(8), yaw: 1.2 });
  life.add({ y: S, kind: 'seller', x: -W / 2 - 1.2, z: wz(5), yaw: Math.PI / 2 });
  life.add({ y: S, kind: 'seller', x: -W / 2 - 1.4, z: wz(23), yaw: Math.PI / 2 });
  life.add({ y: S, kind: 'worker', x: -W / 2 - 2.4, z: wz(24), yaw: 1.4 });
  life.add({ y: S, kind: 'worker', x: W / 2 + 1.6, z: wz(6), yaw: -1.4 });
  life.add({ y: S, kind: 'walker', x: W / 2 + 1.1, z: wz(2), yaw: 0, toX: W / 2 + 1.1, toZ: wz(8) });
  life.add({ y: S, kind: 'walker', x: -W / 2 - 1.1, z: wz(12), yaw: 0, toX: -W / 2 - 1.1, toZ: wz(4) });
  life.add({ y: S, kind: 'onlooker', x: W / 2 + 1.8, z: wz(13.4), yaw: -1.6 });
  life.add({ y: S, kind: 'onlooker', x: W / 2 + 1.9, z: wz(26), yaw: -1.6 });
  life.add({ y: S, kind: 'onlooker', x: -W / 2 - 0.9, z: wz(19.4), yaw: 1.6 });
}

export const OSHODI_METRO_SET: ArenaSet = {
  build,
  crowd: 0.3,
  crowdEdges: { north: false, east: true, west: true, south: false },
};

/** The board's permanent cover: terminal, buses, skywalk piers, rail portals, station, shopfronts, works. */
export const OSHODI_METRO_COVER: CoverFactory = (board) =>
  board.width === 45 && board.height === 33 ? buildOshodiMetroCover(board) : null;
