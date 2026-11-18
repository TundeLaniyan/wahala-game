/**
 * Bot AI public API. `createBot` returns a deterministic controller that sees only the
 * `Observation` and obeys exactly the same rules as a human player.
 */
import { Brain } from './brain';
import { EnemyBot } from './enemyBot';
import { PROFILES } from './profiles';
import { SeatPerception } from './seatPerception';
import type { Bot, BotOptions } from './types';

export type { Bot, BotOptions } from './types';
export type { AiProfile } from './profiles';
export { PROFILES } from './profiles';

export { createEnemyBot, enemyProfile } from './enemyBot';

/**
 * A bot for one seat. A seat that turns out to be a campaign enemy (`Player.enemyKind`, public in the observation) is
 * played by the enemy controller instead (no generators, punches and throws: ai/enemyBot.ts); every other seat is the
 * ordinary brain, untouched - except a campaign boss mission's generator bot, which plans only on the generators it
 * has seen (`config.campaignTactics.seatPerception`, ai/seatPerception.ts).
 */
export function createBot(opts: BotOptions): Bot {
  const brain = new Brain(PROFILES[opts.difficulty], opts.seed, opts.playerId);
  let enemy: EnemyBot | null = null;
  let perception: SeatPerception | null = null;
  return {
    decide(obs) {
      if (obs.players[opts.playerId]?.enemyKind === undefined) {
        // a campaign boss mission's generator bot sees only what it could see (decision SA4); everyone else as before
        const kind = obs.config.campaignTactics?.seatPerception?.[opts.playerId];
        if (kind === undefined) return brain.decide(obs);
        perception ??= new SeatPerception(kind);
        return brain.decide(perception.perceive(obs, () => brain.alert()));
      }
      enemy ??= new EnemyBot(opts);
      return enemy.decide(obs);
    },
  };
}
