/**
 * Warning-band countdown ticks and remote-detonator blips, derived from `state.generators`.
 * The app may call `handleEvents` every tick or every frame, so timing uses the audio clock, not
 * call counts: each generator gets an event whenever its personal schedule comes due.
 *
 *  - timed generators: tick period shrinks as the fuse nears zero (this is the high "tick" that sits
 *    on top of the continuous putt-putt loop);
 *  - remote generators: a calm blip every ~1.4 s that quickens when the failsafe is about to fire.
 *
 * A global gap limits overall density (many generators != machine-gun).
 */
import type { GameState } from '../sim';
import { clamp01 } from './rng';

export const FUSE_MAX_PERIOD_S = 0.5;
export const FUSE_MIN_PERIOD_S = 0.07;
export const REMOTE_PERIOD_S = 1.4;
export const REMOTE_FAST_PERIOD_S = 0.45;
/** Global minimum spacing between any two ticks/blips. */
export const FUSE_GLOBAL_GAP_S = 0.04;
const MAX_PER_UPDATE = 2;

/** Seconds between ticks for a fuse with `frac` (1 = just lit, 0 = about to blow) remaining. */
export function fusePeriod(frac: number): number {
  return FUSE_MIN_PERIOD_S + (FUSE_MAX_PERIOD_S - FUSE_MIN_PERIOD_S) * Math.pow(clamp01(frac), 1.4);
}

export interface FuseEmission {
  mode: 'timed' | 'remote';
  /** 0 just lit .. 1 about to go. */
  urgency: number;
  tileX: number;
}
export type FuseEmit = (e: FuseEmission) => void;

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
      const failsafe = state.config.generator.remoteFailsafeTicks;
      let emitted = 0;
      for (const g of state.generators) {
        if ((g.mode !== 'timed' && g.mode !== 'remote') || g.timer <= 0) continue;
        const timed = g.mode === 'timed';
        const frac = clamp01(g.timer / (timed ? fuse : failsafe));
        const period = timed ? fusePeriod(frac) : frac < 0.25 ? REMOTE_FAST_PERIOD_S : REMOTE_PERIOD_S;
        let e = entries.get(g.id);
        if (!e) {
          e = { next: now + period, stamp };
          entries.set(g.id, e);
        }
        e.stamp = stamp;
        if (now < e.next) continue;
        if (emitted < MAX_PER_UPDATE && now - lastEmit >= FUSE_GLOBAL_GAP_S) {
          emit({ mode: g.mode, urgency: 1 - frac, tileX: g.x });
          lastEmit = now;
          emitted++;
        }
        e.next = now + period;
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
