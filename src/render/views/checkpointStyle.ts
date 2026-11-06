/**
 * The look of a field mission's WALK-THROUGH checkpoint beacon as a pure function (no three.js), pinned by
 * tests/render/checkpoint-beacons.test.ts (docs/CHECKPOINT_CLARITY.md, decisions CK1-CK3). A checkpoint completes the
 * instant the fighter steps on it, so it never wears a filling ring: it is a tall column of light with a flag.
 *
 *   current (live)  gold, bright and breathing, a ripple running out across the floor: "walk here"
 *   later (locked)  a faint, short grey column and a small grey flag: "after that one"
 *   reached         a white-then-green burst for `BEACON_FLASH_SEC`, then a small green flag with a tick
 *
 * Doors (hold-to-interact) are a different object: the square pad with the hold ring in `MissionViews`.
 */

export const BEACON_COLORS = {
  current: 0xffd23a,
  later: 0x8d96a3,
  reached: 0x4dff88,
  flash: 0xffffff,
} as const;

/** How long a reached checkpoint flashes before it settles (seconds of render time). */
export const BEACON_FLASH_SEC = 1.2;
/** Column height in world units (tiles) at full size: tall enough to read from the follow camera. */
export const BEACON_HEIGHT = 6;

export type BeaconState = 'live' | 'locked' | 'done';

export interface BeaconLook {
  color: number;
  /** Outer column opacity 0..1 (0 = not drawn) and its radius scale. */
  column: number;
  width: number;
  /** Bright inner core 0..1 (current and the reach burst only). */
  core: number;
  /** Column height as a fraction of `BEACON_HEIGHT`. */
  height: number;
  /** Flag opacity and size. */
  flag: number;
  flagScale: number;
  /** Floor ripple: its radius scale and opacity (opacity 0 = not drawn). */
  ripple: number;
  rippleOpacity: number;
  /** Floor ring under the beacon (always on while the beacon is drawn). */
  ring: number;
  /** Green tick decal on the floor (reached). */
  tick: boolean;
  /**
   * The waypoint arrow floating above the CURRENT checkpoint (0 = none): drawn on top of roofs and buses so the target
   * reads from the follow camera even when a building stands in front of it. `arrowY` is its height in tiles (it bobs).
   */
  arrow: number;
  arrowY: number;
}

/** Height of the waypoint arrow above the floor (tiles). */
export const BEACON_ARROW_Y = 3.1;

/**
 * `sinceReached`: seconds since the renderer saw this checkpoint turn done (null = it was already done when first seen,
 * or it is not done).
 */
export function beaconLook(state: BeaconState, sinceReached: number | null, time: number): BeaconLook {
  if (state === 'live') {
    const pulse = 0.5 + 0.5 * Math.sin(time * 4.2);
    const phase = (time * 0.75) % 1;
    return {
      color: BEACON_COLORS.current,
      column: 0.65 + 0.3 * pulse,
      width: 1 + 0.08 * pulse,
      core: 0.75 + 0.25 * pulse,
      height: 1,
      flag: 1,
      flagScale: 1,
      ripple: 1 + phase * 1.6,
      rippleOpacity: 0.9 * (1 - phase),
      ring: 1,
      tick: false,
      arrow: 1,
      arrowY: BEACON_ARROW_Y + 0.35 * Math.sin(time * 3.2),
    };
  }
  if (state === 'locked') {
    return {
      color: BEACON_COLORS.later,
      column: 0.16,
      width: 0.6,
      core: 0,
      height: 0.4,
      flag: 0.6,
      flagScale: 0.7,
      ripple: 1,
      rippleOpacity: 0,
      ring: 0.45,
      tick: false,
      arrow: 0,
      arrowY: BEACON_ARROW_Y,
    };
  }
  if (sinceReached !== null && sinceReached < BEACON_FLASH_SEC) {
    const k = Math.max(0, sinceReached) / BEACON_FLASH_SEC;
    return {
      color: k < 0.2 ? BEACON_COLORS.flash : BEACON_COLORS.reached,
      column: 1 - 0.8 * k,
      width: 1.3 - 0.5 * k,
      core: 1 - k,
      height: 1.15 - 0.5 * k,
      flag: 1,
      flagScale: 1,
      ripple: 1 + k * 2.4,
      rippleOpacity: 1 - k,
      ring: 1,
      tick: true,
      arrow: 0,
      arrowY: BEACON_ARROW_Y,
    };
  }
  return {
    color: BEACON_COLORS.reached,
    column: 0,
    width: 0.6,
    core: 0,
    height: 0.3,
    flag: 0.75,
    flagScale: 0.7,
    ripple: 1,
    rippleOpacity: 0,
    ring: 0.6,
    tick: true,
    arrow: 0,
    arrowY: BEACON_ARROW_Y,
  };
}
