/**
 * Token buckets keyed by a string (`ip:1.2.3.4`, `player:<id>`, ...). In memory and bounded: fine for one process; with
 * several instances the `RateLimiter` interface is the seam for a shared store (Redis) without touching callers.
 */
import type { Clock } from '../util/clock';

export interface Rate {
  /** Bucket size: how many at once. */
  burst: number;
  /** Refill per minute. */
  perMin: number;
}

export interface RateLimiter {
  /** Takes one token. `ok: false` carries how long to wait. */
  take(key: string, rate: Rate): { ok: true } | { ok: false; retryAfterMs: number };
}

interface Bucket {
  tokens: number;
  at: number;
}

export function createRateLimiter(clock: Clock, maxKeys = 100_000): RateLimiter {
  const buckets = new Map<string, Bucket>();
  return {
    take(key, rate) {
      const now = clock().getTime();
      let b = buckets.get(key);
      if (!b) {
        if (buckets.size >= maxKeys) {
          // bounded memory: drop the oldest entries (a full bucket refills anyway, so this only ever forgives)
          let n = 0;
          for (const k of buckets.keys()) {
            buckets.delete(k);
            if (++n >= Math.ceil(maxKeys / 10)) break;
          }
        }
        b = { tokens: rate.burst, at: now };
        buckets.set(key, b);
      }
      const perMs = rate.perMin / 60_000;
      b.tokens = Math.min(rate.burst, b.tokens + (now - b.at) * perMs);
      b.at = now;
      if (b.tokens >= 1) {
        b.tokens -= 1;
        return { ok: true };
      }
      return { ok: false, retryAfterMs: Math.ceil((1 - b.tokens) / perMs) };
    },
  };
}

/** The named classes routes use. Every number is a first estimate to be tuned with real traffic. */
export const RATES = {
  /** Anonymous account creation per address: the main abuse surface of a guest-first system. */
  guestCreate: { burst: 5, perMin: 6 },
  /** Sign-in / refresh attempts per address. */
  auth: { burst: 20, perMin: 30 },
  /** Any authenticated read. */
  read: { burst: 120, perMin: 240 },
  /** Any authenticated write. */
  write: { burst: 30, perMin: 60 },
  /** Friend requests and invitations (spam / harassment vector). */
  social: { burst: 10, perMin: 10 },
  /** Joining a party by code: guesses are the abuse (31^8 codes, so a slow rate is plenty for honest use). */
  partyJoin: { burst: 6, perMin: 6 },
  /** Reports (abuse of the report button is itself abuse). */
  report: { burst: 5, perMin: 5 },
  /** Preset quick-chat / pings / emotes. */
  signal: { burst: 8, perMin: 40 },
  /** Anything per address before authentication is known. */
  ip: { burst: 200, perMin: 600 },
} as const satisfies Record<string, Rate>;
