/**
 * City Rumble: a whole Lagos district under hazy afternoon light.
 *
 * Presentation only (the grid, roads and hazards are `src/sim/arenas`). This module owns the arena's
 * light (RUMBLE_LOOK), its surroundings (RUMBLE_SET) and its playfield floor (RUMBLE_FLOOR).
 * Every set follows the rules in `common.ts`: nothing on the board, the camera (south) side stays low.
 *
 * The board is 41 x 31 tiles, so everything here is cheap: the floor is one painted canvas, the
 * surroundings are instanced models plus a few merged static meshes (`rumbleSet.ts`).
 */
import { getArena } from '../../sim';
import type { ArenaLook } from '../arenaLook';
import type { ArenaSet } from './common';
import { T, noiseFill, stain } from './floorKit';
import type { Ctx, FloorDrawer } from './floorKit';
import { artRng } from '../textures';
import { buildRumbleSet } from './rumbleSet';

export const RUMBLE_LOOK: ArenaLook = {
  sky: 0x8a7660,
  fog: { color: 0x7e6c58, near: 22, far: 80 },
  sun: { color: 0xffc088, intensity: 3.6, position: [-12, 22, 14] },
  hemi: { sky: 0xd0b898, ground: 0x584634, intensity: 0.95 },
  envIntensity: 0.45,
  exposure: 1.06,
  floorTint: 0xb8ae9e,
  pillarTint: 0xc6bcac,
  softTint: 0xc2b4a4,
  slab: 0x6c6458,
  street: 0x26221e,
  grit: { tone: 0x78624c, dirt: 0x5a4c3c, dust: 0x8c7a64 },
  lamps: [
    [-9.2, 3.0, -0.8, 0xffa04a],
    [9.2, 3.0, 1.2, 0xffa04a],
  ],
};

export const RUMBLE_SET: ArenaSet = {
  build: buildRumbleSet,
  crowd: 0.45,
  crowdEdges: { north: true, east: true, west: true, south: true },
};

/**
 * District character of each block between the avenues (12 blocks, row-major from the north-west):
 * a market, a mechanic village, a residential close and a motor park, so a player can tell where they
 * are in the city from the ground under their feet.
 */
export type District = 'market' | 'mechanic' | 'residential' | 'motorpark';
const DISTRICTS: District[] = [
  'mechanic',
  'market',
  'residential',
  'motorpark',
  'residential',
  'market',
  'mechanic',
  'market',
  'motorpark',
  'residential',
  'market',
  'mechanic',
];
const DISTRICT_TINT: Record<District, string> = {
  market: 'rgba(150, 82, 46, 0.22)',
  mechanic: 'rgba(40, 44, 52, 0.26)',
  residential: 'rgba(196, 170, 120, 0.18)',
  motorpark: 'rgba(110, 100, 70, 0.2)',
};

/** Avenue rows / columns (centre lines) and the half-width of each avenue, read from the layout. */
function avenues(layout: readonly string[]): { rows: number[]; cols: number[] } {
  const H = layout.length;
  const W = layout[0]!.length;
  const rows: number[] = [];
  const cols: number[] = [];
  for (let y = 1; y < H - 1; y++) {
    if ([...layout[y]!].every((c) => c === '=') && layout[y - 1]![0] === '=' && layout[y + 1]![0] === '=')
      rows.push(y);
  }
  for (let x = 1; x < W - 1; x++) {
    if (layout.every((r) => r[x] === '=') && layout.every((r) => r[x - 1] === '=' && r[x + 1] === '='))
      cols.push(x);
  }
  return { rows, cols };
}

/** Block (district) rectangles between the avenues, in tiles: [x0, y0, x1, y1] inclusive. */
export function rumbleBlocks(layout: readonly string[]): [number, number, number, number][] {
  const { rows, cols } = avenues(layout);
  const span = (cuts: number[], size: number): [number, number][] => {
    const out: [number, number][] = [];
    let start = 0;
    for (const c of cuts) {
      out.push([start, c - 2]);
      start = c + 2;
    }
    out.push([start, size - 1]);
    return out;
  };
  const out: [number, number, number, number][] = [];
  for (const [y0, y1] of span(rows, layout.length))
    for (const [x0, x1] of span(cols, layout[0]!.length)) out.push([x0, y0, x1, y1]);
  return out;
}

export const districtOf = (block: number): District => DISTRICTS[block % DISTRICTS.length]!;

function dashed(g: Ctx, x0: number, y0: number, x1: number, y1: number, dash: number, gap: number): void {
  g.setLineDash([dash, gap]);
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.setLineDash([]);
}

/**
 * Worn concrete blocks tinted by district, dark asphalt avenues with faded lane paint and kerbs,
 * zebra crossings at the junctions, and the painted "final square" in the middle that never closes.
 * Drawn in T-pixel tile units (the canvas may be scaled down for this big board); the noise is
 * painted at the canvas's real resolution.
 */
