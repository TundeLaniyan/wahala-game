/**
 * Campaign health for the HUD (docs/CAMPAIGN_TEXT_NARRATION.md, goal C; contract: src/sim/campaign/types.ts). Pure
 * and read-only: the sim decides who is hurt and how; these read combat-core's `playerVitalsView` / `enemyHealthView`
 * (src/sim/systems/campaignView.ts) and the sim's events and say it. No rules here.
 *
 * Nothing is silent (plan section 2): every outcome of a hit has a rail notice ("HIT BY BOTTLE", "ARMOUR USED",
 * "OKADA SAVED YOU", "DAZED BY BRICK"), and the meter flashes for `FLASH_TICKS` after a segment is lost.
 */
import { enemyHealthView, playerVitalsView } from '../sim';
import type { CampaignHitSource, EnemyKind, GameState, SimEvent } from '../sim';
import type { Toast } from './store';

/** Presentation timing (not balance): how long the meter flashes after a segment is lost. */
export const FLASH_TICKS = 36;

/** Boss and lieutenant kinds have the always-visible boss bar in the rail. */
export const isBossKind = (kind: EnemyKind): boolean => kind === 'boss' || kind === 'lieutenant';

export interface CampaignHud {
  hp: number;
  maxHp: number;
  /** Armour plates left (each absorbs one lethal event). */
  armour: number;
  /** The Okada mount is still under the player (it absorbs one lethal event). */
  okada: boolean;
  /** Campaign lives left and the most; null when the game has no lives (nothing to show). */
  lives: { left: number; max: number } | null;
  /** Hits are ignored right now (the recovery frames after a hit). */
  invulnerable: boolean;
  /** Seconds of invulnerability left (0 when not invulnerable). */
  invulnSeconds: number;
  /** The last damage taken and when (sim tick); null before the first. */
  lastHit: { source: CampaignHitSource; tick: number } | null;
  /** Ticks since that damage (null before the first): the cause text stays up for a few seconds. */
  sinceHit: number | null;
  /** A segment was lost in the last `FLASH_TICKS` ticks (drives the meter flash). */
  flash: boolean;
}

export interface EnemyHud {
  id: number;
  name: string;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  /** Targeted, recently damaged, near the player, or a boss: draw its bar. */
  showBar: boolean;
}

/** The local campaign player's health picture (from the sim's `playerVitalsView`); null in every normal match. */
export function buildCampaignHud(state: GameState, localId: number): CampaignHud | null {
  const view = playerVitalsView(state, localId);
  const v = state.players[localId]?.vitals;
  if (!view || !v) return null;
  const left = Math.max(0, v.invulnUntil - state.tick);
  return {
    hp: Math.max(0, Math.min(view.maxHp, view.hp)),
    maxHp: view.maxHp,
    armour: view.armour,
    okada: view.okada,
    lives: view.lives ? { left: view.lives.left, max: view.lives.max } : null,
    invulnerable: view.invulnerable,
    invulnSeconds: view.invulnerable ? Math.max(1, Math.ceil(left / 60)) : 0,
    lastHit:
      v.lastHitSource !== null && v.lastHitTick >= 0
        ? { source: v.lastHitSource, tick: v.lastHitTick }
        : null,
    sinceHit: v.lastHitTick >= 0 ? state.tick - v.lastHitTick : null,
    flash: v.lastHitTick >= 0 && state.tick - v.lastHitTick < FLASH_TICKS,
  };
}

/** Enemies whose health should be on screen, by the sim's `enemyHealthView` (bosses always; others targeted, hurt or near). */
export function buildEnemyHud(state: GameState, localId: number): EnemyHud[] {
  if (!state.players[localId]?.vitals) return [];
  const out: EnemyHud[] = [];
  for (const p of state.players) {
    if (p.id === localId || !p.alive || !p.enemyKind) continue;
    const h = enemyHealthView(state, p.id);
    if (h?.kind && h.showBar)
      out.push({
        id: p.id,
        name: p.name,
        kind: h.kind,
        hp: Math.max(0, h.hp),
        maxHp: h.maxHp,
        showBar: true,
      });
  }
  // bosses first (the rail's boss bar), then by id: a stable order
  return out.sort((a, b) => Number(isBossKind(b.kind)) - Number(isBossKind(a.kind)) || a.id - b.id);
}

const SOURCE_LABEL: Record<CampaignHitSource, string> = {
  punch: 'PUNCH',
  bottle: 'BOTTLE',
  brick: 'BRICK',
  stone: 'STONE',
  tool: 'THROWN TOOL',
  blast: 'BLAST',
  vehicle: 'VEHICLE',
  hazard: 'HAZARD',
  player: 'A RIVAL',
  trap: 'FLOOR TRAP',
};

/** "BOTTLE", "FLOOR TRAP" ... : what hurt the player, in the rail's capitals. */
export const sourceLabel = (source: CampaignHitSource): string => SOURCE_LABEL[source];

type Notice = Pick<Toast, 'text' | 'tone'> & { ttlMs?: number };

/**
 * The rail notice for a campaign hit on the local player. Armour / Okada outcomes are worded by the existing
 * `protectionBroken` notice (combatNotices.ts) when the same batch of events carries it, so they never show twice;
 * a hit that only blocks nothing visible (the recovery frames) stays quiet: the invulnerability chip says it.
 */
export function campaignHitNotice(
  e: Extract<SimEvent, { type: 'campaignHit' }>,
  batch: readonly SimEvent[],
  localId: number,
  armourLeft: number,
): Notice | null {
  if (e.victimId !== localId) return null;
  const cause = sourceLabel(e.source);
  switch (e.result) {
    case 'damaged':
      return { text: `HIT BY ${cause} · ${e.hpAfter}/${e.maxHp} LEFT`, tone: 'bad', ttlMs: 2600 };
    case 'dazed':
      return { text: `DAZED BY ${cause}`, tone: 'bad', ttlMs: 2200 };
    case 'blockedArmour':
      return batch.some(
        (o) => o.type === 'protectionBroken' && o.playerId === localId && o.layer === 'armour',
      )
        ? null
        : {
            text: armourLeft > 0 ? `ARMOUR USED · ${armourLeft} LEFT` : 'ARMOUR USED',
            tone: 'good',
            ttlMs: 3000,
          };
    case 'blockedOkada':
      return batch.some((o) => o.type === 'protectionBroken' && o.playerId === localId && o.layer === 'okada')
        ? null
        : { text: 'OKADA SAVED YOU', tone: 'good', ttlMs: 3000 };
    case 'defeated':
      return { text: `DOWN: ${cause}`, tone: 'bad', ttlMs: 2800 };
    case 'invulnerable':
      return null;
  }
}
