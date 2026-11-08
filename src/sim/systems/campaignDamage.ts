/**
 * Campaign health and damage (decisions CC1-CC4, docs/CAMPAIGN_COMBAT.md). Only players that carry `Vitals`
 * (campaign humans and enemies) come through here; multiplayer keeps the one-hit rules in lethality.ts untouched.
 *
 * `applyCampaignHit` resolves ONE hit, in a fixed and visible order, and pushes exactly one `campaignHit` event:
 *
 *   1. invulnerability frames (`vitals.invulnUntil`, spawn protection) ignore the hit: 'invulnerable'. A `strong` hit
 *      pierces the frames only when the hit that started them was not strong;
 *   2. a lethal-class hit (blast, vehicle, hazard, trap, or any `strong` hit) meets the Okada, then the Armour (the
 *      deployed shield rules): ONE layer absorbs it and is consumed ('blockedOkada' / 'blockedArmour', with the
 *      existing `okadaBroken` / `protectionBroken` events). Surviving through a shield is not damage and not a death,
 *      and it starts the same recovery frames as a wound;
 *   3. otherwise health drops by `hit.damage` ('damaged'); the daze and the knockback are applied (never into a wall or
 *      a generator). A hit with damage 0 only dazes or shoves ('dazed'): it never removes a segment;
 *   4. health at zero eliminates through the ordinary `eliminate()` (credit, stats): 'defeated' plus `campaignDefeated`.
 *
 * Protection is spent before health and health before lives: campaign LIVES are the mission runtime's (`mission/`),
 * which sees the elimination exactly like a one-hit death; the respawn then restores full health and spawn
 * protection (`resetVitals`). A `terminal` hit (the closing city with nowhere to go, the Sudden Death blast) skips all
 * of it and kills.
 */
import { DIR_VEC } from '../grid';
import { campaignConfig } from '../config';
import type { CampaignHit, CampaignHitResult, CampaignHitSource, Vitals } from '../campaign/types';
import { enemyDef } from '../data/enemies';
import type { EliminationCause, GameState, Player, SimEvent } from '../types';
import { recordHit } from './attribution';
import { eliminate } from './eliminate';
import { pushLanding } from './pushLanding';
import { beginStep } from './stepping';

const NEVER = -1e9;

/** Sources that count as lethal events: they meet the Okada and the Armour first. */
const LETHAL_SOURCES: ReadonlySet<CampaignHitSource> = new Set(['blast', 'vehicle', 'hazard', 'trap']);

/** Fresh full health. */
export function createVitals(maxHp: number): Vitals {
  const hp = Math.max(1, Math.floor(maxHp));
  return {
    hp,
    maxHp: hp,
    invulnUntil: 0,
    lastHitTick: NEVER,
    lastHitBy: null,
    lastHitSource: null,
    lastHitStrong: false,
  };
}

/**
 * The health a seat starts with: an enemy kind's own (`data/enemies.ts`; only a heavy may be raised, up to
 * `config.campaign.heavyMaxHp`), else the human's `maxHp` from the setup, else none (the one-hit rules).
 */
export function vitalsFor(
  setup: { enemyKind?: Player['enemyKind']; maxHp?: number },
  config: Pick<GameState['config'], 'campaign' | 'combatPilot'>,
): Vitals | undefined {
  if (setup.enemyKind) {
    // the combat pilot's enemy health (decision CP3), only in a pilot match
    const pilotHp = config.combatPilot?.enemyHp[setup.enemyKind];
    if (pilotHp !== undefined) return createVitals(pilotHp);
    const def = enemyDef(setup.enemyKind);
    if (setup.enemyKind !== 'heavy' || setup.maxHp === undefined) return createVitals(def.hp);
    return createVitals(
      Math.min(Math.max(setup.maxHp, def.hp), Math.max(campaignConfig(config).heavyMaxHp, def.hp)),
    );
  }
  return setup.maxHp !== undefined ? createVitals(setup.maxHp) : undefined;
}

/** A respawn (respawn.ts): full health and the spawn protection already on the player, shown as recovery frames. */
export function resetVitals(p: Player): void {
  const v = p.vitals;
  if (!v) return;
  v.hp = v.maxHp;
  v.invulnUntil = p.protectedUntil;
  v.lastHitTick = NEVER;
  v.lastHitBy = null;
  v.lastHitSource = null;
  v.lastHitStrong = false;
}

export interface CampaignHitOptions {
  /** Elimination causes to credit if the hit defeats the victim (lethal events pass their own); default: a 'campaign' cause. */
  causes?: readonly EliminationCause[];
  /** Skips frames, shields and health: the victim is defeated (a closing crush with no tile left, the Sudden Death blast). */
  terminal?: boolean;
  /**
   * A combat-pilot punch (decision CP3): it is not stopped by an enemy's recovery frames (its own stagger immunity is
   * what prevents a stun-lock) and it starts none. Only `pilotCombat.ts` passes it.
   */
  pilotPunch?: boolean;
}

/** Is the victim's recovery (or spawn protection) running? */
export function isCampaignInvulnerable(
  state: Pick<GameState, 'tick'>,
  p: Pick<Player, 'vitals' | 'protectedUntil'>,
): boolean {
  return state.tick < (p.vitals?.invulnUntil ?? 0) || state.tick < p.protectedUntil;
}

