import type { RaidDef } from '../raid/def';
import { enemySeats, parseRaidLayout } from '../raid/layout';
import type { ArenaDef } from './types';

/**
 * Builds the `ArenaDef` of a classic raid from its `RaidDef` (docs/CLASSIC_RAIDS.md). The arena layout is the normalised
 * one ('#' walls and closed doors, 'x' every destructible, '.' floor), so `createGame` builds the tile map with no raid
 * special case; spawn 0 is the entrance, spawns 1... the enemy spots in seat order (the seats start dormant). A raid
 * has no Wahala Crush, no random crates and no stage hazards or endgame traps of its own (the raid brings conveyor
 * shipments instead, `src/sim/raid/belts.ts`).
 */
export function raidArena(def: RaidDef): ArenaDef {
  const parsed = parseRaidLayout(def);
  const seats = enemySeats(def);
  return {
    id: def.arenaId,
    name: def.name,
    kind: 'raid',
    layout: parsed.arenaLayout,
    spawns: [parsed.entrance, ...seats.map((s) => s.at)],
    spawnClearance: [],
    mirrorSoftBlocks: false,
    maxPlayers: 1 + seats.length,
    endgameTraps: [],
    stageHazards: [],
    forcedMode: 'classic',
    info: {
      tagline: def.blurb,
      lighting: 'Interior - work lights',
      hazards: def.conveyors.some((c) => c.shipments)
        ? ['Conveyor shipments slide down the belts after a warning.']
        : [],
    },
  };
}
