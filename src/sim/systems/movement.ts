/**
 * Grid movement. Players move one orthogonal tile at a time. A step commits the destination
 * tile immediately (so hazards and blockers use the new tile) and the renderer interpolates
 * between stepFrom* and x/y over stepRemaining ticks.
 */
import { DIR_VEC, OPPOSITE } from '../grid';
import type { Dir, GameState, Intents, SimEvent } from '../types';
import { kickGenerator } from './generators';
import { continueSlide } from './hazards';
import { beginStep, canPlayerEnter } from './stepping';
import { groundedGeneratorAt, isActing, playerStepTicks } from './queries';

export function updateMovement(state: GameState, intents: Intents, events: SimEvent[]): void {
  for (const p of state.players) {
    if (!p.alive) continue;
    if (p.stepRemaining > 0) p.stepRemaining--;
    if (p.stepRemaining > 0) continue;
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
      if (!gen) continue;
      if (p.kick && kickGenerator(state, gen, dir, events)) continue;
      // Jump Sneakers: hop a single generator onto the free tile behind it.
      const lx = tx + v.dx;
      const ly = ty + v.dy;
      if (p.sneakers && state.tick >= p.jumpReadyTick && canPlayerEnter(state, lx, ly)) {
        p.jumpReadyTick = state.tick + state.config.movement.jumpCooldownTicks;
        beginStep(p, lx, ly, playerStepTicks(state, p) * 2);
        events.push({ type: 'playerJumped', playerId: p.id });
      }
    }
  }
}
