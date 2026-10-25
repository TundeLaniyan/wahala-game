/**
 * EXPERIMENTAL Mobile Test Arena (sim/arenas/mobileTest.ts): presentation reused from Danfo Bus Park, the
 * visually approved stage it is derived from - the same light and fog, the same terminal surroundings
 * (the set reads the board size, so it frames the smaller 13 x 9 / 15 x 9 board) and the same worn floor.
 */
import { arenaLook } from '../arenaLook';
import type { ArenaArt } from './newArenas';
import { BUS_PARK_SET } from './busPark';
import { busPark } from './floors';

export function mobileTestArt(): ArenaArt {
  return { look: arenaLook('danfoBusPark'), set: BUS_PARK_SET, floor: busPark };
}
