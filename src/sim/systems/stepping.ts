/** Primitive step helpers shared by movement, skills and hazards (kept separate to avoid import cycles). */
import { tileAt } from '../grid';
import { Tile } from '../types';
import type { GameState, Player } from '../types';
import { groundedGeneratorAt } from './queries';

/** Can a player's feet go onto this tile right now? */
export function canPlayerEnter(state: GameState, x: number, y: number): boolean {
  if (tileAt(state, x, y) !== Tile.Empty) return false;
  return !groundedGeneratorAt(state, x, y);
}

export function beginStep(p: Player, x: number, y: number, stepTicks: number): void {
  p.stepFromX = p.x;
  p.stepFromY = p.y;
  p.x = x;
  p.y = y;
  p.stepRemaining = stepTicks;
  p.stepTotal = stepTicks;
}