export function applyCampaignHit(
  state: GameState,
  hit: CampaignHit,
  events: SimEvent[],
  options: CampaignHitOptions = {},
): CampaignHitResult {
  const p = state.players[hit.victimId];
  const v = p?.vitals;
  // not a campaign victim (or already down): nothing to resolve, nothing to announce
  if (!p || !v || !p.alive) return 'invulnerable';
  const cfg = campaignConfig(state.config);
  // recovery frames: the human's `invulnTicks`; an enemy's are the pilot's short ones in a pilot match (CP3)
  const pilot = state.config.combatPilot;
  const frameTicks = pilot && p.enemyKind !== undefined ? pilot.enemyFramesTicks : cfg.invulnTicks;
  const pilotPunch = options.pilotPunch === true && pilot !== undefined;
  const done = (result: CampaignHitResult, taken: number): CampaignHitResult => {
    events.push({
      type: 'campaignHit',
      victimId: p.id,
      byId: hit.byId,
      source: hit.source,
      result,
      damage: taken,
      hpAfter: v.hp,
      maxHp: v.maxHp,
      dazeTicks: result === 'dazed' || result === 'damaged' ? hit.dazeTicks : 0,
      x: p.x,
      y: p.y,
    });
    return result;
  };

  if (options.terminal) return defeat(state, p, v, hit, events, options, v.hp, done);

  // 1. recovery frames and spawn protection
  const frames = state.tick < v.invulnUntil;
  const protectedNow = state.tick < p.protectedUntil;
  if (protectedNow || (frames && !pilotPunch && !(hit.strong && !v.lastHitStrong)))
    return done('invulnerable', 0);

  const damage = Math.max(0, Math.floor(hit.damage));

  // 2. the shield layers, one per lethal event: Okada first, then Armour
  if (damage > 0 && (hit.strong || LETHAL_SOURCES.has(hit.source))) {
    const layer = p.mounted ? 'okada' : p.armour > 0 ? 'armour' : null;
    if (layer) {
      if (layer === 'okada') p.mounted = false;
      else p.armour--;
      v.invulnUntil = state.tick + frameTicks;
      v.lastHitStrong = !!hit.strong;
      v.lastHitBy = hit.byId;
      v.lastHitSource = hit.source;
      if (layer === 'okada') events.push({ type: 'okadaBroken', playerId: p.id, x: p.x, y: p.y });
      events.push({ type: 'protectionBroken', playerId: p.id, layer, x: p.x, y: p.y });
      return done(layer === 'okada' ? 'blockedOkada' : 'blockedArmour', 0);
    }
  }

  // 3. health, daze, knockback
  if (hit.byId !== null && hit.byId !== p.id) recordHit(state, p, hit.byId);
  const taken = Math.min(damage, v.hp);
  v.hp -= taken;
  v.lastHitBy = hit.byId;
  v.lastHitSource = hit.source;
  if (damage > 0) {
    v.lastHitTick = state.tick;
    if (!pilotPunch) v.invulnUntil = state.tick + frameTicks;
    v.lastHitStrong = !!hit.strong;
  }
  if (v.hp <= 0) return defeat(state, p, v, hit, events, options, taken, done);

  if (hit.dazeTicks > 0) {
    p.dazedUntil = Math.max(p.dazedUntil, state.tick + hit.dazeTicks);
    p.entryUntil = null; // a dazed player drops out of vehicle-entry mode
    events.push({ type: 'playerDazed', playerId: p.id, byId: hit.byId });
  }
  if (hit.knockback && hit.knockback.tiles > 0) {
    const landing = pushLanding(state, p, DIR_VEC[hit.knockback.dir], hit.knockback.tiles);
    if (landing) {
      const fromX = p.x;
      const fromY = p.y;
      p.slide = null;
      beginStep(p, landing.x, landing.y, state.config.movement.pushStepTicks * landing.tiles);
      events.push({ type: 'playerPushed', playerId: p.id, byId: hit.byId ?? p.id, fromX, fromY });
    }
  }
  return done(damage > 0 ? 'damaged' : 'dazed', taken);
}

function defeat(
  state: GameState,
  p: Player,
  v: Vitals,
  hit: CampaignHit,
  events: SimEvent[],
  options: CampaignHitOptions,
  taken: number,
  done: (result: CampaignHitResult, taken: number) => CampaignHitResult,
): CampaignHitResult {
  v.hp = 0;
  v.lastHitTick = state.tick;
  v.lastHitBy = hit.byId;
  v.lastHitSource = hit.source;
  const causes = options.causes ?? [
    { kind: 'campaign', source: hit.source, ownerId: hit.byId, eventId: state.nextEventId++ } as const,
  ];
  const result = done('defeated', taken);
  const x = p.x;
  const y = p.y;
  eliminate(state, p, causes, events);
  events.push({
    type: 'campaignDefeated',
    victimId: p.id,
    byId: hit.byId,
    source: hit.source,
    enemyKind: p.enemyKind ?? null,
    x,
    y,
  });
  return result;
}
