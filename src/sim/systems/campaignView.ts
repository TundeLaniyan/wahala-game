/**
 * Pure read-only views for the campaign HUD and the renderer (decision CC5, docs/CAMPAIGN_COMBAT.md). They read the
 * state only: no rules, no events. The HUD and the renderer must use these instead of reaching into `Player.vitals`.
 */
import { DIR_VEC, tileAt } from '../grid';
import { campaignConfig } from '../config';
import type { EnemyKind } from '../campaign/types';
import { ENEMY_KINDS } from '../data/enemies';
import type { GameState, Player } from '../types';
import { Tile } from '../types';
import { isCampaignInvulnerable } from './campaignDamage';

/** Everything an enemy's health bar or pips need. */
export interface EnemyHealthView {
  hp: number;
  maxHp: number;
  kind: EnemyKind | null;
  dazed: boolean;
  /** Lost a segment within `config.campaign.bar.recentTicks` (drives the flash and the "recently hurt" bar). */
  recentlyHurt: boolean;
  /**
   * Draw the bar this frame. True only for a boss / lieutenant, or an enemy that the human is targeting (adjacent or
   * faced in a clear line), that lost a segment in the last 3 s, or that stands within 3 tiles of the human. Never
   * permanent for every enemy.
   */
  showBar: boolean;
}

/** The player's own health, protection layers and lives. */
export interface PlayerVitalsView {
  hp: number;
  maxHp: number;
  armour: number;
  okada: boolean;
  /** Recovery frames (or spawn protection) are running: the player flashes and ordinary hits are ignored. */
  invulnerable: boolean;
  /** Campaign lives (the mission runtime's); null where no mission runs. */
  lives: { used: number; max: number; left: number } | null;
}

/** The human: the first seat that is neither a bot nor an enemy (seat 0 in every mission). */
export function humanPlayerId(state: Pick<GameState, 'players'>): number {
  return state.players.find((p) => !p.isBot && p.enemyKind === undefined)?.id ?? 0;
}

/** Is `target` the one the human is fighting: adjacent, or faced along a clear line within `aimTiles`? */
function targetedBy(state: GameState, human: Player, target: Player): boolean {
  const aim = campaignConfig(state.config).bar.aimTiles;
  const dist = Math.abs(human.x - target.x) + Math.abs(human.y - target.y);
  if (dist === 1) return true;
  const v = DIR_VEC[human.facing];
  for (let k = 1; k <= aim; k++) {
    const x = human.x + v.dx * k;
    const y = human.y + v.dy * k;
    if (x === target.x && y === target.y) return true;
    if (tileAt(state, x, y) !== Tile.Empty) return false; // a wall or crate ends the line
  }
  return false;
}

export function enemyHealthView(state: GameState, id: number): EnemyHealthView | null {
  const p = state.players[id];
  const v = p?.vitals;
  if (!p || !v) return null;
  const cfg = campaignConfig(state.config).bar;
  const recentlyHurt = state.tick - v.lastHitTick <= cfg.recentTicks;
  const kind = p.enemyKind ?? null;
  const human = state.players[humanPlayerId(state)];
  let showBar = false;
  if (p.alive && human && human.id !== p.id) {
    const near = Math.abs(human.x - p.x) + Math.abs(human.y - p.y) <= cfg.nearTiles;
    showBar =
      (kind !== null && ENEMY_KINDS[kind].bossBar) ||
      recentlyHurt ||
      near ||
      (human.alive && targetedBy(state, human, p));
  }
  return {
    hp: v.hp,
    maxHp: v.maxHp,
    kind,
    dazed: state.tick < p.dazedUntil,
    recentlyHurt,
    showBar,
  };
}

export function playerVitalsView(state: GameState, id: number): PlayerVitalsView | null {
  const p = state.players[id];
  const v = p?.vitals;
  if (!p || !v) return null;
  const m = state.mission;
  return {
    hp: v.hp,
    maxHp: v.maxHp,
    armour: p.armour,
    okada: p.mounted,
    invulnerable: p.alive && isCampaignInvulnerable(state, p),
    lives: m ? { used: m.livesUsed, max: m.livesMax, left: Math.max(0, m.livesMax - m.livesUsed) } : null,
  };
}
