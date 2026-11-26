/**
 * Authentication of the MATCH SERVER (not a player) calling the internal endpoints. Each request carries
 * `X-Wahala-Timestamp` (ms) and `X-Wahala-Signature` = hex HMAC-SHA256(secret, `${timestamp}.${METHOD}.${path}.${rawBody}`).
 * Stale timestamps (> 5 minutes either way) are refused, so a captured request cannot be replayed later; results are also
 * idempotent per match id. The secret is shared out-of-band and never leaves server-side environment configuration.
 */
import { createHmac } from 'node:crypto';
import { ApiError } from '../errors';
import { safeEqual } from '../util/secrets';

export const SERVICE_SKEW_MS = 5 * 60_000;

export function signServiceRequest(
  secret: string,
  ts: number,
  method: string,
  path: string,
  body: string,
): string {
  return createHmac('sha256', secret).update(`${ts}.${method.toUpperCase()}.${path}.${body}`).digest('hex');
}

export function verifyServiceRequest(
  secret: string,
  now: Date,
  req: {
    method: string;
    path: string;
    body: string;
    timestamp: string | undefined;
    signature: string | undefined;
  },
): void {
  if (!secret) throw new ApiError('unavailable', 'internal endpoints are not enabled');
  const ts = Number(req.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now.getTime() - ts) > SERVICE_SKEW_MS || !req.signature)
    throw new ApiError('unauthenticated', 'bad service signature');
  if (!safeEqual(signServiceRequest(secret, ts, req.method, req.path, req.body), req.signature))
    throw new ApiError('unauthenticated', 'bad service signature');
}
