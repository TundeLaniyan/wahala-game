/**
 * Per-arena art direction: light, atmosphere and material treatment. Presentation only; the
 * arena's gameplay contract (grid, tiles, lanes) lives in `src/sim/arenas`.
 *
 * The target is gritty, adult Lagos street life, not a bright toy board: restrained colour, smog
 * and dust in the air, hard low light and deep shadow.
 *
 * - Danfo Bus Park: smoggy late afternoon. A low orange sun through exhaust haze, brown air, long
 *   hard shadows across worn tarmac.
 * - Balogun Market: humid, hazy overcast noon thick with cooking smoke; flat grey-ochre light, red
 *   laterite dust on everything.
 * - Lekki Roadworks: night shift. Cold white floodlights over raw cement and wet asphalt, sodium
 *   work lamps, black sky.
 */
import { NEW_ARENA_ART } from './arenas/newArenas';
import { timeOfDay } from './timeOfDay';

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
  /** Grit: the dusty tone colours drift towards, ground dirt and dust film (see grit.ts). */
  grit: { tone: number; dirt: number; dust: number };
  /** Warm work lamps / sodium lights around the arena (world x, y, z, colour), no shadows. */
  lamps: [number, number, number, number][];
}

const LOOKS: Record<string, ArenaLook> = {
  danfoBusPark: {
    sky: 0x7d6650,
    fog: { color: 0x76604c, near: 13, far: 50 },
    sun: { color: 0xffb070, intensity: 3.6, position: [-7.5, 12, 9] },
    hemi: { sky: 0xc8ac8c, ground: 0x5a4636, intensity: 0.9 },
    envIntensity: 0.45,
    exposure: 1.04,
    floorTint: 0xbab0a0,
    pillarTint: 0xc8beae,
    softTint: 0xc4b6a8,
    slab: 0x6e665c,
    street: 0x26221e,
    grit: { tone: 0x78624c, dirt: 0x5a4c3c, dust: 0x8c7a64 },
    // sodium street lamps over the side streets and the north bays
    lamps: [
      [-9.2, 3.0, -0.8, 0xffa04a],
      [9.2, 3.0, 1.2, 0xffa04a],
      [-4.6, 3.2, -7.4, 0xff9a40],
      [4.6, 3.2, -7.4, 0xff9a40],
    ],
  },
  balogunMarket: {
    sky: 0x8f887a,
    fog: { color: 0x847c6c, near: 12, far: 46 },
    sun: { color: 0xffe2bc, intensity: 3.0, position: [7, 16, 5] },
    hemi: { sky: 0xd2c2a8, ground: 0x5a4230, intensity: 0.95 },
    envIntensity: 0.42,
    exposure: 1.04,
    floorTint: 0xc29e84,
    pillarTint: 0xcab8a4,
    softTint: 0xc8b8a6,
    slab: 0x6c5242,
    street: 0x3a2a1f,
    grit: { tone: 0x7c5a44, dirt: 0x5a3e2e, dust: 0x8e6c54 },
    // bare bulbs under the stall roofs
    lamps: [
      [-9.3, 2.3, 0.4, 0xffb060],
      [9.3, 2.3, -0.6, 0xffb060],
      [-3.4, 2.3, -7.1, 0xffaa55],
      [3.4, 2.3, -7.1, 0xffaa55],
    ],
  },
  lekkiRoadworks: {
    sky: 0x121722,
    fog: { color: 0x1a202c, near: 11, far: 42 },
    sun: { color: 0xdde6ff, intensity: 4.1, position: [-5, 16, 9] },
    hemi: { sky: 0x5a6890, ground: 0x2e261c, intensity: 0.95 },
    envIntensity: 0.36,
    exposure: 1.08,
    floorTint: 0x8e8c88,
    pillarTint: 0xb6b4b0,
    softTint: 0xbcb6aa,
    slab: 0x4a4846,
    street: 0x16161a,
    grit: { tone: 0x6c6a66, dirt: 0x46423e, dust: 0x8a8680 },
    lamps: [
      [-9.4, 3.2, -7.6, 0xffa040],
      [9.4, 3.2, -7.6, 0xffa040],
      [-10.2, 2.6, 7.4, 0xff9a36],
      [10.2, 2.6, 7.4, 0xff9a36],
    ],
  },
};
/** The arena's look: the original three live here, the expansion arenas in their own modules. */
export function arenaLook(arenaId: string): ArenaLook {
  const built = LOOKS[arenaId];
  if (built) return built;
  const art = NEW_ARENA_ART()[arenaId];
  // an arena that ships a night look on the same geometry shows it behind the review flag `?tod=night`
  if (art?.nightLook && timeOfDay() === 'night') return art.nightLook;
  return art?.look ?? LOOKS.danfoBusPark!;
}
