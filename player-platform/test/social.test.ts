import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HEARTBEAT_TTL_MS } from '../src/social/presence';
import { DAY, SECOND } from '../src/util/clock';
import { befriend, client, newGuest, newRegistered, startHarness } from './helpers';
import type { Api, Harness } from './helpers';

let h: Harness;
let api: Api;
beforeAll(async () => {
  h = await startHarness();
  api = client(h.base);
});
afterAll(() => h.close());

describe('friend requests', () => {
  it('sends by friend code, receives, accepts; both sides then see each other', async () => {
    const a = await newGuest(api, 'Ada Friend');
    const b = await newGuest(api, 'Bola Friend');
    const sent = await api.post('/v1/friends/requests', { code: b.friendCode.toLowerCase() }, a.access);
    expect(sent.status).toBe(201);
    expect(sent.body.status).toBe('pending');
    expect(sent.body.player).toEqual(expect.objectContaining({ id: b.id, displayName: 'Bola Friend' }));
    const out = await api.get('/v1/friends/requests', a.access);
    expect(out.body.outgoing).toHaveLength(1);
    const inc = await api.get('/v1/friends/requests', b.access);
    expect(inc.body.incoming).toEqual([
      expect.objectContaining({ playerId: a.id, displayName: 'Ada Friend' }),
    ]);
    // only the RECEIVER can accept
    expect(
      (await api.post(`/v1/friends/requests/${inc.body.incoming[0].id}/accept`, {}, a.access)).status,
    ).toBe(404);
    const acc = await api.post(`/v1/friends/requests/${inc.body.incoming[0].id}/accept`, {}, b.access);
    expect(acc.status).toBe(200);
    expect(acc.body.friend.playerId).toBe(a.id);
    expect(
      (await api.get('/v1/friends', a.access)).body.friends.map((f: { playerId: string }) => f.playerId),
    ).toEqual([b.id]);
    expect(
      (await api.get('/v1/friends', b.access)).body.friends.map((f: { playerId: string }) => f.playerId),
    ).toEqual([a.id]);
    expect((await api.get('/v1/friends/requests', b.access)).body.incoming).toEqual([]);
  });

  it('a request the other way round while one is pending becomes a friendship at once', async () => {
    const a = await newGuest(api);
    const b = await newGuest(api);
    await api.post('/v1/friends/requests', { code: b.friendCode }, a.access);
    const back = await api.post('/v1/friends/requests', { code: a.friendCode }, b.access);
    expect(back.status).toBe(200);
    expect(back.body.status).toBe('accepted');
    expect((await api.get('/v1/friends', a.access)).body.friends).toHaveLength(1);
  });

  it('refuses yourself, duplicates, existing friends, malformed and unknown codes (unknown looks like blocked)', async () => {
    const a = await newGuest(api);
    const b = await newGuest(api);
    expect((await api.post('/v1/friends/requests', { code: a.friendCode }, a.access)).status).toBe(400);
    expect((await api.post('/v1/friends/requests', { code: 'short' }, a.access)).status).toBe(400);
    expect((await api.post('/v1/friends/requests', { code: 'ZZZZZZZZ' }, a.access)).status).toBe(404);
    await api.post('/v1/friends/requests', { code: b.friendCode }, a.access);
    expect((await api.post('/v1/friends/requests', { code: b.friendCode }, a.access)).status).toBe(409);
    await befriend(api, b, a).catch(() => undefined);
    const fresh = await newGuest(api);
    const c = await newGuest(api);
    await befriend(api, fresh, c);
    expect((await api.post('/v1/friends/requests', { code: c.friendCode }, fresh.access)).status).toBe(409);
  });

  it('decline and cancel end a request without telling the other side which', async () => {
    const a = await newGuest(api);
    const b = await newGuest(api);
    await api.post('/v1/friends/requests', { code: b.friendCode }, a.access);
    const id = (await api.get('/v1/friends/requests', a.access)).body.outgoing[0].id;
    expect((await api.del(`/v1/friends/requests/${id}`, b.access)).status).toBe(404); // only the sender cancels
    expect((await api.del(`/v1/friends/requests/${id}`, a.access)).status).toBe(204);
    await api.post('/v1/friends/requests', { code: b.friendCode }, a.access);
    const id2 = (await api.get('/v1/friends/requests', b.access)).body.incoming[0].id;
    expect((await api.post(`/v1/friends/requests/${id2}/decline`, {}, b.access)).status).toBe(204);
    expect((await api.get('/v1/friends/requests', a.access)).body.outgoing).toEqual([]);
    // after a decline they may ask again
    expect((await api.post('/v1/friends/requests', { code: b.friendCode }, a.access)).status).toBe(201);
  });

  it('a pending request lapses after 30 days', async () => {
    const a = await newGuest(api);
    const b = await newGuest(api);
    await api.post('/v1/friends/requests', { code: b.friendCode }, a.access);
    const id = (await api.get('/v1/friends/requests', b.access)).body.incoming[0].id;
    // refresh tokens live 30 days (sliding): keep both sessions alive across the 31 days
    const hop = async (g: { refresh: string }) =>
      (await api.post('/v1/auth/refresh', { refreshToken: g.refresh })).body.tokens as {
        accessToken: string;
        refreshToken: string;
      };
    h.clock.advance(20 * DAY);
    const a1 = await hop(a);
    const b1 = await hop(b);
    h.clock.advance(11 * DAY);
    const ra = (await hop({ refresh: a1.refreshToken })).accessToken;
    const rb = (await hop({ refresh: b1.refreshToken })).accessToken;
    expect((await api.get('/v1/friends/requests', rb)).body.incoming).toEqual([]);
    expect((await api.post(`/v1/friends/requests/${id}/accept`, {}, rb)).status).toBe(404);
    // and the stale row no longer blocks a new request
    expect((await api.post('/v1/friends/requests', { code: b.friendCode }, ra)).status).toBe(201);
  });

  it('removes a friend for both sides, and limits pending outgoing requests', async () => {
    const a = await newGuest(api);
    const b = await newGuest(api);
    await befriend(api, a, b);
    expect((await api.del(`/v1/friends/${b.id}`, a.access)).status).toBe(204);
    expect((await api.get('/v1/friends', b.access)).body.friends).toEqual([]);
    expect((await api.del(`/v1/friends/${b.id}`, a.access)).status).toBe(404);
    const spammer = await newGuest(api);
    let refused = 0;
    for (let i = 0; i < 22; i++) {
      const t = await newGuest(api);
      if ((await api.post('/v1/friends/requests', { code: t.friendCode }, spammer.access)).status === 409)
        refused++;
    }
    expect(refused).toBe(2); // 20 pending allowed
  });

  it('rotating a friend code invalidates the old code for new requests', async () => {
    const a = await newGuest(api);
    const b = await newGuest(api);
    const fresh = (await api.post('/v1/me/friend-code/rotate', {}, b.access)).body.friendCode;
    expect((await api.post('/v1/friends/requests', { code: b.friendCode }, a.access)).status).toBe(404);
    expect((await api.post('/v1/friends/requests', { code: fresh }, a.access)).status).toBe(201);
  });
});

