/**
 * Endgame music escalation, synchronised to the game clock (pure, unit-tested).
 *
 * From ESCALATION_SECONDS remaining the music gets progressively more urgent:
 *   - tempo: playback rate eases from 1.0 up to MAX_TEMPO at 0:00 with the pitch preserved
 *     (HTMLMediaElement.preservesPitch); where pitch cannot be preserved the rate is never changed;
 *   - brightness / drive: a high shelf and a low "punch" peak open up, with a trim that takes the
 *     added energy back out so the music does not get louder overall.
 * The curve is a smoothstep, so there is no audible step at 30 s and no jump at the buzzer.
 * Nothing here touches match timing: it only reads the remaining time the simulation reports.
 */
import type { GameState } from '../sim';

export const TICKS_PER_SECOND = 60;
/** Escalation starts with this many seconds left. */
export const ESCALATION_SECONDS = 30;
/** Playback rate reached at 0:00 (pitch preserved). */
export const MAX_TEMPO = 1.09;
/** High-shelf boost at full urgency (dB) and its corner (Hz). */
export const SHELF_DB = 3.5;
export const SHELF_HZ = 3200;
/** Low peaking "punch" boost at full urgency (dB), centre (Hz) and Q. */
export const PUNCH_DB = 2;
export const PUNCH_HZ = 110;
export const PUNCH_Q = 0.8;
/**
 * Loudness compensation at full urgency (dB, applied as a cut). A shelf/peak boost of N dB raises a
 * typical full-range mix by well under N dB; this trim is an estimate (not measured by ear) that keeps
 * the escalated music at or below its normal level.
 */
export const COMPENSATION_DB = 0.35 * SHELF_DB + 0.3 * PUNCH_DB;

export type ClockPhase = 'countdown' | 'playing' | 'ended';
export interface MatchClock {
  phase: ClockPhase;
  /** Seconds of play left (the HUD clock). */
  remaining: number;
}

/** The game clock as the music sees it: (durationTicks - playTicks) / 60. */
export function matchClock(state: Readonly<GameState>): MatchClock {
  const remaining = Math.max(0, state.config.match.durationTicks - state.match.playTicks) / TICKS_PER_SECOND;
  return { phase: state.match.phase, remaining };
}

/** 0 (calm) .. 1 (0:00) for a given number of seconds remaining. */
export function urgencyAt(remainingSeconds: number): number {
  if (!Number.isFinite(remainingSeconds)) return 0;
  const u = (ESCALATION_SECONDS - remainingSeconds) / ESCALATION_SECONDS;
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return u * u * (3 - 2 * u);
}

/** Urgency for a clock: only the playing phase escalates (countdown and ended are calm). */
export function urgencyOf(clock: MatchClock): number {
  return clock.phase === 'playing' ? urgencyAt(clock.remaining) : 0;
}

/** Playback rate for an urgency (1 when pitch cannot be preserved: no chipmunk music). */
export function tempoFor(urgency: number, pitchPreserved: boolean): number {
  if (!pitchPreserved) return 1;
  return 1 + (MAX_TEMPO - 1) * Math.min(1, Math.max(0, urgency));
}

export interface ToneSettings {
  shelfDb: number;
  punchDb: number;
  /** Linear gain of the compensation trim (<= 1). */
  trim: number;
}

export function toneFor(urgency: number): ToneSettings {
  const u = Math.min(1, Math.max(0, urgency));
  return {
    shelfDb: SHELF_DB * u,
    punchDb: PUNCH_DB * u,
    trim: Math.pow(10, (-COMPENSATION_DB * u) / 20),
  };
}
