/**
 * Pure rules of the damage feedback (docs/RAID_PRESENTATION.md): WHEN an enemy shows its health pips and WHAT each
 * hit result looks like. Presentation only - the numbers come from the sim (`Player.vitals`, `campaignHit`); nothing here
 * decides damage. Tested without WebGL.
 */
import type { CampaignHitResult, EnemyAttackKind } from '../../sim';

/** Never more pips than this per enemy (a tougher one scales its pips down instead). */
export const PIP_MAX = 8;
/** Boss and lieutenant bars belong to the HUD rail (story-hud); regular enemies get world pips. */
export const RAIL_BAR_KINDS: ReadonlySet<string> = new Set(['boss', 'lieutenant']);

/**
 * Do this enemy's world pips show? The WHEN is the sim's `enemyHealthView(...).showBar` (targeted, hurt in the last 3 s,
 * or near - the same rule the HUD uses, so the two never drift); this adds the presentation rules: never for a boss or
 * lieutenant (their bar is in the HUD rail), never for the dead.
 */
export function pipsShown(view: { showBar: boolean; kind: string | null } | null, alive: boolean): boolean {
  if (!view || !alive || !view.showBar) return false;
  return !(view.kind && RAIL_BAR_KINDS.has(view.kind));
}

/** Filled / total pips (a tough enemy's pips are scaled down to `PIP_MAX`, never fewer filled than 1 while alive). */
export function pipCounts(hp: number, maxHp: number): { filled: number; total: number } {
  const total = Math.max(1, Math.min(PIP_MAX, Math.round(maxHp)));
  if (maxHp <= PIP_MAX) return { filled: Math.max(0, Math.min(total, Math.round(hp))), total };
  const f = Math.ceil((Math.max(0, hp) / maxHp) * total);
  return { filled: hp > 0 ? Math.max(1, f) : 0, total };
}

/** Pip colour by remaining fraction: healthy green, hurt amber, one hit from gone red. Empty pips are dark. */
export function pipColor(filled: boolean, fraction: number): number {
  if (!filled) return 0x2a2e36;
  if (fraction > 0.66) return 0x5be37d;
  if (fraction > 0.34) return 0xffc233;
  return 0xff4a3d;
}

export type FeedbackKind = 'hit' | 'shield' | 'daze' | 'none';

export interface HitFeedback {
  kind: FeedbackKind;
  /** Colour of the flash. */
  color: number;
  /** Flash size in tiles. */
  size: number;
  /** Seconds the flash lives. */
  life: number;
  /** A small ring under the victim. */
  ring: boolean;
  /** Camera shake trauma for a hit on the local player (0 = none). */
  shake: number;
  /** The victim flinches (a short offset along the hit direction), in tiles. */
  jolt: number;
}

export const HIT_COLORS = {
  hit: 0xff5a3c,
  hitEnemy: 0xfff1c0,
  /** Armour and Okada: a distinct white-blue spark, never the red of a hit. */
  shield: 0xbfe6ff,
  daze: 0xffe14a,
} as const;

/**
 * What a resolved hit looks like (`campaignHit.result`). Every outcome has its own cue so the player can tell why
 * they lost a segment, were only dazed, or were saved by a shield:
 * damaged = red/cream flash + ring + flinch; dazed = yellow flash + flinch (the stars are the daze pose);
 * blockedArmour / blockedOkada = white-blue spark, no flinch, no shake; invulnerable = nothing (the flicker is the cue).
 */
export function hitFeedback(result: CampaignHitResult, victimIsLocal: boolean): HitFeedback {
  switch (result) {
    case 'damaged':
    case 'defeated':
      return {
        kind: 'hit',
        color: victimIsLocal ? HIT_COLORS.hit : HIT_COLORS.hitEnemy,
        size: result === 'defeated' ? 2.2 : 1.6,
        life: 0.22,
        ring: true,
        shake: victimIsLocal ? 0.18 : 0.06,
        jolt: 0.1,
      };
    case 'dazed':
      return {
        kind: 'daze',
        color: HIT_COLORS.daze,
        size: 1.3,
        life: 0.2,
        ring: false,
        shake: victimIsLocal ? 0.1 : 0,
        jolt: 0.07,
      };
    case 'blockedArmour':
    case 'blockedOkada':
      return {
        kind: 'shield',
        color: HIT_COLORS.shield,
        size: 1.9,
        life: 0.3,
        ring: true,
        shake: 0,
        jolt: 0,
      };
    case 'invulnerable':
      return { kind: 'none', color: 0xffffff, size: 0, life: 0, ring: false, shake: 0, jolt: 0 };
  }
}

