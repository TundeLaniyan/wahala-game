/**
 * Arena-specific floor traps (only present when the "floor traps" option is on): potholes make a player stumble,
 * oil slicks make them slide a predictable number of tiles. Both are visible and never lethal.
 */
import { DIR_VEC, tileIndex } from '../grid';
import type { GameState, SimEvent } from '../types';
import { beginStep, canPlayerEnter } from './stepping';
import { playerStepTicks } from './queries';

/** Applies hazard effects to players that started a step onto a hazard tile this tick. */
export function updateFloorHazards(state: GameState, events: SimEvent[]): void {
  if (Object.keys(state.floorHazards).length === 0) return;
  for (const p of state.players) {
    if (!p.alive || p.stepRemaining !== p.stepTotal || p.stepTotal === 0) continue;
    const kind = state.floorHazards[tileIndex(state, p.x, p.y)];
    if (!kind) continue;
    if (kind === 'pothole') {
      // A stumble is a brief non-lethal daze that starts once the step into the pothole completes.
      p.dazedUntil = Math.max(
        p.dazedUntil,
        state.tick + p.stepTotal + state.config.hazards.potholeStumbleTicks,
      );
      p.slide = null;
    } else {
      p.slide = { dir: p.facing, remaining: state.config.hazards.oilSlideTiles };
    }
    events.push({ type: 'hazardTriggered', playerId: p.id, kind });
  }
}

/** Continues an oil slide: returns true if the player was moved (and so ignores input this tick). */
export function continueSlide(state: GameState, p: GameState['players'][number]): boolean {
  if (!p.slide) return false;
  const v = DIR_VEC[p.slide.dir];
  const tx = p.x + v.dx;
  const ty = p.y + v.dy;
  if (p.slide.remaining <= 0 || !canPlayerEnter(state, tx, ty)) {
    p.slide = null;
    return false;
  }
  p.slide.remaining--;
  p.facing = p.slide.dir;
  beginStep(p, tx, ty, playerStepTicks(state, p));
  if (p.slide.remaining <= 0) p.slide = null;
  return true;
}
