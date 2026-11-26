/**
 * Sessions: opaque access + refresh tokens (256-bit random, stored as SHA-256 only).
 *   access  - 15 minutes, looked up per request (so revocation is immediate, not "when the JWT expires")
 *   refresh - sliding window (default 30 days) under a hard cap (default 365 days); ROTATED on every use.
 * Reuse detection: the previous refresh token is remembered; presenting it again means two parties hold copies, so the whole
 * session is revoked and the legitimate holder must sign in again (guests lose the account if they have no other device:
 * documented; upgrade to a registered account).
 */
import { ApiError } from '../errors';
import type { Queryable } from '../db/types';
import { audit } from '../audit';
import { DAY, MINUTE, addMs } from '../util/clock';
import { hashToken, newToken } from '../util/secrets';
import type { AgeGroup, AuthMethod, ClientPlatform, PlayerKind, Principal, Tokens } from './types';

export const ACCESS_TTL_MS = 15 * MINUTE;
/** A sensitive action (unlink, delete, change age band upward) needs a credential proof this recent. */
export const REAUTH_WINDOW_MS = 10 * MINUTE;

export interface SessionPolicy {
  refreshDays: number;
  sessionMaxDays: number;
}

interface SessionRow {
  id: string;
  player_id: string;
  access_expires_at: Date;
  refresh_expires_at: Date;
  absolute_expires_at: Date;
  last_used_at: Date;
  reauth_at: Date | null;
  auth_method: AuthMethod;
  revoked_at: Date | null;
  kind: PlayerKind;
  status: string;
  age_group: AgeGroup;
}

export async function createSession(
  q: Queryable,
  now: Date,
  policy: SessionPolicy,
  input: {
    playerId: string;
    authMethod: AuthMethod;
    platform: ClientPlatform;
    deviceLabel?: string | null;
    reauth: boolean;
  },
): Promise<Tokens> {
  const access = newToken('wa');
  const refresh = newToken('wr');
  const accessExpires = addMs(now, ACCESS_TTL_MS);
  const refreshExpires = addMs(now, policy.refreshDays * DAY);
  const r = await q.query<{ id: string }>(
    `INSERT INTO sessions (player_id, access_hash, access_expires_at, refresh_hash, refresh_expires_at, absolute_expires_at,
                           created_at, last_used_at, reauth_at, auth_method, client_platform, device_label)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11) RETURNING id`,
    [
      input.playerId,
      hashToken(access),
      accessExpires,
      hashToken(refresh),
      refreshExpires,
      addMs(now, policy.sessionMaxDays * DAY),
      now,
      input.reauth ? now : null,
      input.authMethod,
      input.platform,
      input.deviceLabel ?? null,
    ],
  );
  return {
    sessionId: r.rows[0]!.id,
    accessToken: access,
    accessExpiresAt: accessExpires.toISOString(),
    refreshToken: refresh,
    refreshExpiresAt: refreshExpires.toISOString(),
  };
}

const unauth = (): ApiError => new ApiError('unauthenticated', 'sign in again');

/** Resolves an access token to a principal, or throws. A suspended or deleted account never authenticates. */
export async function authenticate(q: Queryable, now: Date, accessToken: string): Promise<Principal> {
  if (typeof accessToken !== 'string' || !accessToken.startsWith('wa_') || accessToken.length > 200)
    throw unauth();
  const r = await q.query<SessionRow>(
    `SELECT s.id, s.player_id, s.access_expires_at, s.refresh_expires_at, s.absolute_expires_at, s.last_used_at, s.reauth_at,
            s.auth_method, s.revoked_at, p.kind, p.status, p.age_group
       FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.access_hash = $1`,
    [hashToken(accessToken)],
  );
  const s = r.rows[0];
  if (!s || s.revoked_at || s.access_expires_at <= now || s.absolute_expires_at <= now) throw unauth();
  if (s.status === 'deleted') throw unauth();
  if (s.status === 'suspended') throw new ApiError('forbidden', 'this account is suspended');
  // throttled bookkeeping: at most one write a minute per session
  if (now.getTime() - s.last_used_at.getTime() > MINUTE) {
    await q.query('UPDATE sessions SET last_used_at = $2 WHERE id = $1', [s.id, now]);
    await q.query('UPDATE players SET last_seen_at = $2 WHERE id = $1', [s.player_id, now]);
  }
  return {
    playerId: s.player_id,
    sessionId: s.id,
    kind: s.kind,
    ageGroup: s.age_group,
    authMethod: s.auth_method,
    reauthAt: s.reauth_at,
  };
}

