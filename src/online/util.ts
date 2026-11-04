import type { AuthToken } from './types';

/**
 * Small pure helpers: a token-bucket rate limiter (injectable clock) and FNV-1a hashing.
 */

export interface RateLimiter {
  /** Takes one token; returns 0 when allowed, else the milliseconds until one is available. */
  take(nowMs: number): number;
}

/** `perSecond` sustained rate with `burst` tokens of headroom. */
export function createRateLimiter(perSecond: number, burst: number): RateLimiter {
  let tokens = burst;
  let last = -1;
  return {
    take(nowMs) {
      if (last < 0) last = nowMs;
      tokens = Math.min(burst, tokens + ((nowMs - last) / 1000) * perSecond);
      last = nowMs;
      if (tokens >= 1) {
        tokens -= 1;
        return 0;
      }
      return Math.ceil(((1 - tokens) / perSecond) * 1000);
    },
  };
}

/** 32-bit FNV-1a of a string. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A redacting token wrapper: the value only leaves through `reveal()`. */
export function makeOpaqueToken(value: string, expiresAt: number): AuthToken {
  return {
    expiresAt,
    reveal: () => value,
    toJSON: () => '[redacted]',
    toString: () => '[redacted]',
  };
}
