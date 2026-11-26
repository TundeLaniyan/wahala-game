/**
 * Friends, friend requests and blocks.
 *
 * Rules (all server-side):
 *  - friends are added by FRIEND CODE only (no name search): names are not an enumeration surface for harassment
 *  - a code that is unknown, deleted, or belongs to someone who blocked you (or whom you blocked) answers the SAME way
 *  - a request in the opposite direction is accepted automatically (both wanted it)
 *  - blocking removes the friendship, cancels requests and party invitations both ways, and removes the two from a shared party
 *  - limits: 100 friends, 20 pending outgoing requests, 200 blocks; a pending request lapses after 30 days
 */
import { badRequest, conflict, notFound } from '../errors';
import type { ApiError } from '../errors';
import { audit } from '../audit';
import type { Db, Queryable } from '../db/types';
import { isUniqueViolation } from '../db/types';
import type { PublicCard } from '../identity/types';
import { DAY, addMs } from '../util/clock';
import type { Clock } from '../util/clock';
import { normaliseCode } from '../util/secrets';
import { FRIEND_CODE_LENGTH } from '../identity/service';
import type { PresenceStatus, PresenceStore } from './presence';

export const MAX_FRIENDS = 100;
export const MAX_PENDING_OUT = 20;
export const MAX_BLOCKS = 200;
export const REQUEST_TTL_MS = 30 * DAY;

export interface FriendView {
  playerId: string;
  displayName: string;
  selectedCharacter: string;
  presence: PresenceStatus;
  since: string;
}

export interface RequestView {
  id: string;
  playerId: string;
  displayName: string;
  createdAt: string;
}

export interface BlockView {
  playerId: string;
  displayName: string;
  since: string;
}

const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

/** True when either player has blocked the other. Used by every feature that connects two players. */
export async function blockedEitherWay(q: Queryable, a: string, b: string): Promise<boolean> {
  const r = await q.query(
    'SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)',
    [a, b],
  );
  return r.rowCount > 0;
}

export async function areFriends(q: Queryable, a: string, b: string): Promise<boolean> {
  const [x, y] = pair(a, b);
  return (
    (await q.query('SELECT 1 FROM friendships WHERE player_a = $1 AND player_b = $2', [x, y])).rowCount > 0
  );
}

type BlockHook = (q: Queryable, blocker: string, blocked: string, now: Date) => Promise<void>;

export class SocialService {
  private readonly blockHooks: BlockHook[] = [];
  constructor(private readonly d: { db: Db; clock: Clock; presence: PresenceStore }) {}

  /** The party module registers here: blocking someone you share a party with must separate you. */
  onBlock(h: BlockHook): void {
    this.blockHooks.push(h);
  }

  /** Presence as `viewer` is allowed to see it: hidden people, deleted people and blockers read as offline. */
  private visiblePresence(hidden: boolean, id: string): PresenceStatus {
    return hidden ? 'offline' : this.d.presence.get(id);
  }

  async friends(playerId: string): Promise<FriendView[]> {
    const r = await this.d.db.query<{
      id: string;
      display_name: string;
      selected_character: string;
      presence_visibility: string;
      created_at: Date;
    }>(
      `SELECT p.id, f.display_name, f.selected_character, f.presence_visibility, fs.created_at
         FROM friendships fs
         JOIN players p ON p.id = CASE WHEN fs.player_a = $1 THEN fs.player_b ELSE fs.player_a END
         JOIN profiles f ON f.player_id = p.id
        WHERE (fs.player_a = $1 OR fs.player_b = $1) AND p.status = 'active'
        ORDER BY lower(f.display_name) LIMIT $2`,
      [playerId, MAX_FRIENDS],
    );
    return r.rows.map((x) => ({
      playerId: x.id,
      displayName: x.display_name,
      selectedCharacter: x.selected_character,
      presence: this.visiblePresence(x.presence_visibility === 'nobody', x.id),
      since: x.created_at.toISOString(),
    }));
  }

