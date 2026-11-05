/**
 * CONTRACT (classic raid view and events). Written by the integrator; the `raid-sim` worker owns `src/sim/raid/**`
 * and may extend this file (optional fields, new union members), never rename or remove what the renderer / HUD /
 * campaign import. A raid is a compact fixed-screen mission: cardinal grid movement, cross bombs, cargo, crates,
 * barrels, conveyor belts and moving shipments, locked areas and opened routes, optional side rooms, enemy waves,
 * extraction. `raidView(state)` (src/sim/raid/view.ts) builds this from `state.raid`; null outside a raid.
 */
import type { Dir } from '../types';
import type { RaidId, RaidOutcome } from '../campaign/types';

export type CargoKind = 'cargo' | 'crate' | 'barrel';
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
}
