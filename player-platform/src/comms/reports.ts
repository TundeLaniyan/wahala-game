/**
 * Reports and moderation.
 *
 * A report must be tied to a REAL interaction (the same party, the same match, a friend request, or a friend): a stranger cannot be
 * reported out of the blue, so a mass-report campaign needs real contact with the target. One open report per reporter / target /
 * place (repeats are idempotent), 20 reports a day per reporter. A report keeps a bounded SNAPSHOT of what the reporter could see
 * (preset signals, dev chat lines) and the name as it was.
 *
 * Automatic safeguard (a policy PLACEHOLDER, reversible): three DIFFERENT reporters in 24 hours silence the target's signals for one
 * hour until a moderator looks. It can be abused by three colluding accounts, which is why it is short, audited and liftable.
 * Moderators act through the admin endpoints (a bearer token, off unless configured); every action is in the audit trail.
 */
import { ApiError, badRequest, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import type { Db, Queryable } from '../db/types';
import type { IdentityService } from '../identity/service';
import { DAY, HOUR, addMs } from '../util/clock';
import type { Clock } from '../util/clock';
import type { CommsService } from './service';

export const REPORT_CATEGORIES = [
  'abusive_name',
  'harassment',
  'cheating',
  'spam',
  'inappropriate_content',
  'impersonation',
  'other',
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];
export const REPORT_CONTEXTS = ['profile', 'party', 'match', 'friend_request', 'chat'] as const;
export type ReportContext = (typeof REPORT_CONTEXTS)[number];
export const RESOLUTIONS = ['dismiss', 'warn', 'restrict_signals', 'suspend'] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const MAX_REPORTS_PER_DAY = 20;
export const AUTO_RESTRICT_REPORTERS = 3;
export const AUTO_RESTRICT_MS = 1 * HOUR;
export const MODERATOR_RESTRICT_MS = 24 * HOUR;
export const RESOLVED_RETENTION_MS = 180 * DAY;

export interface ReportInput {
  reportedId: string;
  category: ReportCategory;
  context: ReportContext;
  contextRef: string | null;
  note: string | null;
}

export interface AdminReportView {
  id: string;
  status: 'open' | 'actioned' | 'dismissed';
  category: ReportCategory;
  context: ReportContext;
  contextRef: string | null;
  note: string | null;
  evidence: unknown;
  createdAt: string;
  reporter: { playerId: string; dismissedLast30d: number };
  reported: { playerId: string; nameAtReport: string; distinctReportersLast30d: number; status: string };
  resolution: Resolution | null;
}

/** Strips control, zero-width and bidi characters and collapses space: free text from a player is never stored raw. */
export function cleanNote(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw badRequest('note must be text');
  const t = raw
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > 200) throw badRequest('note is at most 200 characters');
  return t === '' ? null : t;
}

export class ReportService {
  constructor(private readonly d: { db: Db; clock: Clock; comms: CommsService; identity: IdentityService }) {}

  /** Is there a real interaction between reporter and target in this context? Throws `forbidden` (one message) when not. */
  private async verifyContact(q: Queryable, me: string, input: ReportInput): Promise<void> {
    const deny = (): ApiError =>
      forbidden('You can only report someone you have actually played or talked with.');
    const ref = input.contextRef;
    let ok = false;
    switch (input.context) {
      case 'party':
      case 'chat': {
        if (!ref) throw badRequest('contextRef must be the party id');
        const r = await q.query(
          'SELECT 1 FROM party_members a JOIN party_members b ON a.party_id = b.party_id WHERE a.party_id::text = $1 AND a.player_id = $2 AND b.player_id = $3',
          [ref, me, input.reportedId],
        );
        ok = r.rowCount > 0;
        break;
      }
      case 'match': {
        if (!ref) throw badRequest('contextRef must be the match id');
        const r = await q.query(
          'SELECT 1 FROM match_participants a JOIN match_participants b ON a.match_id = b.match_id WHERE a.match_id = $1 AND a.player_id = $2 AND b.player_id = $3',
          [ref, me, input.reportedId],
        );
        ok = r.rowCount > 0;
        break;
      }
      case 'friend_request': {
        const r = await q.query(
          "SELECT 1 FROM friend_requests WHERE from_id = $1 AND to_id = $2 AND status IN ('pending','declined','accepted')",
          [input.reportedId, me],
        );
        ok = r.rowCount > 0;
        break;
      }
      case 'profile': {
        const a = me < input.reportedId ? me : input.reportedId;
        const b = me < input.reportedId ? input.reportedId : me;
        const r = await q.query('SELECT 1 FROM friendships WHERE player_a = $1 AND player_b = $2', [a, b]);
        ok = r.rowCount > 0;
        break;
      }
    }
    if (!ok) throw deny();
  }

