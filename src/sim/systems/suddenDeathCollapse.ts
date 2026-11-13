/**
 * Sudden Death TEST match (decisions SD-T1..SD-T7): the outer arena closes in over `collapseTicks` once the
 * countdown starts. It is the ordinary Wahala Crush (`crush.ts`): the same outside-in order around the area, the same
 * telegraph (`crushWarning`, then `crushLanded` `config.crush.warnTicks` later) and the same lethal landing, so every
 * tile that kills was warned first. Only the schedule differs: an even cadence that spans the collapse window.
 */
import type { GameState } from '../types';

export function startCollapse(state: GameState, collapseTicks: number): void {
  const crush = state.crush;
  if (!crush || crush.order.length === 0) return;
  const first = state.match.playTicks;
  const last = first + Math.max(0, collapseTicks - state.config.crush.warnTicks);
  const count = crush.order.length;
  crush.warnAt = crush.order.map((_, j) =>
    count > 1 ? first + Math.round(((last - first) * j) / (count - 1)) : first,
  );
  crush.next = 0;
  crush.nextAtTick = crush.warnAt[0] ?? Infinity;
}
