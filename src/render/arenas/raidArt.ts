/**
 * The reusable look of the classic-raid arenas (docs/RAID_PRESENTATION.md): three variants of one generic raid art,
 * registered by arena id in `newArenas.ts` like every other arena.
 *
 *   warehouse  - the goods-shed interior: racking, roller doors, strip lights (Dispatch Depot, standby plant)
 *   yard       - the rail / goods yard: tracks, wagons, a signal, a floodlight tower (rail yard, junction tool shed)
 *   storeroom  - the under-bridge storeroom: a flyover deck, piers, padlocked lock-ups (parts storeroom, records vault)
 *
 * The board is small and fixed (the whole-arena camera), so each variant dresses AROUND and OVER it, off the board and
 * low on the camera side, and reads the board size from the set context, so any raid layout works. Day and night are the
 * same art. Each raid picks its variant by RAID id (`RAID_VARIANT_BY_RAID`); the table is registered under the raid's
 * SIM ARENA id (`RaidDef.arenaId`, `raid...`), the id `GameState.arenaId` carries. A raid arena the sim registers without
 * a variant here gets the warehouse look (decision NL1: keyed by raid id once, every raid fell back to Danfo Bus Park).
 */
import { RAID_ARENA_IDS, RAID_DEFS } from '../../sim';
import type { RaidId } from '../../sim/campaign/types';
import type { ArenaArt } from './newArenas';
import { RAID_WAREHOUSE_FLOOR, RAID_WAREHOUSE_LOOK, RAID_WAREHOUSE_SET } from './raidWarehouse';
import { RAID_YARD_FLOOR, RAID_YARD_LOOK, RAID_YARD_SET } from './raidYard';
import {
  RAID_STOREROOM_FLOOR,
  RAID_STOREROOM_LOOK,
  RAID_STOREROOM_NIGHT_LOOK,
  RAID_STOREROOM_SET,
} from './raidStoreroom';

export type RaidArtVariant = 'warehouse' | 'yard' | 'storeroom';

/** Which look each raid wears, by raid id (the art table registers it under the raid's sim arena id). */
export const RAID_VARIANT_BY_RAID: Readonly<Record<RaidId, RaidArtVariant>> = {
  warehouseDispatchDepot: 'warehouse',
  standbyPlant: 'warehouse',
  railYardGoods: 'yard',
  junctionToolShed: 'yard',
  partsStoreroom: 'storeroom',
  recordsVault: 'storeroom',
};

export const RAID_VARIANTS: Readonly<Record<RaidArtVariant, ArenaArt>> = {
  warehouse: { look: RAID_WAREHOUSE_LOOK, set: RAID_WAREHOUSE_SET, floor: RAID_WAREHOUSE_FLOOR },
  yard: { look: RAID_YARD_LOOK, set: RAID_YARD_SET, floor: RAID_YARD_FLOOR },
  storeroom: { look: RAID_STOREROOM_LOOK, set: RAID_STOREROOM_SET, floor: RAID_STOREROOM_FLOOR },
};

/** The variant a raid ARENA id (`raidWarehouseDispatchDepot`) wears; null for an id that is not a raid board. */
export function raidVariantOfArena(arenaId: string): RaidArtVariant | null {
  for (const def of Object.values(RAID_DEFS))
    if (def.arenaId === arenaId) return RAID_VARIANT_BY_RAID[def.id] ?? 'warehouse';
  return RAID_ARENA_IDS.includes(arenaId) ? 'warehouse' : null;
}

/**
 * The look of a NIGHT raid on each variant (decision NL4): what a light falls on; the dark is the night mask. Only the
 * storeroom has one today (the Records Vault); a night raid on another variant would use its lit look under the mask.
 */
export const RAID_NIGHT_LOOKS: Partial<Readonly<Record<RaidArtVariant, ArenaArt['look']>>> = {
  storeroom: RAID_STOREROOM_NIGHT_LOOK,
};

/** Is the raid board `arenaId` a night raid (raid data `lighting`)? */
export function isNightRaidArena(arenaId: string): boolean {
  return Object.values(RAID_DEFS).some((d) => d.arenaId === arenaId && d.lighting?.mode === 'night');
}

/**
 * The art of every raid board, keyed by its sim arena id (every id in `RAID_ARENA_IDS`). A night raid keeps its
 * variant's set and floor and wears the variant's night look (it is the raid's own lighting, not the `?tod` review
 * flag, so it is not an `ArenaArt.nightLook`).
 */
export function raidArtTable(): Record<string, ArenaArt> {
  const out: Record<string, ArenaArt> = {};
  for (const id of RAID_ARENA_IDS) {
    const variant = raidVariantOfArena(id) ?? 'warehouse';
    const art = RAID_VARIANTS[variant];
    const night = isNightRaidArena(id) ? RAID_NIGHT_LOOKS[variant] : undefined;
    out[id] = night ? { ...art, look: night } : art;
  }
  return out;
}

/**
 * Art review only: `?raidart=warehouse|yard|storeroom` puts that look on the Oshodi Interchange standard board, so the
 * three variants can be seen on a real match (`scripts/quick-shot.mjs`) before raid-sim's arenas exist. Never set in play.
 */
export function raidReviewVariant(): RaidArtVariant | null {
  if (typeof location === 'undefined') return null;
  const v = new URLSearchParams(location.search).get('raidart');
  return v === 'warehouse' || v === 'yard' || v === 'storeroom' ? v : null;
}
