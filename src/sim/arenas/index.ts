import { AJEGUNLE_BACKSTREETS } from './ajegunleBackstreets';
import { BALOGUN_MARKET } from './balogunMarket';
import { CITY_RUMBLE } from './cityRumble';
import { DANFO_BUS_PARK } from './danfoBusPark';
import { LAGOON_JETTY } from './lagoonJetty';
import { LEKKI_ROADWORKS } from './lekkiRoadworks';
import { OSHODI_INTERCHANGE } from './oshodiInterchange';
import { SURULERE_POWER_YARD } from './surulerePowerYard';
import { THIRD_MAINLAND } from './thirdMainland';
import { YABA_AFTER_DARK } from './yabaAfterDark';
import type { ArenaDef } from './types';

export type { ArenaDef, ArenaInfo, ArenaKind, HazardSchedule, StageHazardDef } from './types';

/** Every arena, in menu order: the nine standard arenas, then City Rumble. */
export const ARENAS: Readonly<Record<string, ArenaDef>> = Object.fromEntries(
  [
    DANFO_BUS_PARK,
    BALOGUN_MARKET,
    LEKKI_ROADWORKS,
    OSHODI_INTERCHANGE,
    AJEGUNLE_BACKSTREETS,
    LAGOON_JETTY,
    SURULERE_POWER_YARD,
    YABA_AFTER_DARK,
    THIRD_MAINLAND,
    CITY_RUMBLE,
  ].map((a) => [a.id, a]),
);

/** The nine standard (2-4 player, whole-arena camera) arenas in menu order. */
export const STANDARD_ARENA_IDS: readonly string[] = Object.values(ARENAS)
  .filter((a) => a.kind === 'standard')
  .map((a) => a.id);

export const CITY_RUMBLE_ID = CITY_RUMBLE.id;
export const DEFAULT_ARENA_ID = DANFO_BUS_PARK.id;

export function getArena(id: string): ArenaDef {
  const arena = ARENAS[id];
  if (!arena) throw new Error(`Unknown arena "${id}"`);
  return arena;
}
