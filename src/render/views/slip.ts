/**
 * The slip / stumble pose of a fighter who stepped on a floor trap. Presentation only: the sim decides how long
 * the slide or the daze lasts (`Player.slide`, `Player.dazedUntil`); this module only turns "still down?" into a
 * body tilt that falls in fast, stays down, then gets back up to standing.
 *  - oil: the feet shoot out and the fighter lands on their back (pitch back, a little wobble, a small lift);
 *  - pothole: a trip, pitching forward.
 */
export type SlipKind = 'oil' | 'pothole';

/** Seconds to go down, and to get back on their feet. */
export const SLIP_DOWN_S = 0.16;
export const SLIP_RECOVER_S = 0.5;
/** A slip never lasts longer than this whatever the sim says (a safety net for the visual only). */
export const SLIP_MAX_S = 2.2;

export interface SlipState {
  kind: SlipKind;
  /** Render time (seconds) the slip began. */
  start: number;
  /** Render time the fighter stopped being down (null while still down). */
  endedAt: number | null;
  /** Oil only: stay down until this render time (the sim clears `slide` as the last slid tile begins). */
  holdUntil: number;
}

export interface SlipPose {
  /** Radians about the body's own X axis (negative = backwards). */
  pitch: number;
  /** Radians of side wobble. */
  roll: number;
  /** Metres the body is lifted (feet leaving the ground, then the hop back up). */
  lift: number;
  /** The fighter is standing again: drop the state. */
  done: boolean;
}

const smooth = (k: number): number => k * k * (3 - 2 * k);

/** `fallen`: the sim still has the fighter sliding / dazed. Stamps `endedAt` the first time it is false. */
export function slipPose(s: SlipState, time: number, fallen: boolean): SlipPose {
  const down = Math.min(1, Math.max(0, (time - s.start) / SLIP_DOWN_S));
  const timedOut = time - s.start > SLIP_MAX_S;
  if ((!fallen || timedOut) && s.endedAt === null) s.endedAt = time;
  const oil = s.kind === 'oil';
  const peakPitch = oil ? -1.2 : 0.6;
  const peakLift = oil ? 0.1 : 0.02;
  let amt = 1 - (1 - down) * (1 - down);
  let hop = 0;
  if (s.endedAt !== null) {
    const k = Math.min(1, (time - s.endedAt) / SLIP_RECOVER_S);
    if (k >= 1) return { pitch: 0, roll: 0, lift: 0, done: true };
    amt *= 1 - smooth(k);
    hop = Math.sin(k * Math.PI) * (oil ? 0.16 : 0.06);
  }
  return {
    pitch: peakPitch * amt,
    roll: (oil ? 0.14 : 0.08) * amt * Math.sin(time * 20),
    lift: peakLift * amt + hop,
    done: false,
  };
}
