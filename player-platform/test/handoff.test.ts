import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyHandoffTicket } from '../src/handoff/verify';
import { SERVICE_SKEW_MS } from '../src/http/serviceAuth';
import { MINUTE } from '../src/util/clock';
import { client, internalCall, newGuest, newRegistered, startHarness, TEST_SECRET } from './helpers';
import type { Api, Harness } from './helpers';

let h: Harness;
let api: Api;
beforeAll(async () => {
  h = await startHarness();
  api = client(h.base);
});
afterAll(() => h.close());

type G = Awaited<ReturnType<typeof newGuest>>;
const ROOM = 'K7M2QX';

/** A party of two with an open match; returns both and the party id. */
async function openParty(room = ROOM) {
  const lead = await newGuest(api);
  const m = await newGuest(api);
  const p = (await api.post('/v1/parties', {}, lead.access)).body.party;
  await api.post('/v1/parties/join', { code: p.code }, m.access);
  const opened = await api.post(`/v1/parties/${p.id}/match`, { roomCode: room }, lead.access);
  return { lead, m, p, opened };
}
const jwks = async () => (await api.get('/.well-known/jwks.json')).body as { keys: { x: string }[] };

describe('opening a match for a party', () => {
  it('the leader reports the match server room code; members then see it and the party is in_match', async () => {
    const { lead, m, p, opened } = await openParty();
    expect(opened.status).toBe(200);
    expect(opened.body.party).toMatchObject({ status: 'in_match', match: { roomCode: ROOM } });
    expect(opened.body.party.you.canOpenMatch).toBe(false);
    const seen = await api.get(`/v1/parties/${p.id}`, m.access);
    expect(seen.body.party.match.roomCode).toBe(ROOM);
    // not twice, not malformed, not by a member
    expect((await api.post(`/v1/parties/${p.id}/match`, { roomCode: 'ABC234' }, lead.access)).status).toBe(
      409,
    );
    const fresh = await newGuest(api);
    const pf = (await api.post('/v1/parties', {}, fresh.access)).body.party;
    expect(
      (await api.post(`/v1/parties/${pf.id}/match`, { roomCode: 'not a code' }, fresh.access)).status,
    ).toBe(400);
    expect((await api.post(`/v1/parties/${pf.id}/match`, { roomCode: 'ILOVE0' }, fresh.access)).status).toBe(
      400,
    ); // I, L, O, 0 are not in the alphabet
  });

  it('no new invitations, ready changes or mode changes once the match is open; the leader can return to the lobby', async () => {
    const { lead, m, p } = await openParty();
    expect((await api.post(`/v1/parties/${p.id}/ready`, { ready: true }, m.access)).status).toBe(409);
    expect((await api.patch(`/v1/parties/${p.id}`, { mode: 'team' }, lead.access)).status).toBe(409);
    const back = await api.del(`/v1/parties/${p.id}/match`, lead.access);
    expect(back.body.party).toMatchObject({ status: 'open', match: null });
    expect((await api.del(`/v1/parties/${p.id}/match`, m.access)).status).toBe(403);
  });
});

