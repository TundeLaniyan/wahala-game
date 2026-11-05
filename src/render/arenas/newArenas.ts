/**
 * Registry of the arenas added in the nine-arena expansion (presentation only). Each arena module owns
 * its look, surroundings and floor; the registry is read lazily so module cycles never matter.
 */
import type { ArenaLook } from '../arenaLook';
import type { CoverFactory } from './boardCover';
import type { ArenaSet } from './common';
import type { FloorDrawer } from './floorKit';
import { OJUELEGBA_ENV } from '../env/ojuelegbaEnv';
import { oshodiMetroEnv } from '../env/oshodiMetroEnv';
import {
  RUMBLE_EBUTE_METTA_COVER,
  RUMBLE_EBUTE_METTA_FLOOR,
  RUMBLE_EBUTE_METTA_LOOK,
  RUMBLE_EBUTE_METTA_NIGHT_LOOK,
  RUMBLE_EBUTE_METTA_SET,
  ebuteMettaEnv,
} from './ebuteMettaArt';
import {
  RUMBLE_FADEYI_COVER,
  RUMBLE_FADEYI_FLOOR,
  RUMBLE_FADEYI_LOOK,
  RUMBLE_FADEYI_NIGHT_LOOK,
  RUMBLE_FADEYI_SET,
  fadeyiEnv,
} from './fadeyiArt';
import {
  RUMBLE_LEKKI_COVER,
  RUMBLE_LEKKI_FLOOR,
  RUMBLE_LEKKI_LOOK,
  RUMBLE_LEKKI_NIGHT_LOOK,
  RUMBLE_LEKKI_SET,
  lekkiEnv,
} from './lekkiArt';
import {
  RUMBLE_MUSHIN_COVER,
  RUMBLE_MUSHIN_FLOOR,
  RUMBLE_MUSHIN_LOOK,
  RUMBLE_MUSHIN_NIGHT_LOOK,
  RUMBLE_MUSHIN_SET,
  mushinEnv,
} from './mushinArt';
import { RAID_VARIANTS, raidArtTable, raidReviewVariant } from './raidArt';
import { timeOfDay } from '../timeOfDay';
import type { StageEnvironmentSource } from '../env/types';
import { AJEGUNLE_FLOOR, AJEGUNLE_LOOK, AJEGUNLE_SET } from './ajegunle';
import { LAGOON_FLOOR, LAGOON_LOOK, LAGOON_SET } from './lagoon';
import { mobileTestArt } from './mobileTest';
import { OSHODI_FLOOR, OSHODI_LOOK, OSHODI_SET } from './oshodi';
import {
  OSHODI_METRO_COVER,
  OSHODI_METRO_FLOOR,
  OSHODI_METRO_LOOK,
  OSHODI_METRO_NIGHT_LOOK,
  OSHODI_METRO_SET,
} from './oshodiMetroArt';
import { POWER_YARD_FLOOR, POWER_YARD_LOOK, POWER_YARD_SET } from './powerYard';
import {
  RUMBLE_LAGOS_ISLAND_COVER,
  RUMBLE_LAGOS_ISLAND_FLOOR,
  RUMBLE_LAGOS_ISLAND_LOOK,
  RUMBLE_LAGOS_ISLAND_NIGHT_LOOK,
  RUMBLE_LAGOS_ISLAND_SET,
  lagosIslandEnv,
} from './lagosIslandArt';
import {
  RUMBLE_OJUELEGBA_COVER,
  RUMBLE_OJUELEGBA_FLOOR,
  RUMBLE_OJUELEGBA_LOOK,
  RUMBLE_OJUELEGBA_SET,
} from './rumbleOjuelegbaArt';
import { THIRD_MAINLAND_FLOOR, THIRD_MAINLAND_LOOK, THIRD_MAINLAND_SET } from './thirdMainland';
import { YABA_FLOOR, YABA_LOOK, YABA_SET } from './yaba';

export interface ArenaArt {
  look: ArenaLook;
  /** A night look on the same geometry, used instead of `look` when the review flag `?tod=night` is set. */
  nightLook?: ArenaLook;
  set: ArenaSet;
  floor: FloorDrawer;
  /** Permanent cover drawn as whole objects instead of per-tile pillars (`boardCover.ts`). */
  cover?: CoverFactory;
  /** The stage's living environment (ambient traffic, crowds, practical lights), as data. Optional. */
  env?: StageEnvironmentSource;
}

let cache: Record<string, ArenaArt> | null = null;

