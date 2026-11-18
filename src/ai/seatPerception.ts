/**
 * Perception for the GENERATOR bots of a campaign boss mission (decision SA4, docs/CAMPAIGN_SECTOR_AI.md): the boss
 * and its crew have no `enemyKind` (they fight with generators), but under the campaign tactics layer they no longer
 * see every generator either. `config.campaignTactics.seatPerception` names the perception row of each seat; the bot
 * then plans on the same perceived observation as an enemy seat (`perceivedObservation`: a generator it never saw is
 * absent, one it saw but has not reacted to is an obstacle). Its own team's generators are always known.
 * No other seat (Classic, City Rumble, multiplayer, online) ever reaches this: those configs carry no layer.
 */
import { ENEMY_VARIANTS } from '../sim';
import type { EnemyKind, EnemyVariantId, Observation } from '../sim';
import { TrapSight } from './trapSight';
import { perceivedObservation } from './enemyBot';

export class SeatPerception {
  private readonly sight = new TrapSight();

  /**
   * `variant` (decision BX8, `config.campaignTactics.seatVariant`): the seat's personality - its trap sense scales the
   * reaction (more again while it brawls: chasing or blocking) and may let it watch a placement it can SEE; its vision
   * delta widens or narrows the radius. Never information it could not perceive.
   */
  constructor(
    private readonly kind: EnemyKind,
    private readonly variant?: EnemyVariantId,
  ) {}

  /** The observation as this seat takes it in; `alert` is called when a generator has just become known. */
  perceive(obs: Observation, alert: () => void): Observation {
    const t = obs.config.campaignTactics;
    const me = obs.players[obs.selfId];
    if (!t || !me || !me.alive) return obs;
    const pers = this.variant ? ENEMY_VARIANTS[this.variant].personality : null;
    const sense = pers ? t.trapSense[pers.trapSense] : null;
    const d = obs.directive?.kind;
    const brawling = me.attack !== null || d === 'chase' || d === 'block';
    this.sight.update(obs, me, t, {
      kind: this.kind,
      teamKnown: true,
      ...(pers && sense
        ? {
            visionDelta: pers.visionDelta,
            reactScale: sense.reactScale * (brawling ? sense.brawlReactScale : 1),
            seesPlacement: sense.seesPlacement && obs.tick >= me.dazedUntil,
          }
        : {}),
    });
    if (this.sight.freshlyKnown) alert();
    return perceivedObservation(obs, this.sight);
  }
}
