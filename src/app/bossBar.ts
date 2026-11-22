/**
 * What the boss bar remembers between frames (decisions BH1-BH3, docs/DECISIONS.md): WHEN the last real hit landed, when
 * a blast bounced off the shield and when he fell, so the bar can drain / flash / pulse for a moment. A view diff of the
 * sim's own events - the bar's VALUE is always the sim's `MissionView.boss.hitsLeft`; this only times the cue, and it
 * learns about a hit from the `bossHit` / `bossDefeated` events and nothing else (a bar can never drop without damage).
 */
import type { GameState, SimEvent } from '../sim';
import { shieldBlockingFlame } from '../render/views/bossFeedback';

/** How long (ticks) the bar shows a hit, a bounce, and the fall (0.9 s / 0.6 s). */
export const BOSS_HIT_TICKS = 54;
export const BOSS_BLOCK_TICKS = 36;

export interface BossBarMemory {
  /** The match this belongs to (a new match starts a new memory). */
  game: GameState | null;
  hit: { tick: number; hitsLeft: number } | null;
  blocked: { tick: number; eventId: number } | null;
}

export const NO_BOSS_MEMORY: BossBarMemory = { game: null, hit: null, blocked: null };

/** What the HUD needs from the memory this frame: ticks since each cue (null = none recent). */
export interface BossFeedback {
  /** Ticks since the last real hit, and the hits the boss had left after it (0 = that hit was the last). */
  sinceHit: number | null;
  hitsLeft: number | null;
  /** Ticks since a blast bounced off his shield. */
  sinceBlocked: number | null;
}

/** Folds one frame's events (and the flames on a shielded boss) into the memory; the same object when nothing changed. */
export function trackBossBar(
  mem: BossBarMemory,
  events: readonly SimEvent[],
  state: GameState,
): BossBarMemory {
  let next = mem.game === state ? mem : { ...NO_BOSS_MEMORY, game: state };
  if (!state.mission) return next;
  const set = (patch: Partial<BossBarMemory>): void => {
    next = { ...next, ...patch };
  };
  for (const e of events) {
    if (e.type === 'bossHit') set({ hit: { tick: state.tick, hitsLeft: e.hitsLeft } });
    else if (e.type === 'bossDefeated') set({ hit: { tick: state.tick, hitsLeft: 0 } });
  }
  const flame = shieldBlockingFlame(state);
  if (flame !== null && flame !== next.blocked?.eventId)
    set({ blocked: { tick: state.tick, eventId: flame } });
  return next;
}

/** The cue timings at `tick`; null outside a boss mission or when nothing happened recently. */
export function bossFeedback(mem: BossBarMemory, tick: number): BossFeedback | null {
  const since = (at: number | undefined, window: number): number | null => {
    if (at === undefined) return null;
    const ago = tick - at;
    return ago >= 0 && ago < window ? ago : null;
  };
  const sinceHit = since(mem.hit?.tick, BOSS_HIT_TICKS);
  const sinceBlocked = since(mem.blocked?.tick, BOSS_BLOCK_TICKS);
  if (sinceHit === null && sinceBlocked === null) return null;
  return { sinceHit, hitsLeft: sinceHit === null ? null : (mem.hit?.hitsLeft ?? null), sinceBlocked };
}

type Notice = { text: string; tone: 'good' | 'bad' | 'info'; ttlMs?: number };

/**
 * The rail notice of a boss event: a real hit says how many are left, the last one says he is down, and a window that ran
 * out says the shield is back (the one boss event that is bad news). The phase shield after a hit and the shield at the start
 * say nothing: the bar shows them.
 */
export function bossNotice(
  e: Extract<SimEvent, { type: 'bossHit' | 'bossShielded' | 'bossDefeated' }>,
): Notice | null {
  switch (e.type) {
    case 'bossHit':
      return { text: `BOSS HIT · ${e.hitsLeft}/${e.maxHits} LEFT`, tone: 'good', ttlMs: 3000 };
    case 'bossDefeated':
      return { text: e.defeat === 'ousted' ? 'BOSS OUSTED!' : 'BOSS DOWN!', tone: 'good', ttlMs: 3400 };
    case 'bossShielded':
      return e.reason === 'expired'
        ? { text: 'TOO SLOW: SHIELD IS BACK UP', tone: 'bad', ttlMs: 3000 }
        : null;
  }
}
