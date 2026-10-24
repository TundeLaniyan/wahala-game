/**
 * Floating virtual thumbstick (pure model, no DOM): the stick appears where the thumb lands inside the
 * activation zone and reads the drag relative to that point.
 *
 * It FEELS analog (the knob follows the thumb smoothly, clamped to `radius`) but it only ever reports one
 * of the four grid directions or none. The direction goes to `InputManager.setTouchDir`, so the MoveGate
 * still turns it into exactly one tile per press and repeats at the player's own step cadence while held:
 *
 *  - dead zone: nothing until the thumb is `deadZone` px from the origin; back inside `releaseZone`
 *    (smaller, so the edge does not flicker) releases the direction;
 *  - cardinal quantisation with hysteresis: the current direction is kept until another axis is
 *    clearly dominant (`switchRatio` times stronger) or the thumb crosses to the opposite side, so a
 *    thumb drifting near a diagonal never produces alternating presses;
 *  - follow: dragging further than `followRadius` drags the origin along, so reversing is always a short
 *    flick instead of a long trip back across the screen;
 *  - one finger owns the stick (other fingers are free for the action buttons).
 */
import type { Dir } from '../sim';

export interface StickConfig {
  /** Visual knob travel (px). */
  radius: number;
  /** Distance from the origin that starts a direction (px). */
  deadZone: number;
  /** Distance below which an active direction is released (px, < deadZone). */
  releaseZone: number;
  /** Another axis must be this many times stronger than the current one to take over. */
  switchRatio: number;
  /** Beyond this distance the origin follows the thumb (px, >= radius). */
  followRadius: number;
  /** A touch that never left the dead zone and lasted less than this (ms) is a tap. */
  tapMs: number;
}

/** Sizes scale with the viewport's short side: comfortable on a 320 px tall phone and on a tablet. */
export function stickConfigFor(width: number, height: number): StickConfig {
  const radius = Math.round(Math.min(72, Math.max(44, Math.min(width, height) * 0.14)));
  return {
    radius,
    deadZone: Math.round(radius * 0.24),
    releaseZone: Math.round(radius * 0.16),
    switchRatio: 1.35,
    followRadius: Math.round(radius * 1.35),
    tapMs: 300,
  };
}

const UNIT: Readonly<Record<Dir, readonly [number, number]>> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
const DIRS: readonly Dir[] = ['up', 'right', 'down', 'left'];

export class VirtualStick {
  /** Pointer that owns the stick, null when idle. */
  pointerId: number | null = null;
  originX = 0;
  originY = 0;
  /** Knob offset from the origin, clamped to `radius`. */
  knobX = 0;
  knobY = 0;
  dir: Dir | null = null;
  private startMs = 0;
  /** Whether the thumb ever left the dead zone during this touch. */
  private travelled = false;

  constructor(public config: StickConfig) {}

  get active(): boolean {
    return this.pointerId !== null;
  }

  /** A finger landed in the zone. Returns false (ignored) if another finger already owns the stick. */
  begin(pointerId: number, x: number, y: number, nowMs = 0): boolean {
    if (this.pointerId !== null) return false;
    this.pointerId = pointerId;
    this.originX = x;
    this.originY = y;
    this.knobX = 0;
    this.knobY = 0;
    this.dir = null;
    this.startMs = nowMs;
    this.travelled = false;
    return true;
  }

  /** The owning finger moved; returns the (possibly unchanged) direction. Other fingers are ignored. */
  move(pointerId: number, x: number, y: number): Dir | null {
    if (pointerId !== this.pointerId) return this.dir;
    const c = this.config;
    let dx = x - this.originX;
    let dy = y - this.originY;
    let dist = Math.hypot(dx, dy);
    if (dist > c.followRadius) {
      // drag the origin along so the way back is never longer than followRadius
      const k = (dist - c.followRadius) / dist;
      this.originX += dx * k;
      this.originY += dy * k;
      dx = x - this.originX;
      dy = y - this.originY;
      dist = c.followRadius;
    }
    const clamp = dist > c.radius ? c.radius / dist : 1;
    this.knobX = dx * clamp;
    this.knobY = dy * clamp;
    if (dist >= c.deadZone) this.travelled = true;
    this.dir = quantise(this.dir, dx, dy, dist, c);
    return this.dir;
  }

  /**
   * The owning finger lifted (or the gesture was cancelled). Returns whether it was a tap (never left the
   * dead zone, short) - the UI uses taps to pick vehicle entrances under the zone - or null if `pointerId`
   * does not own the stick.
   */
  end(pointerId: number, nowMs = 0): { tap: boolean } | null {
    if (pointerId !== this.pointerId) return null;
    const tap = !this.travelled && nowMs - this.startMs <= this.config.tapMs;
    this.reset();
    return { tap };
  }

  /** Drops the touch without a tap (orientation change, pause, lost capture). */
  reset(): void {
    this.pointerId = null;
    this.knobX = 0;
    this.knobY = 0;
    this.dir = null;
    this.travelled = false;
  }
}

/** Cardinal direction for a thumb offset, with dead zone and hysteresis around the current direction. */
export function quantise(current: Dir | null, dx: number, dy: number, dist: number, c: StickConfig): Dir | null {
  if (current === null) {
    if (dist < c.deadZone) return null;
    return dominant(dx, dy);
  }
  if (dist < c.releaseZone) return null;
  const along = (d: Dir): number => dx * UNIT[d][0] + dy * UNIT[d][1];
  const keep = along(current);
  const best = dominant(dx, dy);
  if (best === current) return current;
  // crossed to the other side of the origin: follow at once; otherwise only a clearly stronger axis wins
  if (keep <= 0 || along(best) > keep * c.switchRatio) return best;
  return current;
}

function dominant(dx: number, dy: number): Dir {
  let best: Dir = 'right';
  let score = -Infinity;
  for (const d of DIRS) {
    const s = dx * UNIT[d][0] + dy * UNIT[d][1];
    if (s > score) {
      score = s;
      best = d;
    }
  }
  return best;
}
