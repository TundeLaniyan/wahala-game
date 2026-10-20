import { Vector3 } from 'three';
import type { Player } from '../../sim';
import type { Layout } from '../coords';

/** 0..1 progress through the current step, interpolated by the fractional tick `alpha`. */
export function stepProgress(stepRemaining: number, stepTotal: number, alpha: number): number {
  if (stepTotal <= 0 || stepRemaining <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - (stepRemaining - alpha) / stepTotal));
}

export function playerGridPos(p: Player, alpha: number): { x: number; y: number; moving: boolean } {
  const k = stepProgress(p.stepRemaining, p.stepTotal, alpha);
  return {
    x: p.stepFromX + (p.x - p.stepFromX) * k,
    y: p.stepFromY + (p.y - p.stepFromY) * k,
    moving: p.stepRemaining > 0 && k < 1,
  };
}

export function toWorld(layout: Layout, gx: number, gy: number, y = 0, out = new Vector3()): Vector3 {
  return out.set(layout.wx(gx), y, layout.wz(gy));
}

/** Shortest-angle lerp. */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Yaw (about Y) that makes a +Z-facing model look along grid direction (dx,dy). */
export function yawForDir(dx: number, dy: number): number {
  return Math.atan2(dx, dy);
}
