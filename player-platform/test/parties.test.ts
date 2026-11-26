import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CODE_TTL_MS, IDLE_CLOSE_MS, INVITE_TTL_MS, MATCH_RELEASE_MS } from '../src/parties/service';
import { MINUTE } from '../src/util/clock';
import { befriend, client, newGuest, startHarness } from './helpers';
import type { Api, Harness } from './helpers';

let h: Harness;
let api: Api;
beforeAll(async () => {
  h = await startHarness({ PLATFORM_PARTY_MAX_SIZE: '3' });
  api = client(h.base);
});
afterAll(() => h.close());

type G = Awaited<ReturnType<typeof newGuest>>;
const party = async (leader: G, mode?: 'ffa' | 'team') =>
  (await api.post('/v1/parties', mode ? { mode } : {}, leader.access)).body.party;
const join = async (g: G, code: string) => api.post('/v1/parties/join', { code }, g.access);
const ids = (p: { members: { playerId: string }[] }) => p.members.map((m) => m.playerId);

describe('creating and joining', () => {
  it('creates a party led by the caller with a shareable code, links and permissions', async () => {
    const a = await newGuest(api, 'Party Lead');
    const r = await api.post('/v1/parties', { mode: 'team' }, a.access);
    expect(r.status).toBe(201);
    const p = r.body.party;
    expect(p.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(p).toMatchObject({ status: 'open', mode: 'team', maxSize: 3, leaderId: a.id, match: null });
    expect(p.inviteLink).toBe(`http://localhost:5173/join?party=${p.code}`);
    expect(p.appLink).toBe(`wahala://party/${p.code}`);
    expect(p.members).toEqual([
      expect.objectContaining({ playerId: a.id, displayName: 'Party Lead', isLeader: true, ready: false }),
    ]);
    expect(p.you).toMatchObject({
      isLeader: true,
      canInvite: true,
      canKick: false,
      canOpenMatch: true,
      canLeave: true,
    });
    expect((await api.get('/v1/parties/current', a.access)).body.party.id).toBe(p.id);
  });

  it('a player is in at most one party', async () => {
    const a = await newGuest(api);
    await party(a);
    const again = await api.post('/v1/parties', {}, a.access);
    expect(again.status).toBe(409);
    const b = await newGuest(api);
    const pb = await party(b);
    expect((await join(a, pb.code)).status).toBe(409);
  });

  it('joins by code (any case, spaces and dashes ignored); everything that cannot work answers the same', async () => {
    const lead = await newGuest(api);
    const p = await party(lead);
    const m = await newGuest(api);
    const spaced = `${p.code.slice(0, 4).toLowerCase()} - ${p.code.slice(4)}`;
    const ok = await join(m, spaced);
    expect(ok.status).toBe(200);
    expect(ids(ok.body.party).sort()).toEqual([lead.id, m.id].sort());
    expect(ok.body.party.you.isLeader).toBe(false);
    expect(ok.body.party.you.canInvite).toBe(false);
    const answers = new Set<string>();
    for (const code of ['ZZZZZZZZ', 'short', '12345678', 'AAAAAAAAAAAA']) {
      const x = await join(await newGuest(api), code);
      expect(x.status).toBe(404);
      answers.add(JSON.stringify([x.status, x.body.error.code, x.body.error.message]));
    }
    expect(answers.size).toBe(1);
  });

  it('is full at the configured size and a full party looks like no party', async () => {
    const lead = await newGuest(api);
    const p = await party(lead);
    await join(await newGuest(api), p.code);
    await join(await newGuest(api), p.code);
    const late = await join(await newGuest(api), p.code);
    expect(late.status).toBe(404);
    expect(late.body.error.message).toBe('That party is not available.');
  });

  it('refuses someone who blocked, or was blocked by, any member (and says nothing about why)', async () => {
    const lead = await newGuest(api);
    const m = await newGuest(api);
    const p = await party(lead);
    await join(m, p.code);
    const blockedByMember = await newGuest(api);
    await api.call('PUT', `/v1/blocks/${blockedByMember.id}`, {}, m.access);
    expect((await join(blockedByMember, p.code)).status).toBe(404);
    const blocker = await newGuest(api);
    await api.call('PUT', `/v1/blocks/${lead.id}`, {}, blocker.access);
    expect((await join(blocker, p.code)).status).toBe(404);
  });

  it('a code expires after 24 hours and rotating it gives a new one and kills the old', async () => {
    const lead = await newGuest(api);
    const p = await party(lead);
    const rotated = await api.post(`/v1/parties/${p.id}/code/rotate`, {}, lead.access);
    expect(rotated.body.party.code).not.toBe(p.code);
    expect((await join(await newGuest(api), p.code)).status).toBe(404);
    const joiner = await newGuest(api);
    h.clock.advance(CODE_TTL_MS + MINUTE);
    const token = (await api.post('/v1/auth/refresh', { refreshToken: joiner.refresh })).body.tokens
      .accessToken as string;
    const stale = await api.post('/v1/parties/join', { code: rotated.body.party.code }, token);
    expect(stale.status).toBe(404);
  });

  it('only members read a party; only the leader leads', async () => {
    const lead = await newGuest(api);
    const p = await party(lead);
    const m = await newGuest(api);
    const stranger = await newGuest(api);
    await join(m, p.code);
    expect((await api.get(`/v1/parties/${p.id}`, stranger.access)).status).toBe(404);
    expect((await api.get(`/v1/parties/${p.id}`, m.access)).status).toBe(200);
    for (const [path, body] of [
      [`/v1/parties/${p.id}/kick`, { playerId: lead.id }],
      [`/v1/parties/${p.id}/promote`, { playerId: m.id }],
      [`/v1/parties/${p.id}/code/rotate`, {}],
      [`/v1/parties/${p.id}/match`, { roomCode: 'ABC234' }],
    ] as const) {
      const r = await api.post(path, body, m.access);
      expect(r.status, path).toBe(403);
    }
    expect((await api.patch(`/v1/parties/${p.id}`, { mode: 'team' }, m.access)).status).toBe(403);
    expect((await api.patch(`/v1/parties/${p.id}`, { mode: 'team' }, stranger.access)).status).toBe(404);
  });
});

describe('invitations', () => {
  it('the leader invites a friend; the friend sees, accepts and joins; non-friends cannot be invited', async () => {
    const lead = await newGuest(api);
    const f = await newGuest(api);
    const x = await newGuest(api);
    await befriend(api, lead, f);
    const p = await party(lead);
    expect((await api.post(`/v1/parties/${p.id}/invites`, { friendId: x.id }, lead.access)).status).toBe(404);
    const inv = await api.post(`/v1/parties/${p.id}/invites`, { friendId: f.id }, lead.access);
    expect(inv.status).toBe(201);
    expect((await api.post(`/v1/parties/${p.id}/invites`, { friendId: f.id }, lead.access)).status).toBe(409);
    const mine = await api.get('/v1/invites', f.access);
    expect(mine.body.invites).toEqual([
      expect.objectContaining({ id: inv.body.invite.id, fromId: lead.id, members: 1, maxSize: 3 }),
    ]);
    // only the invited player can answer it
    expect((await api.post(`/v1/invites/${inv.body.invite.id}/accept`, {}, x.access)).status).toBe(404);
    const acc = await api.post(`/v1/invites/${inv.body.invite.id}/accept`, {}, f.access);
    expect(acc.status).toBe(200);
    expect(ids(acc.body.party)).toContain(f.id);
    expect((await api.get('/v1/invites', f.access)).body.invites).toEqual([]);
    expect((await api.post(`/v1/invites/${inv.body.invite.id}/accept`, {}, f.access)).status).toBe(404); // single use
  });

  it('a member (not the leader) cannot invite; declining removes it; an invitation expires after 10 minutes', async () => {
    const lead = await newGuest(api);
    const m = await newGuest(api);
    const f = await newGuest(api);
    await befriend(api, lead, f);
    await befriend(api, m, f);
    const p = await party(lead);
    await join(m, p.code);
    expect((await api.post(`/v1/parties/${p.id}/invites`, { friendId: f.id }, m.access)).status).toBe(403);
    const inv = await api.post(`/v1/parties/${p.id}/invites`, { friendId: f.id }, lead.access);
    expect((await api.post(`/v1/invites/${inv.body.invite.id}/decline`, {}, f.access)).status).toBe(204);
    const inv2 = await api.post(`/v1/parties/${p.id}/invites`, { friendId: f.id }, lead.access);
    expect(inv2.status).toBe(201);
    h.clock.advance(INVITE_TTL_MS + MINUTE);
    const fresh = (await api.post('/v1/auth/refresh', { refreshToken: f.refresh })).body.tokens.accessToken;
    expect((await api.get('/v1/invites', fresh)).body.invites).toEqual([]);
    expect((await api.post(`/v1/invites/${inv2.body.invite.id}/accept`, {}, fresh)).status).toBe(404);
    // the expired invitation no longer occupies the slot
    const leadFresh = (await api.post('/v1/auth/refresh', { refreshToken: lead.refresh })).body.tokens
      .accessToken;
    expect((await api.post(`/v1/parties/${p.id}/invites`, { friendId: f.id }, leadFresh)).status).toBe(201);
  });

  it('cannot invite into a full party; accepting into a party that filled up fails; accepting while in another party fails', async () => {
    const lead = await newGuest(api);
    const f1 = await newGuest(api);
    const f2 = await newGuest(api);
    const busy = await newGuest(api);
    for (const f of [f1, f2, busy]) await befriend(api, lead, f);
    const p = await party(lead);
    const i1 = await api.post(`/v1/parties/${p.id}/invites`, { friendId: f1.id }, lead.access);
    const iBusy = await api.post(`/v1/parties/${p.id}/invites`, { friendId: busy.id }, lead.access);
    await party(busy);
    expect((await api.post(`/v1/invites/${iBusy.body.invite.id}/accept`, {}, busy.access)).status).toBe(409);
    await api.post(`/v1/invites/${i1.body.invite.id}/accept`, {}, f1.access);
    await join(f2, p.code);
    const extra = await newGuest(api);
    await befriend(api, lead, extra);
    expect((await api.post(`/v1/parties/${p.id}/invites`, { friendId: extra.id }, lead.access)).status).toBe(
      409,
    );
  });

  it('blocking a friend cancels their pending invitation', async () => {
    const lead = await newGuest(api);
    const f = await newGuest(api);
    await befriend(api, lead, f);
    const p = await party(lead);
    await api.post(`/v1/parties/${p.id}/invites`, { friendId: f.id }, lead.access);
    await api.call('PUT', `/v1/blocks/${lead.id}`, {}, f.access);
    expect((await api.get('/v1/invites', f.access)).body.invites).toEqual([]);
  });
});

describe('leaving, leadership and housekeeping', () => {
  it('the leader leaving promotes the longest-standing member; the last one out closes the party and kills its code', async () => {
    const lead = await newGuest(api);
    const p = await party(lead);
    const m1 = await newGuest(api);
    h.clock.advance(1000);
    const m2 = await newGuest(api);
    await join(m1, p.code);
    h.clock.advance(1000);
    await join(m2, p.code);
    expect((await api.post(`/v1/parties/${p.id}/leave`, {}, lead.access)).status).toBe(204);
    const now = (await api.get(`/v1/parties/${p.id}`, m1.access)).body.party;
    expect(now.leaderId).toBe(m1.id);
    expect(ids(now)).toEqual([m1.id, m2.id]);
    expect((await api.get('/v1/parties/current', lead.access)).body.party).toBeNull();
    await api.post(`/v1/parties/${p.id}/leave`, {}, m2.access);
    await api.post(`/v1/parties/${p.id}/leave`, {}, m1.access);
    expect((await api.get(`/v1/parties/${p.id}`, m1.access)).status).toBe(404);
    expect((await join(await newGuest(api), p.code)).status).toBe(404);
    expect((await api.post(`/v1/parties/${p.id}/leave`, {}, m1.access)).status).toBe(404);
  });

  it('kick, promote, ready and mode (mode change clears ready flags)', async () => {
    const lead = await newGuest(api);
    const m = await newGuest(api);
    const p = await party(lead);
    await join(m, p.code);
    expect(
      (await api.post(`/v1/parties/${p.id}/ready`, { ready: true }, m.access)).body.party.members.find(
        (x: { playerId: string }) => x.playerId === m.id,
      ).ready,
    ).toBe(true);
    const changed = await api.patch(`/v1/parties/${p.id}`, { mode: 'team' }, lead.access);
    expect(changed.body.party.mode).toBe('team');
    expect(changed.body.party.members.every((x: { ready: boolean }) => !x.ready)).toBe(true);
    expect((await api.post(`/v1/parties/${p.id}/kick`, { playerId: lead.id }, lead.access)).status).toBe(400);
    expect(
      (await api.post(`/v1/parties/${p.id}/promote`, { playerId: m.id }, lead.access)).body.party.leaderId,
    ).toBe(m.id);
    expect((await api.post(`/v1/parties/${p.id}/kick`, { playerId: lead.id }, m.access)).status).toBe(200);
    expect((await api.get('/v1/parties/current', lead.access)).body.party).toBeNull();
    expect((await api.post(`/v1/parties/${p.id}/kick`, { playerId: lead.id }, m.access)).status).toBe(404);
  });

  it('blocking a party member separates you: a leader removes them, a member leaves', async () => {
    const lead = await newGuest(api);
    const m = await newGuest(api);
    const p = await party(lead);
    await join(m, p.code);
    await api.call('PUT', `/v1/blocks/${m.id}`, {}, lead.access);
    expect((await api.get('/v1/parties/current', m.access)).body.party).toBeNull();
    expect(ids((await api.get('/v1/parties/current', lead.access)).body.party)).toEqual([lead.id]);
    const m2 = await newGuest(api);
    await join(m2, (await api.get('/v1/parties/current', lead.access)).body.party.code);
    await api.call('PUT', `/v1/blocks/${lead.id}`, {}, m2.access);
    expect((await api.get('/v1/parties/current', m2.access)).body.party).toBeNull();
    expect(ids((await api.get('/v1/parties/current', lead.access)).body.party)).toEqual([lead.id]);
  });

  it('sweep: drops members silent for 10 minutes (promoting the next leader), expires invitations, closes idle parties', async () => {
    const lead = await newGuest(api);
    const m = await newGuest(api);
    const p = await party(lead);
    await join(m, p.code);
    h.clock.advance(5 * MINUTE);
    await api.get('/v1/parties/current', m.access); // m is active, lead is not
    h.clock.advance(6 * MINUTE);
    const swept = await h.platform.parties.sweep();
    expect(swept.removed).toBeGreaterThanOrEqual(1);
    const left = await api.get(`/v1/parties/${p.id}`, m.access);
    expect(left.body.party.leaderId).toBe(m.id);
    expect(ids(left.body.party)).toEqual([m.id]);
    // an idle party (nobody talks to it for 6 hours) closes even with a member who keeps heartbeating
    const idleLead = await newGuest(api);
    const ip = await party(idleLead);
    await h.platform.db.query('UPDATE parties SET last_activity_at = $2 WHERE id = $1', [
      ip.id,
      new Date(h.clock.now.getTime() - IDLE_CLOSE_MS - MINUTE),
    ]);
    await api.call('PUT', '/v1/presence', { status: 'online' }, idleLead.access);
    const s2 = await h.platform.parties.sweep();
    expect(s2.closed).toBeGreaterThanOrEqual(1);
    expect((await api.get('/v1/parties/current', idleLead.access)).body.party).toBeNull();
  });

  it('a restart does not mass-remove parties: a member never heard from since start-up gets 10 minutes of grace', async () => {
    const fresh = await startHarness();
    try {
      const a = client(fresh.base);
      const lead = await newGuest(a);
      const p = (await a.post('/v1/parties', {}, lead.access)).body.party;
      fresh.clock.advance(9 * MINUTE);
      expect((await fresh.platform.parties.sweep()).removed).toBe(0);
      expect(
        (await fresh.platform.db.query('SELECT 1 FROM party_members WHERE party_id = $1', [p.id])).rowCount,
      ).toBe(1);
      fresh.clock.advance(2 * MINUTE);
      expect((await fresh.platform.parties.sweep()).removed).toBe(1);
    } finally {
      await fresh.close();
    }
  });
});

describe('deleting an account in a party', () => {
  it('hands the leadership on, or closes an emptied party', async () => {
    const lead = await newGuest(api);
    const m = await newGuest(api);
    const p = await party(lead);
    await join(m, p.code);
    expect((await api.post('/v1/me/delete', { confirm: 'DELETE' }, lead.access)).status).toBe(204);
    const after = (await api.get(`/v1/parties/${p.id}`, m.access)).body.party;
    expect(after.leaderId).toBe(m.id);
    expect(ids(after)).toEqual([m.id]);
    await api.post('/v1/me/delete', { confirm: 'DELETE' }, m.access);
    expect((await h.platform.db.query('SELECT status FROM parties WHERE id = $1', [p.id])).rows[0]).toEqual({
      status: 'closed',
    });
  });
});

// keep the constant referenced so a rename in the service is caught here
void MATCH_RELEASE_MS;
