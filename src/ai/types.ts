/** Public contract of the AI layer (what the app integrates against). */
import type { Difficulty, Intent, Observation } from '../sim';

export interface Bot {
  /** Called once per sim tick for a living bot. The returned intent is applied on the next tick. */
  decide(obs: Observation): Intent;
}

export interface BotOptions {
  difficulty: Difficulty;
  seed: number;
  playerId: number;
}
