/**
 * Pure rules of the BOSS FIGHT feedback (decisions BH1-BH6, docs/DECISIONS.md): what the board shows when the sim's boss
 * events arrive, and the one thing the sim leaves unsaid - a blast that reaches a SHIELDED boss does nothing and
 * emits no event, so the view recognises it from the flames (the same tile test lethality uses) and shows a cold
 * "blocked" spark instead of a hit. Presentation only: every number is the sim's (`bossHit.hitsLeft`, the flames);
 * nothing here decides damage. Tested without WebGL (tests/render/boss-feedback.test.ts).
 */
import type { GameState } from '../../sim';

export const BOSS_COLORS = {
  /** A real hit: the same hot gold the exposed window uses, so "exposed -> hit" reads as one story. */
  hit: 0xffe14a,
  hitCore: 0xffffff,
  hitRing: 0xff5a3c,
  /** The shield: cold blue, the colour of the bubble and of every "protected" cue. */
  shield: 0x4aa8ff,
  shieldSpark: 0xbfe6ff,
  /** The shield dropping (a window opens): gold shards, then the ring takes over. */
  exposed: 0xffd23a,
  /** Defeat: white-hot flash with an orange ring, bigger than any hit. */
  defeat: 0xffffff,
  defeatRing: 0xff8a1a,
} as const;

export type BossFxKind = 'hit' | 'shieldUp' | 'shieldDown' | 'blocked' | 'defeated';

export interface BossFx {
  /** Flash size in tiles and its life in seconds. */
  flashSize: number;
  flashLife: number;
  flashColor: number;
  /** Shock rings (tiles, colour); the second one is optional. */
  ring: number;
  ringColor: number;
  ring2: number;
  ring2Color: number;
  /** Sparkle colour (0 = none). */
  spark: number;
  /** Camera shake trauma (the shake budget bounds it; touch and reduced motion switch it off). */
  shake: number;
  /** Seconds the boss marker's ring runs `tint` instead of its state colour (the "struck" beat). */
  ringBeat: number;
  tint: number;
  /** A big dust / smoke burst (defeat only). */
  smoke: boolean;
}

const NONE = 0;

export const BOSS_FX: Readonly<Record<BossFxKind, BossFx>> = {
  hit: {
    flashSize: 3.2,
    flashLife: 0.34,
    flashColor: BOSS_COLORS.hit,
    ring: 2.4,
    ringColor: BOSS_COLORS.hitRing,
    ring2: 1.5,
    ring2Color: BOSS_COLORS.hitCore,
    spark: BOSS_COLORS.hit,
    shake: 0.22,
    ringBeat: 0.5,
    tint: BOSS_COLORS.hitCore,
    smoke: false,
  },
  shieldUp: {
    flashSize: 2,
    flashLife: 0.25,
    flashColor: BOSS_COLORS.shield,
    ring: 1.9,
    ringColor: BOSS_COLORS.shield,
    ring2: NONE,
    ring2Color: NONE,
    spark: NONE,
    shake: 0,
    ringBeat: 0.35,
    tint: BOSS_COLORS.shield,
    smoke: false,
  },
  shieldDown: {
    flashSize: 2.4,
    flashLife: 0.28,
    flashColor: BOSS_COLORS.exposed,
    ring: 2.2,
    ringColor: BOSS_COLORS.exposed,
    ring2: NONE,
    ring2Color: NONE,
    spark: BOSS_COLORS.exposed,
    shake: 0,
    ringBeat: 0.35,
    tint: BOSS_COLORS.exposed,
    smoke: false,
  },
  blocked: {
    flashSize: 1.9,
    flashLife: 0.3,
    flashColor: BOSS_COLORS.shieldSpark,
    ring: 1.7,
    ringColor: BOSS_COLORS.shield,
    ring2: NONE,
    ring2Color: NONE,
    spark: BOSS_COLORS.shieldSpark,
    shake: 0,
    ringBeat: 0.3,
    tint: BOSS_COLORS.shieldSpark,
    smoke: false,
  },
  defeated: {
    flashSize: 4.4,
    flashLife: 0.5,
    flashColor: BOSS_COLORS.defeat,
    ring: 3.6,
    ringColor: BOSS_COLORS.defeatRing,
    ring2: 2.2,
    ring2Color: BOSS_COLORS.defeat,
    spark: BOSS_COLORS.hit,
    shake: 0.3,
    ringBeat: 0.8,
    tint: BOSS_COLORS.defeat,
    smoke: true,
  },
};

/**
 * The sim event -> effect mapping. A `bossShielded` of reason `start` (the fight begins shielded) draws nothing: only a
 * shield that CLOSES on a boss who was exposed is a beat worth showing.
 */
export function bossFxFor(
  e:
    | { type: 'bossHit' }
    | { type: 'bossExposed' }
    | { type: 'bossShielded'; reason: 'start' | 'phase' | 'expired' }
    | { type: 'bossDefeated' },
): BossFxKind | null {
  switch (e.type) {
    case 'bossHit':
      return 'hit';
    case 'bossExposed':
      return 'shieldDown';
    case 'bossShielded':
      return e.reason === 'start' ? null : 'shieldUp';
    case 'bossDefeated':
      return 'defeated';
  }
}

/**
 * Is a flame on the SHIELDED boss's tile right now (decision BH2)? Returns that flame's event id (so the view shows one
 * "blocked" spark per blast, not one per flame tile per frame) or null. Same tile test as `lethality.ts` (his tile, or
 * the tile he is stepping away from); a boss who is exposed, defeated or dead is never "blocking" anything.
 */
export function shieldBlockingFlame(state: GameState): number | null {
  const m = state.mission;
  if (!m || m.field || !m.boss.shielded || m.boss.defeated) return null;
  const boss = state.players[m.bossId];
  if (!boss || !boss.alive) return null;
  const leaving = boss.stepRemaining > 0 && boss.stepTotal > 0;
  for (const f of state.flames) {
    if (state.tick < f.startTick || state.tick >= f.endTick) continue;
    // the blast that just cost him a hit is still burning on his tile: he is immune to THAT blast (BX2), it is not a bounce
    if (boss.immune.some((i) => i.eventId === f.eventId && i.until > state.tick)) continue;
    if ((f.x === boss.x && f.y === boss.y) || (leaving && f.x === boss.stepFromX && f.y === boss.stepFromY))
      return f.eventId;
  }
  return null;
}

/**
 * How the boss's death plays (decision BH5), as time in seconds since he fell: he is flung up higher than a rival,
 * stays down (stars circling) and only then shrinks away, so the last beat of the fight is never a blink.
 * Returns the hop height (world units) and the share of the body scale left (1 = full size).
 */
export function bossDefeatPose(t: number, total: number): { lift: number; scale: number } {
  const air = 0.8;
  const lift = t < air ? 10 * t * (1 - t / air) : 0;
  const k = total > 0 ? t / total : 1;
  return { lift, scale: k > 0.82 ? Math.max(0, 1 - (k - 0.82) / 0.18) : 1 };
}