export const RUMBLE_FLOOR: FloorDrawer = (g, rg, cols, rows) => {
  const layout = getArena('cityRumble').layout;
  const r = artRng(4111);
  noiseFill(g, g.canvas.width, g.canvas.height, [176, 166, 150], 18, 7);
  noiseFill(rg, rg.canvas.width, rg.canvas.height, [214, 214, 214], 20, 9);

  // districts: a tint per block and faint tile seams
  rumbleBlocks(layout).forEach(([x0, y0, x1, y1], i) => {
    g.fillStyle = DISTRICT_TINT[districtOf(i)];
    g.fillRect(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T);
  });
  g.strokeStyle = 'rgba(24, 20, 16, 0.32)';
  g.lineWidth = 3;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (layout[y]![x] === '=') continue;
      g.strokeRect(x * T + 1.5, y * T + 1.5, T - 3, T - 3);
    }
  }

  // avenues: asphalt over the road tiles, smoother (less rough) than the blocks
  const { rows: aRows, cols: aCols } = avenues(layout);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (layout[y]![x] !== '=') continue;
      g.fillStyle = `rgba(${34 + r() * 8}, ${32 + r() * 6}, ${30 + r() * 6}, 0.86)`;
      g.fillRect(x * T, y * T, T, T);
      rg.fillStyle = 'rgba(150, 150, 150, 0.6)';
      rg.fillRect(x * T, y * T, T, T);
    }
  }
  // kerbs along the avenue edges, faded centre lines, zebra crossings where avenues meet
  g.lineCap = 'butt';
  for (const ay of aRows) {
    g.strokeStyle = 'rgba(206, 196, 170, 0.75)';
    g.lineWidth = 10;
    for (const ky of [ay - 1, ay + 2]) dashed(g, 0, ky * T, cols * T, ky * T, T * 0.9, T * 0.1);
    g.strokeStyle = 'rgba(230, 190, 60, 0.55)';
    g.lineWidth = 8;
    dashed(g, 0, (ay + 0.5) * T, cols * T, (ay + 0.5) * T, T * 0.7, T * 0.5);
  }
  for (const ax of aCols) {
    g.strokeStyle = 'rgba(206, 196, 170, 0.75)';
    g.lineWidth = 10;
    for (const kx of [ax - 1, ax + 2]) dashed(g, kx * T, 0, kx * T, rows * T, T * 0.9, T * 0.1);
    g.strokeStyle = 'rgba(230, 190, 60, 0.55)';
    g.lineWidth = 8;
    dashed(g, (ax + 0.5) * T, 0, (ax + 0.5) * T, rows * T, T * 0.7, T * 0.5);
  }
  g.fillStyle = 'rgba(232, 226, 210, 0.5)';
  for (const ay of aRows) {
    for (const ax of aCols) {
      // stripes across the avenue just before each junction square
      for (let k = 0; k < 6; k++) {
        const s = (ay - 1) * T + k * T * 0.5 + T * 0.1;
        g.fillRect((ax - 2) * T + T * 0.15, s, T * 0.7, T * 0.28);
        g.fillRect((ax + 2) * T + T * 0.15, s, T * 0.7, T * 0.28);
      }
    }
  }

  // oil, tyre scuffs and rubbish on the roads; dust in the blocks
  for (let i = 0; i < cols * rows * 0.12; i++) {
    const x = r() * cols * T;
    const y = r() * rows * T;
    const road = layout[Math.floor(y / T)]?.[Math.floor(x / T)] === '=';
    stain(g, x, y, T * (0.3 + r() * 0.7), road ? 'rgba(8, 8, 10, 0.32)' : 'rgba(70, 52, 34, 0.22)');
  }

  // the final square: it never closes, painted like a football pitch kerb
  const keep = getArena('cityRumble').config?.crush?.keepCore;
  if (keep?.w && keep.h) {
    const x0 = ((cols - keep.w) / 2) * T;
    const y0 = ((rows - keep.h) / 2) * T;
    g.strokeStyle = 'rgba(240, 200, 40, 0.8)';
    g.lineWidth = 14;
    g.strokeRect(x0 + 7, y0 + 7, keep.w * T - 14, keep.h * T - 14);
    g.strokeStyle = 'rgba(30, 24, 10, 0.6)';
    g.lineWidth = 6;
    dashed(g, x0 + 22, y0 + 22, x0 + keep.w * T - 22, y0 + 22, T * 0.4, T * 0.25);
    dashed(g, x0 + 22, y0 + keep.h * T - 22, x0 + keep.w * T - 22, y0 + keep.h * T - 22, T * 0.4, T * 0.25);
  }
};
