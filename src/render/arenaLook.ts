/**
 * Per-arena art direction: light, atmosphere and material treatment. Presentation only; the
 * arena's gameplay contract (grid, tiles, lanes) lives in `src/sim/arenas`.
 *
 * - Danfo Bus Park: golden late-afternoon sun low in the west, warm dust haze, long shadows.
 * - Balogun Market: high tropical midday sun from the east, saturated colour, terracotta pavers.
 * - Lekki Roadworks: blue-hour dusk under cool white floodlights, dark asphalt, a lit skyline.
 */
export interface ArenaLook {
  /** Sky / clear colour and the distance fog that gives the backdrop atmospheric depth. */
  sky: number;
  fog: { color: number; near: number; far: number };
  sun: { color: number; intensity: number; position: [number, number, number] };
  hemi: { sky: number; ground: number; intensity: number };
  /** Environment-map strength (reflections on paint, glass and metal). */
  envIntensity: number;
  exposure: number;
  /** Multiplies the slab floor's albedo. */
  floorTint: number;
  /** Multiplies the pillar and soft-block albedo (pulls obstacles a step behind the characters). */
  pillarTint: number;
  softTint: number;
  /** Raised slab and street ground around the arena. */
  slab: number;
  street: number;
}

const LOOKS: Record<string, ArenaLook> = {
  danfoBusPark: {
    sky: 0xe7b47c,
    fog: { color: 0xdca878, near: 17, far: 62 },
    sun: { color: 0xffc98a, intensity: 4.6, position: [-14, 11, 5.5] },
    hemi: { sky: 0xffe2c0, ground: 0x6e5038, intensity: 0.58 },
    envIntensity: 0.55,
    exposure: 1.04,
    floorTint: 0xcfc2b0,
    pillarTint: 0xe6dccd,
    softTint: 0xe4d6c4,
    slab: 0xd8c9b4,
    street: 0x3f3a35,
  },
  balogunMarket: {
    sky: 0xf4cf98,
    fog: { color: 0xf0c891, near: 16, far: 58 },
    sun: { color: 0xfff0d2, intensity: 4.9, position: [10, 15, 7] },
    hemi: { sky: 0xfff0dc, ground: 0x8a5232, intensity: 0.64 },
    envIntensity: 0.6,
    exposure: 1.06,
    floorTint: 0xe2a684,
    pillarTint: 0xf0dccb,
    softTint: 0xffffff,
    slab: 0xc98e6a,
    street: 0x6a4630,
  },
  lekkiRoadworks: {
    sky: 0x4d5f86,
    fog: { color: 0x55678f, near: 15, far: 54 },
    sun: { color: 0xdfe8ff, intensity: 3.9, position: [-6, 15, 9] },
    hemi: { sky: 0x7f95cc, ground: 0x4a3c34, intensity: 0.6 },
    envIntensity: 0.7,
    exposure: 1.02,
    floorTint: 0x7c7a79,
    pillarTint: 0xd8d8dc,
    softTint: 0xf2eee8,
    slab: 0x77736f,
    street: 0x26262a,
  },
};

export function arenaLook(arenaId: string): ArenaLook {
  return LOOKS[arenaId] ?? LOOKS.danfoBusPark!;
}
