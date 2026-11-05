/**
 * The campaign health meter as plain data (unit-tested without React): health segments, the protection chips
 * (Armour layers, Okada, lives, the recovery frames) with what each looks like when used up, the cause line
 * ("HIT BY BOTTLE") and the boss bar. All of it is read from the HUD snapshot (`CampaignHud`, `EnemyHud`); no rules.
 */
import { isBossKind, sourceLabel } from '../app/campaignHud';
import type { CampaignHud, EnemyHud } from '../app/campaignHud';
import type { MissionView } from '../sim';

/** The cause line stays up this long after a hit (ticks, 3.5 s). */
export const CAUSE_TICKS = 210;
/** A boss bar never draws more than this many segments (a 20 hp boss shows 10, each worth two). */
export const BOSS_SEGMENTS_MAX = 10;

export interface HealthSegment {
  index: number;
  /** `full`; `empty` (lost earlier); `lost` (lost just now, flashes). */
  state: 'full' | 'empty' | 'lost';
}

export interface ProtectionChip {
  kind: 'armour' | 'okada' | 'lives' | 'invulnerable';
  /** Visible word: ARMOUR, OKADA, LIVES, SAFE. */
  label: string;
  /** Visible value: a count, "READY", "USED", "2/3", "1s". */
  value: string;
  /** `ready`: it will absorb; `used`: consumed (struck through, dim); `active`: running now; `low`: one life left. */
  state: 'ready' | 'used' | 'active' | 'low';
  /** Spoken / hover text. */
  title: string;
}

/** The most protection seen so far in a mission: a consumed layer stays on the rail, struck through. */
export interface SeenProtection {
  armour: number;
  okada: boolean;
}

export const NOTHING_SEEN: SeenProtection = { armour: 0, okada: false };

/** Folds the current snapshot into what has been seen (never decreases). */
export function seeProtection(seen: SeenProtection, c: CampaignHud): SeenProtection {
  const next = { armour: Math.max(seen.armour, c.armour), okada: seen.okada || c.okada };
  return next.armour === seen.armour && next.okada === seen.okada ? seen : next;
}

export interface HealthModel {
  segments: HealthSegment[];
  /** "3 / 4" */
  text: string;
  low: boolean;
  /** The meter flashes: a segment was lost just now. */
  flash: boolean;
  chips: ProtectionChip[];
  /** "HIT BY BOTTLE" while recent, else null. */
  cause: string | null;
  /** One sentence for screen readers. */
  aria: string;
}

export function healthModel(c: CampaignHud, seen: SeenProtection = NOTHING_SEEN): HealthModel {
  const seenNow = seeProtection(seen, c);
  const segments: HealthSegment[] = Array.from({ length: c.maxHp }, (_, i) => ({
    index: i,
    // the segment lost last is the first empty one: it flashes while `flash` is on
    state: i < c.hp ? 'full' : c.flash && i === c.hp ? 'lost' : 'empty',
  }));
  const chips: ProtectionChip[] = [];
  for (let i = 0; i < seenNow.armour; i++)
    chips.push({
      kind: 'armour',
      label: 'ARMOUR',
      value: i < c.armour ? 'READY' : 'USED',
      state: i < c.armour ? 'ready' : 'used',
      title: i < c.armour ? 'Armour plate: absorbs one lethal hit' : 'Armour plate used',
    });
  if (seenNow.okada)
    chips.push({
      kind: 'okada',
      label: 'OKADA',
      value: c.okada ? 'READY' : 'USED',
      state: c.okada ? 'ready' : 'used',
      title: c.okada ? 'Okada: absorbs one lethal hit' : 'The Okada took a hit and is gone',
    });
  if (c.lives)
    chips.push({
      kind: 'lives',
      label: 'LIVES',
      value: `${c.lives.left}/${c.lives.max}`,
      state: c.lives.left <= 1 ? 'low' : 'ready',
      title: `${c.lives.left} of ${c.lives.max} lives left`,
    });
  if (c.invulnerable)
    chips.push({
      kind: 'invulnerable',
      label: 'SAFE',
      value: `${Math.max(1, c.invulnSeconds)}s`,
      state: 'active',
      title: 'Recovering: hits are ignored for a moment',
    });
  const cause =
    c.lastHit && c.sinceHit !== null && c.sinceHit < CAUSE_TICKS
      ? `HIT BY ${sourceLabel(c.lastHit.source)}`
      : null;
  const layers = c.armour + (c.okada ? 1 : 0);
  return {
    segments,
    text: `${c.hp} / ${c.maxHp}`,
    low: c.hp > 0 && c.hp <= 1 && c.maxHp > 1,
    flash: c.flash,
    chips,
    cause,
    aria: `Health ${c.hp} of ${c.maxHp}${layers > 0 ? `, ${layers} protection ${layers === 1 ? 'layer' : 'layers'}` : ''}${
      c.lives ? `, ${c.lives.left} ${c.lives.left === 1 ? 'life' : 'lives'} left` : ''
    }`,
  };
}

