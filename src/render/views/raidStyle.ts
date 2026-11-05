/**
 * Pure look functions of the classic-raid world markers (docs/RAID_PRESENTATION.md, "colour legend"). Presentation
 * only: they turn a `RaidView` entry and the time into numbers and colours; nothing decides a rule. Tested without WebGL.
 */
import type { Dir, RaidCargoView, RaidDoorView, RaidShipmentView } from '../../sim';

export const RAID_COLORS = {
  /** The objective cargo: dispatch yellow, with a gold ring on the floor. */
  marked: 0xffc61a,
  /** Plain crates and barrels: scenery or bonus, never glow. */
  crate: 0xffffff,
  barrel: 0xffffff,
  /** A moving shipment on a belt (blue-grey pallet) and its red telegraph. */
  shipment: 0x6fa8d8,
  warning: 0xff4a2e,
  /** A main door: amber while locked, green once open. An optional-room door wears teal instead. */
  doorLocked: 0xe8891a,
  doorOpen: 0x3ddc84,
  roomLocked: 0x35c9c2,
  roomOpen: 0x7be8e2,
  lock: 0xffe14a,
  /** The way out. */
  extraction: 0x3dff7a,
} as const;

/** How many crack levels a crate shows: 0 none, 1 hairline, 2 broken. */
export type CrackLevel = 0 | 1 | 2;

/**
 * Damage state of a piece of cargo from its hit points. Intact = clean; hurt but standing above half = hairline cracks;
 * half or less (or one hit from gone) = broken. A `state` of 'damaged' is never shown clean even when the numbers say so.
 */
export function crackLevel(c: Pick<RaidCargoView, 'hp' | 'maxHp' | 'state'>): CrackLevel {
  if (c.state === 'destroyed') return 2;
  const frac = c.maxHp > 0 ? c.hp / c.maxHp : 1;
  if (frac >= 1 && c.state !== 'damaged') return 0;
  return frac > 0.5 ? 1 : 2;
}

export interface CargoLook {
  /** Marked objective cargo gets the ring and the bright face. */
  ring: number;
  ringColor: number;
  /** Uniform scale punch right after a hit (1 = rest). */
  scale: number;
  crack: CrackLevel;
  /** Marked cargo gently bobs its ring; plain cargo has none. */
  marked: boolean;
}

/** Seconds a hit "punches" the crate. */
export const HIT_PUNCH_SECONDS = 0.22;

/** `sinceHit` is the seconds since the last `cargoHit` for this item (Infinity when none). */
export function cargoLook(c: RaidCargoView, time: number, sinceHit: number): CargoLook {
  const marked = c.marked && c.kind === 'cargo';
  const k = Math.max(0, 1 - sinceHit / HIT_PUNCH_SECONDS);
  return {
    marked,
    ring: marked ? 0.7 + 0.3 * Math.sin(time * 3.4) : 0,
    ringColor: RAID_COLORS.marked,
    scale: 1 + 0.12 * k * k,
    crack: crackLevel(c),
  };
}

/** Texture phase (0..1) of a belt: one full tile every `stepTicks`, locked to the sim clock so a pause stops it. */
export function beltPhase(tick: number, alpha: number, stepTicks: number): number {
  if (!(stepTicks > 0)) return 0;
  const p = ((tick + alpha) / stepTicks) % 1;
  return p < 0 ? p + 1 : p;
}

/** Yaw (about Y) that points a +X-travelling plane or model along grid direction `dir`. */
export function beltYaw(dir: Dir): number {
  switch (dir) {
    case 'right':
      return 0;
    case 'left':
      return Math.PI;
    case 'up':
      return Math.PI / 2; // grid up = -z: a plane's +x rotated by +90 degrees about Y points to -z
    case 'down':
      return -Math.PI / 2;
  }
}

const STEP: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/**
 * The tiles a shipment will enter next (up to `count`, never off the board). The telegraph: drawn only while the sim
 * says the shipment is about to move (`warnTicks > 0`), so the player is never hit by something they could not see.
 */
export function shipmentTelegraph(
  s: Pick<RaidShipmentView, 'x' | 'y' | 'dir' | 'warnTicks'>,
  width: number,
  height: number,
  count = 2,
): number[] {
  if (s.warnTicks <= 0) return [];
  const [dx, dy] = STEP[s.dir];
  const out: number[] = [];
  for (let i = 1; i <= count; i++) {
    const x = s.x + dx * i;
    const y = s.y + dy * i;
    if (x < 0 || y < 0 || x >= width || y >= height) break;
    out.push(y * width + x);
  }
  return out;
}

export interface DoorLook {
  /** Frame colour (amber/green for a main door, teal for an optional room). */
  color: number;
  /** Shutter lift: 0 = closed, 1 = fully up (an open frame). */
  lift: number;
  /** Lock icon opacity (1 locked, fades out while opening). */
  lock: number;
  /** Chain drop 0..1 (0 = across the door, 1 = fallen away). */
  chain: number;
  locked: boolean;
}

/** Seconds the opening animation takes. */
export const DOOR_OPEN_SECONDS = 0.7;

/** `since` = seconds since the door opened (Infinity: it was already open when first seen). */
export function doorLook(d: Pick<RaidDoorView, 'locked' | 'optionalRoom'>, since: number): DoorLook {
  const accent = d.optionalRoom;
  if (d.locked)
    return {
      color: accent ? RAID_COLORS.roomLocked : RAID_COLORS.doorLocked,
      lift: 0,
      lock: 1,
      chain: 0,
      locked: true,
    };
  const t = Math.min(1, Math.max(0, since / DOOR_OPEN_SECONDS));
  const ease = 1 - (1 - t) * (1 - t);
  return {
    color: accent ? RAID_COLORS.roomOpen : RAID_COLORS.doorOpen,
    lift: ease,
    lock: Math.max(0, 1 - t * 2.2),
    chain: Math.min(1, t * 1.6),
    locked: false,
  };
}

export interface ExtractionLook {
  visible: boolean;
  /** Pad pulse 0..1. */
  pulse: number;
  /** Beam height scale; grows while the exit appears. */
  beam: number;
  scale: number;
}

/** Seconds the extraction marker takes to grow in when `raidExtractionOpened` fires. */
export const EXTRACTION_GROW_SECONDS = 0.6;

export function extractionLook(open: boolean, since: number, time: number): ExtractionLook {
  if (!open) return { visible: false, pulse: 0, beam: 0, scale: 0 };
  const grow = Math.min(1, Math.max(0, since / EXTRACTION_GROW_SECONDS));
  const pulse = 0.5 + 0.5 * Math.sin(time * 4.2);
  return {
    visible: true,
    pulse,
    beam: grow * (0.75 + 0.25 * pulse),
    scale: 0.2 + 0.8 * (1 - (1 - grow) * (1 - grow)),
  };
}

/** Distinct accent for the 'wave' warning (reinforcements) tiles, drawn like the mission legend's blue. */
export const WAVE_WARNING_COLOR = 0x4aa8ff;

export function warningColor(kind: 'projectile' | 'shipment' | 'wave'): number {
  return kind === 'wave' ? WAVE_WARNING_COLOR : RAID_COLORS.warning;
}
