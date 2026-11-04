/**
 * The look of the campaign mission markers as pure functions (no three.js): which colour and strength each node
 * state, warning kind and boss state gets. `MissionViews` applies them; `tests/render/mission-markers.test.ts` pins them.
 * The legend (also in docs/MISSION_PRESENTATION.md): gold = do this now, green = done, grey = not yet (dim),
 * red hatch = lethal strike / convoy, amber hatch = rail lane (a railcar), blue = reinforcements, blue bubble = boss
 * shielded, flashing red + gold ring = boss exposed. No text anywhere in the world.
 */
import type { MissionNodeState, MissionWarningView, NpcRole } from '../../sim';

export const MARKER_COLORS = {
  target: 0xffd23a,
  done: 0x4dff88,
  locked: 0x8d96a3,
  progress: 0x4dff88,
  strike: 0xff2a1a,
  window: 0xffb300,
  reinforce: 0x4aa8ff,
  bossShield: 0x4aa8ff,
  bossExposed: 0xff3b1f,
  bossExposedAlt: 0xffd23a,
} as const;

/** One flat colour per crew role (a small pip ring under each crew fighter). */
export const ROLE_COLORS: Readonly<Record<NpcRole, number>> = {
  meleeGuard: 0xff8a1a,
  rangedAttacker: 0xff3b1f,
  blocker: 0xb8c0cc,
  runner: 0x3ddcff,
  escort: 0xc08cff,
  objectiveDefender: 0xffd23a,
  supportUnit: 0x4dffb8,
  bossAssistant: 0xff5fb0,
};

export interface NodeLook {
  /** Colour of the pad's rim and of the icon's glow. */
  color: number;
  /** Pad strength 0..1 (the pad is the dark disc with a coloured rim). */
  pad: number;
  /** Icon glow 0..1 and a uniform scale (live nodes breathe a little). */
  glow: number;
  scale: number;
  /** A vertical beam of light (only for nodes that want the player). */
  beam: number;
  /** Progress ring 0..1 (0 = not drawn). */
  arc: number;
  /** A green tick decal (completed). */
  tick: boolean;
}

/** Gold pulses while a node wants the player; progress fills a green ring; done is green and calm; locked is dim grey. */
export function nodeLook(state: MissionNodeState, fraction: number, time: number): NodeLook {
  const pulse = 0.5 + 0.5 * Math.sin(time * 4.2);
  switch (state) {
    case 'locked':
      return { color: MARKER_COLORS.locked, pad: 0.4, glow: 0, scale: 0.9, beam: 0, arc: 0, tick: false };
    case 'done':
      return { color: MARKER_COLORS.done, pad: 0.7, glow: 0.35, scale: 1, beam: 0, arc: 1, tick: true };
    case 'progress':
      return {
        color: MARKER_COLORS.target,
        pad: 1,
        glow: 0.7 + 0.3 * pulse,
        scale: 1.04,
        beam: 0.5,
        arc: Math.min(1, Math.max(0.04, fraction)),
        tick: false,
      };
    case 'live':
    case 'idle':
    default:
      return {
        color: MARKER_COLORS.target,
        pad: 0.8 + 0.2 * pulse,
        glow: 0.45 + 0.4 * pulse,
        scale: 1 + 0.04 * pulse,
        beam: 0.28 + 0.14 * pulse,
        arc: 0,
        tick: false,
      };
  }
}

export interface WarningLook {
  color: number;
  /** Side of the hatched square as a fraction of the tile: it fills the tile as the landing nears. */
  hatchScale: number;
  /** Additive tile glow strength and the edge frame's strength (both 0..1). */
  glow: number;
  edge: number;
  /** The landing is under 2 s away: flash. */
  urgent: boolean;
}

/** `k` is how far the countdown has run (0 just called, 1 about to land). */
export function warningLook(kind: MissionWarningView['kind'], k: number, time: number): WarningLook {
  const color =
    kind === 'window'
      ? MARKER_COLORS.window
      : kind === 'reinforce'
        ? MARKER_COLORS.reinforce
        : MARKER_COLORS.strike;
  const kk = Math.min(1, Math.max(0, k));
  const urgent = kk > 0.75;
  const flash = urgent ? 0.6 + 0.4 * Math.sin(time * 22) : 0.8 + 0.2 * Math.sin(time * 8);
  return {
    color,
    hatchScale: 0.3 + 0.66 * kk,
    glow: (0.2 + 0.4 * kk) * flash,
    edge: (0.55 + 0.45 * kk) * flash,
    urgent,
  };
}

export interface BossLook {
  /** Ring under the boss: colour, strength and radius in tiles. */
  ringColor: number;
  ring: number;
  radius: number;
  /** Blue bubble around a shielded boss (0 = none). */
  bubble: number;
  /** Countdown arc of the exposed window 0..1 (0 = none). */
  arc: number;
  /** Tall beam above an exposed boss. */
  beam: number;
}

export function bossLook(
  boss: { shielded: boolean; exposed: boolean; exposedRemainingTicks: number; defeated: boolean },
  exposeTicks: number,
  time: number,
  sinceDefeat: number,
): BossLook {
  if (boss.defeated) {
    const fade = Math.max(0, 1 - sinceDefeat / 1.5);
    return {
      ringColor: MARKER_COLORS.done,
      ring: 0.8 * fade,
      radius: 1.1 + sinceDefeat * 0.8,
      bubble: 0,
      arc: 0,
      beam: 0,
    };
  }
  if (boss.exposed) {
    const frac = exposeTicks > 0 ? Math.min(1, Math.max(0, boss.exposedRemainingTicks / exposeTicks)) : 1;
    const flash = Math.sin(time * (frac < 0.3 ? 16 : 9)) > 0;
    return {
      ringColor: flash ? MARKER_COLORS.bossExposed : MARKER_COLORS.bossExposedAlt,
      ring: 1,
      radius: 1.25,
      bubble: 0,
      arc: Math.max(0.02, frac),
      beam: 0.5,
    };
  }
  return {
    ringColor: MARKER_COLORS.bossShield,
    ring: 0.85,
    radius: 1.0,
    bubble: 0.28 + 0.1 * Math.sin(time * 3),
    arc: 0,
    beam: 0,
  };
}

/** Quantised fraction (steps of 1/48) so one shared ring geometry per step serves every arc. */
export const ARC_STEPS = 48;
export function arcStep(fraction: number): number {
  return Math.min(ARC_STEPS, Math.max(0, Math.round(fraction * ARC_STEPS)));
}

/** A stable key for a warning across frames (kind + first tile + size): the sim gives warnings no id. */
export function warningKey(w: Pick<MissionWarningView, 'kind' | 'tiles' | 'x' | 'y'>): string {
  return `${w.kind}:${w.tiles[0] ?? `${w.x},${w.y}`}:${w.tiles.length}`;
}