export function NEW_ARENA_ART(): Record<string, ArenaArt> {
  cache ??= {
    oshodiInterchange: { look: OSHODI_LOOK, set: OSHODI_SET, floor: OSHODI_FLOOR },
    ajegunleBackstreets: { look: AJEGUNLE_LOOK, set: AJEGUNLE_SET, floor: AJEGUNLE_FLOOR },
    lagoonJetty: { look: LAGOON_LOOK, set: LAGOON_SET, floor: LAGOON_FLOOR },
    surulerePowerYard: { look: POWER_YARD_LOOK, set: POWER_YARD_SET, floor: POWER_YARD_FLOOR },
    yabaAfterDark: { look: YABA_LOOK, set: YABA_SET, floor: YABA_FLOOR },
    thirdMainland: { look: THIRD_MAINLAND_LOOK, set: THIRD_MAINLAND_SET, floor: THIRD_MAINLAND_FLOOR },
    // City Rumble V2 stages
    rumbleLagosIsland: {
      look: RUMBLE_LAGOS_ISLAND_LOOK,
      nightLook: RUMBLE_LAGOS_ISLAND_NIGHT_LOOK,
      set: RUMBLE_LAGOS_ISLAND_SET,
      floor: RUMBLE_LAGOS_ISLAND_FLOOR,
      cover: RUMBLE_LAGOS_ISLAND_COVER,
      env: lagosIslandEnv,
    },
    rumbleOjuelegba: {
      look: RUMBLE_OJUELEGBA_LOOK,
      set: RUMBLE_OJUELEGBA_SET,
      floor: RUMBLE_OJUELEGBA_FLOOR,
      cover: RUMBLE_OJUELEGBA_COVER,
      env: OJUELEGBA_ENV,
    },
    // Lagos arenas, build 1: Oshodi Transport Metropolis (day by default, a night look behind ?tod=night)
    rumbleOshodi: {
      look: OSHODI_METRO_LOOK,
      nightLook: OSHODI_METRO_NIGHT_LOOK,
      set: OSHODI_METRO_SET,
      floor: OSHODI_METRO_FLOOR,
      cover: OSHODI_METRO_COVER,
      env: (board) => oshodiMetroEnv(board, timeOfDay()),
    },
    // researched communities (Canonical Lagos Map Build Bible v2): day by default, a night look behind ?tod=night
    rumbleMushin: {
      look: RUMBLE_MUSHIN_LOOK,
      nightLook: RUMBLE_MUSHIN_NIGHT_LOOK,
      set: RUMBLE_MUSHIN_SET,
      floor: RUMBLE_MUSHIN_FLOOR,
      cover: RUMBLE_MUSHIN_COVER,
      env: mushinEnv,
    },
    rumbleFadeyi: {
      look: RUMBLE_FADEYI_LOOK,
      nightLook: RUMBLE_FADEYI_NIGHT_LOOK,
      set: RUMBLE_FADEYI_SET,
      floor: RUMBLE_FADEYI_FLOOR,
      cover: RUMBLE_FADEYI_COVER,
      env: fadeyiEnv,
    },
    rumbleLekki: {
      look: RUMBLE_LEKKI_LOOK,
      nightLook: RUMBLE_LEKKI_NIGHT_LOOK,
      set: RUMBLE_LEKKI_SET,
      floor: RUMBLE_LEKKI_FLOOR,
      cover: RUMBLE_LEKKI_COVER,
      env: lekkiEnv,
    },
    rumbleEbuteMetta: {
      look: RUMBLE_EBUTE_METTA_LOOK,
      nightLook: RUMBLE_EBUTE_METTA_NIGHT_LOOK,
      set: RUMBLE_EBUTE_METTA_SET,
      floor: RUMBLE_EBUTE_METTA_FLOOR,
      cover: RUMBLE_EBUTE_METTA_COVER,
      env: ebuteMettaEnv,
    },
    // V2 experimental: the Mobile Test Arena wears Danfo Bus Park's presentation
    mobileTest13x9: mobileTestArt(),
    mobileTest15x9: mobileTestArt(),
    // classic raids (docs/RAID_PRESENTATION.md): warehouse interior, rail yard, under-bridge storeroom
    ...raidArtTable(),
  };
  // art review only (`?raidart=warehouse|yard|storeroom`): the look on a real standard board
  const review = raidReviewVariant();
  if (review) cache.oshodiInterchange = RAID_VARIANTS[review];
  return cache;
}

export function NEW_ARENA_FLOORS(): Record<string, FloorDrawer> {
  return Object.fromEntries(Object.entries(NEW_ARENA_ART()).map(([id, a]) => [id, a.floor]));
}
