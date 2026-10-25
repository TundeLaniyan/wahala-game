/**
 * Registry of the arenas added in the nine-arena expansion (presentation only). Each arena module owns
 * its look, surroundings and floor; the registry is read lazily so module cycles never matter.
 */
import type { ArenaLook } from '../arenaLook';
import type { ArenaSet } from './common';
import type { FloorDrawer } from './floorKit';
import { AJEGUNLE_FLOOR, AJEGUNLE_LOOK, AJEGUNLE_SET } from './ajegunle';
import { LAGOON_FLOOR, LAGOON_LOOK, LAGOON_SET } from './lagoon';
import { mobileTestArt } from './mobileTest';
import { OSHODI_FLOOR, OSHODI_LOOK, OSHODI_SET } from './oshodi';
import { POWER_YARD_FLOOR, POWER_YARD_LOOK, POWER_YARD_SET } from './powerYard';
import { RUMBLE_FLOOR, RUMBLE_LOOK, RUMBLE_SET } from './rumble';
import { THIRD_MAINLAND_FLOOR, THIRD_MAINLAND_LOOK, THIRD_MAINLAND_SET } from './thirdMainland';
import { YABA_FLOOR, YABA_LOOK, YABA_SET } from './yaba';

export interface ArenaArt {
  look: ArenaLook;
  set: ArenaSet;
  floor: FloorDrawer;
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
    // V2 experimental: the Mobile Test Arena wears Danfo Bus Park's presentation
    mobileTest13x9: mobileTestArt(),
    mobileTest15x9: mobileTestArt(),
  };
  return cache;
}

export function NEW_ARENA_FLOORS(): Record<string, FloorDrawer> {
  return Object.fromEntries(Object.entries(NEW_ARENA_ART()).map(([id, a]) => [id, a.floor]));
}