  async requests(playerId: string): Promise<{ incoming: RequestView[]; outgoing: RequestView[] }> {
    const cutoff = addMs(this.d.clock(), -REQUEST_TTL_MS);
    const incoming = await this.d.db.query<{
      id: string;
      pid: string;
      display_name: string;
      created_at: Date;
    }>(
      `SELECT r.id, r.from_id AS pid, f.display_name, r.created_at FROM friend_requests r JOIN profiles f ON f.player_id = r.from_id
        JOIN players p ON p.id = r.from_id AND p.status = 'active'
        WHERE r.to_id = $1 AND r.status = 'pending' AND r.created_at > $2 ORDER BY r.created_at DESC LIMIT 50`,
      [playerId, cutoff],
    );
    const outgoing = await this.d.db.query<{
      id: string;
      pid: string;
      display_name: string;
      created_at: Date;
    }>(
      `SELECT r.id, r.to_id AS pid, f.display_name, r.created_at FROM friend_requests r JOIN profiles f ON f.player_id = r.to_id
        JOIN players p ON p.id = r.to_id AND p.status = 'active'
        WHERE r.from_id = $1 AND r.status = 'pending' AND r.created_at > $2 ORDER BY r.created_at DESC LIMIT 50`,
      [playerId, cutoff],
    );
    const view = (x: { id: string; pid: string; display_name: string; created_at: Date }): RequestView => ({
      id: x.id,
      playerId: x.pid,
      displayName: x.display_name,
      createdAt: x.created_at.toISOString(),
    });
    return { incoming: incoming.rows.map(view), outgoing: outgoing.rows.map(view) };
  }

