/**
 * Communication safety core: preset signals in a party, mutes, time-limited restrictions, and the RELAY FILTER the match server
 * calls before it forwards a ping / emote / quick message to a team (so a block, a mute or a restriction holds in a match too).
 *
 * Visibility rule, used everywhere: A may receive from B only if neither blocked the other, A has not muted B, and A is an active
 * account. Text and voice additionally need an ADULT REGISTERED recipient and sender (`capabilitiesFor`): a minor, a guest or an
 * account with no declared age never receives free-form text or voice, whatever the party contains.
 */
import { ApiError, badRequest, conflict, notFound } from '../errors';
import type { Db, Queryable } from '../db/types';
import { capabilitiesFor } from '../identity/capabilities';
import type { AgeGroup, PlayerKind } from '../identity/types';
import { addMs, HOUR, SECOND } from '../util/clock';
import type { Clock } from '../util/clock';
import { signalById } from './catalogue';
import type { SignalDef } from './catalogue';

export type RestrictionKind = 'signals' | 'text' | 'voice';
export const MAX_MUTES = 200;
export const SIGNAL_REPEAT_MS = 2 * SECOND;
export const SIGNAL_HISTORY = 200;
export const SIGNAL_PAGE = 50;
export const MAX_FILTER_RECIPIENTS = 64;

export interface SignalView {
  id: number;
  signalId: string;
  kind: SignalDef['kind'];
  label: string;
  from: { playerId: string; displayName: string };
  at: string;
}

export interface MuteView {
  playerId: string;
  displayName: string;
  since: string;
}

export interface FilterResult {
  /** False when the SENDER is restricted from this kind of communication (nothing may be relayed). */
  senderAllowed: boolean;
  reason: string | null;
  /** The subset of the requested recipients who may receive it. */
  recipients: string[];
}

/** SQL fragment: `r` (the recipient's players row) may receive from `$sender`. */
const RECEIVES = (sender: string) => `
  p.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = p.id AND b.blocked_id = ${sender}) OR (b.blocker_id = ${sender} AND b.blocked_id = p.id))
  AND NOT EXISTS (SELECT 1 FROM mutes m WHERE m.muter_id = p.id AND m.muted_id = ${sender})`;

export class CommsService {
  constructor(private readonly d: { db: Db; clock: Clock }) {}

  // ---------------------------------------------------------------- restrictions

  async activeRestriction(
    q: Queryable,
    playerId: string,
    kind: RestrictionKind,
    now = this.d.clock(),
  ): Promise<Date | null> {
    const r = await q.query<{ until: Date }>(
      'SELECT max(until) AS until FROM comm_restrictions WHERE player_id = $1 AND kind = $2 AND lifted_at IS NULL AND until > $3',
      [playerId, kind, now],
    );
    return r.rows[0]?.until ?? null;
  }

  async restrict(
    q: Queryable,
    playerId: string,
    kind: RestrictionKind,
    source: 'auto' | 'moderator',
    reason: string,
    ms: number,
  ): Promise<Date> {
    const now = this.d.clock();
    const until = addMs(now, ms);
    await q.query(
      'INSERT INTO comm_restrictions (player_id, kind, source, reason, created_at, until) VALUES ($1,$2,$3,$4,$5,$6)',
      [playerId, kind, source, reason.slice(0, 120), now, until],
    );
    return until;
  }

  async lift(q: Queryable, playerId: string, kind?: RestrictionKind): Promise<number> {
    const r = await q.query(
      'UPDATE comm_restrictions SET lifted_at = $2 WHERE player_id = $1 AND lifted_at IS NULL AND until > $2 AND ($3::text IS NULL OR kind = $3)',
      [playerId, this.d.clock(), kind ?? null],
    );
    return r.rowCount;
  }

  // ---------------------------------------------------------------- mutes

  async mutes(me: string): Promise<MuteView[]> {
    const r = await this.d.db.query<{ muted_id: string; display_name: string; created_at: Date }>(
      'SELECT m.muted_id, f.display_name, m.created_at FROM mutes m JOIN profiles f ON f.player_id = m.muted_id WHERE m.muter_id = $1 ORDER BY m.created_at DESC LIMIT $2',
      [me, MAX_MUTES],
    );
    return r.rows.map((x) => ({
      playerId: x.muted_id,
      displayName: x.display_name,
      since: x.created_at.toISOString(),
    }));
  }

