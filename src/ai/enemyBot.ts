/**
 * The campaign enemy controller (decisions EA2, EA4, EF1, EF2). An enemy seat (`Player.enemyKind`) plays through the
 * same `Intent` and sees only the `Observation` like every bot; what differs is the repertoire and the perception:
 *
 *   - movement is the ordinary planner (danger map, escapes) steered by the group tactic in `Observation.directive`
 *     (surround / standoff / block / hold / reinforce, see sim/campaign/tactics.ts and ai/directive.ts);
 *   - PERCEPTION (decision EF1): the planner is handed the observation with every generator that this enemy has not
 *     yet taken seriously shown as a harmless obstacle. A generator becomes a threat once its fuse is down to the
 *     kind's `config.enemyAttacks.awareness.alertTicks` (sometimes a little later: `slipChance` / `slipTicks`, drawn
 *     once per generator from this bot's own seeded RNG), and that moment forces an immediate re-plan. So a fresh
 *     generator is walked past while the enemy chases you, and a generator it has had time to see is still dodged
 *     with the full escape search. Remote, triggered and burning danger is always seen. Nothing is added to what the
 *     observation shows - only taken away for a while;
 *   - COMMITMENT (decision EF2): it never starts a punch or a throw while standing in the cross of a generator it
 *     takes seriously (never suicidal); once committed, the sim plants it for the wind-up / cue and the recovery
 *     after it (`recoveryRootTicks`, `throwRecoveryTicks`): the window in which a player can punish it;
 *   - it NEVER places a generator, detonates, disarms, drives or uses a reward: the profile has no placement and the
 *     intent is scrubbed (the sim ignores `place` for an enemy seat anyway);
 *   - its only action is the one B press: an adjacent rival is punched, else a thrower with a rival in a clear
 *     cardinal line throws (sim/systems/enemyActions.ts decides if it may: cooldowns, group gap, caps).
 */
import { Tile, attackReady, createRng, enemyMeleeTarget, chooseThrow, nextFloat } from '../sim';
import type { Difficulty, EnemyAwareness, Generator, Intent, Observation, RngHolder } from '../sim';
import { Brain } from './brain';
import { PROFILES } from './profiles';
import type { AiProfile } from './profiles';
import type { Bot, BotOptions } from './types';

/** After a B press the bot waits this long before pressing again (the sim enforces the real cooldowns). */
const PRESS_GAP = 12;
/** The fuse an unheeded generator is shown with: far beyond every planning horizon (an obstacle, not a threat). */
export const UNHEEDED_FUSE = 1_000_000;

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

/** Does the plus of `g` (its range, stopped by any non-floor tile) cover (x, y)? */
function inCross(obs: Observation, g: Readonly<Generator>, x: number, y: number): boolean {
  if (g.x === x && g.y === y) return true;
  if (g.x !== x && g.y !== y) return false;
  const d = Math.abs(g.x - x) + Math.abs(g.y - y);
  if (d > g.range) return false;
  const sx = Math.sign(x - g.x);
  const sy = Math.sign(y - g.y);
  for (let k = 1; k < d; k++) {
    if (obs.tiles[(g.y + sy * k) * obs.width + g.x + sx * k] !== Tile.Empty) return false;
  }
  return true;
}

export class EnemyBot implements Bot {
  private readonly brain: Brain;
  private readonly rng: RngHolder;
  private nextPress = 0;
  /** Per generator: the extra ticks this enemy is late to take it seriously (0 or the kind's `slipTicks`). */
  private readonly slip = new Map<number, number>();
  /** Per generator: the tick this enemy first saw it. */
  private readonly seen = new Map<number, number>();
  /** Generators already taken seriously (the moment one joins, the planner re-plans at once). */
  private readonly heeded = new Set<number>();

  constructor(opts: BotOptions) {
    this.brain = new Brain(enemyProfile(opts.difficulty), opts.seed, opts.playerId);
    this.rng = createRng((opts.seed ^ 0x5bd1e995 ^ (opts.playerId * 0x27d4eb2d)) >>> 0);
  }

  /** Is generator `g` a threat to this enemy yet (decision EF1)? Once it is, it stays one. */
  private heeds(obs: Observation, g: Readonly<Generator>, aw: EnemyAwareness, brawling: boolean): boolean {
    if (this.heeded.has(g.id) || g.ownerId === obs.selfId || g.triggered || g.mode !== 'timed') return true;
    if (!brawling && obs.tick - (this.seen.get(g.id) ?? obs.tick) >= aw.reactTicks) return true;
    return g.timer <= aw.alertTicks - (this.slip.get(g.id) ?? 0);
  }

  /** Tunnel vision: a rival within `focusTiles`, or its own wind-up / cue / recovery running. */
  private brawling(obs: Observation, aw: EnemyAwareness): boolean {
    const me = obs.players[obs.selfId]!;
    if (me.attack !== null || obs.tick < me.rootedUntil) return true;
    return obs.players.some(
      (o) =>
        o.alive &&
        o.enemyKind === undefined &&
        o.team !== me.team &&
        Math.abs(o.x - me.x) + Math.abs(o.y - me.y) <= aw.focusTiles,
    );
  }

  /**
   * The observation as this enemy takes it in: generators it does not heed yet carry an unreachable fuse. Returns the
   * live observation itself when nothing is hidden (and always for a seat without awareness: never a multiplayer bot).
   */
  perceive(obs: Observation): Observation {
    const me = obs.players[obs.selfId];
    const aw = me?.enemyKind ? obs.config.enemyAttacks.awareness[me.enemyKind] : undefined;
    if (!aw || obs.generators.length === 0) {
      this.slip.clear();
      this.seen.clear();
      this.heeded.clear();
      return obs;
    }
    let hidden = false;
    let fresh = false;
    const live = new Set<number>();
    const brawling = this.brawling(obs, aw);
    const generators = obs.generators.map((g) => {
      live.add(g.id);
      if (!this.slip.has(g.id)) {
        this.slip.set(g.id, nextFloat(this.rng) < aw.slipChance ? aw.slipTicks : 0);
        this.seen.set(g.id, obs.tick);
      }
      if (this.heeds(obs, g, aw, brawling)) {
        if (!this.heeded.has(g.id)) {
          this.heeded.add(g.id);
          fresh = true;
        }
        return g;
      }
      hidden = true;
      return { ...g, timer: UNHEEDED_FUSE };
    });
    for (const id of this.slip.keys()) if (!live.has(id)) this.slip.delete(id);
    for (const id of this.seen.keys()) if (!live.has(id)) this.seen.delete(id);
    for (const id of this.heeded) if (!live.has(id)) this.heeded.delete(id);
    if (fresh) this.brain.alert();
    return hidden ? { ...obs, generators } : obs;
  }

  decide(raw: Observation): Intent {
    const obs = this.perceive(raw);
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
    // never commit to a wind-up / cue (and the recovery after it) inside a cross it takes seriously
    if (
      obs.generators.some(
        (g) => g.timer < UNHEEDED_FUSE && g.mode !== 'disabled' && inCross(obs, g, me.x, me.y),
      )
    )
      return intent;

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