  /** Sends a request by friend code. Returns `accepted` when the other side had already asked you. */
  async sendRequest(
    me: string,
    rawCode: unknown,
  ): Promise<{ status: 'pending' | 'accepted'; requestId: string; player: PublicCard }> {
    const code = normaliseCode(rawCode, FRIEND_CODE_LENGTH);
    if (!code) throw badRequest('friend codes are 8 letters and digits');
    const now = this.d.clock();
    return this.d.db.tx(async (q) => {
      const t = await q.query<{
        id: string;
        display_name: string;
        selected_character: string;
        loadout: Record<string, string>;
      }>(
        `SELECT p.id, f.display_name, f.selected_character, f.loadout FROM players p JOIN profiles f ON f.player_id = p.id
          WHERE p.friend_code = $1 AND p.status = 'active'`,
        [code],
      );
      const target = t.rows[0];
      // one answer for: no such code, deleted, suspended, you blocked them, they blocked you
      const none = (): ApiError => notFound('No player has that friend code.');
      if (!target) throw none();
      if (target.id === me) throw badRequest('That is your own friend code.');
      if (await blockedEitherWay(q, me, target.id)) throw none();
      if (await areFriends(q, me, target.id)) throw conflict('You are already friends.');
      const card: PublicCard = {
        id: target.id,
        displayName: target.display_name,
        selectedCharacter: target.selected_character,
        loadout: target.loadout,
      };

      const cutoff = addMs(now, -REQUEST_TTL_MS);
      const existing = await q.query<{ id: string; from_id: string }>(
        `SELECT id, from_id FROM friend_requests WHERE status = 'pending' AND created_at > $3
          AND ((from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1)) FOR UPDATE`,
        [me, target.id, cutoff],
      );
      const ex = existing.rows[0];
      if (ex && ex.from_id === me) throw conflict('You already sent them a request.');
      if (ex) {
        await this.makeFriends(q, now, ex.id, target.id, me);
        return { status: 'accepted' as const, requestId: ex.id, player: card };
      }
      // a stale pending row (older than the TTL) blocks the unique index: retire it
      await q.query(
        "UPDATE friend_requests SET status = 'cancelled', responded_at = $3 WHERE status = 'pending' AND created_at <= $4 AND ((from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1))",
        [me, target.id, now, cutoff],
      );
      const out = await q.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM friend_requests WHERE from_id = $1 AND status = 'pending'",
        [me],
      );
      if (out.rows[0]!.n >= MAX_PENDING_OUT)
        throw conflict('You have too many pending requests. Wait for answers or cancel some.');
      if ((await this.friendCount(q, me)) >= MAX_FRIENDS) throw conflict('Your friend list is full.');
      if ((await this.friendCount(q, target.id)) >= MAX_FRIENDS)
        throw conflict('They cannot accept more friends right now.');
      try {
        const ins = await q.query<{ id: string }>(
          'INSERT INTO friend_requests (from_id, to_id, created_at) VALUES ($1, $2, $3) RETURNING id',
          [me, target.id, now],
        );
        return { status: 'pending' as const, requestId: ins.rows[0]!.id, player: card };
      } catch (e) {
        if (isUniqueViolation(e)) throw conflict('A request between you two is already pending.');
        throw e;
      }
    });
  }

  private async friendCount(q: Queryable, id: string): Promise<number> {
    const r = await q.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM friendships WHERE player_a = $1 OR player_b = $1',
      [id],
    );
    return r.rows[0]!.n;
  }

  private async makeFriends(q: Queryable, now: Date, requestId: string, a: string, b: string): Promise<void> {
    const [x, y] = pair(a, b);
    await q.query("UPDATE friend_requests SET status = 'accepted', responded_at = $2 WHERE id = $1", [
      requestId,
      now,
    ]);
    await q.query(
      'INSERT INTO friendships (player_a, player_b, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [x, y, now],
    );
  }

  async accept(me: string, requestId: string): Promise<FriendView> {
    const now = this.d.clock();
    return this.d.db.tx(async (q) => {
      const r = await q.query<{ from_id: string; created_at: Date }>(
        "SELECT from_id, created_at FROM friend_requests WHERE id = $1 AND to_id = $2 AND status = 'pending' FOR UPDATE",
        [requestId, me],
      );
      const req = r.rows[0];
      if (!req || req.created_at <= addMs(now, -REQUEST_TTL_MS)) throw notFound('no such request');
      if (await blockedEitherWay(q, me, req.from_id)) throw notFound('no such request');
      if ((await this.friendCount(q, me)) >= MAX_FRIENDS) throw conflict('Your friend list is full.');
      if ((await this.friendCount(q, req.from_id)) >= MAX_FRIENDS)
        throw conflict('They cannot accept more friends right now.');
      await this.makeFriends(q, now, requestId, req.from_id, me);
      const f = (await this.friendsAmong(q, me, [req.from_id]))[0];
      if (!f) throw notFound('no such player');
      return f;
    });
  }

  private async friendsAmong(q: Queryable, me: string, ids: string[]): Promise<FriendView[]> {
    const r = await q.query<{
      id: string;
      display_name: string;
      selected_character: string;
      presence_visibility: string;
      created_at: Date;
    }>(
      `SELECT p.id, f.display_name, f.selected_character, f.presence_visibility, fs.created_at FROM friendships fs
        JOIN players p ON p.id = CASE WHEN fs.player_a = $1 THEN fs.player_b ELSE fs.player_a END
        JOIN profiles f ON f.player_id = p.id WHERE (fs.player_a = $1 OR fs.player_b = $1) AND p.id = ANY($2::uuid[])`,
      [me, ids],
    );
    return r.rows.map((x) => ({
      playerId: x.id,
      displayName: x.display_name,
      selectedCharacter: x.selected_character,
      presence: this.visiblePresence(x.presence_visibility === 'nobody', x.id),
      since: x.created_at.toISOString(),
    }));
  }

  /** The receiver declines, or the sender cancels: both end the request; neither tells the other which happened. */
  async decline(me: string, requestId: string): Promise<void> {
    const r = await this.d.db.query(
      "UPDATE friend_requests SET status = 'declined', responded_at = $3 WHERE id = $1 AND to_id = $2 AND status = 'pending'",
      [requestId, me, this.d.clock()],
    );
    if (r.rowCount === 0) throw notFound('no such request');
  }

  async cancel(me: string, requestId: string): Promise<void> {
    const r = await this.d.db.query(
      "UPDATE friend_requests SET status = 'cancelled', responded_at = $3 WHERE id = $1 AND from_id = $2 AND status = 'pending'",
      [requestId, me, this.d.clock()],
    );
    if (r.rowCount === 0) throw notFound('no such request');
  }

  async removeFriend(me: string, other: string): Promise<void> {
    const [x, y] = pair(me, other);
    const r = await this.d.db.query('DELETE FROM friendships WHERE player_a = $1 AND player_b = $2', [x, y]);
    if (r.rowCount === 0) throw notFound('not your friend');
  }

  // ---------------------------------------------------------------- blocks

  async blocks(me: string): Promise<BlockView[]> {
    const r = await this.d.db.query<{ blocked_id: string; display_name: string; created_at: Date }>(
      'SELECT b.blocked_id, f.display_name, b.created_at FROM blocks b JOIN profiles f ON f.player_id = b.blocked_id WHERE b.blocker_id = $1 ORDER BY b.created_at DESC LIMIT $2',
      [me, MAX_BLOCKS],
    );
    return r.rows.map((x) => ({
      playerId: x.blocked_id,
      displayName: x.display_name,
      since: x.created_at.toISOString(),
    }));
  }

  /** Blocks `target`. Idempotent. Unfriends, cancels requests and invitations both ways, separates a shared party. */
  async block(me: string, target: string): Promise<void> {
    if (me === target) throw badRequest('You cannot block yourself.');
    const now = this.d.clock();
    await this.d.db.tx(async (q) => {
      const exists = await q.query("SELECT 1 FROM players WHERE id = $1 AND status <> 'deleted'", [target]);
      if (exists.rowCount === 0) throw notFound('no such player');
      const count = await q.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM blocks WHERE blocker_id = $1',
        [me],
      );
      const already = await q.query('SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [
        me,
        target,
      ]);
      if (already.rowCount > 0) return;
      if (count.rows[0]!.n >= MAX_BLOCKS) throw conflict('Your block list is full.');
      await q.query('INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES ($1, $2, $3)', [
        me,
        target,
        now,
      ]);
      const [x, y] = pair(me, target);
      await q.query('DELETE FROM friendships WHERE player_a = $1 AND player_b = $2', [x, y]);
      await q.query(
        "UPDATE friend_requests SET status = 'cancelled', responded_at = $3 WHERE status = 'pending' AND ((from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1))",
        [me, target, now],
      );
      await q.query(
        "UPDATE party_invites SET status = 'cancelled' WHERE status = 'pending' AND ((from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1))",
        [me, target],
      );
      for (const h of this.blockHooks) await h(q, me, target, now);
      await audit(q, now, { type: 'friend.blocked', actor: me, subject: target });
    });
  }

  async unblock(me: string, target: string): Promise<void> {
    const r = await this.d.db.query('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [
      me,
      target,
    ]);
    if (r.rowCount === 0) throw notFound('not blocked');
  }

  /** Erasure hook: everything this player owns in the social graph. */
  async erase(q: Queryable, playerId: string): Promise<void> {
    this.d.presence.forget(playerId);
    await q.query('DELETE FROM friend_requests WHERE from_id = $1 OR to_id = $1', [playerId]);
    await q.query('DELETE FROM friendships WHERE player_a = $1 OR player_b = $1', [playerId]);
    await q.query('DELETE FROM blocks WHERE blocker_id = $1 OR blocked_id = $1', [playerId]);
  }
}
