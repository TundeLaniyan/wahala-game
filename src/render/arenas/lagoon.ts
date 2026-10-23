/**
 * Lagos Lagoon Jetty: a waterfront loading jetty in a misty sunrise.
 *
 * Presentation only (the grid, roads and hazards are `src/sim/arenas`). This module owns the arena's
 * light (LAGOON_LOOK), its surroundings (LAGOON_SET) and its playfield floor (LAGOON_FLOOR).
 * Every set follows the rules in `common.ts`: nothing on the board, the camera (south) side stays low.
 */
import type { ArenaLook } from '../arenaLook';
import type { ArenaSet, SetContext } from './common';
import { T, makeCanvas, noiseFill, seams } from './floorKit';
import type { FloorDrawer } from './floorKit';
import { shophouseRows, streetDressing } from './shared';

export const LAGOON_LOOK: ArenaLook = {
  sky: 0xc4b4a4,
  fog: { color: 0xb6a99c, near: 10, far: 42 },
  sun: { color: 0xffc898, intensity: 3.0, position: [-11, 8, 6] },
  hemi: { sky: 0xd8c8b8, ground: 0x4a4440, intensity: 0.95 },
  envIntensity: 0.55,
  exposure: 1.06,
  floorTint: 0xa89c8c,
  pillarTint: 0xbab0a2,
  softTint: 0xb8a890,
  slab: 0x5c5650,
  street: 0x262a2c,
  grit: { tone: 0x6e665c, dirt: 0x4a443c, dust: 0x8c8478 },
  lamps: [
      [-9.2, 3.0, -0.8, 0xffa04a],
      [9.2, 3.0, 1.2, 0xffa04a],
    ],
};

function build(ctx: SetContext): void {
  streetDressing(ctx);
  shophouseRows(ctx, { east: true, west: true });
}

export const LAGOON_SET: ArenaSet = {
  build,
  crowd: 0.6,
  crowdEdges: { north: true, east: true, west: true, south: true },
};

/** Placeholder floor: worn concrete with faint tile seams. */
export const LAGOON_FLOOR: FloorDrawer = (g, rg, cols, rows) => {
  const w = cols * T;
  const h = rows * T;
  noiseFill(g, w, h, [168, 156, 140], 18, 7);
  noiseFill(rg, w, h, [210, 210, 210], 20, 9);
  seams(g, cols, rows, 'rgba(20,18,16,0.4)', 3);
  void makeCanvas;
};
