/**
 * Camera shake, bounded (decision WA6). The old shake added a fixed amount per event and fed the result
 * into a 53 Hz positional jitter: Wahala Crush (+0.2 per landed tile) and the City Rumble closing (many
 * tiles a second) kept it saturated, and phones got a constant violent buzz. Now:
 *
 *  - every event adds "trauma" through `add`, but one frame may add at most `FRAME_BUDGET` and the total
 *    is capped at `CAP`, so no burst of events (a chain, a crush wave, a trap wave) can compound it;
 *  - trauma decays fast (`DECAY_PER_S`): a jolt lasts a fraction of a second;
 *  - the camera offset is trauma^2 x a SMALL amplitude, moving at a few Hz (a nudge, not a buzz);
 *  - mode 'off' (touch devices by default, prefers-reduced-motion, or the setting) gives no offset at all.
 *
 * Purely presentational, and only ever a translation of the camera: picking and board-corner maths use the
 * un-shaken camera (cameraRig.ts), so touch targets never move.
 */

export type ShakeMode = 'off' | 'subtle';
/** The player setting (app/settings.ts `ShakeSetting`). */
export type ShakeSetting = 'auto' | 'off' | 'subtle';

export const SHAKE_CAP = 0.6;
export const SHAKE_FRAME_BUDGET = 0.3;
export const SHAKE_DECAY_PER_S = 3;
/** World units of camera offset at the cap (a tile is 1 unit): about 1/20 of a tile. */
export const SHAKE_MAX_OFFSET = 0.05;

export interface ShakeOffset {
  x: number;
  y: number;
  z: number;
}

export const NO_SHAKE: Readonly<ShakeOffset> = Object.freeze({ x: 0, y: 0, z: 0 });

/** 'auto' = off on touch screens, subtle with a mouse; reduced motion always wins. */
export function resolveShakeMode(
  setting: ShakeSetting,
  env: { coarsePointer: boolean; reducedMotion: boolean },
): ShakeMode {
  if (env.reducedMotion || setting === 'off') return 'off';
  if (setting === 'subtle') return 'subtle';
  return env.coarsePointer ? 'off' : 'subtle';
}

export class ShakeBudget {
  mode: ShakeMode = 'subtle';
  private value = 0;
  private addedThisFrame = 0;

  /** Current trauma, 0..SHAKE_CAP. */
  get trauma(): number {
    return this.value;
  }

  /** An event asks for a jolt of `amount` (old scale: 0.1 small .. 0.35 big). */
  add(amount: number): void {
    if (!(amount > 0)) return;
    const room = Math.max(0, SHAKE_FRAME_BUDGET - this.addedThisFrame);
    const a = Math.min(amount, room);
    this.addedThisFrame += a;
    this.value = Math.min(SHAKE_CAP, this.value + a);
  }

  /** Once per rendered frame, after that frame's events. */
  update(dt: number): void {
    this.value = Math.max(0, this.value - Math.max(0, dt) * SHAKE_DECAY_PER_S);
    this.addedThisFrame = 0;
  }

  reset(): void {
    this.value = 0;
    this.addedThisFrame = 0;
  }

  /** Camera offset for this frame (world units). Never larger than SHAKE_MAX_OFFSET on any axis. */
  offset(time: number): ShakeOffset {
    if (this.mode === 'off' || this.value <= 0) return { x: 0, y: 0, z: 0 };
    const k = (this.value / SHAKE_CAP) ** 2 * SHAKE_MAX_OFFSET;
    // a few incommensurate low frequencies: a short irregular nudge rather than a periodic buzz
    return {
      x: k * (0.6 * Math.sin(time * 41) + 0.4 * Math.sin(time * 23 + 1.3)),
      y: k * 0.5 * Math.sin(time * 37 + 0.7),
      z: k * (0.6 * Math.sin(time * 29 + 2.1) + 0.4 * Math.sin(time * 17)),
    };
  }
}
