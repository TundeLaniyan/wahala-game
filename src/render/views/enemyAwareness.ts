/**
 * Awareness marks over an enemy's head (docs/CAMPAIGN_SECTOR_AI.md "Awareness markers and armour cue", decision SV6).
 * Pure: it decides which mark a territorial state change starts and how the mark looks at a given age; it reads the
 * sim (the `enemyCue` events and `state.territory.minds`) and decides nothing. `EnemyTelegraphViews` draws it.
 *
 *   alert        it spotted the human (or an ally called it): a warning triangle with "!" pops in, holds through
 *                the alert beat (at least a readable moment), then fades;
 *   investigate  it heard something, or lost sight of the human and goes to his last seen spot: a round "?" plate
 *                that sways gently for a moment, then fades;
 *   lost         it gave up the chase / its search and goes back: a grey three-dot plate that sinks and fades.
 *
 * Every mark is BRIEF (never a permanent state badge) and is timed in sim ticks, so a paused match holds it still.
 */
import type { EnemyCueKind, GameState, MindState } from '../../sim';

export type AwarenessKind = 'alert' | 'investigate' | 'lost';

/** Body colours (the plate's outline and its mark are always dark; the SHAPE carries the meaning). */
export const AWARENESS_COLORS: Record<AwarenessKind, number> = {
  alert: 0xff8c1a,
  investigate: 0xa8dcff,
  lost: 0xa9b1bb,
};

/** Timings in ticks (60/s). The alert holds for the sim's alert beat, clamped to a readable span. */
export const AWARENESS_TIMING = {
  pop: 9,
  alertHoldMin: 36,
  alertHoldMax: 72,
  investigateHold: 66,
  lostTotal: 54,
  fade: 18,
} as const;

/** The mark an `enemyCue` starts (wind-up / recovery / stagger are the telegraphs' own: none). */
export function awarenessOfCue(cue: EnemyCueKind): AwarenessKind | null {
  return cue === 'alert' || cue === 'investigate' || cue === 'lost' ? cue : null;
}

/**
 * The mark a territorial state change starts: entering `alert` = "!", entering `investigate` (a noise, or sight lost
 * during a chase: no event for that one) = "?", entering `return` (gave up the chase, or a search found nothing) = the
 * fade-out. Patrol / watch / pursue start nothing (pursuit already reads from the chase itself).
 */
export function awarenessOfMind(next: MindState, prev: MindState | undefined): AwarenessKind | null {
  if (prev === undefined || prev === next) return null;
  if (next === 'alert') return 'alert';
  if (next === 'investigate') return 'investigate';
  if (next === 'return') return 'lost';
  return null;
}

/** The mind of seat `id`, if the match runs the territorial layer. */
export function mindOf(state: GameState, id: number): MindState | undefined {
  return state.territory?.minds[id]?.state;
}

/** How a mark looks at one moment (a reusable record: no allocation per frame). */
export interface AwarenessLook {
  visible: boolean;
  /** Scale factor (1 = the mark's full size). */
  scale: number;
  /** Own opacity 0..1. */
  alpha: number;
  /** World-units offset up (+) or down (-) from the mark's anchor. */
  lift: number;
  /** Screen-plane roll (radians). */
  roll: number;
}

export function emptyLook(): AwarenessLook {
  return { visible: false, scale: 0, alpha: 0, lift: 0, roll: 0 };
}

/** Total lifetime (ticks) of a mark; `beat` is the alert beat of the cue (`untilTick - fromTick`). */
export function awarenessSpan(kind: AwarenessKind, beat: number): number {
  const T = AWARENESS_TIMING;
  if (kind === 'lost') return T.lostTotal;
  const hold =
    kind === 'alert' ? Math.min(T.alertHoldMax, Math.max(T.alertHoldMin, beat)) : T.investigateHold;
  return T.pop + hold + T.fade;
}

const easeOutBack = (t: number): number => {
  const c = 1.9;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};

/**
 * Fills `out` with the look of a `kind` mark `age` ticks (render time, may be fractional) after it started. `reduced`
 * (prefers-reduced-motion): no overshoot, sway or sinking; the fade stays.
 */
export function awarenessLook(
  kind: AwarenessKind,
  age: number,
  beat: number,
  reduced: boolean,
  out: AwarenessLook,
): AwarenessLook {
  const T = AWARENESS_TIMING;
  const span = awarenessSpan(kind, beat);
  out.visible = age >= 0 && age < span;
  out.roll = 0;
  out.lift = 0;
  if (!out.visible) {
    out.scale = 0;
    out.alpha = 0;
    return out;
  }
  if (kind === 'lost') {
    // a quick appearance, then it sinks and fades the whole time: "never mind"
    const k = Math.min(1, age / 6);
    const f = age / span;
    out.scale = reduced ? 0.9 : 0.75 + 0.15 * k;
    out.alpha = k * (1 - f * f);
    out.lift = reduced ? 0 : -0.22 * f;
    return out;
  }
  const pop = Math.min(1, age / T.pop);
  out.scale = reduced ? 1 : pop < 1 ? Math.max(0.05, easeOutBack(pop)) : 1;
  out.alpha = reduced ? 1 : Math.min(1, pop * 1.6);
  const fadeAt = span - T.fade;
  if (age > fadeAt) out.alpha *= 1 - (age - fadeAt) / T.fade;
  if (kind === 'alert') out.lift = reduced ? 0 : 0.08 * Math.sin(Math.min(1, age / T.pop) * Math.PI);
  else if (!reduced) out.roll = 0.18 * Math.sin((age / 60) * Math.PI * 2 * 1.4);
  return out;
}