  /** Mute: you stop receiving their signals, text and voice. They are not told, and nothing else changes (friends stay friends). Idempotent. */
  async mute(me: string, target: string): Promise<void> {
    if (me === target) throw badRequest('You cannot mute yourself.');
    await this.d.db.tx(async (q) => {
      const exists = await q.query("SELECT 1 FROM players WHERE id = $1 AND status <> 'deleted'", [target]);
      if (exists.rowCount === 0) throw notFound('no such player');
      const n = await q.query<{ n: number }>('SELECT count(*)::int AS n FROM mutes WHERE muter_id = $1', [
        me,
      ]);
      if (n.rows[0]!.n >= MAX_MUTES) throw conflict('Your mute list is full.');
      await q.query(
        'INSERT INTO mutes (muter_id, muted_id, created_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [me, target, this.d.clock()],
      );
    });
  }

  async unmute(me: string, target: string): Promise<void> {
    const r = await this.d.db.query('DELETE FROM mutes WHERE muter_id = $1 AND muted_id = $2', [me, target]);
    if (r.rowCount === 0) throw notFound('not muted');
  }

  // ---------------------------------------------------------------- party signals

  private async requireMember(q: Queryable, partyId: string, me: string): Promise<void> {
    const r = await q.query(
      "SELECT 1 FROM party_members m JOIN parties p ON p.id = m.party_id AND p.status <> 'closed' WHERE m.party_id = $1 AND m.player_id = $2",
      [partyId, me],
    );
    if (r.rowCount === 0) throw notFound('That party is not available.');
  }

  async sendPartySignal(me: string, partyId: string, signalId: unknown): Promise<{ id: number }> {
    const def = signalById(signalId);
    if (!def || !def.contexts.includes('party')) throw badRequest('unknown signal');
    const now = this.d.clock();
    return this.d.db.tx(async (q) => {
      await this.requireMember(q, partyId, me);
      const until = await this.activeRestriction(q, me, 'signals', now);
      if (until)
        throw new ApiError('restricted_account', 'You cannot send messages right now.', {
          retryAfterMs: until.getTime() - now.getTime(),
        });
      // the same signal twice within 2 s is a flood, not a conversation
      const last = await q.query<{ created_at: Date }>(
        'SELECT created_at FROM party_signals WHERE party_id = $1 AND sender_id = $2 AND signal_id = $3 ORDER BY id DESC LIMIT 1',
        [partyId, me, def.id],
      );
      const prev = last.rows[0]?.created_at;
      if (prev && now.getTime() - prev.getTime() < SIGNAL_REPEAT_MS)
        throw new ApiError('rate_limited', 'Slow down.', {
          retryAfterMs: SIGNAL_REPEAT_MS - (now.getTime() - prev.getTime()),
        });
      const ins = await q.query<{ id: string }>(
        'INSERT INTO party_signals (party_id, sender_id, signal_id, created_at) VALUES ($1,$2,$3,$4) RETURNING id',
        [partyId, me, def.id, now],
      );
      const id = Number(ins.rows[0]!.id);
      await q.query('DELETE FROM party_signals WHERE party_id = $1 AND id <= $2', [
        partyId,
        id - SIGNAL_HISTORY,
      ]);
      return { id };
    });
  }

