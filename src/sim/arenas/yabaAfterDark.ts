import type { ArenaDef } from './types';
import { CORNER_CLEARANCE, CORNER_SPAWNS, line, makeLayout, mirror4, trapRows } from './build';

/**
 * Yaba After Dark: a nightlife street. Small plazas open where four pillars are removed, and kiosk
 * blocks on the centre column split rows 2 and 8.
 *
 * Stage: power fluctuations. One of four symmetric zone sets (street-front strips, the centre plaza,
 * the side kerbs) sparks 1.8 s ahead, then is live for 1.2 s: anyone standing in it is out (Okada
 * absorbs). The zones are always marked on the floor, so the danger stays readable when the neon flickers.
 */
const ZONES: [number, number][][] = [
  mirror4(line([2, 2], [4, 2])),
  mirror4(line([6, 2], [6, 4])),
  [...line([6, 4], [8, 4]), ...line([6, 6], [8, 6]), [7, 5]],
  [...mirror4(line([0, 4], [0, 5])), ...mirror4(line([6, 0], [7, 0]))],
];

export const YABA_AFTER_DARK: ArenaDef = {
  id: 'yabaAfterDark',
  name: 'Yaba After Dark',
  kind: 'standard',
  layout: makeLayout({
    removeHard: mirror4([[3, 3]]),
    addHard: [
      [7, 2],
      [7, 8],
    ],
    roads: ZONES.flat(),
  }),
  spawns: CORNER_SPAWNS,
  spawnClearance: CORNER_CLEARANCE,
  mirrorSoftBlocks: true,
  maxPlayers: 4,
  endgameTraps: [
    trapRows([
      [2, 4, '~'],
      [5, 0, 'o'],
      [4, 2, '~'],
      [3, 4, 'o'],
    ]),
    trapRows([
      [1, 4, 'o'],
      [5, 4, '~'],
      [2, 0, '~'],
    ]),
  ],
  stageHazards: [
    {
      kind: 'strike',
      style: 'power',
      zones: ZONES,
      activeSec: 1.2,
      firstAtSec: 10,
      everySec: [7, 11],
      warnSec: 1.8,
    },
  ],
  info: {
    tagline: 'Yaba nightlife: neon, suya smoke, headlights and street-food crowds.',
    lighting: 'Night - neon and street lights',
    hazards: [
      'Power surges: a marked floor zone sparks for 1.8 s, then is live for 1.2 s. Do not stand in it.',
    ],
  },
};
