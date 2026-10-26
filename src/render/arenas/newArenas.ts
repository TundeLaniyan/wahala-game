/**
 * Registry of the arenas added in the nine-arena expansion (presentation only). Each arena module owns
 * its look, surroundings and floor; the registry is read lazily so module cycles never matter.
 */
import type { ArenaLook } from '../arenaLook';
import type { CoverFactory } from './boardCover';
import type { ArenaSet } from './common';
import type { FloorDrawer } from './floorKit';
import { OJUELEGBA_ENV } from '../env/ojuelegbaEnv';
import type { StageEnvironmentSource } from '../env/types';
import { AJEGUNLE_FLOOR, AJEGUNLE_LOOK, AJEGUNLE_SET } from './ajegunle';
import { LAGOON_FLOOR, LAGOON_LOOK, LAGOON_SET } from './lagoon';
import { mobileTestArt } from './mobileTest';
import { OSHODI_FLOOR, OSHODI_LOOK, OSHODI_SET } from './oshodi';
import { POWER_YARD_FLOOR, POWER_YARD_LOOK, POWER_YARD_SET } from './powerYard';
import { RUMBLE_FLOOR, RUMBLE_LOOK, RUMBLE_SET } from './rumble';
import { RUMBLE_APAPA_FLOOR, RUMBLE_APAPA_LOOK, RUMBLE_APAPA_SET } from './rumbleApapaArt';
import {
  RUMBLE_LAGOS_ISLAND_FLOOR,
  RUMBLE_LAGOS_ISLAND_LOOK,
  RUMBLE_LAGOS_ISLAND_SET,
} from './rumbleLagosIslandArt';
import {
  RUMBLE_LEKKI_NIGHT_FLOOR,
  RUMBLE_LEKKI_NIGHT_LOOK,
  RUMBLE_LEKKI_NIGHT_SET,
} from './rumbleLekkiNightArt';
import {
  RUMBLE_OJUELEGBA_COVER,
  RUMBLE_OJUELEGBA_FLOOR,
  RUMBLE_OJUELEGBA_LOOK,
  RUMBLE_OJUELEGBA_SET,
} from './rumbleOjuelegbaArt';
import { RUMBLE_OSHODI_FLOOR, RUMBLE_OSHODI_LOOK, RUMBLE_OSHODI_SET } from './rumbleOshodiArt';
import { THIRD_MAINLAND_FLOOR, THIRD_MAINLAND_LOOK, THIRD_MAINLAND_SET } from './thirdMainland';
import { YABA_FLOOR, YABA_LOOK, YABA_SET } from './yaba';

export interface ArenaArt {
  look: ArenaLook;
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
    cityRumble: { look: RUMBLE_LOOK, set: RUMBLE_SET, floor: RUMBLE_FLOOR },
    // City Rumble V2 stages
    rumbleOshodi: { look: RUMBLE_OSHODI_LOOK, set: RUMBLE_OSHODI_SET, floor: RUMBLE_OSHODI_FLOOR },
    rumbleLagosIsland: {
      look: RUMBLE_LAGOS_ISLAND_LOOK,
      set: RUMBLE_LAGOS_ISLAND_SET,
      floor: RUMBLE_LAGOS_ISLAND_FLOOR,
    },
    rumbleOjuelegba: {
      look: RUMBLE_OJUELEGBA_LOOK,
      set: RUMBLE_OJUELEGBA_SET,
      floor: RUMBLE_OJUELEGBA_FLOOR,
      cover: RUMBLE_OJUELEGBA_COVER,
      env: OJUELEGBA_ENV,
    },
    rumbleApapa: { look: RUMBLE_APAPA_LOOK, set: RUMBLE_APAPA_SET, floor: RUMBLE_APAPA_FLOOR },
    rumbleLekkiNight: {
      look: RUMBLE_LEKKI_NIGHT_LOOK,
      set: RUMBLE_LEKKI_NIGHT_SET,
      floor: RUMBLE_LEKKI_NIGHT_FLOOR,
    },
    // V2 experimental: the Mobile Test Arena wears Danfo Bus Park's presentation
    mobileTest13x9: mobileTestArt(),
    mobileTest15x9: mobileTestArt(),
  };
  return cache;
}

export function NEW_ARENA_FLOORS(): Record<string, FloorDrawer> {
  return Object.fromEntries(Object.entries(NEW_ARENA_ART()).map(([id, a]) => [id, a.floor]));
}
