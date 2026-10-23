import type { ArenaDef } from './types';
import { CORNER_CLEARANCE, CORNER_SPAWNS, makeLayout, trapRows } from './build';

/**
 * Surulere Power Yard: the POWER ARENA. A generator and transformer compound on the classic grid.
 *
 * Special match rule (configuration, this arena only): every blast covers its ENTIRE row and column to
 * the arena edge, passing through pillars and crates (crates in the line break). Pillars still block
 * walking. Everyone starts with two generator sockets (max 4) and fire-range pickups are replaced by
 * sockets, speed and shields because range means nothing here. No ordinary stage hazards: the blasts
 * are the hazard.
 */
export const SURULERE_POWER_YARD: ArenaDef = {
  id: 'surulerePowerYard',
  name: 'Surulere Power Yard',
  kind: 'standard',
  layout: makeLayout(),
  spawns: CORNER_SPAWNS,
  spawnClearance: CORNER_CLEARANCE,
  mirrorSoftBlocks: true,
  maxPlayers: 4,
  config: {
    generator: { blastMode: 'fullLine', baseCapacity: 2, maxCapacity: 4 },
    pickups: {
      weights: {
        petrol: 0,
        diesel: 0,
        hotfuel: 0,
        socket: 24,
        skates: 12,
        boots: 4,
        gloves: 3,
        grip: 3,
        remote: 2,
        killswitch: 6,
        okada: 7,
        voucher: 6,
        curse: 4,
        sneakers: 4,
        bombpass: 6,
      },
    },
  },
  endgameTraps: [
    trapRows([
      [2, 2, 'o'],
      [6, 0, '~'],
      [4, 4, '~'],
      [7, 2, 'o'],
    ]),
    trapRows([
      [0, 4, 'o'],
      [6, 4, '~'],
      [3, 0, 'o'],
    ]),
  ],
  stageHazards: [],
  info: {
    tagline: 'High-voltage generator compound: transformers, cable drums and diesel.',
    lighting: 'Hard, clear midday sun',
    hazards: [],
    ruleWarning:
      'POWER YARD RULE: every blast fills its WHOLE row and column, straight through pillars and crates. Everyone starts with 2 generators.',
  },
};
