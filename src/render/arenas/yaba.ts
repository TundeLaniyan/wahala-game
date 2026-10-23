/**
 * Yaba After Dark: a nightlife street lit by neon, headlights and street lamps.
 *
 * Presentation only (the grid, roads and hazards are `src/sim/arenas`). This module owns the arena's
 * light (YABA_LOOK), its surroundings (YABA_SET) and its playfield floor (YABA_FLOOR).
 * Every set follows the rules in `common.ts`: nothing on the board, the camera (south) side stays low.
 */
import type { ArenaLook } from '../arenaLook';
import type { ArenaSet, SetContext } from './common';
import { T, makeCanvas, noiseFill, seams } from './floorKit';
import type { FloorDrawer } from './floorKit';
import { shophouseRows, streetDressing } from './shared';

export const YABA_LOOK: ArenaLook = {
  sky: 0x0d0b16,
  fog: { color: 0x181322, near: 10, far: 40 },
  sun: { color: 0xb8b0ff, intensity: 2.4, position: [-4, 16, 9] },
  hemi: { sky: 0x56487a, ground: 0x261c18, intensity: 0.9 },
  envIntensity: 0.4,
  exposure: 1.1,
  floorTint: 0x8c8890,
  pillarTint: 0xb0aab4,
  softTint: 0xb6aca4,
  slab: 0x46424a,
  street: 0x141218,
  grit: { tone: 0x625e66, dirt: 0x423e44, dust: 0x847e88 },
  lamps: [
      [-9.2, 2.8, -1.2, 0xff3cc8],
      [9.2, 2.8, 1.0, 0x3ce0ff],
      [-4.4, 3.0, -7.4, 0xffb040],
      [4.4, 3.0, -7.4, 0xff4a5a],
    ],
};

function build(ctx: SetContext): void {
  streetDressing(ctx);
  shophouseRows(ctx, { north: true, east: true, west: true, close: -0.3 });
}

export const YABA_SET: ArenaSet = {
  build,
  crowd: 0.6,
  crowdEdges: { north: true, east: true, west: true, south: true },
};

/** Placeholder floor: worn concrete with faint tile seams. */
export const YABA_FLOOR: FloorDrawer = (g, rg, cols, rows) => {
  const w = cols * T;
  const h = rows * T;
  noiseFill(g, w, h, [140, 136, 144], 18, 7);
  noiseFill(rg, w, h, [210, 210, 210], 20, 9);
  seams(g, cols, rows, 'rgba(20,18,16,0.4)', 3);
  void makeCanvas;
};
