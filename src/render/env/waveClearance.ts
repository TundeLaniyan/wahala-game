/**
 * Where the road wave's own vehicle is while it approaches (presentation only): the ambient traffic of a stage
 * that opts in (`StageEnvironment.yieldToWave`) fades out around it, so the vehicle that will cross the lane stands
 * alone and readable. Same arithmetic as the hazard view: the vehicle is `1 + remaining / stepTicks` tiles before
 * the entry tile of its lane, in the lane's direction, and reaches the entry on the tick the sweep starts.
 */
import { DIR_VEC } from '../../sim';
import type { GameState } from '../../sim';

export interface WavePoint {
  /** Tile-edge coordinates (the environment's own frame: x 0 .. cols, y 0 .. rows). */
  x: number;
  y: number;
}

/** Radii (tiles) inside which ambient vehicles vanish completely / are back at full size. */
export const CLEAR_INNER = 3.5;
export const CLEAR_OUTER = 8;

export function wavePoints(state: GameState, alpha: number): WavePoint[] {
  const out: WavePoint[] = [];
  const w = state.width;
  for (const ev of state.stage.events) {
    if (ev.kind !== 'sweep' || ev.style !== 'traffic' || ev.index >= 0) continue;
    const t0 = ev.tiles[0];
    if (t0 === undefined) continue;
    const d = DIR_VEC[ev.dir ?? 'right'];
    const remaining = Math.max(0, ev.startTick - state.tick - alpha);
    const dist = 1 + remaining / ev.stepTicks;
    out.push({ x: (t0 % w) + 0.5 - d.dx * dist, y: Math.floor(t0 / w) + 0.5 - d.dy * dist });
  }
  return out;
}

/** Size factor 0..1 of an ambient vehicle at (x, y): 0 within CLEAR_INNER of a wave vehicle, 1 beyond CLEAR_OUTER. */
export function clearanceScale(x: number, y: number, waves: readonly WavePoint[]): number {
  let k = 1;
  for (const p of waves) {
    const d = Math.hypot(x - p.x, y - p.y);
    const t = Math.min(1, Math.max(0, (d - CLEAR_INNER) / (CLEAR_OUTER - CLEAR_INNER)));
    k = Math.min(k, t * t * (3 - 2 * t));
  }
  return k;
}