describe('match tickets (platform -> client -> match server)', () => {
  const verify = async (token: string, room = ROOM, opts: { audience?: string; now?: Date } = {}) =>
    verifyHandoffTicket(token, {
      keys: createLocalJWKSet((await jwks()) as never),
      audience: opts.audience ?? 'wahala-rumble',
      roomCode: room,
      now: opts.now ?? h.clock.now,
    });

  it('a member gets a ticket the match server can verify with only the PUBLIC key, bound to the room and the player', async () => {
    const { m, p } = await openParty();
    const t = await api.post(`/v1/parties/${p.id}/match/ticket`, {}, m.access);
    expect(t.status).toBe(201);
    expect(t.body).toMatchObject({ roomCode: ROOM, audience: 'wahala-rumble' });
    const v = await verify(t.body.ticket);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.claims).toMatchObject({ sub: m.id, name: m.name, room: ROOM, party: p.id, restricted: true });
      expect(v.claims.char).toBe(m.profile.selectedCharacter);
    }
    expect(JSON.stringify(await jwks())).not.toMatch(/"d"/); // never the private part
  });

  it('is refused for the wrong room, the wrong audience, after two minutes, and from another key', async () => {
    const { m, p } = await openParty();
    const t = (await api.post(`/v1/parties/${p.id}/match/ticket`, {}, m.access)).body.ticket as string;
    expect(await verify(t, 'ZZZZZZ')).toEqual({ ok: false, reason: 'wrong_room' });
    expect((await verify(t, ROOM, { audience: 'someone-else' })).ok).toBe(false);
    expect((await verify(t, ROOM, { now: new Date(h.clock.now.getTime() + 3 * MINUTE) })).ok).toBe(false);
    expect((await verify('not-a-token')).ok).toBe(false);
    expect((await verify(undefined as unknown as string)).ok).toBe(false);
    const evil = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
    const forged = await new SignJWT({
      name: 'Mallory',
      char: 'x',
      room: ROOM,
      party: null,
      restricted: false,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'handoff-1' })
      .setIssuer('wahala-platform')
      .setAudience('wahala-rumble')
      .setSubject(m.id)
      .setJti('1')
      .setIssuedAt()
      .setExpirationTime('2m')
      .sign(evil.privateKey);
    expect((await verify(forged)).ok).toBe(false);
    // an algorithm-confusion attempt: HS256 signed with the public key bytes must not verify
    const pub = (await jwks()).keys[0]!;
    const hs = await new SignJWT({ name: 'x', room: ROOM })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('wahala-platform')
      .setAudience('wahala-rumble')
      .setSubject(m.id)
      .setJti('2')
      .setExpirationTime('2m')
      .sign(new TextEncoder().encode(pub.x.padEnd(32, 'x')));
    expect((await verify(hs)).ok).toBe(false);
    void exportJWK;
  });

  it('only members of a party with an open match can get one; every ticket is logged for the result check', async () => {
    const { lead, m, p } = await openParty();
    const outsider = await newGuest(api);
    expect((await api.post(`/v1/parties/${p.id}/match/ticket`, {}, outsider.access)).status).toBe(404);
    expect((await api.post(`/v1/parties/${p.id}/match/ticket`, {}, lead.access)).status).toBe(201);
    const lobby = (await api.post('/v1/parties', {}, (await newGuest(api)).access)).body.party;
    const solo = await newGuest(api);
    const ps = (await api.post('/v1/parties', {}, solo.access)).body.party;
    const mem = await newGuest(api);
    await api.post('/v1/parties/join', { code: ps.code }, mem.access);
    expect((await api.post(`/v1/parties/${ps.id}/match/ticket`, {}, mem.access)).status).toBe(409); // members wait for the leader to open the match
    const host = await api.post(`/v1/parties/${ps.id}/match/ticket`, {}, solo.access); // the leader may create the room
    expect(host.body).toMatchObject({ host: true, roomCode: null });
    const vh = await verifyHandoffTicket(host.body.ticket, {
      keys: createLocalJWKSet((await jwks()) as never),
      audience: 'wahala-rumble',
      roomCode: null,
      now: h.clock.now,
    });
    expect(vh.ok && vh.claims.room).toBe('*');
    // a host ticket is not a way into somebody else's room, and a room ticket is not a way to create one
    const wrong = await verifyHandoffTicket(host.body.ticket, {
      keys: createLocalJWKSet((await jwks()) as never),
      audience: 'wahala-rumble',
      roomCode: 'ABC234',
      now: h.clock.now,
    });
    expect(wrong).toEqual({ ok: false, reason: 'wrong_room' });
    void lobby;
    const logged = await h.platform.db.query(
      'SELECT player_id, room_code FROM handoff_tickets WHERE party_id = $1',
      [p.id],
    );
    expect(logged.rows).toEqual([{ player_id: lead.id, room_code: ROOM }]);
    const created = await verifyHandoffTicket(
      (await api.post(`/v1/parties/${p.id}/match/ticket`, {}, m.access)).body.ticket,
      {
        keys: createLocalJWKSet((await jwks()) as never),
        audience: 'wahala-rumble',
        roomCode: null,
        now: h.clock.now,
      },
    );
    expect(created).toEqual({ ok: false, reason: 'wrong_room' });
    void m;
  });

  it('marks a registered adult as unrestricted and a guest or minor as restricted', async () => {
    const adult = await newRegistered(api, 'ticket-adult', 'Ticket Adult');
    await api.patch('/v1/me', { ageGroup: 'adult' }, adult.access);
    const kid = await newGuest(api);
    const p = (await api.post('/v1/parties', {}, adult.access)).body.party;
    await api.post('/v1/parties/join', { code: p.code }, kid.access);
    await api.post(`/v1/parties/${p.id}/match`, { roomCode: 'T3S7QR' }, adult.access);
    const ta = (await api.post(`/v1/parties/${p.id}/match/ticket`, {}, adult.access)).body.ticket;
    const tk = (await api.post(`/v1/parties/${p.id}/match/ticket`, {}, kid.access)).body.ticket;
    const keys = createLocalJWKSet((await jwks()) as never);
    const now = h.clock.now;
    const ca = await verifyHandoffTicket(ta, { keys, audience: 'wahala-rumble', roomCode: 'T3S7QR', now });
    const ck = await verifyHandoffTicket(tk, { keys, audience: 'wahala-rumble', roomCode: 'T3S7QR', now });
    expect(ca.ok && ca.claims.restricted).toBe(false);
    expect(ck.ok && ck.claims.restricted).toBe(true);
  });
});

