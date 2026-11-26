/**
 * Private parties: a SOCIAL group that plays one private match together. A party owns no room, no seat and no team (the match
 * server owns those); it carries the match server's ROOM CODE once the leader has opened the room, and hands each member a
 * signed ticket for it.
 *
 * Rules (the leader / member permissions mirror `partyPermissions` in src/online/lifecycle.ts):
 *  - one party per player; the leader invites, kicks, promotes, rotates the code, picks the mode and opens the match
 *  - a failed code join, a full / closed / expired party and a party containing someone who blocked you all answer alike
 *  - the leader leaving promotes the longest-standing member; the last one leaving closes the party
 *  - direct invitations lapse after 10 minutes; a code lapses after 24 hours (rotate to extend); an idle party closes after 6 hours;
 *    members silent for 10 minutes are removed while the party is open; a match that never reports back releases the party after 3 hours
 *  - nothing here changes approved match rules: capacity (32), FFA / Team, the 30 s public wait and the reconnection window are the server's
 */
import { ApiError, badRequest, conflict, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import type { Db, Queryable } from '../db/types';
import { isUniqueViolation } from '../db/types';
import { normalizeRoomCode } from '../../../src/net/protocol';
import type { HandoffSigner } from '../handoff/signer';
import { HOST_ROOM } from '../handoff/verify';
import type { IdentityService } from '../identity/service';
import { capabilitiesFor } from '../identity/capabilities';
import type { PresenceStatus, PresenceStore } from '../social/presence';
import { blockedEitherWay, areFriends } from '../social/service';
import type { SocialService } from '../social/service';
import { HOUR, MINUTE, addMs } from '../util/clock';
import type { Clock } from '../util/clock';
import { newCode, normaliseCode } from '../util/secrets';

export const PARTY_CODE_LENGTH = 8;
export const INVITE_TTL_MS = 10 * MINUTE;
export const CODE_TTL_MS = 24 * HOUR;
export const IDLE_CLOSE_MS = 6 * HOUR;
export const ABSENT_REMOVE_MS = 10 * MINUTE;
export const MATCH_RELEASE_MS = 3 * HOUR;
export const MAX_PENDING_INVITES = 16;

export type PartyMode = 'ffa' | 'team';
export const PARTY_MODES: readonly PartyMode[] = ['ffa', 'team'];

export interface PartyMemberView {
  playerId: string;
  displayName: string;
  selectedCharacter: string;
  ready: boolean;
  isLeader: boolean;
  joinedAt: string;
  presence: PresenceStatus;
}

export interface PartyView {
  id: string;
  code: string;
  codeExpiresAt: string;
  /** Built from PLATFORM_PUBLIC_WEB_URL; the app link is the same code for the Android / iOS client's own scheme. */
  inviteLink: string;
  appLink: string;
  status: 'open' | 'in_match';
  mode: PartyMode;
  maxSize: number;
  leaderId: string;
  members: PartyMemberView[];
  match: { roomCode: string; openedAt: string } | null;
  /** What the CALLER may do (the UI enables buttons from this; the server enforces it regardless). */
  you: {
    isLeader: boolean;
    canInvite: boolean;
    canKick: boolean;
    canPromote: boolean;
    canOpenMatch: boolean;
    canLeave: boolean;
  };
}

export interface InviteView {
  id: string;
  partyId: string;
  fromId: string;
  fromName: string;
  expiresAt: string;
  members: number;
  maxSize: number;
}

interface PartyRow {
  id: string;
  code: string;
  code_expires_at: Date;
  leader_id: string;
  status: 'open' | 'in_match' | 'closed';
  mode: PartyMode;
  max_size: number;
  match_room_code: string | null;
  match_opened_at: Date | null;
  last_activity_at: Date;
}

export interface PartyDeps {
  db: Db;
  clock: Clock;
  identity: IdentityService;
  social: SocialService;
  presence: PresenceStore;
  signer: HandoffSigner;
  maxSize: number;
  publicWebUrl: string;
  /** Process start: a member never heard from since a restart is not "absent" until 10 minutes after it. */
  startedAt: Date;
}

const unavailable = (): ApiError => notFound('That party is not available.');

export class PartyService {
  constructor(private readonly d: PartyDeps) {
    d.social.onBlock((q, blocker, blocked, now) => this.separate(q, blocker, blocked, now));
  }

  // ---------------------------------------------------------------- reading

  private async row(q: Queryable, partyId: string, lock = false): Promise<PartyRow> {
    const r = await q.query<PartyRow>(
      `SELECT * FROM parties WHERE id = $1 AND status <> 'closed' ${lock ? 'FOR UPDATE' : ''}`,
      [partyId],
    );
    const p = r.rows[0];
    if (!p) throw unavailable();
    return p;
  }

  private async memberIds(q: Queryable, partyId: string): Promise<string[]> {
    const r = await q.query<{ player_id: string }>(
      'SELECT player_id FROM party_members WHERE party_id = $1 ORDER BY joined_at, player_id',
      [partyId],
    );
    return r.rows.map((m) => m.player_id);
  }

  private async view(q: Queryable, p: PartyRow, viewer: string): Promise<PartyView> {
    const ms = await q.query<{
      player_id: string;
      display_name: string;
      selected_character: string;
      presence_visibility: string;
      ready: boolean;
      joined_at: Date;
    }>(
      `SELECT m.player_id, f.display_name, f.selected_character, f.presence_visibility, m.ready, m.joined_at
         FROM party_members m JOIN profiles f ON f.player_id = m.player_id WHERE m.party_id = $1 ORDER BY m.joined_at, m.player_id`,
      [p.id],
    );
    if (!ms.rows.some((m) => m.player_id === viewer)) throw unavailable();
    const leader = p.leader_id === viewer;
    const full = ms.rows.length >= p.max_size;
    return {
      id: p.id,
      code: p.code,
      codeExpiresAt: p.code_expires_at.toISOString(),
      inviteLink: `${this.d.publicWebUrl}/join?party=${p.code}`,
      appLink: `wahala://party/${p.code}`,
      status: p.status === 'in_match' ? 'in_match' : 'open',
      mode: p.mode,
      maxSize: p.max_size,
      leaderId: p.leader_id,
      members: ms.rows.map((m) => ({
        playerId: m.player_id,
        displayName: m.display_name,
        selectedCharacter: m.selected_character,
        ready: m.ready,
        isLeader: m.player_id === p.leader_id,
        joinedAt: m.joined_at.toISOString(),
        // a member who hides presence is still shown as present to their own party: the party is a voluntary group
        presence: this.d.presence.get(m.player_id),
      })),
      match: p.match_room_code
        ? { roomCode: p.match_room_code, openedAt: (p.match_opened_at ?? p.last_activity_at).toISOString() }
        : null,
      you: {
        isLeader: leader,
        canInvite: leader && p.status === 'open' && !full,
        canKick: leader && ms.rows.length > 1,
        canPromote: leader && ms.rows.length > 1,
        canOpenMatch: leader && p.status === 'open',
        canLeave: true,
      },
    };
  }

  /** The caller's current party, or null. */
  async current(playerId: string): Promise<PartyView | null> {
    const r = await this.d.db.query<PartyRow>(
      "SELECT p.* FROM parties p JOIN party_members m ON m.party_id = p.id WHERE m.player_id = $1 AND p.status <> 'closed'",
      [playerId],
    );
    return r.rows[0] ? this.view(this.d.db, r.rows[0], playerId) : null;
  }

  async get(playerId: string, partyId: string): Promise<PartyView> {
    return this.view(this.d.db, await this.row(this.d.db, partyId), playerId);
  }

  // ---------------------------------------------------------------- lifecycle

  async create(me: string, mode: PartyMode = 'ffa'): Promise<PartyView> {
    const now = this.d.clock();
    return this.d.db.tx(async (q) => {
      await this.requireNotInParty(q, me);
      let row: PartyRow | undefined;
      for (let i = 0; i < 8 && !row; i++) {
        const r = await q.query<PartyRow>(
          `INSERT INTO parties (code, code_expires_at, leader_id, mode, max_size, created_at, last_activity_at)
           VALUES ($1, $2, $3, $4, $5, $6, $6) ON CONFLICT DO NOTHING RETURNING *`,
          [newCode(PARTY_CODE_LENGTH), addMs(now, CODE_TTL_MS), me, mode, this.d.maxSize, now],
        );
        row = r.rows[0];
      }
      if (!row) throw new ApiError('unavailable', 'could not create a party, try again');
      await q.query('INSERT INTO party_members (party_id, player_id, joined_at) VALUES ($1, $2, $3)', [
        row.id,
        me,
        now,
      ]);
      await audit(q, now, { type: 'party.created', actor: me, subject: me, detail: { partyId: row.id } });
      return this.view(q, row, me);
    });
  }

  private async requireNotInParty(q: Queryable, me: string): Promise<void> {
    const r = await q.query(
      "SELECT 1 FROM party_members m JOIN parties p ON p.id = m.party_id WHERE m.player_id = $1 AND p.status <> 'closed'",
      [me],
    );
    if (r.rowCount > 0) throw conflict('You are already in a party. Leave it first.');
  }

  async joinByCode(me: string, rawCode: unknown): Promise<PartyView> {
    const code = normaliseCode(rawCode, PARTY_CODE_LENGTH);
    if (!code) throw unavailable();
    const now = this.d.clock();
    return this.d.db.tx(async (q) => {
      await this.requireNotInParty(q, me);
      const r = await q.query<PartyRow>(
        "SELECT * FROM parties WHERE code = $1 AND status = 'open' AND code_expires_at > $2 FOR UPDATE",
        [code, now],
      );
      const p = r.rows[0];
      if (!p) throw unavailable();
      await this.admit(q, p, me, now);
      return this.view(q, p, me);
    });
  }

  /** Adds `me` to the party after every check; throws the uniform "not available" for anything about the party itself. */
  private async admit(q: Queryable, p: PartyRow, me: string, now: Date): Promise<void> {
    const members = await this.memberIds(q, p.id);
    if (members.length >= p.max_size) throw unavailable();
    for (const m of members) if (await blockedEitherWay(q, me, m)) throw unavailable();
    await q.query('INSERT INTO party_members (party_id, player_id, joined_at) VALUES ($1, $2, $3)', [
      p.id,
      me,
      now,
    ]);
    await q.query('UPDATE parties SET last_activity_at = $2 WHERE id = $1', [p.id, now]);
  }

  async leave(me: string, partyId: string): Promise<void> {
    const now = this.d.clock();
    await this.d.db.tx(async (q) => {
      await this.row(q, partyId, true);
      const gone = await q.query('DELETE FROM party_members WHERE party_id = $1 AND player_id = $2', [
        partyId,
        me,
      ]);
      if (gone.rowCount === 0) throw unavailable();
      await this.afterDeparture(q, partyId, me, now);
    });
  }

  /** After a member is gone: promote the longest-standing member if the leader left; close the party if it is empty. */
  private async afterDeparture(q: Queryable, partyId: string, who: string, now: Date): Promise<void> {
    const rest = await this.memberIds(q, partyId);
    if (rest.length === 0) {
      await this.close(q, partyId, now, 'empty');
      return;
    }
    const p = (await q.query<{ leader_id: string }>('SELECT leader_id FROM parties WHERE id = $1', [partyId]))
      .rows[0];
    if (p && p.leader_id === who)
      await q.query('UPDATE parties SET leader_id = $2, last_activity_at = $3 WHERE id = $1', [
        partyId,
        rest[0],
        now,
      ]);
    else await q.query('UPDATE parties SET last_activity_at = $2 WHERE id = $1', [partyId, now]);
  }

  private async close(q: Queryable, partyId: string, now: Date, reason: string): Promise<void> {
    await q.query(
      "UPDATE parties SET status = 'closed', closed_at = $2, closed_reason = $3, match_room_code = NULL WHERE id = $1 AND status <> 'closed'",
      [partyId, now, reason],
    );
    await q.query(
      "UPDATE party_invites SET status = 'cancelled' WHERE party_id = $1 AND status = 'pending'",
      [partyId],
    );
    await q.query('DELETE FROM party_members WHERE party_id = $1', [partyId]);
    await audit(q, now, { type: 'party.closed', detail: { partyId, reason } });
  }

  private async requireLeader(q: Queryable, partyId: string, me: string): Promise<PartyRow> {
    const p = await this.row(q, partyId, true);
    const member = await q.query('SELECT 1 FROM party_members WHERE party_id = $1 AND player_id = $2', [
      partyId,
      me,
    ]);
    if (member.rowCount === 0) throw unavailable();
    if (p.leader_id !== me) throw forbidden('Only the party leader can do that.');
    return p;
  }

  async kick(me: string, partyId: string, target: string): Promise<PartyView> {
    const now = this.d.clock();
    return this.d.db.tx(async (q) => {
      const p = await this.requireLeader(q, partyId, me);
      if (target === me) throw badRequest('Use leave to leave the party.');
      const r = await q.query('DELETE FROM party_members WHERE party_id = $1 AND player_id = $2', [
        partyId,
        target,
      ]);
      if (r.rowCount === 0) throw notFound('they are not in this party');
      await q.query(
        "UPDATE party_invites SET status = 'cancelled' WHERE party_id = $1 AND to_id = $2 AND status = 'pending'",
        [partyId, target],
      );
      await q.query('UPDATE parties SET last_activity_at = $2 WHERE id = $1', [partyId, now]);
      return this.view(q, p, me);
    });
  }

  async promote(me: string, partyId: string, target: string): Promise<PartyView> {
    const now = this.d.clock();
    return this.d.db.tx(async (q) => {
      const p = await this.requireLeader(q, partyId, me);
      const m = await q.query('SELECT 1 FROM party_members WHERE party_id = $1 AND player_id = $2', [
        partyId,
        target,
      ]);
      if (m.rowCount === 0) throw notFound('they are not in this party');
      await q.query('UPDATE parties SET leader_id = $2, last_activity_at = $3 WHERE id = $1', [
        partyId,
        target,
        now,
      ]);
      return this.view(q, { ...p, leader_id: target }, me);
    });
  }

  async setReady(me: string, partyId: string, ready: boolean): Promise<PartyView> {
    return this.d.db.tx(async (q) => {
      const p = await this.row(q, partyId, true);
      if (p.status !== 'open') throw conflict('The match has already been opened.');
      const r = await q.query('UPDATE party_members SET ready = $3 WHERE party_id = $1 AND player_id = $2', [
        partyId,
        me,
        ready,
      ]);
      if (r.rowCount === 0) throw unavailable();
      return this.view(q, p, me);
    });
  }

  async setMode(me: string, partyId: string, mode: PartyMode): Promise<PartyView> {
    return this.d.db.tx(async (q) => {
      const p = await this.requireLeader(q, partyId, me);
      if (p.status !== 'open') throw conflict('The match has already been opened.');
      await q.query('UPDATE parties SET mode = $2, last_activity_at = $3 WHERE id = $1', [
        partyId,
        mode,
        this.d.clock(),
      ]);
      await q.query('UPDATE party_members SET ready = false WHERE party_id = $1', [partyId]);
      return this.view(q, { ...p, mode }, me);
    });
  }

  /** New code (the old one stops working at once) with a fresh 24 h lifetime. */
  async rotateCode(me: string, partyId: string): Promise<PartyView> {
    const now = this.d.clock();
    return this.d.db.tx(async (q) => {
      await this.requireLeader(q, partyId, me);
      for (let i = 0; i < 8; i++) {
        const code = newCode(PARTY_CODE_LENGTH);
        const r = await q.query<PartyRow>(
          "UPDATE parties SET code = $2, code_expires_at = $3, last_activity_at = $4 WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM parties WHERE code = $2 AND status <> 'closed') RETURNING *",
          [partyId, code, addMs(now, CODE_TTL_MS), now],
        );
        if (r.rows[0]) return this.view(q, r.rows[0], me);
      }
      throw new ApiError('unavailable', 'try again');
    });
  }

  // ---------------------------------------------------------------- invitations

  async invite(me: string, partyId: string, friendId: string): Promise<InviteView> {
    const now = this.d.clock();
    return this.d.db.tx(async (q) => {
      const p = await this.requireLeader(q, partyId, me);
      if (p.status !== 'open') throw conflict('The match has already been opened.');
      if (!(await areFriends(q, me, friendId)) || (await blockedEitherWay(q, me, friendId)))
        throw notFound('You can only invite your friends.');
      const members = await this.memberIds(q, partyId);
      if (members.length >= p.max_size) throw conflict('The party is full.');
      if (members.includes(friendId)) throw conflict('They are already in the party.');
      const pending = await q.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM party_invites WHERE party_id = $1 AND status = 'pending' AND expires_at > $2",
        [partyId, now],
      );
      if (pending.rows[0]!.n >= MAX_PENDING_INVITES) throw conflict('Too many open invitations.');
      // retire an expired pending invite so it does not block the unique (party, player) slot
      await q.query(
        "UPDATE party_invites SET status = 'cancelled' WHERE party_id = $1 AND to_id = $2 AND status = 'pending' AND expires_at <= $3",
        [partyId, friendId, now],
      );
      try {
        const ins = await q.query<{ id: string; expires_at: Date }>(
          'INSERT INTO party_invites (party_id, from_id, to_id, created_at, expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING id, expires_at',
          [partyId, me, friendId, now, addMs(now, INVITE_TTL_MS)],
        );
        const name = (await this.d.identity.publicCard(me, q))?.displayName ?? '';
        return {
          id: ins.rows[0]!.id,
          partyId,
          fromId: me,
          fromName: name,
          expiresAt: ins.rows[0]!.expires_at.toISOString(),
          members: members.length,
          maxSize: p.max_size,
        };
      } catch (e) {
        if (isUniqueViolation(e)) throw conflict('They already have an invitation.');
        throw e;
      }
    });
  }

  /** My live invitations (expired, cancelled, closed-party and blocked ones never show). */
  async invites(me: string): Promise<InviteView[]> {
    const r = await this.d.db.query<{
      id: string;
      party_id: string;
      from_id: string;
      display_name: string;
      expires_at: Date;
      members: number;
      max_size: number;
    }>(
      `SELECT i.id, i.party_id, i.from_id, f.display_name, i.expires_at, p.max_size,
              (SELECT count(*)::int FROM party_members m WHERE m.party_id = p.id) AS members
         FROM party_invites i JOIN parties p ON p.id = i.party_id AND p.status = 'open'
         JOIN profiles f ON f.player_id = i.from_id
        WHERE i.to_id = $1 AND i.status = 'pending' AND i.expires_at > $2
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = i.from_id) OR (b.blocker_id = i.from_id AND b.blocked_id = $1))
        ORDER BY i.created_at DESC LIMIT 20`,
      [me, this.d.clock()],
    );
    return r.rows.map((x) => ({
      id: x.id,
      partyId: x.party_id,
      fromId: x.from_id,
      fromName: x.display_name,
      expiresAt: x.expires_at.toISOString(),
      members: x.members,
      maxSize: x.max_size,
    }));
  }

  async acceptInvite(me: string, inviteId: string): Promise<PartyView> {
    const now = this.d.clock();
    return this.d.db.tx(async (q) => {
      const r = await q.query<{ party_id: string; expires_at: Date }>(
        "SELECT party_id, expires_at FROM party_invites WHERE id = $1 AND to_id = $2 AND status = 'pending' FOR UPDATE",
        [inviteId, me],
      );
      const inv = r.rows[0];
      if (!inv || inv.expires_at <= now) throw notFound('That invitation is no longer valid.');
      await this.requireNotInParty(q, me);
      const p = (
        await q.query<PartyRow>("SELECT * FROM parties WHERE id = $1 AND status = 'open' FOR UPDATE", [
          inv.party_id,
        ])
      ).rows[0];
      if (!p) throw notFound('That invitation is no longer valid.');
      await this.admit(q, p, me, now);
      await q.query("UPDATE party_invites SET status = 'accepted' WHERE id = $1", [inviteId]);
      return this.view(q, p, me);
    });
  }

  async declineInvite(me: string, inviteId: string): Promise<void> {
    const r = await this.d.db.query(
      "UPDATE party_invites SET status = 'declined' WHERE id = $1 AND to_id = $2 AND status = 'pending'",
      [inviteId, me],
    );
    if (r.rowCount === 0) throw notFound('That invitation is no longer valid.');
  }

  // ---------------------------------------------------------------- the match handoff

  /**
   * The leader opened a private room on the match server and reports its code. The platform does not create, start or control the
   * room: it only remembers the code for the members. (A wrong code can only send members to a room that refuses them.)
   */
  async openMatch(me: string, partyId: string, rawRoomCode: unknown): Promise<PartyView> {
    const room = normalizeRoomCode(rawRoomCode);
    if (!room) throw badRequest('That is not a room code (6 letters and digits).');
    const now = this.d.clock();
    return this.d.db.tx(async (q) => {
      const p = await this.requireLeader(q, partyId, me);
      if (p.status !== 'open') throw conflict('A match is already open for this party.');
      await q.query(
        "UPDATE parties SET status = 'in_match', match_room_code = $2, match_opened_at = $3, last_activity_at = $3 WHERE id = $1",
        [partyId, room, now],
      );
      await q.query('UPDATE party_members SET ready = false WHERE party_id = $1', [partyId]);
      return this.view(q, { ...p, status: 'in_match', match_room_code: room, match_opened_at: now }, me);
    });
  }

  /** The leader returns the party to the lobby (the room was abandoned or the match is over). */
  async closeMatch(me: string, partyId: string): Promise<PartyView> {
    const now = this.d.clock();
    return this.d.db.tx(async (q) => {
      const p = await this.requireLeader(q, partyId, me);
      await q.query(
        "UPDATE parties SET status = 'open', match_room_code = NULL, match_opened_at = NULL, last_activity_at = $2 WHERE id = $1",
        [partyId, now],
      );
      return this.view(q, { ...p, status: 'open', match_room_code: null, match_opened_at: null }, me);
    });
  }

  /**
   * A signed, two-minute ticket. Before the match is opened only the LEADER can ask, and gets a HOST ticket (it lets them create
   * the private room: the code does not exist yet). Once the leader has reported the room code, every member (the leader too)
   * gets a ticket bound to that room. Tickets are logged so the platform can later refuse a result that names someone who was never admitted.
   */
  async ticket(
    me: string,
    partyId: string,
  ): Promise<{
    ticket: string;
    roomCode: string | null;
    host: boolean;
    expiresAt: string;
    audience: string;
  }> {
    const p = await this.d.db.tx(async (q) => {
      const party = await this.row(q, partyId);
      const m = await q.query('SELECT 1 FROM party_members WHERE party_id = $1 AND player_id = $2', [
        partyId,
        me,
      ]);
      if (m.rowCount === 0) throw unavailable();
      return party;
    });
    const inMatch = p.status === 'in_match' && p.match_room_code !== null;
    if (!inMatch && p.leader_id !== me) throw conflict('The leader has not opened a match yet.');
    const room = inMatch ? p.match_room_code! : HOST_ROOM;
    const profile = await this.d.identity.profile(me);
    const caps = capabilitiesFor(profile.kind, profile.ageGroup);
    const signed = await this.d.signer.sign({
      sub: me,
      name: profile.displayName,
      char: profile.selectedCharacter,
      room,
      party: partyId,
      // unrestricted text / voice features are for adult registered accounts only (capabilitiesFor)
      restricted: !(caps.textChat || caps.voice),
    });
    await this.d.db.query(
      'INSERT INTO handoff_tickets (jti, player_id, party_id, room_code, issued_at, expires_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [signed.jti, me, partyId, room, signed.issuedAt, signed.expiresAt],
    );
    return {
      ticket: signed.token,
      roomCode: inMatch ? room : null,
      host: !inMatch,
      expiresAt: signed.expiresAt.toISOString(),
      audience: this.d.signer.audience,
    };
  }

  /** The match server reported this room finished: the party is a lobby again (ready flags cleared). */
  async matchEnded(q: Queryable, roomCode: string, now: Date): Promise<number> {
    const r = await q.query<{ id: string }>(
      "UPDATE parties SET status = 'open', match_room_code = NULL, match_opened_at = NULL, last_activity_at = $2 WHERE status = 'in_match' AND match_room_code = $1 RETURNING id",
      [roomCode, now],
    );
    for (const p of r.rows)
      await q.query('UPDATE party_members SET ready = false WHERE party_id = $1', [p.id]);
    return r.rowCount;
  }

  // ---------------------------------------------------------------- hooks and housekeeping

  /** Blocking someone in your party: a leader removes them, a member leaves. */
  private async separate(q: Queryable, blocker: string, blocked: string, now: Date): Promise<void> {
    const shared = await q.query<{ party_id: string; leader_id: string }>(
      `SELECT a.party_id, p.leader_id FROM party_members a JOIN party_members b ON a.party_id = b.party_id
         JOIN parties p ON p.id = a.party_id AND p.status <> 'closed' WHERE a.player_id = $1 AND b.player_id = $2`,
      [blocker, blocked],
    );
    const s = shared.rows[0];
    if (!s) return;
    const leaving = s.leader_id === blocker ? blocked : blocker;
    await q.query('DELETE FROM party_members WHERE party_id = $1 AND player_id = $2', [s.party_id, leaving]);
    await this.afterDeparture(q, s.party_id, leaving, now);
  }

  /** Account erasure: leave any party (promoting or closing as needed). */
  async erase(q: Queryable, playerId: string, now: Date): Promise<void> {
    const m = await q.query<{ party_id: string }>('SELECT party_id FROM party_members WHERE player_id = $1', [
      playerId,
    ]);
    for (const row of m.rows) {
      await q.query('DELETE FROM party_members WHERE party_id = $1 AND player_id = $2', [
        row.party_id,
        playerId,
      ]);
      await this.afterDeparture(q, row.party_id, playerId, now);
    }
    await q.query('DELETE FROM party_invites WHERE from_id = $1 OR to_id = $1', [playerId]);
    await q.query('DELETE FROM handoff_tickets WHERE player_id = $1', [playerId]);
  }

  /**
   * Run every ~30 s by the server timer (tests call it directly with a fake clock). Expires invitations, closes idle parties,
   * removes members who have been silent 10 minutes (the leader's departure promotes the next), releases a party whose match
   * never reported back.
   */
  async sweep(): Promise<{ invites: number; closed: number; removed: number; released: number }> {
    const now = this.d.clock();
    const db = this.d.db;
    const invites = await db.query(
      "UPDATE party_invites SET status = 'cancelled' WHERE status = 'pending' AND expires_at <= $1",
      [now],
    );
    const released = await db.query(
      "UPDATE parties SET status = 'open', match_room_code = NULL, match_opened_at = NULL, last_activity_at = $1 WHERE status = 'in_match' AND match_opened_at <= $2",
      [now, addMs(now, -MATCH_RELEASE_MS)],
    );
    let removed = 0;
    const open = await db.query<{ party_id: string; player_id: string }>(
      "SELECT m.party_id, m.player_id FROM party_members m JOIN parties p ON p.id = m.party_id WHERE p.status = 'open'",
    );
    for (const m of open.rows) {
      const seen = Math.max(this.d.presence.lastSeen(m.player_id) ?? 0, this.d.startedAt.getTime());
      if (now.getTime() - seen <= ABSENT_REMOVE_MS) continue;
      await db.tx(async (q) => {
        const gone = await q.query('DELETE FROM party_members WHERE party_id = $1 AND player_id = $2', [
          m.party_id,
          m.player_id,
        ]);
        if (gone.rowCount > 0) {
          removed++;
          await this.afterDeparture(q, m.party_id, m.player_id, now);
        }
      });
    }
    const idle = await db.query<{ id: string }>(
      "SELECT id FROM parties WHERE status = 'open' AND last_activity_at <= $1",
      [addMs(now, -IDLE_CLOSE_MS)],
    );
    for (const p of idle.rows) await db.tx((q) => this.close(q, p.id, now, 'idle'));
    return { invites: invites.rowCount, closed: idle.rows.length, removed, released: released.rowCount };
  }
}
