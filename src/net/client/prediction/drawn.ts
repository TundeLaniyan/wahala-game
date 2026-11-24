/**
 * Where the renderer draws a fighter, and how to make it draw one somewhere else using only the fields the sim already has.
 *
 * Every view draws a player at `playerGridPos(p, alpha)` (src/render/views/motion.ts): `stepFrom + (x - stepFrom) * k` with
 * `k = clamp(1 - (stepRemaining - alpha) / stepTotal)`. `drawnPosition` is that formula (kept here so the online chunk does
 * not import the renderer; tests check both agree). `encodeDrawn` picks values of those same seven fields that make the
 * renderer, at this frame's alpha, draw a given point: the logical tile (`x`, `y`) stays the predicted tile, only the
 * interpolation start (`stepFromX/Y`) and the step counters carry the sub-tile position. Presentation only.
 */
import type { Dir, Player } from '../../../sim';

/** The seven fields the overlay may change, and nothing else (decision ON4). */
export interface StepFields {
  x: number;
  y: number;
  facing: Dir;
  stepFromX: number;
  stepFromY: number;
  stepRemaining: number;
  stepTotal: number;
}

export const STEP_FIELD_KEYS = [
  'x',
  'y',
  'facing',
  'stepFromX',
  'stepFromY',
  'stepRemaining',
  'stepTotal',
] as const satisfies readonly (keyof StepFields & keyof Player)[];

export interface Vec {
  x: number;
  y: number;
}

export function pickStep(p: Readonly<StepFields>): StepFields {
  return {
    x: p.x,
    y: p.y,
    facing: p.facing,
    stepFromX: p.stepFromX,
    stepFromY: p.stepFromY,
    stepRemaining: p.stepRemaining,
    stepTotal: p.stepTotal,
  };
}

/** Same as the renderer's `stepProgress`; `alpha` may lie outside 0..1 (evaluating a path between its ticks). */
export function stepProgress(stepRemaining: number, stepTotal: number, alpha: number): number {
  if (stepTotal <= 0 || stepRemaining <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - (stepRemaining - alpha) / stepTotal));
}

/** Same as the renderer's `playerGridPos` (position only). */
export function drawnPosition(p: Readonly<StepFields>, alpha: number): Vec {
  const k = stepProgress(p.stepRemaining, p.stepTotal, alpha);
  return { x: p.stepFromX + (p.x - p.stepFromX) * k, y: p.stepFromY + (p.y - p.stepFromY) * k };
}

/** Fallback step length for an encoding while standing (only the walk animation's pace reads it). */
const DEFAULT_STEP_TICKS = 12;
/** Keep `1 - k` at least this large so the solved `stepFrom` stays within a few tiles of the target. */
const MIN_REMAINING_SHARE = 0.3;
const EPS = 1e-6;

/**
 * Fields that make `drawnPosition(fields, alpha)` equal `target`, keeping the logical tile and facing of `at` (the
 * predicted state at the shown tick). With the target on the tile and `at` standing still, the result is "standing on the
 * tile" (no step in progress), so a settled fighter idles exactly as offline.
 */
export function encodeDrawn(target: Vec, at: Readonly<StepFields>, alpha: number): StepFields {
  const dx = target.x - at.x;
  const dy = target.y - at.y;
  if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) {
    return { ...pickStep(at), stepRemaining: 0, stepFromX: at.x, stepFromY: at.y };
  }
  let total = at.stepTotal > 0 ? at.stepTotal : DEFAULT_STEP_TICKS;
  let remaining = at.stepRemaining;
  if (total < 2) total = 2;
  // keep the predicted step's own counters when they leave enough room, else pick ones that do
  if (remaining < 1 || remaining > total || (remaining - alpha) / total < MIN_REMAINING_SHARE) {
    remaining = Math.max(1, Math.ceil(MIN_REMAINING_SHARE * total + alpha));
    if (remaining > total) total = remaining;
  }
  const k = 1 - (remaining - alpha) / total; // 0 <= k <= 1 - MIN_REMAINING_SHARE
  const inv = 1 / (1 - k);
  return {
    x: at.x,
    y: at.y,
    facing: at.facing,
    stepFromX: at.x + dx * inv,
    stepFromY: at.y + dy * inv,
    stepRemaining: remaining,
    stepTotal: total,
  };
}
