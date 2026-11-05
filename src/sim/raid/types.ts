/**
 * CONTRACT (classic raid view and events). Written by the integrator; the `raid-sim` worker owns `src/sim/raid/**`
 * and may extend this file (optional fields, new union members), never rename or remove what the renderer / HUD /
 * campaign import. A raid is a compact fixed-screen mission: cardinal grid movement, cross bombs, cargo, crates,
 * barrels, conveyor belts and moving shipments, locked areas and opened routes, optional side rooms, enemy waves,
 * extraction. `raidView(state)` (src/sim/raid/view.ts) builds this from `state.raid`; null outside a raid.
 */
import type { Dir, TilePos } from '../types';
import type { EnemyKind, RaidId, RaidOutcome } from '../campaign/types';
import type { BonusKind, DoorCondition, WaveTrigger } from './def';

export type CargoKind = 'cargo' | 'crate' | 'barrel';
export type { BonusKind } from './def';
export type CargoState = 'intact' | 'damaged' | 'destroyed';

export interface RaidCargoView {
  id: string;
  kind: CargoKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** A marked objective target (must be destroyed for the raid objective). Unmarked ones are scenery or bonus. */
  marked: boolean;
  state: CargoState;
}

export interface RaidConveyorView {
  id: string;
  /** Belt tiles in travel order, each with the direction things on it move. */
  tiles: { x: number; y: number; dir: Dir }[];
  /** Ticks per tile of belt movement. */
  stepTicks: number;
}

/** A moving shipment on a belt: a hazard that damages (campaign damage, source 'hazard') what it hits. */
export interface RaidShipmentView {
  id: string;
  x: number;
  y: number;
  dir: Dir;
  /** A telegraph (ticks until it starts moving / reaches the next hazard tile) so it is never unavoidable. */
  warnTicks: number;
}

export interface RaidDoorView {
  id: string;
  x: number;
  y: number;
  /** Locked until its condition is met (a cargo target destroyed, a switch hit, a wave cleared ...). */
  locked: boolean;
  /** Leads to an optional side room. */
  optionalRoom: boolean;
  /** Short HUD hint of what opens it ("Destroy the marked cargo"). */
  opensWhen: string;
}

export interface RaidRoomView {
  id: string;
  name: string;
  opened: boolean;
  completed: boolean;
  /** Always true for side rooms: they are never required. */
  optional: boolean;
}

/** An enemy seat of the raid (the view lists dormant ones too, so the renderer can ignore them). */
export interface RaidEnemyView {
  playerId: number;
  kind: EnemyKind;
  /** Index of the wave it belongs to, or -1 for a room group. */
  wave: number;
  /** False until its wave (or room) has started and it has appeared. */
  active: boolean;
  /** The spot it appears on. */
  spot: TilePos;
}

export interface RaidView {
  raidId: RaidId;
  /** The short objective card line ("Destroy the 3 marked crates"). */
  objective: string;
  /** Plain progress ("2 of 3 destroyed"). */
  progress: { done: number; goal: number; label: string };
  cargo: RaidCargoView[];
  conveyors: RaidConveyorView[];
  shipments: RaidShipmentView[];
  doors: RaidDoorView[];
  rooms: RaidRoomView[];
  wave: { index: number; total: number; enemiesAlive: number; nextInTicks: number | null };
  extraction: { open: boolean; x: number; y: number };
  /** 'cargo' = destroy the objective; 'extract' = reach the exit; 'done'. */
  stage: 'cargo' | 'extract' | 'done' | 'failed';
  lives: { used: number; max: number };
  timeRemainingSec: number;
  /** Enemy projectile warnings (tiles that will be hit and in how many ticks), like mission warnings. */
  warnings: { kind: 'projectile' | 'shipment' | 'wave'; tiles: number[]; remainingTicks: number }[];
  outcome: RaidOutcome | null;
  /** Added by raid-sim: every enemy seat (dormant ones have `active: false`) and the bonus tiles left in side rooms. */
  seats?: RaidEnemyView[];
  bonuses?: { roomId: string; kind: BonusKind; x: number; y: number; taken: boolean }[];
  switches?: { x: number; y: number; pressed: boolean }[];
  /** Hint line of the objective stage ("Reach the exit"). */
  hint?: string;
}