describe('blocking', () => {
  it('unfriends, cancels requests both ways, and makes the blocker unfindable by the blocked', async () => {
    const a = await newGuest(api);
    const b = await newGuest(api);
    const c = await newGuest(api);
    await befriend(api, a, b);
    await api.post('/v1/friends/requests', { code: c.friendCode }, a.access);
    expect((await api.call('PUT', `/v1/blocks/${b.id}`, {}, a.access)).status).toBe(204);
    expect((await api.call('PUT', `/v1/blocks/${c.id}`, {}, a.access)).status).toBe(204);
    expect((await api.get('/v1/friends', b.access)).body.friends).toEqual([]);
    expect((await api.get('/v1/friends/requests', c.access)).body.incoming).toEqual([]);
    // the blocked player cannot find the blocker by code: same answer as a code that does not exist
    const found = await api.post('/v1/friends/requests', { code: a.friendCode }, b.access);
    expect(found.status).toBe(404);
    expect(found.body.error.message).toBe('No player has that friend code.');
    // and the blocker cannot add them either (they would have to unblock first)
    expect((await api.post('/v1/friends/requests', { code: b.friendCode }, a.access)).status).toBe(404);
    expect(
      (await api.get('/v1/blocks', a.access)).body.blocks.map((x: { playerId: string }) => x.playerId).sort(),
    ).toEqual([b.id, c.id].sort());
    // blocks are private: the blocked player's list does not show the blocker
    expect((await api.get('/v1/blocks', b.access)).body.blocks).toEqual([]);
    expect((await api.del(`/v1/blocks/${b.id}`, a.access)).status).toBe(204);
    expect((await api.post('/v1/friends/requests', { code: b.friendCode }, a.access)).status).toBe(201);
  });

  it('is idempotent, refuses yourself and unknown players', async () => {
    const a = await newGuest(api);
    const b = await newGuest(api);
    expect((await api.call('PUT', `/v1/blocks/${a.id}`, {}, a.access)).status).toBe(400);
    expect(
      (await api.call('PUT', '/v1/blocks/00000000-0000-4000-8000-000000000000', {}, a.access)).status,
    ).toBe(404);
    expect((await api.call('PUT', `/v1/blocks/${b.id}`, {}, a.access)).status).toBe(204);
    expect((await api.call('PUT', `/v1/blocks/${b.id}`, {}, a.access)).status).toBe(204);
    expect((await api.get('/v1/blocks', a.access)).body.blocks).toHaveLength(1);
    expect((await api.del(`/v1/blocks/${a.id}`, a.access)).status).toBe(404);
  });
});