  /** Signals newer than `after` that the caller may see, oldest first. Names are read NOW (one consistent name per player). */
  async partySignals(me: string, partyId: string, after: number): Promise<SignalView[]> {
    await this.requireMember(this.d.db, partyId, me);
    const r = await this.d.db.query<{
      id: string;
      signal_id: string;
      sender_id: string;
      display_name: string;
      created_at: Date;
    }>(
      `SELECT s.id, s.signal_id, s.sender_id, f.display_name, s.created_at FROM party_signals s JOIN profiles f ON f.player_id = s.sender_id
        WHERE s.party_id = $1 AND s.id > $2
          AND (s.sender_id = $3 OR (
            NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $3 AND b.blocked_id = s.sender_id) OR (b.blocker_id = s.sender_id AND b.blocked_id = $3))
            AND NOT EXISTS (SELECT 1 FROM mutes m WHERE m.muter_id = $3 AND m.muted_id = s.sender_id)))
        ORDER BY s.id DESC LIMIT $4`,
      [partyId, after, me, SIGNAL_PAGE],
    );
    return r.rows.reverse().flatMap((x) => {
      const def = signalById(x.signal_id);
      return def
        ? [
            {
              id: Number(x.id),
              signalId: def.id,
              kind: def.kind,
              label: def.label,
              from: { playerId: x.sender_id, displayName: x.display_name },
              at: x.created_at.toISOString(),
            },
          ]
        : [];
    });
  }

  // ---------------------------------------------------------------- the relay filter (match server / voice / text)

  /**
   * "May `senderId` reach these players?" for a relay the platform does not run itself (a team ping in a match, a voice session).
   * Pure decision, no state change. `text` and `voice` need adult registered accounts on both ends.
   */
  async filter(input: {
    senderId: string;
    recipientIds: string[];
    kind: 'signal' | 'text' | 'voice';
  }): Promise<FilterResult> {
    const ids = [...new Set(input.recipientIds)]
      .filter((x) => x !== input.senderId)
      .slice(0, MAX_FILTER_RECIPIENTS);
    const now = this.d.clock();
    const s = await this.d.db.query<{ kind: PlayerKind; age_group: AgeGroup; status: string }>(
      'SELECT kind, age_group, status FROM players WHERE id = $1',
      [input.senderId],
    );
    const sender = s.rows[0];
    const no = (reason: string): FilterResult => ({ senderAllowed: false, reason, recipients: [] });
    if (!sender || sender.status !== 'active') return no('unknown sender');
    const restrictionKind: RestrictionKind = input.kind === 'signal' ? 'signals' : input.kind;
    if (await this.activeRestriction(this.d.db, input.senderId, restrictionKind, now))
      return no('restricted');
    const adultOnly = input.kind !== 'signal';
    if (adultOnly) {
      const caps = capabilitiesFor(sender.kind, sender.age_group);
      if (!(input.kind === 'text' ? caps.textChat : caps.voice)) return no('account not eligible');
    }
    if (ids.length === 0) return { senderAllowed: true, reason: null, recipients: [] };
    const r = await this.d.db.query<{ id: string }>(
      `SELECT p.id FROM players p WHERE p.id = ANY($1::uuid[]) AND ${RECEIVES('$2::uuid')}
         ${adultOnly ? "AND p.kind = 'registered' AND p.age_group = 'adult'" : ''}`,
      [ids, input.senderId],
    );
    const ok = new Set(r.rows.map((x) => x.id));
    return { senderAllowed: true, reason: null, recipients: ids.filter((x) => ok.has(x)) };
  }

  // ---------------------------------------------------------------- erasure and retention

  async erase(q: Queryable, playerId: string): Promise<void> {
    await q.query('DELETE FROM mutes WHERE muter_id = $1 OR muted_id = $1', [playerId]);
    await q.query('DELETE FROM party_signals WHERE sender_id = $1', [playerId]);
    await q.query('DELETE FROM dev_chat_messages WHERE sender_id = $1', [playerId]);
    await q.query('DELETE FROM comm_restrictions WHERE player_id = $1 AND source = $2', [playerId, 'auto']);
  }

  /** Housekeeping: dev chat lines older than 24 h, old restrictions. */
  async purge(): Promise<{ chat: number; restrictions: number }> {
    const now = this.d.clock();
    const chat = await this.d.db.query('DELETE FROM dev_chat_messages WHERE created_at < $1', [
      addMs(now, -24 * HOUR),
    ]);
    const old = await this.d.db.query('DELETE FROM comm_restrictions WHERE until < $1', [
      addMs(now, -90 * 24 * HOUR),
    ]);
    return { chat: chat.rowCount, restrictions: old.rowCount };
  }
}