/** The jolt offset (tiles) `t` seconds after a hit: a quick shove along the hit direction that settles. 0 after `JOLT_SECONDS`. */
export const JOLT_SECONDS = 0.2;
export function joltOffset(amount: number, t: number): number {
  if (t < 0 || t >= JOLT_SECONDS) return 0;
  const k = 1 - t / JOLT_SECONDS;
  return amount * k * k * Math.cos(t * 55);
}

export type ProjectileKind = EnemyAttackKind;

export interface ProjectileStyle {
  /** Spin (rad/s) while flying. */
  spin: number;
  /** Colour of the launch flash and the path preview. */
  cue: number;
  /** Peak height of the throw arc (world units). */
  arc: number;
  /** Debris / spark colour on a wall. */
  shatter: number;
}

export const PROJECTILE_STYLES: Record<ProjectileKind, ProjectileStyle> = {
  punch: { spin: 0, cue: 0xffffff, arc: 0, shatter: 0xcfcfcf },
  bottle: { spin: 16, cue: 0xbfffd0, arc: 0.45, shatter: 0x9fe8b0 },
  brick: { spin: 9, cue: 0xffb08a, arc: 0.35, shatter: 0xc2674a },
  stone: { spin: 7, cue: 0xdedede, arc: 0.3, shatter: 0xb8b8b8 },
  tool: { spin: 14, cue: 0xffd24a, arc: 0.4, shatter: 0xe0e0e0 },
};
/** A strong projectile (slow, a whole segment) is drawn with a red-hot cue. */
export const STRONG_CUE = 0xff3d2e;

export function cueColor(kind: ProjectileKind, strong: boolean): number {
  return strong ? STRONG_CUE : PROJECTILE_STYLES[kind].cue;
}

/**
 * Where a projectile is along its path. `start` is the tick it begins to move (after the telegraph), `elapsed` the ticks
 * since then. Returns the float index into `[from, ...path]` (0 = the thrower's tile, 1 = the first path tile ...),
 * clamped to the path end.
 */
export function pathProgress(elapsedTicks: number, stepTicks: number, pathLength: number): number {
  if (elapsedTicks <= 0 || stepTicks <= 0) return 0;
  return Math.min(pathLength, elapsedTicks / stepTicks);
}

/** The tick a projectile starts to move: the telegraph (`warnTicks`) comes BEFORE any movement, whichever way `launchTick` counts it. */
export function moveStartTick(eventTick: number, launchTick: number, warnTicks: number): number {
  return Math.max(launchTick, eventTick + warnTicks);
}

/** World-space point along `from` + `path` tiles for a float index (linear between tile centres). */
export function pointAlong(
  from: { x: number; y: number },
  path: readonly number[],
  width: number,
  index: number,
): { x: number; y: number } {
  const pts = [from, ...path.map((i) => ({ x: i % width, y: Math.floor(i / width) }))];
  const i = Math.max(0, Math.min(pts.length - 1, index));
  const a = pts[Math.floor(i)]!;
  const b = pts[Math.min(pts.length - 1, Math.floor(i) + 1)]!;
  const k = i - Math.floor(i);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** What a `projectileHit` result looks like at the landing point. */
export type ImpactKind = 'shatter' | 'spark' | 'flash' | 'thud' | 'puff';

export function impactFor(result: CampaignHitResult | 'wall' | 'blocked' | 'expired'): ImpactKind {
  switch (result) {
    case 'wall':
      return 'shatter';
    case 'blocked':
    case 'blockedArmour':
    case 'blockedOkada':
      return 'spark';
    case 'damaged':
    case 'dazed':
    case 'defeated':
      return 'flash';
    case 'invulnerable':
      return 'puff';
    case 'expired':
      return 'thud';
  }
}