  /** What the reporter could see from the target in that place (bounded, small). */
  private async evidence(q: Queryable, me: string, input: ReportInput): Promise<unknown[]> {
    if ((input.context !== 'party' && input.context !== 'chat') || !input.contextRef) return [];
    const sig = await q.query<{ signal_id: string; created_at: Date }>(
      'SELECT signal_id, created_at FROM party_signals WHERE party_id::text = $1 AND sender_id = $2 ORDER BY id DESC LIMIT 20',
      [input.contextRef, input.reportedId],
    );
    const chat = await q.query<{ body: string; created_at: Date }>(
      'SELECT body, created_at FROM dev_chat_messages WHERE party_id::text = $1 AND sender_id = $2 ORDER BY id DESC LIMIT 10',
      [input.contextRef, input.reportedId],
    );
    void me;
    return [
      ...sig.rows.map((s) => ({ t: 'signal', id: s.signal_id, at: s.created_at.toISOString() })),
      ...chat.rows.map((c) => ({ t: 'text', body: c.body, at: c.created_at.toISOString() })),
    ];
  }

  async file(me: string, input: ReportInput): Promise<{ id: string; duplicate: boolean }> {
    if (me === input.reportedId) throw badRequest('You cannot report yourself.');
    const now = this.d.clock();
    return this.d.db.tx(async (q) => {
      const target = await q.query<{ display_name: string; status: string }>(
        "SELECT f.display_name, p.status FROM players p JOIN profiles f ON f.player_id = p.id WHERE p.id = $1 AND p.status <> 'deleted'",
        [input.reportedId],
      );
      if (!target.rows[0]) throw notFound('no such player');
      await this.verifyContact(q, me, input);
      const today = await q.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM reports WHERE reporter_id = $1 AND created_at > $2',
        [me, addMs(now, -DAY)],
      );
      if (today.rows[0]!.n >= MAX_REPORTS_PER_DAY)
        throw new ApiError('rate_limited', 'You have sent a lot of reports today. Try again tomorrow.', {
          retryAfterMs: DAY,
        });
      const evidence = await this.evidence(q, me, input);
      // ON CONFLICT (not a caught error): a unique violation would abort the whole Postgres transaction
      const ins = await q.query<{ id: string }>(
        `INSERT INTO reports (reporter_id, reported_id, category, context, context_ref, note, reported_name, evidence, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) ON CONFLICT DO NOTHING RETURNING id`,
        [
          me,
          input.reportedId,
          input.category,
          input.context,
          input.contextRef,
          input.note,
          target.rows[0]!.display_name,
          JSON.stringify(evidence),
          now,
        ],
      );
      if (ins.rows[0]) {
        await audit(q, now, {
          type: 'report.filed',
          actor: me,
          subject: input.reportedId,
          detail: { category: input.category, context: input.context },
        });
        await this.maybeAutoRestrict(q, input.reportedId, now);
        return { id: ins.rows[0].id, duplicate: false };
      }
      // same reporter, same target, same place, still open: the earlier report stands
      const prev = await q.query<{ id: string }>(
        "SELECT id FROM reports WHERE reporter_id = $1 AND reported_id = $2 AND context = $3 AND COALESCE(context_ref,'') = $4 AND status = 'open'",
        [me, input.reportedId, input.context, input.contextRef ?? ''],
      );
      return { id: prev.rows[0]!.id, duplicate: true };
    });
  }

  private async maybeAutoRestrict(q: Queryable, target: string, now: Date): Promise<void> {
    const r = await q.query<{ n: number }>(
      "SELECT count(DISTINCT reporter_id)::int AS n FROM reports WHERE reported_id = $1 AND status <> 'dismissed' AND created_at > $2",
      [target, addMs(now, -DAY)],
    );
    if (r.rows[0]!.n < AUTO_RESTRICT_REPORTERS) return;
    if (await this.d.comms.activeRestriction(q, target, 'signals', now)) return;
    await this.d.comms.restrict(
      q,
      target,
      'signals',
      'auto',
      'several players reported this account',
      AUTO_RESTRICT_MS,
    );
  }

  async mine(me: string): Promise<{ id: string; status: string; category: string; createdAt: string }[]> {
    const r = await this.d.db.query<{ id: string; status: string; category: string; created_at: Date }>(
      'SELECT id, status, category, created_at FROM reports WHERE reporter_id = $1 ORDER BY created_at DESC LIMIT 50',
      [me],
    );
    return r.rows.map((x) => ({
      id: x.id,
      status: x.status,
      category: x.category,
      createdAt: x.created_at.toISOString(),
    }));
  }

  // ---------------------------------------------------------------- moderators

  async list(status: 'open' | 'actioned' | 'dismissed', limit: number): Promise<AdminReportView[]> {
    const now = this.d.clock();
    const r = await this.d.db.query<{
      id: string;
      status: AdminReportView['status'];
      category: ReportCategory;
      context: ReportContext;
      context_ref: string | null;
      note: string | null;
      evidence: unknown;
      created_at: Date;
      reporter_id: string;
      reported_id: string;
      reported_name: string;
      resolution: Resolution | null;
      target_status: string;
      distinct_reporters: number;
      dismissed: number;
    }>(
      `SELECT r.*, p.status AS target_status,
              (SELECT count(DISTINCT x.reporter_id)::int FROM reports x WHERE x.reported_id = r.reported_id AND x.created_at > $3) AS distinct_reporters,
              (SELECT count(*)::int FROM reports y WHERE y.reporter_id = r.reporter_id AND y.status = 'dismissed' AND y.created_at > $3) AS dismissed
         FROM reports r JOIN players p ON p.id = r.reported_id WHERE r.status = $1 ORDER BY r.created_at LIMIT $2`,
      [status, Math.min(Math.max(limit, 1), 100), addMs(now, -30 * DAY)],
    );
    return r.rows.map((x) => ({
      id: x.id,
      status: x.status,
      category: x.category,
      context: x.context,
      contextRef: x.context_ref,
      note: x.note,
      evidence: x.evidence,
      createdAt: x.created_at.toISOString(),
      reporter: { playerId: x.reporter_id, dismissedLast30d: x.dismissed },
      reported: {
        playerId: x.reported_id,
        nameAtReport: x.reported_name,
        distinctReportersLast30d: x.distinct_reporters,
        status: x.target_status,
      },
      resolution: x.resolution,
    }));
  }

  async resolve(reportId: string, resolution: Resolution, moderator: string): Promise<void> {
    const now = this.d.clock();
    await this.d.db.tx(async (q) => {
      const r = await q.query<{ reported_id: string }>(
        "SELECT reported_id FROM reports WHERE id = $1 AND status = 'open' FOR UPDATE",
        [reportId],
      );
      const rep = r.rows[0];
      if (!rep) throw notFound('no such open report');
      await q.query(
        'UPDATE reports SET status = $2, resolution = $3, resolved_at = $4, resolved_by = $5 WHERE id = $1',
        [
          reportId,
          resolution === 'dismiss' ? 'dismissed' : 'actioned',
          resolution,
          now,
          moderator.slice(0, 40),
        ],
      );
      if (resolution === 'restrict_signals')
        await this.d.comms.restrict(
          q,
          rep.reported_id,
          'signals',
          'moderator',
          `report ${reportId.slice(0, 8)}`,
          MODERATOR_RESTRICT_MS,
        );
      await audit(q, now, {
        type: 'report.resolved',
        actor: null,
        subject: rep.reported_id,
        detail: { reportId, resolution, by: moderator.slice(0, 40) },
      });
    });
    // suspension revokes every session; it runs through the identity service (its own transaction and audit row)
    if (resolution === 'suspend') {
      const r = await this.d.db.query<{ reported_id: string }>(
        'SELECT reported_id FROM reports WHERE id = $1',
        [reportId],
      );
      await this.d.identity.setStatus(r.rows[0]!.reported_id, 'suspended', null);
    }
  }

  /** A moderator lifts an automatic or manual restriction early (a wrongly silenced player). */
  async liftRestrictions(playerId: string): Promise<number> {
    const n = await this.d.comms.lift(this.d.db, playerId);
    await audit(this.d.db, this.d.clock(), {
      type: 'report.resolved',
      subject: playerId,
      detail: { lifted: n },
    });
    return n;
  }

  /** Erasure: free text and names go; category / context / status stay for aggregate moderation statistics. */
  async erase(q: Queryable, playerId: string): Promise<void> {
    await q.query(
      `UPDATE reports SET note = NULL, evidence = '[]'::jsonb, reported_name = CASE WHEN reported_id = $1 THEN 'Deleted player' ELSE reported_name END
        WHERE reporter_id = $1 OR reported_id = $1`,
      [playerId],
    );
  }

  /** Resolved reports older than 180 days are deleted (open ones are never auto-deleted: someone must decide). */
  async purge(): Promise<number> {
    const r = await this.d.db.query("DELETE FROM reports WHERE status <> 'open' AND resolved_at < $1", [
      addMs(this.d.clock(), -RESOLVED_RETENTION_MS),
    ]);
    return r.rowCount;
  }
}