// ---------------------------------------------------------------- runtime state (plain JSON in `GameState.raid`)

/** `GameOptions.raid`: which raid to play and what the player brings in. */
export interface RaidSpec {
  raidId: RaidId;
  /** Lives (default from the raid definition). */
  lives?: number;
  /** Health the player starts with (a field mission hands its own value in; default: full). */
  hp?: number;
  /** Maximum health of the player (default from the raid definition). */
  maxHp?: number;
  /** Replaces the raid's clock (practice / tests). */
  timeLimitSec?: number;
}

export interface RaidCargoState {
  id: string;
  kind: CargoKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  marked: boolean;
  /** Destroyed (the tile is open floor again). */
  destroyed: boolean;
}

export interface RaidDoorState {
  id: string;
  x: number;
  y: number;
  open: boolean;
  openedTick: number | null;
  opensWhen: DoorCondition;
  hint: string;
  /** The side room it leads to, if any. */
  room: string | null;
}

export interface RaidRoomState {
  id: string;
  name: string;
  doorId: string;
  opened: boolean;
  /** Its bonus was taken (and its group, if any, is down). */
  completed: boolean;
  bonus: { kind: BonusKind; x: number; y: number; taken: boolean };
  seatIds: number[];
  activated: boolean;
}

export interface RaidShipmentState {
  id: string;
  beltId: string;
  /** Index into the belt's tiles. */
  index: number;
  x: number;
  y: number;
  dir: Dir;
  phase: 'warn' | 'moving' | 'stopped';
  /** Tick it starts moving. */
  goTick: number;
  /** Tick it advances next (moving) / disappears (stopped). */
  nextTick: number;
  /** Players it has already hit. */
  hit: number[];
}

export interface RaidBeltState {
  id: string;
  tiles: { x: number; y: number; dir: Dir }[];
  stepTicks: number;
  /** Next launch (play tick), or null when the belt launches nothing. */
  nextLaunch: number | null;
  everyTicks: number;
  warnTicks: number;
  damage: number;
  dazeTicks: number;
  maxLive: number;
}

export interface RaidWaveState {
  name: string;
  trigger: WaveTrigger;
  /** Seat ids of its enemies. */
  seatIds: number[];
  /** Tick the trigger fired (the spawn warning started), or null. */
  startedTick: number | null;
  /** The enemies have appeared. */
  activated: boolean;
  clearedTick: number | null;
  /** A side room's group: it starts when the room's door opens and does not count in the wave numbers. */
  room?: string;
}

export interface RaidSeat {
  playerId: number;
  kind: EnemyKind;
  wave: number;
  room: string | null;
  spot: TilePos;
  active: boolean;
}

export interface RaidBarrelBlast {
  x: number;
  y: number;
  atTick: number;
  ownerId: number;
}

export interface RaidState {
  raidId: RaidId;
  announced: boolean;
  stage: 'cargo' | 'extract' | 'done' | 'failed';
  cargo: RaidCargoState[];
  doors: RaidDoorState[];
  rooms: RaidRoomState[];
  belts: RaidBeltState[];
  shipments: RaidShipmentState[];
  waves: RaidWaveState[];
  seats: RaidSeat[];
  switches: { x: number; y: number; pressed: boolean }[];
  barrelBlasts: RaidBarrelBlast[];
  extraction: { x: number; y: number; open: boolean };
  entrance: TilePos;
  livesUsed: number;
  livesMax: number;
  maxHp: number;
  /** `eliminatedTick` of the last human death already counted. */
  deathSeen: number | null;
  respawnAt: number | null;
  /** Star tokens taken in side rooms. */
  bonusStars: number;
  nextShipmentId: number;
  timeLimitTicks: number;
  parTicks: number;
  objective: string;
  outcome: RaidOutcome | null;
}
