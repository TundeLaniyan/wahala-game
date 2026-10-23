/** Primitive step helpers shared by movement, skills and hazards (kept separate to avoid import cycles). */
import { tileAt } from '../grid';
import { Tile } from '../types';
import type { GameState, Player } from '../types';
import { groundedGeneratorAt } from './queries';

/**
 * Can a player's feet go onto this tile right now? Pass the player to honour Generator Pass (Bomb
 * Pass), which lets them walk over grounded generators; concrete and soft blocks always stop them.
 */
export function canPlayerEnter(state: GameState, x: number, y: number, p?: Player): boolean {
  if (tileAt(state, x, y) !== Tile.Empty) return false;
  return p?.bombPass === true || !groundedGeneratorAt(state, x, y);
}

export function beginStep(p: Player, x: number, y: number, stepTicks: number): void {
  p.stepFromX = p.x;
  p.stepFromY = p.y;
  p.x = x;
  p.y = y;
  p.stepRemaining = stepTicks;
  p.stepTotal = stepTicks;
}