export interface BossBarModel {
  id: number;
  name: string;
  kindLabel: 'BOSS' | 'LIEUTENANT' | 'BOSS DEFENCES';
  /** Mission bosses: what the bar is showing right now (hit-point bosses leave it undefined). */
  state?: 'shielded' | 'exposed' | 'defeated';
  /** Segments drawn, and how many are full. */
  segments: number;
  filled: number;
  text: string;
}

/** The boss bars of the rail: only boss and lieutenant kinds, bosses first. */
export function bossBars(enemies: readonly EnemyHud[]): BossBarModel[] {
  return enemies
    .filter((e) => isBossKind(e.kind) && e.maxHp > 0)
    .map((e) => {
      const segments = Math.min(BOSS_SEGMENTS_MAX, e.maxHp);
      return {
        id: e.id,
        name: e.name,
        kindLabel: e.kind === 'boss' ? ('BOSS' as const) : ('LIEUTENANT' as const),
        segments,
        // a boss with any health left always shows at least one segment
        filled: e.hp <= 0 ? 0 : Math.max(1, Math.ceil((e.hp / e.maxHp) * segments)),
        text: `${e.hp} / ${e.maxHp}`,
      };
    });
}

/**
 * The boss bar of a BOSS MISSION (docs/CAMPAIGN_EXPANSION_STATUS.md): those bosses are not hit-point fights, they fall to
 * one blast once the objective exposes them, so the bar shows what really protects them: one segment per defence phase.
 * Full = all three defences up (shielded); a segment goes as each phase is cleared; the last one flashes while the boss is
 * exposed; empty = defeated. Pure read of the mission view; null outside a boss mission or when a hit-point boss bar
 * already shows this boss.
 */
export function missionBossBar(
  view: MissionView | null,
  alreadyShown: readonly BossBarModel[] = [],
): BossBarModel | null {
  if (!view || alreadyShown.some((b) => b.kindLabel === 'BOSS')) return null;
  const total = view.phaseCount;
  const state = view.boss.defeated ? 'defeated' : view.boss.exposed ? 'exposed' : 'shielded';
  // phase = the active phase index (0, 1, 2): that many defences are already down; exposed = only the last one is left
  const filled = state === 'defeated' ? 0 : state === 'exposed' ? 1 : Math.max(1, total - view.phase);
  const label =
    state === 'defeated'
      ? 'DOWN'
      : state === 'exposed'
        ? 'EXPOSED: NOW!'
        : `${filled} OF ${total} DEFENCES UP`;
  return {
    id: view.boss.playerId,
    name: view.boss.name ?? 'The boss',
    kindLabel: 'BOSS DEFENCES',
    state,
    segments: total,
    filled,
    text: label,
  };
}