/**
 * Rotates a refresh token. Returns new tokens (the old refresh token stays remembered as `prev_refresh_hash` for reuse
 * detection only). `revokeOnReuse` runs in its own statement; the caller must commit it even though it then throws.
 */
export async function refreshSession(
  q: Queryable,
  now: Date,
  policy: SessionPolicy,
  refreshToken: string,
): Promise<{ tokens: Tokens; playerId: string } | { reuse: { sessionId: string; playerId: string } }> {
  if (typeof refreshToken !== 'string' || !refreshToken.startsWith('wr_') || refreshToken.length > 200)
    throw unauth();
  const h = hashToken(refreshToken);
  const r = await q.query<SessionRow & { refresh_hash: string; prev_refresh_hash: string | null }>(
    `SELECT s.*, p.kind, p.status, p.age_group FROM sessions s JOIN players p ON p.id = s.player_id
      WHERE s.refresh_hash = $1 OR s.prev_refresh_hash = $1 FOR UPDATE OF s`,
    [h],
  );
  const s = r.rows[0];
  if (!s || s.revoked_at) throw unauth();
  if (s.prev_refresh_hash === h && s.refresh_hash !== h)
    return { reuse: { sessionId: s.id, playerId: s.player_id } };
  if (s.refresh_expires_at <= now || s.absolute_expires_at <= now || s.status !== 'active') throw unauth();
  const access = newToken('wa');
  const refresh = newToken('wr');
  const accessExpires = addMs(now, ACCESS_TTL_MS);
  const slid = addMs(now, policy.refreshDays * DAY);
  const refreshExpires = slid < s.absolute_expires_at ? slid : s.absolute_expires_at;
  await q.query(
    `UPDATE sessions SET access_hash=$2, access_expires_at=$3, refresh_hash=$4, prev_refresh_hash=$5, refresh_expires_at=$6,
                         last_used_at=$7, rotated_at=$7 WHERE id=$1`,
    [s.id, hashToken(access), accessExpires, hashToken(refresh), h, refreshExpires, now],
  );
  return {
    playerId: s.player_id,
    tokens: {
      sessionId: s.id,
      accessToken: access,
      accessExpiresAt: accessExpires.toISOString(),
      refreshToken: refresh,
      refreshExpiresAt: refreshExpires.toISOString(),
    },
  };
}

export async function revokeSession(
  q: Queryable,
  now: Date,
  sessionId: string,
  reason: string,
): Promise<boolean> {
  const r = await q.query(
    'UPDATE sessions SET revoked_at = $2, revoked_reason = $3 WHERE id = $1 AND revoked_at IS NULL',
    [sessionId, now, reason],
  );
  return r.rowCount > 0;
}

export async function revokeAllSessions(
  q: Queryable,
  now: Date,
  playerId: string,
  reason: string,
  exceptSessionId?: string,
): Promise<number> {
  const r = await q.query(
    `UPDATE sessions SET revoked_at = $2, revoked_reason = $3
      WHERE player_id = $1 AND revoked_at IS NULL AND ($4::uuid IS NULL OR id <> $4::uuid)`,
    [playerId, now, reason, exceptSessionId ?? null],
  );
  if (r.rowCount > 0)
    await audit(q, now, {
      type: 'session.revoked_all',
      actor: playerId,
      subject: playerId,
      detail: { reason, count: r.rowCount },
    });
  return r.rowCount;
}

export const isRecentlyAuthenticated = (p: Principal, now: Date): boolean =>
  p.reauthAt !== null && now.getTime() - p.reauthAt.getTime() <= REAUTH_WINDOW_MS;
