/**
 * Raid DATA types (docs/CLASSIC_RAIDS.md). A raid is authored as one `RaidDef`: an ASCII layout with a fixed glyph
 * legend plus the rules that hang on its glyphs (waves, doors, rooms, belts). Pure data: no runtime state here.
 *
 * Layout legend (one character per tile; the board is at most 17 x 13):
 *
 *   #   indestructible wall               .   open floor
 *   x   plain crate (the ordinary soft block: one blast breaks it)
 *   M   MARKED cargo (the objective), hp `legend.markedHp`      K   unmarked cargo, hp `legend.cargoHp`
 *   S   sturdy crate, hp `legend.crateHp`                         B   barrel, hp `legend.barrelHp`, explodes when destroyed
 *   @   the entrance (spawn and respawn)                          E   the extraction tile (opens when the objective is done)
 *   ^ > v <   conveyor belt tile carrying things in that direction (a run of belt tiles = one conveyor)
 *   *   a floor switch (stepped on = pressed, permanently)       1-9  a door (closed doors are walls; see `doors`)
 *   a-u w y z   enemy spots: where an enemy seat stands (`waves` / `rooms` name the spot letters)
 *   A   room bonus: an Armour plate     H   room bonus: one health segment     T   room bonus: a star token
 */
import type { EnemyKind, RaidId } from '../campaign/types';

/** Board limits of a fixed-screen raid. */
export const RAID_MAX_WIDTH = 17;
export const RAID_MAX_HEIGHT = 13;

export type BonusKind = 'heal' | 'armour' | 'star';

export interface EnemyPlacement {
  kind: EnemyKind;
  /** The spot letter of the layout. */
  spot: string;
  /** Display name (labels only). */
  name?: string;
}

/** When a wave starts (its enemies then appear after the spawn warning). */
export type WaveTrigger =
  | { kind: 'start' }
  /** `count` marked cargo destroyed. */
  | { kind: 'cargoDestroyed'; count: number }
  /** Another wave (by index) was cleared. */
  | { kind: 'waveCleared'; wave: number }
  | { kind: 'doorOpened'; door: string }
  /** `after` ticks of play. */
  | { kind: 'ticks'; after: number };

export interface WaveDef {
  /** Short label for the HUD ("Guards", "Throwers and a lieutenant"). */
  name: string;
  trigger: WaveTrigger;
  enemies: EnemyPlacement[];
}

/** What opens a closed door. Route changes are permanent for the raid. */
export type DoorCondition =
  /** `count` marked cargo destroyed (omit = all of them). */
  | { kind: 'cargoDestroyed'; count?: number }
  /** One specific cargo / crate / barrel destroyed (ids: `cargo-N`, `goods-N`, `crate-N`, `barrel-N`, reading order). */
  | { kind: 'destroyed'; id: string }
  | { kind: 'waveCleared'; wave: number }
  /** The nth switch (reading order) was stepped on. */
  | { kind: 'switch'; index: number }
  | { kind: 'lieutenantDown' }
  | { kind: 'doorOpened'; door: string };

export interface DoorDef {
  /** The digit glyph. */
  glyph: string;
  id: string;
  opensWhen: DoorCondition;
  /** Short HUD hint ("Clear the guards"). */
  hint: string;
}

export interface RoomDef {
  id: string;
  name: string;
  /** The door (by id) that leads in. */
  door: string;
  /** Inclusive rectangle [x0, y0, x1, y1] of the room's floor. */
  rect: [number, number, number, number];
  /** Optional small enemy group that appears when the door opens (spots inside the rect). */
  enemies?: EnemyPlacement[];
}

export interface ShipmentSpec {
  /** First launch (ticks of play). */
  firstTick: number;
  /** Ticks between launches. */
  everyTicks: number;
  /** The telegraph: a shipment shows (and `raidShipmentWarning` fires) this long before it starts moving. */
  warnTicks: number;
  /** Health segments a hit takes. */
  damage: number;
  dazeTicks: number;
  /** Shipments alive on this belt at once. */
  maxLive: number;
}

/** One conveyor, matched to the belt runs of the layout in reading order of their first tile. */
export interface ConveyorDef {
  /** Ticks per belt tile (carries standing players, moves shipments). */
  stepTicks: number;
  shipments?: ShipmentSpec;
}

export interface RaidLegend {
  markedHp: number;
  cargoHp: number;
  crateHp: number;
  barrelHp: number;
}

export interface RaidDef {
  id: RaidId;
  /** The arena id (`raid...`) the layout registers under. */
  arenaId: string;
  name: string;
  /** Where it sits in the campaign ("Oshodi"). */
  district: string;
  blurb: string;
  /** The short objective card line. */
  objective: string;
  /** Faction label of the enemies (labels only). */
  factionId: string;
  layout: string[];
  legend: RaidLegend;
  waves: WaveDef[];
  doors: DoorDef[];
  rooms: RoomDef[];
  conveyors: ConveyorDef[];
  /** Lives (the human respawns at the entrance while lives last). */
  lives: number;
  /** Health segments of the human (a field mission hands its own value in). */
  humanMaxHp: number;
  timeLimitSec: number;
  /** Finishing within this keeps the third star. */
  parSec: number;
  /** The human's generator range and capacity in this raid. */
  bombs: { range: number; capacity: number };
}