const participants = (...ps: { id: string | null; name: string; bot?: boolean; team?: number }[]) =>
  ps.map((p, seat) => ({ seat, playerId: p.id, name: p.name, isBot: p.bot ?? false, team: p.team ?? null }));

describe('results come only from the signed match server', () => {
  const started = (matchId: string, room: string, ps: ReturnType<typeof participants>) => ({
    matchId,
    game: 'deathmatch',
    arenaId: 'rumbleOshodi',
    roomCode: room,
    seats: 32,
    startedAt: h.clock.now.toISOString(),
    participants: ps,
  });
  const finished = (
    matchId: string,
    room: string,
    ps: ReturnType<typeof participants>,
    extra: object = {},
  ) => ({
    matchId,
    game: 'deathmatch',
    arenaId: 'rumbleOshodi',
    roomCode: room,
    seats: 32,
    startedAt: h.clock.now.toISOString(),
    endedAt: new Date(h.clock.now.getTime() + 300_000).toISOString(),
    durationSec: 300,
    participants: ps,
    results: ps.map((p, i) => ({
      seat: p.seat,
      placement: i + 1,
      kills: 3 - i,
      deaths: i,
      assists: 0,
      botKills: 0,
      botDeaths: 0,
      botAssists: 0,
      controlledByBotAtEnd: false,
    })),
    ...extra,
  });

  it('refuses unsigned, wrongly signed, stale and replayed-later calls: a player token is not enough', async () => {
    const body = started('match-auth-1', ROOM, participants({ id: null, name: 'Guest' }));
    const raw = await fetch(`${h.base}/internal/v1/matches/started`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(raw.status).toBe(401);
    const g = await newGuest(api);
    expect((await api.post('/internal/v1/matches/started', body, g.access)).status).toBe(401);
    expect(
      (await internalCall(h.base, h.clock, '/internal/v1/matches/started', body, { secret: 'x'.repeat(40) }))
        .status,
    ).toBe(401);
    expect(
      (
        await internalCall(h.base, h.clock, '/internal/v1/matches/started', body, {
          ts: h.clock.now.getTime() - SERVICE_SKEW_MS - 1000,
        })
      ).status,
    ).toBe(401);
    // a signature for one body is useless for another
    const goodSig = await internalCall(h.base, h.clock, '/internal/v1/matches/started', body);
    expect(goodSig.status).toBe(201);
  });

  it('is disabled entirely when no shared secret is configured', async () => {
    const off = await startHarness({ PLATFORM_MATCH_SERVER_SECRET: '' });
    try {
      const r = await internalCall(
        off.base,
        off.clock,
        '/internal/v1/matches/started',
        started('match-off-1', ROOM, []),
        { secret: TEST_SECRET },
      );
      expect(r.status).toBe(503);
    } finally {
      await off.close();
    }
  });

  it('records a whole party match: presence in_match while it runs, history afterwards, party back to open', async () => {
    const room = 'H4ND2F';
    const { lead, m, p } = await openParty(room);
    const ticket = async (g: G) => api.post(`/v1/parties/${p.id}/match/ticket`, {}, g.access);
    await ticket(lead);
    await ticket(m);
    const friend = await newGuest(api);
    const ps = participants(
      { id: lead.id, name: lead.name },
      { id: m.id, name: m.name },
      { id: null, name: friend.name },
      { id: null, name: 'BOT Emeka', bot: true },
    );
    expect(
      (
        await internalCall(
          h.base,
          h.clock,
          '/internal/v1/matches/started',
          started('match-party-1', room, ps),
        )
      ).status,
    ).toBe(201);
    // while it runs they are in a match (a friend would see it); results do not exist yet
    await api.call('PUT', '/v1/presence', { status: 'online' }, lead.access);
    expect(h.platform.presence.get(lead.id)).toBe('in_match');
    expect((await api.get('/v1/me/matches', lead.access)).body.matches).toEqual([]);
    // duplicate "started" changes nothing
    expect(
      (
        await internalCall(
          h.base,
          h.clock,
          '/internal/v1/matches/started',
          started('match-party-1', room, ps),
        )
      ).body.duplicate,
    ).toBe(true);
    const fin = await internalCall(
      h.base,
      h.clock,
      '/internal/v1/matches/finished',
      finished('match-party-1', room, ps),
    );
    expect(fin.status).toBe(201);
    expect(h.platform.presence.get(lead.id)).toBe('online');
    const hist = (await api.get('/v1/me/matches', m.access)).body.matches;
    expect(hist).toEqual([
      expect.objectContaining({
        matchId: 'match-party-1',
        game: 'deathmatch',
        arenaId: 'rumbleOshodi',
        durationSec: 300,
        humans: 2,
        you: expect.objectContaining({ placement: 2, kills: 2, deaths: 1, controlledByBotAtEnd: false }),
      }),
    ]);
    // the party is a lobby again
    expect((await api.get(`/v1/parties/${p.id}`, lead.access)).body.party).toMatchObject({
      status: 'open',
      match: null,
    });
    // a second "finished" (replay, or a corrected one) never overwrites the first
    const again = finished('match-party-1', room, ps, {
      results: ps.map((x) => ({ seat: x.seat, placement: 1, kills: 99, deaths: 0, assists: 0 })),
    });
    const dup = await internalCall(h.base, h.clock, '/internal/v1/matches/finished', again);
    expect(dup.status).toBe(200);
    expect(dup.body.duplicate).toBe(true);
    expect((await api.get('/v1/me/matches', m.access)).body.matches[0].you.kills).toBe(2);
    // the history of one player never contains another's
    expect((await api.get('/v1/me/matches', friend.access)).body.matches).toEqual([]);
  });

  it('refuses a participant who was never ticketed for the room, a bot with a player id, and nonsense', async () => {
    const lead = await newGuest(api);
    const stranger = await newGuest(api);
    const room = 'W5X6Y7';
    const bad = [
      participants({ id: stranger.id, name: stranger.name }), // no ticket at all
      participants({ id: null, name: 'BOT X', bot: true }).map((p) => ({ ...p, playerId: lead.id })), // a bot cannot be a player
      [{ seat: 0, playerId: 'not-a-uuid-at-all-not-a-uuid-at-all-xx', name: 'x', isBot: false, team: null }],
      [...participants({ id: null, name: 'a' }), ...participants({ id: null, name: 'b' })], // duplicate seat 0
    ];
    for (const ps of bad) {
      const r = await internalCall(
        h.base,
        h.clock,
        '/internal/v1/matches/started',
        started(`match-bad-${Math.random().toString(36).slice(2, 8)}`, room, ps),
      );
      expect(r.status).toBe(400);
    }
    expect(
      (
        await internalCall(
          h.base,
          h.clock,
          '/internal/v1/matches/finished',
          finished('match-bad-r1', room, participants({ id: null, name: 'G' }), {
            results: [{ seat: 7, placement: 1 }],
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await internalCall(h.base, h.clock, '/internal/v1/matches/started', {
          ...started('match-bad-x', room, []),
          evilField: 1,
        })
      ).status,
    ).toBe(400);
    expect(
      (await internalCall(h.base, h.clock, '/internal/v1/matches/started', { ...started('x', room, []) }))
        .status,
    ).toBe(400); // id too short
    expect(
      (
        await internalCall(h.base, h.clock, '/internal/v1/matches/started', {
          ...started('match-bad-g', room, []),
          game: 'ranked',
        })
      ).status,
    ).toBe(400);
    expect((await h.platform.db.query("SELECT 1 FROM matches WHERE id LIKE 'match-bad-%'")).rowCount).toBe(0); // a refused call leaves nothing behind
  });

  it('accepts a finished match with no earlier "started" (the server may only report the end) and anonymous guests', async () => {
    const ps = participants({ id: null, name: 'Anon' }, { id: null, name: 'BOT Tunde', bot: true });
    const r = await internalCall(
      h.base,
      h.clock,
      '/internal/v1/matches/finished',
      finished('match-only-finish', ROOM, ps),
    );
    expect(r.status).toBe(201);
  });

  it('an erased account is anonymised in history that other players keep', async () => {
    const { lead, m, p } = await openParty('E8F9G2');
    await api.post(`/v1/parties/${p.id}/match/ticket`, {}, m.access);
    await api.post(`/v1/parties/${p.id}/match/ticket`, {}, lead.access);
    const ps = participants({ id: lead.id, name: lead.name }, { id: m.id, name: m.name });
    await internalCall(
      h.base,
      h.clock,
      '/internal/v1/matches/finished',
      finished('match-erase-1', 'E8F9G2', ps),
    );
    await api.post('/v1/me/delete', { confirm: 'DELETE' }, m.access);
    const rows = await h.platform.db.query(
      'SELECT seat, player_id, display_name FROM match_participants WHERE match_id = $1 ORDER BY seat',
      ['match-erase-1'],
    );
    expect(rows.rows).toEqual([
      { seat: 0, player_id: lead.id, display_name: lead.name },
      { seat: 1, player_id: null, display_name: 'Deleted player' },
    ]);
    expect((await api.get('/v1/me/matches', lead.access)).body.matches).toHaveLength(1);
  });

  it('stores no ranking, reward or XP column (ranked play is deferred)', async () => {
    const cols = await h.platform.db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name IN ('matches','match_participants')",
    );
    const names = cols.rows.map((c) => c.column_name).join(' ');
    expect(names).not.toMatch(/xp|rating|rank|reward|elo|mmr|points|coins/i);
  });
});
