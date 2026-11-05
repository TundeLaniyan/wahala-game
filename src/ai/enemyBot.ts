/**
 * The campaign enemy controller (decisions EA2, EA4). An enemy seat (`Player.enemyKind`) plays through the same
 * `Intent` and sees only the `Observation` like every bot; what differs is the repertoire:
 *
 *   - movement is the ordinary planner (danger map, escapes) steered by the group tactic in `Observation.directive`
 *     (surround / standoff / block / hold / reinforce, see sim/campaign/tactics.ts and ai/directive.ts);
 *   - it NEVER places a generator, detonates, disarms, drives or uses a reward: the profile has no placement and the
 *     intent is scrubbed (the sim ignores `place` for an enemy seat anyway);
 *   - its only action is the one B press: an adjacent rival is punched, else a thrower with a rival in a clear
 *     cardinal line throws (sim/systems/enemyActions.ts decides if it may: cooldowns, group gap, caps).
 */
import { attackReady, enemyMeleeTarget, chooseThrow } from '../sim';
import type { Difficulty, Intent, Observation } from '../sim';
import { Brain } from './brain';
import { PROFILES } from './profiles';
import type { AiProfile } from './profiles';
import type { Bot, BotOptions } from './types';

/** After a B press the bot waits this long before pressing again (the sim enforces the real cooldowns). */
const PRESS_GAP = 12;

/** The ordinary profile of a level with everything that needs a generator or a reward switched off. */
export function enemyProfile(difficulty: Difficulty): AiProfile {
  return {
    ...PROFILES[difficulty],
    placeMinGain: Number.POSITIVE_INFINITY,
    pickupInterest: 0,
    trap: 'none',
    vehicleUse: 0,
    useSkill: false,
    meleeUse: 0,
    useGeneratorTools: false,
    smartRemote: false,
    sideline: false,
  };
}

export class EnemyBot implements Bot {
  private readonly brain: Brain;
  private nextPress = 0;

  constructor(opts: BotOptions) {
    this.brain = new Brain(enemyProfile(opts.difficulty), opts.seed, opts.playerId);
  }

  decide(obs: Observation): Intent {
    const intent = this.brain.decide(obs);
    // an enemy is not a generator player: scrub everything but movement
    delete intent.place;
    delete intent.placeHeld;
    delete intent.detonate;
    delete intent.disarm;
    delete intent.skill;
    delete intent.action;
    delete intent.vehicle;
    delete intent.special;
    const me = obs.players[obs.selfId];
    if (
      !me ||
      !me.alive ||
      obs.match.phase !== 'playing' ||
      obs.tick < me.dazedUntil ||
      me.entryUntil !== null
    )
      return intent;
    if (obs.tick < this.nextPress) return intent;

    // 1. a rival next to me: punch (when the catalogue attack is ready; the sim applies the enemy's own cooldown)
    const melee = enemyMeleeTarget(obs, me);
    if (melee) {
      const kind = me.enemyKind ? obs.config.enemyAttacks.melee[me.enemyKind] : null;
      if (kind && attackReady(obs, me, kind.attack)) {
        intent.special = true;
        delete intent.move;
        this.nextPress = obs.tick + PRESS_GAP;
      }
      return intent;
    }
    // 2. a rival in a clear cardinal line: throw (stand still for the cue)
    if (chooseThrow(obs, me)) {
      intent.special = true;
      delete intent.move;
      this.nextPress = obs.tick + PRESS_GAP;
    }
    return intent;
  }
}

export function createEnemyBot(opts: BotOptions): Bot {
  return new EnemyBot(opts);
}
