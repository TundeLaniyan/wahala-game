/**
 * Sudden Death TEST match: what the floor shows for the blast, read from the sim state only (no rules here).
 *
 *  - Warning: in the last `config.suddenDeath.warnTicks` before a blast every open floor tile pulses red, so the whole
 *    area is marked lethal-to-come before anything can strike (the blast reaches every contender).
 *  - Front: the rings `SuddenDeathFront` strikes. A tile glows hot from the tick the sim strikes its ring (the same
 *    `frontRing` / `frontRadius` the sim uses) and cools over the next rings; only a faint hint shows just ahead of it.
 */
import { frontRing, Tile } from '../../sim';
import type { GameState } from '../../sim';

export interface FloorGlow {
  index: number;
  /** 0xRRGGBB */
  color: number;
  intensity: number;
  /** A ring pulse is drawn on the tile as well (the leading edge). */
  edge: boolean;
}

/** Rings behind the front edge that still glow. */
const TRAIL_RINGS = 2.4;
/** How far ahead of the edge (in rings) the faint hint reaches. It is a hint, never lethal: nothing is struck before the edge. */
const HINT_RINGS = 0.5;

export function suddenDeathFloor(state: GameState, alpha: number, time: number): FloorGlow[] {
  const sd = state.match.suddenDeath;
  if (!sd || !state.config.suddenDeath.lab) return [];
  const out: FloorGlow[] = [];
  const open = (i: number): boolean => state.tiles[i] === Tile.Empty;

  const left = sd.nextBlastTick - state.tick - alpha;
  const warn = state.config.suddenDeath.warnTicks;
  if (sd.stage === 'countdown' && Number.isFinite(sd.nextBlastTick) && left <= warn) {
    const k = 1 - Math.max(0, left) / warn;
    const pulse = 0.5 + 0.5 * Math.sin(time * (8 + 14 * k));
    for (let i = 0; i < state.tiles.length; i++)
      if (open(i))
        out.push({ index: i, color: 0xff2a1a, intensity: 0.1 + 0.2 * k + 0.12 * pulse, edge: false });
  }

  const f = sd.front;
  if (f) {
    const at = (state.tick + alpha - f.startTick) / f.ticksPerRing;
    for (let i = 0; i < state.tiles.length; i++) {
      if (!open(i)) continue;
      const d = at - frontRing(f, i % state.width, Math.floor(i / state.width));
      if (d < -HINT_RINGS || d > TRAIL_RINGS) continue;
      if (d < 0) out.push({ index: i, color: 0xff9a2a, intensity: 0.18 * (1 + d / HINT_RINGS), edge: false });
      else
        out.push({
          index: i,
          color: d < 0.7 ? 0xffe8b0 : 0xff6a1a,
          intensity: d < 0.7 ? 1 : 0.85 * (1 - d / TRAIL_RINGS),
          edge: d < 1,
        });
    }
  }
  return out;
}
