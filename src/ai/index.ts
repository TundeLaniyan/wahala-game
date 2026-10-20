/**
 * Bot AI public API. `createBot` returns a deterministic controller that sees only the
 * `Observation` and obeys exactly the same rules as a human player.
 */
import { Brain } from './brain';
import { PROFILES } from './profiles';
import type { Bot, BotOptions } from './types';

export type { Bot, BotOptions } from './types';
export type { AiProfile } from './profiles';
export { PROFILES } from './profiles';

export function createBot(opts: BotOptions): Bot {
  return new Brain(PROFILES[opts.difficulty], opts.seed, opts.playerId);
}
