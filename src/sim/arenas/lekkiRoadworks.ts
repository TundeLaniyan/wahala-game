import { DANFO_BUS_PARK } from './danfoBusPark';
import type { ArenaDef } from './types';
import { mirroredTraps } from './traps';

/**
 * The trap arena: a Lekki construction site on the Danfo Bus Park grid, with potholes (a stumble)
 * and oil slicks (a slide) dug into the open lanes. 'o' = pothole, '~' = oil. Symmetric so every
 * spawn faces the same traps. The early traps default to on here.
 */
export const LEKKI_ROADWORKS: ArenaDef = {
  ...DANFO_BUS_PARK,
  id: 'lekkiRoadworks',
  name: 'Lekki Roadworks (trap arena)',
  trapArena: true,
  hazardLayout: mirroredTraps([
    [6, 4, 'o'],
    [4, 2, 'o'],
    [2, 5, '~'],
    [7, 2, '~'],
  ]),
  endgameTraps: [
    // 0:30 - the excavators break through: trenches and hydraulic-fluid leaks
    mirroredTraps([
      [2, 3, 'o'],
      [5, 0, 'o'],
      [6, 2, '~'],
      [4, 4, '~'],
    ]),
    // 0:15 - the whole cut collapses into potholes
    mirroredTraps([
      [0, 4, 'o'],
      [3, 2, 'o'],
      [6, 5, '~'],
    ]),
  ],
};
