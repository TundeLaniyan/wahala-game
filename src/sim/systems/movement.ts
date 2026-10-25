/**
 * Grid movement. Players move one orthogonal tile at a time. A step commits the destination
 * tile immediately (so hazards and blockers use the new tile) and the renderer interpolates
 * between stepFrom* and x/y over stepRemaining ticks.
 */
import { DIR_VEC, OPPOSITE } from '../grid';
import type { Dir, GameState, Intents, SimEvent } from '../types';
import { tryContact } from './contact';
import { continueSlide } from './hazards';
import { resolveTeleport } from './stage';
import { beginStep, canPlayerEnter } from './stepping';
import { groundedGeneratorAt, isActing, playerStepTicks } from './queries';

/**
 * Whether `updateMovement` will look at this player's move intent on the next tick (the previous
 * step finishes on it). Input layers use it to hand over exactly one buffered move per press.
 */
export function readyToStep(player: { stepRemaining: number }): boolean {
  return player.stepRemaining <= 1;
}

export function updateMovement(state: GameState, intents: Intents, events: SimEvent[]): void {
  for (const p of state.players) {
    if (!p.alive) continue;
    if (p.stepRemaining > 0) p.stepRemaining--;
    if (p.stepRemaining > 0) continue;
    // a manhole entered by the step that just finished carries the player before anything else
    if (p.teleportPending && resolveTeleport(state, p, events)) continue;
    if (!isActing(state, p) || p.entryUntil !== null) continue;

    if (continueSlide(state, p)) continue;
    const wanted = intents[p.id]?.move ?? null;
    if (!wanted) continue;
    const dir: Dir = p.curse?.kind === 'inverted' && state.tick < p.curse.until ? OPPOSITE[wanted] : wanted;
    p.facing = dir;
    const v = DIR_VEC[dir];
    const tx = p.x + v.dx;
    const ty = p.y + v.dy;

    if (canPlayerEnter(state, tx, ty)) {
      beginStep(p, tx, ty, playerStepTicks(state, p));
    } else {
      const gen = groundedGeneratorAt(state, tx, ty);
      // walking into a generator: the equipped contact ability acts (kick / punch / disarm / pass)
      if (gen) tryContact(state, p, gen, dir, events);
    }
  }
}
