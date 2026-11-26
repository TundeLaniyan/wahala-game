/**
 * The match server's key source: the platform's published PUBLIC keys (`/.well-known/jwks.json`), fetched lazily, cached, and
 * refetched at most every `cooldown` after a failure. jose keeps the last good key set when a refetch fails, so a platform outage
 * never stops tickets from verifying (they verify offline against the cached key). Kept here so `jose` stays a dependency of this
 * package only; the match server imports it with `verify.ts`.
 */
import { createRemoteJWKSet } from 'jose';
import type { JWTVerifyGetKey } from 'jose';

export function remoteHandoffKeys(jwksUrl: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(jwksUrl), {
    timeoutDuration: 2000,
    cooldownDuration: 10_000,
    cacheMaxAge: 5 * 60_000,
  });
}
