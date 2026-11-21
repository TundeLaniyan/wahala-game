/**
 * Classic raid presentation (docs/CLASSIC_LIGHTING.md, decision NL1): every raid board the sim registers resolves to
 * its designed raid art (look, set, floor) by its SIM arena id, never to the Danfo Bus Park fallback. The mapping was
 * once keyed by raid id (`warehouseDispatchDepot`) while `GameState.arenaId` is `raidWarehouseDispatchDepot`, so every
 * raid wore the bus park.
 */
import { describe, expect, it } from 'vitest';
import { RAID_ARENA_IDS, RAID_DEFS, RAID_IDS, buildRaidGame, createGame } from '../../src/sim';
import { arenaLook } from '../../src/render/arenaLook';
import { arenaSet } from '../../src/render/arenas';
import { BUS_PARK_SET } from '../../src/render/arenas/busPark';
import { NEW_ARENA_ART, NEW_ARENA_FLOORS } from '../../src/render/arenas/newArenas';
import {
  RAID_VARIANTS,
  RAID_VARIANT_BY_RAID,
  raidArtTable,
  raidVariantOfArena,
} from '../../src/render/arenas/raidArt';

const DANFO_LOOK = arenaLook('danfoBusPark');

describe('raid arena -> raid art (NL1)', () => {
  it('the art table covers exactly the sim raid arena ids', () => {
    expect(Object.keys(raidArtTable()).sort()).toEqual([...RAID_ARENA_IDS].sort());
    // every raid has a designed variant (none is left to the default)
    for (const id of RAID_IDS) expect(RAID_VARIANT_BY_RAID[id], id).toBeDefined();
  });

  it.each(RAID_IDS.map((id) => [id] as const))(
    '%s: the arena id of a real raid game resolves to its variant look, set and floor',
    (raidId) => {
      const state = createGame(buildRaidGame({ raidId, humanCharacter: 'streetBaller', seed: 3 }));
      const arenaId = state.arenaId;
      expect(arenaId).toBe(RAID_DEFS[raidId].arenaId);
      const variant = RAID_VARIANT_BY_RAID[raidId];
      expect(raidVariantOfArena(arenaId)).toBe(variant);
      const art = RAID_VARIANTS[variant];
      expect(arenaLook(arenaId)).toBe(art.look);
      expect(arenaLook(arenaId)).not.toBe(DANFO_LOOK);
      expect(arenaSet(arenaId)).toBe(art.set);
      expect(arenaSet(arenaId)).not.toBe(BUS_PARK_SET);
      expect(NEW_ARENA_FLOORS()[arenaId]).toBe(art.floor);
      expect(NEW_ARENA_ART()[arenaId]).toBe(art);
    },
  );

  it('a raid id is not an arena id and an unknown id is not a raid', () => {
    expect(raidVariantOfArena('warehouseDispatchDepot')).toBeNull();
    expect(raidVariantOfArena('danfoBusPark')).toBeNull();
  });
});
