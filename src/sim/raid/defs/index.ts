/**
 * Every classic raid (docs/CLASSIC_RAIDS.md). Hand-drawn layouts: the Oshodi dispatch depot (the vertical slice), the
 * Mushin parts storeroom, the Ebute-Metta goods shed, the records vault. The other two ids use the compact template so
 * any district can have a raid.
 */
import type { RaidId } from '../../campaign/types';
import type { RaidDef } from '../def';
import { compactRaid } from './compact';
import { PARTS_STOREROOM } from './partsStoreroom';
import { RAIL_YARD_GOODS } from './railYardGoods';
import { RECORDS_VAULT } from './recordsVault';
import { WAREHOUSE_DISPATCH_DEPOT } from './warehouseDispatchDepot';

export const JUNCTION_TOOL_SHED: RaidDef = compactRaid({
  id: 'junctionToolShed',
  arenaId: 'raidJunctionToolShed',
  name: 'Junction Tool Shed',
  district: 'Fadeyi / Somolu',
  blurb:
    'The marshals keep their toll tickets and tools in a tin shed by the junction; a few drums stand too close.',
  objective: 'Destroy the 3 marked toll-ticket crates',
  factionId: 'koboMarshals',
  barrels: [
    [9, 3],
    [2, 5],
  ],
  switchDoor: true,
  belt: false,
  firstWave: ['guard', 'agbero'],
  secondWave: ['thrower', 'guard'],
  timeLimitSec: 180,
  parSec: 110,
});

export const STANDBY_PLANT: RaidDef = compactRaid({
  id: 'standbyPlant',
  arenaId: 'raidStandbyPlant',
  name: 'Standby Plant',
  district: 'Lekki',
  blurb:
    'An estate standby plant: a small feed belt, fuel crates and contractors who were told to let nobody in.',
  objective: 'Destroy the 3 marked fuel crates',
  factionId: 'gatehouseGuard',
  barrels: [[2, 3]],
  switchDoor: false,
  belt: true,
  firstWave: ['guard', 'guard'],
  secondWave: ['thrower', 'heavy'],
  timeLimitSec: 190,
  parSec: 120,
});

/** The raid definitions by id. */
export const RAID_DEFS: Readonly<Record<RaidId, RaidDef>> = {
  warehouseDispatchDepot: WAREHOUSE_DISPATCH_DEPOT,
  partsStoreroom: PARTS_STOREROOM,
  junctionToolShed: JUNCTION_TOOL_SHED,
  railYardGoods: RAIL_YARD_GOODS,
  recordsVault: RECORDS_VAULT,
  standbyPlant: STANDBY_PLANT,
};

export const RAID_IDS: readonly RaidId[] = Object.keys(RAID_DEFS) as RaidId[];
