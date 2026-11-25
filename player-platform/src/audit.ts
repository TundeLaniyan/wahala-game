import { currentRequestId } from './context';
import type { Queryable } from './db/types';

/** Security-relevant events. `detail` is small structured data: never tokens, credentials, e-mail or free text. */
export type AuditType =
  | 'guest.created'
  | 'session.refreshed'
  | 'session.reuse_detected'
  | 'session.revoked'
  | 'session.revoked_all'
  | 'auth.signin'
  | 'auth.reauth'
  | 'account.upgraded'
  | 'account.link_added'
  | 'account.link_removed'
  | 'account.deleted'
  | 'account.suspended'
  | 'account.reinstated'
  | 'profile.name_changed'
  | 'profile.age_group_changed'
  | 'friend.blocked'
  | 'party.created'
  | 'party.closed'
  | 'match.recorded'
  | 'report.filed'
  | 'report.resolved'
  | 'commerce.fulfilled'
  | 'commerce.revoked'
  | 'commerce.refunded';

export async function audit(
  q: Queryable,
  at: Date,
  e: { type: AuditType; actor?: string | null; subject?: string | null; detail?: Record<string, unknown> },
): Promise<void> {
  await q.query(
    'INSERT INTO audit_events (at, type, actor_id, subject_id, detail, request_id) VALUES ($1, $2, $3, $4, $5::jsonb, $6)',
    [at, e.type, e.actor ?? null, e.subject ?? null, JSON.stringify(e.detail ?? {}), currentRequestId()],
  );
}
