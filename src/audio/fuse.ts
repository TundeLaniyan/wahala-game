/**
 * Fuse rattle/tick derived from `state.generators`. The app may call `handleEvents` every tick or
 * every frame, so timing uses the audio clock, not call counts: each timed generator gets a tick
 * whenever its personal schedule comes due, and the period shrinks as the fuse nears zero.
 * A global gap limits the overall tick density (many generators != machine-gun).
 */
import type { GameState } from '../sim';
import { clamp01 } from './rng';

export const FUSE_MAX_PERIOD_S = 0.5;
export const FUSE_MIN_PERIOD_S = 0.07;
/** Global minimum spacing between any two fuse ticks. */
export const FUSE_GLOBAL_GAP_S = 0.04;
const MAX_TICKS_PER_UPDATE = 2;

/** Seconds between ticks for a fuse with `frac` (1 = just lit, 0 = about to blow) remaining. */
export function fusePeriod(frac: number): number {
  return FUSE_MIN_PERIOD_S + (FUSE_MAX_PERIOD_S - FUSE_MIN_PERIOD_S) * Math.pow(clamp01(frac), 1.4);
}

export type FuseEmit = (urgency: number, tileX: number) => void;

export interface FuseTracker {
  update(state: Readonly<GameState>, now: number, emit: FuseEmit): void;
  reset(): void;
}

interface Entry {
  next: number;
  stamp: number;
}

export function createFuseTracker(): FuseTracker {
  const entries = new Map<number, Entry>();
  let stamp = 0;
  let lastEmit = -Infinity;

  return {
    update(state, now, emit) {
      stamp++;
      const fuse = state.config.generator.fuseTicks;
      let emitted = 0;
      for (const g of state.generators) {
        if (g.mode !== 'timed' || g.timer <= 0) continue;
        const frac = clamp01(g.timer / fuse);
        let e = entries.get(g.id);
        if (!e) {
          e = { next: now + fusePeriod(frac), stamp };
          entries.set(g.id, e);
        }
        e.stamp = stamp;
        if (now < e.next) continue;
        if (emitted < MAX_TICKS_PER_UPDATE && now - lastEmit >= FUSE_GLOBAL_GAP_S) {
          emit(1 - frac, g.x);
          lastEmit = now;
          emitted++;
        }
        e.next = now + fusePeriod(frac);
      }
      if (entries.size > state.generators.length || stamp % 30 === 0) {
        for (const [id, e] of entries) if (e.stamp !== stamp) entries.delete(id);
      }
    },
    reset() {
      entries.clear();
      lastEmit = -Infinity;
    },
  };
}