describe('presence', () => {
  it('shows a friend online while their heartbeat is fresh and offline after 90 s; they cannot claim in_match', async () => {
    const a = await newGuest(api);
    const b = await newGuest(api);
    await befriend(api, a, b);
    expect((await api.get('/v1/friends', a.access)).body.friends[0].presence).toBe('offline');
    expect((await api.call('PUT', '/v1/presence', { status: 'online' }, b.access)).status).toBe(204);
    expect((await api.get('/v1/friends', a.access)).body.friends[0].presence).toBe('online');
    expect((await api.call('PUT', '/v1/presence', { status: 'away' }, b.access)).status).toBe(204);
    expect((await api.get('/v1/friends', a.access)).body.friends[0].presence).toBe('away');
    expect((await api.call('PUT', '/v1/presence', { status: 'in_match' }, b.access)).status).toBe(400);
    h.clock.advance(HEARTBEAT_TTL_MS + SECOND);
    const a2 = (await api.post('/v1/auth/refresh', { refreshToken: a.refresh })).body.tokens.accessToken;
    expect((await api.get('/v1/friends', a2)).body.friends[0].presence).toBe('offline');
  });

  it('a player who hides presence reads as offline to friends', async () => {
    const a = await newGuest(api);
    const b = await newGuest(api);
    await befriend(api, a, b);
    await api.call('PUT', '/v1/presence', { status: 'online' }, b.access);
    await api.patch('/v1/me', { presenceVisibility: 'nobody' }, b.access);
    expect((await api.get('/v1/friends', a.access)).body.friends[0].presence).toBe('offline');
  });
});

describe('deleting an account', () => {
  it('removes the player from friends lists, requests and blocks; the tombstone keeps no social data', async () => {
    const a = await newGuest(api);
    const gone = await newRegistered(api, 'social-gone', 'Gone Soon');
    const c = await newGuest(api);
    await befriend(api, a, gone);
    await api.post('/v1/friends/requests', { code: c.friendCode }, gone.access);
    expect((await api.post('/v1/me/delete', { confirm: 'DELETE' }, gone.access)).status).toBe(204);
    expect((await api.get('/v1/friends', a.access)).body.friends).toEqual([]);
    expect((await api.get('/v1/friends/requests', c.access)).body.incoming).toEqual([]);
    for (const t of ['friendships', 'friend_requests', 'blocks'])
      expect(
        (
          await h.platform.db.query(
            `SELECT 1 FROM ${t} WHERE ${t === 'friendships' ? 'player_a = $1 OR player_b' : t === 'blocks' ? 'blocker_id = $1 OR blocked_id' : 'from_id = $1 OR to_id'} = $1`,
            [gone.id],
          )
        ).rowCount,
      ).toBe(0);
  });
});
