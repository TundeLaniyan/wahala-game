/**
 * Lethal hits. Every hit produced in a tick is collected first, then resolved together so that
 * simultaneous eliminations are genuinely simultaneous (and can therefore produce draws).
 *
 * Protection (decision WC5): a player with no layer dies to one lethal hit. Layers are the Okada and
 * Armour plates. ONE layer absorbs every lethal event of a tick (Okada first, then Armour), and the
 * absorbed events stay harmless for their grace window, so one explosion frame can never eat the Okada,
 * the Armour and the life as three impacts. Okada + one plate = survive two separate lethal hits, die to
 * the third. The Rumble sudden-death blast uses the same layers (one per blast) and ignores spawn
 * protection. Wahala Crush: a protected player is shoved to the nearest free tile (a layer is used); when
 * no free tile is left (the final closure) the hit is `terminal` and kills through any protection.
 *
 * Campaign players (those carrying `Vitals`, decision CC1) do not die to the first lethal hit: `campaignLethal` below
 * routes the same hits through `applyCampaignHit` (recovery frames, then Okada, then Armour, then health). Everyone
 * else is exactly as before.
 */
import type { CampaignHit, CampaignHitSource } from '../campaign/types';
import { campaignConfig } from '../config';
import type { EliminationCause, GameState, Player, SimEvent } from '../types';
import { applyCampaignHit } from './campaignDamage';
import { eliminate } from './eliminate';
import { canHarm } from './queries';
import { isShieldedBoss } from '../mission/rules';

export { eliminate };

export interface LethalHit {
  playerId: number;
  eventId: number;
  cause: EliminationCause;
  /** Tick until which a player whose protection absorbed this hit ignores the same continuing hazard. */
  graceUntil: number;
  /** Crush: where a protected player is shoved when a layer absorbs the landing. */
  relocate?: { x: number; y: number };
  /** No protection can absorb this hit (a closing tile with nowhere left to go). */
  terminal?: boolean;
}

export function isImmune(state: GameState, p: Player, eventId: number): boolean {
  return p.immune.some((e) => e.eventId === eventId && e.until > state.tick);
}

/** Collects flame hits for every player currently standing in fire. */
export function collectFlameHits(state: GameState): LethalHit[] {
  const hits: LethalHit[] = [];
  for (const p of state.players) {
    if (!p.alive) continue;
    for (const f of state.flames) {
      if (f.x === p.x && f.y === p.y && state.tick >= f.startTick && state.tick < f.endTick) {
        if (!canHarm(state, f.ownerId, p)) continue; // teammate's fire, friendly fire off
        if (f.ownerSafe && f.ownerId === p.id) continue; // a VEHICLE GENERATOR never catches its owner
        hits.push({
          playerId: p.id,
          eventId: f.eventId,
          cause: f.fromSpectator
            ? { kind: 'spectator', ownerId: f.ownerId, eventId: f.eventId }
            : { kind: 'flame', ownerId: f.ownerId, eventId: f.eventId },
          graceUntil: Math.max(f.endTick, state.tick + state.config.okada.graceTicks),
        });
      }
    }
  }
  return hits;
}

/** Applies all hits simultaneously. Returns the ids eliminated this tick. */
export function applyLethalHits(state: GameState, hits: LethalHit[], events: SimEvent[]): number[] {
  const eliminated: number[] = [];
  const byPlayer = new Map<number, LethalHit[]>();
  for (const h of hits) {
    const list = byPlayer.get(h.playerId) ?? [];
    list.push(h);
    byPlayer.set(h.playerId, list);
  }

  for (const p of state.players) {
    p.immune = p.immune.filter((e) => e.until > state.tick);
    const mine = byPlayer.get(p.id);
    if (!p.alive || !mine) continue;
    const live = mine.filter((h) => !isImmune(state, p, h.eventId));
    if (live.length === 0) continue;
    if (isShieldedBoss(state, p)) continue; // a mission boss cannot be hurt until the objective exposes it
    // spawn protection (respawn modes): ignore everything but the closing walls
    if (
      state.tick < p.protectedUntil &&
      live.every((h) => h.cause.kind !== 'crush' && h.cause.kind !== 'suddenDeath')
    )
      continue;

    if (p.vitals) {
      if (campaignLethal(state, p, live, events)) eliminated.push(p.id);
      continue;
    }

    // Protection layers: ONE layer absorbs every lethal event of this tick (so one explosion frame can
    // never eat the Okada, the Armour and the life at once); the Okada goes first, then Armour.
    const layer = live.some((h) => h.terminal) ? null : p.mounted ? 'okada' : p.armour > 0 ? 'armour' : null;
    if (layer) {
      if (layer === 'okada') p.mounted = false;
      else p.armour--;
      for (const h of live) p.immune.push({ eventId: h.eventId, until: h.graceUntil });
      const shove = live.find((h) => h.relocate)?.relocate;
      if (shove) {
        p.x = p.stepFromX = shove.x;
        p.y = p.stepFromY = shove.y;
        p.stepRemaining = 0;
        p.slide = null;
        p.teleportPending = null;
      }
      if (layer === 'okada') events.push({ type: 'okadaBroken', playerId: p.id, x: p.x, y: p.y });
      events.push({ type: 'protectionBroken', playerId: p.id, layer, x: p.x, y: p.y });
      continue;
    }
    eliminate(
      state,
      p,
      live.map((h) => h.cause),
      events,
    );
    eliminated.push(p.id);
  }
  return eliminated;
}

/** What a lethal cause means for campaign health: who dealt it and which row of `config.campaign.damage` it is. */
function campaignSourceOf(cause: EliminationCause): { source: CampaignHitSource; byId: number | null } {
  switch (cause.kind) {
    case 'flame':
    case 'spectator':
      return { source: 'blast', byId: cause.ownerId };
    case 'vehicle':
      return { source: 'vehicle', byId: cause.ownerId };
    case 'campaign':
      return { source: cause.source, byId: cause.ownerId };
    default:
      return { source: 'hazard', byId: null }; // stage hazards, the crowd; crush and sudden death are terminal
  }
}

/**
 * Resolves this tick's live lethal hits on a campaign player as ONE campaign hit (so a single explosion frame can
 * never take two segments, and each lethal event can hurt once: its id is remembered for its grace window whatever the
 * outcome). The wound is the largest of the hits (`config.campaign.damage`); a terminal hit (the closing city with no
 * tile left, the Sudden Death blast) defeats through everything. Returns whether the player was defeated.
 */
function campaignLethal(state: GameState, p: Player, live: readonly LethalHit[], events: SimEvent[]): boolean {
  const table = campaignConfig(state.config).damage;
  const causes = live.map((h) => h.cause);
  const terminal = live.some((h) => h.terminal || h.cause.kind === 'crush' || h.cause.kind === 'suddenDeath');
  const wound = (s: { source: CampaignHitSource }): number => table[s.source as keyof typeof table] ?? 0;
  let best = campaignSourceOf(causes[0]!);
  for (const c of causes) {
    const s = campaignSourceOf(c);
    if (wound(s) > wound(best)) best = s;
  }
  const hit: CampaignHit = {
    victimId: p.id,
    byId: best.byId,
    source: best.source,
    damage: wound(best),
    dazeTicks: 0,
    knockback: null,
  };
  const result = applyCampaignHit(state, hit, events, { causes, terminal });
  if (result === 'defeated') return true;
  for (const h of live) p.immune.push({ eventId: h.eventId, until: h.graceUntil }); // one event, one chance
  return false;
}
