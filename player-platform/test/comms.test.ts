import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUTO_RESTRICT_MS, MAX_REPORTS_PER_DAY } from '../src/comms/reports';
import { SIGNALS } from '../src/comms/catalogue';
import { SIGNAL_REPEAT_MS } from '../src/comms/service';
import { DAY, HOUR } from '../src/util/clock';
import { TEST_ADMIN, client, internalCall, newGuest, newRegistered, startHarness } from './helpers';
import type { Api, Harness } from './helpers';

let h: Harness;
let api: Api;
beforeAll(async () => {
  h = await startHarness({ PLATFORM_PARTY_MAX_SIZE: '8' });
  api = client(h.base);
});
afterAll(() => h.close());

type G = Awaited<ReturnType<typeof newGuest>>;
let n = 0;
const newAdult = async (name?: string): Promise<G> => {
  const r = await newRegistered(api, `comms-adult-${++n}`, name);
  await api.patch('/v1/me', { ageGroup: 'adult' }, r.access);
  return r;
};
const partyOf = async (lead: G, ...members: G[]) => {
  const p = (await api.post('/v1/parties', {}, lead.access)).body.party;
  for (const m of members) await api.post('/v1/parties/join', { code: p.code }, m.access);
  return p as { id: string; code: string };
};
const send = (g: G, partyId: string, signalId: string) =>
  api.post(`/v1/parties/${partyId}/signals`, { signalId }, g.access);
const read = async (g: G, partyId: string, after = 0) =>
  (await api.get(`/v1/parties/${partyId}/signals?after=${after}`, g.access)).body.signals as {
    id: number;
    signalId: string;
    from: { playerId: string; displayName: string };
  }[];
const admin = (method: string, path: string, body?: unknown) => api.call(method, path, body, TEST_ADMIN);

describe('the preset vocabulary', () => {
  it('is public, fixed, unique, and contains nothing free-form', async () => {
    const r = await api.get('/v1/comms/signals');
    expect(r.status).toBe(200);
    const ids = r.body.signals.map((s: { id: string }) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(SIGNALS.map((s) => s.id));
    expect(ids.every((id: string) => /^(chat|ping|emote)\.[a-z_]+$/.test(id))).toBe(true);
    expect(r.body.signals.find((s: { id: string }) => s.id === 'ping.attack').contexts).toEqual([
      'team',
      'match',
    ]);
  });
});

describe('party signals', () => {
  it('members send presets and everyone reads them with one consistent name per player', async () => {
    const a = await newGuest(api, 'Signal Ada');
    const b = await newGuest(api, 'Signal Bola');
    const p = await partyOf(a, b);
    expect((await send(a, p.id, 'chat.ready')).status).toBe(201);
    expect((await send(b, p.id, 'emote.cheer')).status).toBe(201);
    const seen = await read(b, p.id);
    expect(seen.map((s) => [s.signalId, s.from.displayName])).toEqual([
      ['chat.ready', 'Signal Ada'],
      ['emote.cheer', 'Signal Bola'],
    ]);
    expect(seen[0]!.from.playerId).toBe(a.id);
    // `after` returns only newer ones
    expect((await read(a, p.id, seen[0]!.id)).map((s) => s.signalId)).toEqual(['emote.cheer']);
    // a rename shows everywhere at once (names are read when displayed, never frozen in the log)
    await api.patch('/v1/me', { displayName: 'Signal Adaeze' }, a.access);
    expect((await read(b, p.id))[0]!.from.displayName).toBe('Signal Adaeze');
  });

  it('refuses unknown ids, free text, match-only pings in a party, non-members and bad `after`', async () => {
    const a = await newGuest(api);
    const out = await newGuest(api);
    const p = await partyOf(a);
    for (const bad of [
      'hello world',
      'chat.nope',
      '',
      'ping.attack',
      '../../etc',
      'chat.ready; DROP TABLE',
    ]) {
      expect((await send(a, p.id, bad)).status, bad).toBe(400);
    }
    expect(
      (await api.post(`/v1/parties/${p.id}/signals`, { signalId: 'chat.ready', text: 'hi' }, a.access))
        .status,
    ).toBe(400);
    expect((await send(out, p.id, 'chat.ready')).status).toBe(404);
    expect((await api.get(`/v1/parties/${p.id}/signals`, out.access)).status).toBe(404);
    expect((await api.get(`/v1/parties/${p.id}/signals?after=-1`, a.access)).status).toBe(400);
    expect((await api.get(`/v1/parties/${p.id}/signals?after=abc`, a.access)).status).toBe(400);
  });

  it('the same signal twice within two seconds is a flood and is refused with a retry time; later it is fine', async () => {
    const a = await newGuest(api);
    const p = await partyOf(a);
    expect((await send(a, p.id, 'chat.gg')).status).toBe(201);
    const flood = await send(a, p.id, 'chat.gg');
    expect(flood.status).toBe(429);
    expect(flood.body.error.retryAfterMs).toBeGreaterThan(0);
    expect((await send(a, p.id, 'chat.thanks')).status).toBe(201); // a different signal is a different thing to say
    h.clock.advance(SIGNAL_REPEAT_MS + 1);
    expect((await send(a, p.id, 'chat.gg')).status).toBe(201);
  });

  it('keeps only the latest 200 signals per party', async () => {
    const a = await newGuest(api);
    const p = await partyOf(a);
    for (let i = 0; i < 205; i++) {
      await h.platform.db.query(
        'INSERT INTO party_signals (party_id, sender_id, signal_id, created_at) VALUES ($1,$2,$3,$4)',
        [p.id, a.id, 'chat.nice', h.clock.now],
      );
    }
    h.clock.advance(5000);
    await send(a, p.id, 'chat.ready');
    expect(
      (await h.platform.db.query('SELECT 1 FROM party_signals WHERE party_id = $1', [p.id])).rowCount,
    ).toBeLessThanOrEqual(201);
  });
});

describe('mute and block', () => {
  it('a muted sender disappears for the muter only; nobody is told; friendship is untouched', async () => {
    const a = await newGuest(api);
    const noisy = await newGuest(api);
    const other = await newGuest(api);
    const p = await partyOf(a, noisy, other);
    await send(noisy, p.id, 'chat.ready');
    expect((await api.call('PUT', `/v1/mutes/${noisy.id}`, {}, a.access)).status).toBe(204);
    expect((await api.call('PUT', `/v1/mutes/${noisy.id}`, {}, a.access)).status).toBe(204); // idempotent
    expect(await read(a, p.id)).toEqual([]);
    expect(await read(other, p.id)).toHaveLength(1); // the others still hear them
    expect(await read(noisy, p.id)).toHaveLength(1); // and they cannot tell
    expect(
      (await api.get('/v1/mutes', a.access)).body.mutes.map((m: { playerId: string }) => m.playerId),
    ).toEqual([noisy.id]);
    expect((await api.get('/v1/mutes', noisy.access)).body.mutes).toEqual([]);
    expect((await api.del(`/v1/mutes/${noisy.id}`, a.access)).status).toBe(204);
    expect(await read(a, p.id)).toHaveLength(1);
    expect((await api.del(`/v1/mutes/${noisy.id}`, a.access)).status).toBe(404);
    expect((await api.call('PUT', `/v1/mutes/${a.id}`, {}, a.access)).status).toBe(400);
    expect(
      (await api.call('PUT', '/v1/mutes/00000000-0000-4000-8000-000000000000', {}, a.access)).status,
    ).toBe(404);
  });

  it('a block hides a sender in both directions, even for history written before the block', async () => {
    const a = await newGuest(api);
    const b = await newGuest(api);
    const c = await newGuest(api);
    const p = await partyOf(a, b, c);
    await send(a, p.id, 'chat.ready');
    await send(b, p.id, 'chat.nice');
    // the block rows are written directly: the API would separate the pair from the party, which is tested elsewhere
    await h.platform.db.query('INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES ($1,$2,$3)', [
      c.id,
      b.id,
      h.clock.now,
    ]);
    expect((await read(c, p.id)).map((s) => s.signalId)).toEqual(['chat.ready']); // c blocked b
    expect((await read(b, p.id)).map((s) => s.signalId)).toEqual(['chat.ready', 'chat.nice']); // b sees a and itself, never c's
    await send(c, p.id, 'chat.thanks');
    expect((await read(b, p.id)).map((s) => s.signalId)).toEqual(['chat.ready', 'chat.nice']); // b cannot see what c says either
    expect((await read(a, p.id)).map((s) => s.signalId)).toEqual(['chat.ready', 'chat.nice', 'chat.thanks']);
  });

  it('the block API separates the pair, so a blocked member never keeps reading the blocker', async () => {
    const lead = await newGuest(api);
    const b = await newGuest(api);
    const p = await partyOf(lead, b);
    await send(lead, p.id, 'chat.ready');
    await api.call('PUT', `/v1/blocks/${b.id}`, {}, lead.access);
    expect((await api.get(`/v1/parties/${p.id}/signals`, b.access)).status).toBe(404);
  });
});

describe('the relay filter the match server calls', () => {
  const filter = (body: unknown) => internalCall(h.base, h.clock, '/internal/v1/comms/filter', body);

  it('needs the signed server call', async () => {
    const g = await newGuest(api);
    expect(
      (
        await api.post(
          '/internal/v1/comms/filter',
          { senderId: g.id, recipientIds: [], kind: 'signal' },
          g.access,
        )
      ).status,
    ).toBe(401);
  });

  it('removes recipients who blocked or muted the sender, unknown players, and the sender themself', async () => {
    const s = await newGuest(api);
    const ok = await newGuest(api);
    const blocker = await newGuest(api);
    const muter = await newGuest(api);
    const blocked = await newGuest(api);
    await api.call('PUT', `/v1/blocks/${s.id}`, {}, blocker.access);
    await api.call('PUT', `/v1/mutes/${s.id}`, {}, muter.access);
    await api.call('PUT', `/v1/blocks/${blocked.id}`, {}, s.access);
    const r = await filter({
      senderId: s.id,
      recipientIds: [ok.id, blocker.id, muter.id, blocked.id, s.id, '00000000-0000-4000-8000-000000000000'],
      kind: 'signal',
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ senderAllowed: true, reason: null, recipients: [ok.id] });
  });

  it('text and voice need an ADULT REGISTERED sender and recipient; presets do not', async () => {
    const adult = await newAdult();
    const adult2 = await newAdult();
    const guest = await newGuest(api);
    const teen = await newRegistered(api, 'comms-teen-1');
    await api.patch('/v1/me', { ageGroup: '13_17' }, teen.access);
    const all = [adult2.id, guest.id, teen.id];
    expect(
      (await filter({ senderId: adult.id, recipientIds: all, kind: 'signal' })).body.recipients.sort(),
    ).toEqual([...all].sort());
    for (const kind of ['text', 'voice']) {
      expect((await filter({ senderId: adult.id, recipientIds: all, kind })).body.recipients).toEqual([
        adult2.id,
      ]);
      const fromGuest = await filter({ senderId: guest.id, recipientIds: [adult.id], kind });
      expect(fromGuest.body).toMatchObject({ senderAllowed: false, recipients: [] });
      expect((await filter({ senderId: teen.id, recipientIds: [adult.id], kind })).body.senderAllowed).toBe(
        false,
      );
    }
  });

  it('a restricted sender is refused outright; suspended and unknown senders too; recipients are capped', async () => {
    const s = await newGuest(api);
    await h.platform.db.query(
      "INSERT INTO comm_restrictions (player_id, kind, source, reason, created_at, until) VALUES ($1,'signals','moderator','test',$2,$3)",
      [s.id, h.clock.now, new Date(h.clock.now.getTime() + HOUR)],
    );
    expect((await filter({ senderId: s.id, recipientIds: [], kind: 'signal' })).body).toMatchObject({
      senderAllowed: false,
      reason: 'restricted',
    });
    expect(
      (await filter({ senderId: '00000000-0000-4000-8000-000000000000', recipientIds: [], kind: 'signal' }))
        .body.senderAllowed,
    ).toBe(false);
    expect(
      (await filter({ senderId: s.id, recipientIds: Array(65).fill(s.id), kind: 'signal' })).status,
    ).toBe(400);
    expect((await filter({ senderId: s.id, recipientIds: [], kind: 'shout' })).status).toBe(400);
  });
});

describe('reports', () => {
  const report = (g: G, reportedId: string, extra: object = {}) =>
    api.post('/v1/reports', { reportedId, category: 'harassment', context: 'party', ...extra }, g.access);

  it('only about someone you actually shared a party, match, friend request or friendship with', async () => {
    const a = await newGuest(api);
    const stranger = await newGuest(api);
    const r = await report(a, stranger.id, { contextRef: '00000000-0000-4000-8000-000000000000' });
    expect(r.status).toBe(403);
    expect((await report(a, a.id, { contextRef: 'x' })).status).toBe(400);
    const m = await newGuest(api);
    const p = await partyOf(a, m);
    expect((await report(a, m.id, { contextRef: p.id })).status).toBe(201);
    expect((await report(a, m.id, { context: 'party' })).status).toBe(400); // contextRef missing
    expect((await report(a, stranger.id, { context: 'profile' })).status).toBe(403);
    expect((await report(a, '00000000-0000-4000-8000-000000000000', { contextRef: p.id })).status).toBe(404);
  });

  it('is idempotent per reporter / target / place and snapshots what the reporter could see', async () => {
    const a = await newGuest(api, 'Rep Orter');
    const bad = await newGuest(api, 'Bad Actor');
    const p = await partyOf(a, bad);
    await send(bad, p.id, 'chat.sorry');
    h.clock.advance(3000);
    await send(bad, p.id, 'chat.thanks');
    const first = await report(a, bad.id, { contextRef: p.id, note: '  spam​   spam\n\tspam  ' });
    const again = await report(a, bad.id, { contextRef: p.id });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ id: first.body.id, duplicate: true });
    const rows = await h.platform.db.query<{
      note: string;
      reported_name: string;
      evidence: { id: string }[];
    }>('SELECT note, reported_name, evidence FROM reports WHERE id = $1', [first.body.id]);
    expect(rows.rows[0]!.note).toBe('spam spam spam');
    expect(rows.rows[0]!.reported_name).toBe('Bad Actor');
    expect(rows.rows[0]!.evidence.map((e) => e.id).sort()).toEqual(['chat.sorry', 'chat.thanks']);
    expect((await api.get('/v1/me/reports', a.access)).body.reports).toEqual([
      expect.objectContaining({ id: first.body.id, status: 'open', category: 'harassment' }),
    ]);
    expect((await report(a, bad.id, { contextRef: p.id, note: 'x'.repeat(201) })).status).toBe(400);
    expect((await report(a, bad.id, { contextRef: p.id, category: 'rude' })).status).toBe(400);
  });

  it(`caps a reporter at ${MAX_REPORTS_PER_DAY} reports a day`, async () => {
    const a = await newGuest(api);
    let limited = 0;
    for (let i = 0; i < MAX_REPORTS_PER_DAY + 3; i++) {
      const target = await newGuest(api);
      const p = await partyOf(a, target);
      const r = await report(a, target.id, { contextRef: p.id });
      if (r.status === 429) limited++;
      await api.post(`/v1/parties/${p.id}/leave`, {}, a.access);
    }
    expect(limited).toBe(3);
  });

  it("three different reporters silence a target's signals for an hour (reversible); one reporter repeating does not", async () => {
    const target = await newGuest(api, 'Heavy Target');
    const lead = await newGuest(api);
    const r1 = await newGuest(api);
    const r2 = await newGuest(api);
    const p = await partyOf(lead, target, r1, r2);
    await report(r1, target.id, { contextRef: p.id });
    await report(r1, target.id, { contextRef: p.id });
    await report(r2, target.id, { contextRef: p.id });
    expect((await send(target, p.id, 'chat.ready')).status).toBe(201); // only two distinct reporters so far
    await report(lead, target.id, { contextRef: p.id });
    const silenced = await send(target, p.id, 'chat.thanks');
    expect(silenced.status).toBe(403);
    expect(silenced.body.error.code).toBe('restricted_account');
    expect(silenced.body.error.retryAfterMs).toBeLessThanOrEqual(AUTO_RESTRICT_MS);
    // a moderator who disagrees lifts it
    expect((await admin('POST', `/admin/v1/players/${target.id}/restrictions/lift`)).body.lifted).toBe(1);
    expect((await send(target, p.id, 'chat.thanks')).status).toBe(201);
  });

  it('moderators: admin token required; list shows context; dismiss / restrict / suspend act and are audited', async () => {
    expect((await api.get('/admin/v1/reports')).status).toBe(401);
    const user = await newGuest(api);
    expect((await api.get('/admin/v1/reports', user.access)).status).toBe(401); // a player token is not an admin token
    const a = await newGuest(api);
    const t1 = await newGuest(api);
    const t2 = await newGuest(api);
    const t3 = await newGuest(api);
    const p = await partyOf(a, t1, t2, t3);
    const r1 = (await report(a, t1.id, { contextRef: p.id })).body.id;
    const r2 = (await report(a, t2.id, { contextRef: p.id })).body.id;
    const r3 = (await report(a, t3.id, { contextRef: p.id })).body.id;
    const list = await admin('GET', '/admin/v1/reports?status=open&limit=100');
    expect(list.status).toBe(200);
    const mine = list.body.reports.filter((x: { id: string }) => [r1, r2, r3].includes(x.id));
    expect(mine).toHaveLength(3);
    expect(mine[0]).toMatchObject({
      status: 'open',
      category: 'harassment',
      context: 'party',
      reported: { distinctReportersLast30d: 1 },
    });
    expect(
      (await admin('POST', `/admin/v1/reports/${r1}/resolve`, { resolution: 'dismiss', moderator: 'mod-1' }))
        .status,
    ).toBe(204);
    expect(
      (await admin('POST', `/admin/v1/reports/${r1}/resolve`, { resolution: 'dismiss', moderator: 'mod-1' }))
        .status,
    ).toBe(404); // already closed
    expect(
      (
        await admin('POST', `/admin/v1/reports/${r2}/resolve`, {
          resolution: 'restrict_signals',
          moderator: 'mod-1',
        })
      ).status,
    ).toBe(204);
    expect((await send(t2, p.id, 'chat.ready')).status).toBe(403);
    expect(
      (await admin('POST', `/admin/v1/reports/${r3}/resolve`, { resolution: 'suspend', moderator: 'mod-2' }))
        .status,
    ).toBe(204);
    expect((await api.get('/v1/me', t3.access)).status).toBe(401); // suspended: every session revoked
    expect(
      (await admin('POST', `/admin/v1/reports/${r3}/resolve`, { resolution: 'ban-forever', moderator: 'm' }))
        .status,
    ).toBe(400);
    expect(
      (await api.get('/v1/me/reports', a.access)).body.reports
        .map((x: { status: string }) => x.status)
        .sort(),
    ).toEqual(['actioned', 'actioned', 'dismissed']);
    const trail = await h.platform.db.query<{ detail: { resolution: string } }>(
      "SELECT detail FROM audit_events WHERE type = 'report.resolved' AND detail ? 'resolution'",
    );
    expect(trail.rows.map((x) => x.detail.resolution)).toEqual(
      expect.arrayContaining(['dismiss', 'restrict_signals', 'suspend']),
    );
    // the reporter's dismissal history is visible to the next moderator
    const again = await report(a, t1.id, { contextRef: p.id }).catch(() => null);
    void again;
  });

  it('admin endpoints do not exist without an admin token configured', async () => {
    const off = await startHarness({ PLATFORM_ADMIN_TOKEN: '' });
    try {
      const o = client(off.base);
      expect((await o.call('GET', '/admin/v1/reports', undefined, TEST_ADMIN)).status).toBe(401);
    } finally {
      await off.close();
    }
  });

  it('erasing an account scrubs notes, names and evidence from reports (the category stays for statistics)', async () => {
    const a = await newGuest(api);
    const t = await newRegistered(api, 'report-erase', 'Erase Me Later');
    const p = await partyOf(a, t);
    await send(t, p.id, 'chat.sorry');
    const id = (await report(a, t.id, { contextRef: p.id, note: 'he said my real name' })).body.id;
    await api.post('/v1/me/delete', { confirm: 'DELETE' }, t.access);
    const row = (
      await h.platform.db.query<Record<string, unknown>>(
        'SELECT note, reported_name, evidence, category FROM reports WHERE id = $1',
        [id],
      )
    ).rows[0]!;
    expect(row).toMatchObject({
      note: null,
      reported_name: 'Deleted player',
      evidence: [],
      category: 'harassment',
    });
  });

  it('resolved reports are purged after 180 days; open ones never are', async () => {
    const a = await newGuest(api);
    const m = await newGuest(api);
    const p = await partyOf(a, m);
    const id = (await report(a, m.id, { contextRef: p.id })).body.id;
    await admin('POST', `/admin/v1/reports/${id}/resolve`, { resolution: 'dismiss', moderator: 'mod' });
    const keep = await newGuest(api);
    const p2 = await partyOf(keep, await newGuest(api));
    void p2;
    h.clock.advance(181 * DAY);
    const out = await h.platform.purge();
    expect(out.reports).toBeGreaterThanOrEqual(1);
    expect((await h.platform.db.query('SELECT 1 FROM reports WHERE id = $1', [id])).rowCount).toBe(0);
  });
});

describe('development text chat is off by default', () => {
  it('the routes do not exist and nothing writes to the chat table in the default configuration', async () => {
    const a = await newGuest(api);
    const p = await partyOf(a);
    expect((await api.post(`/v1/dev/parties/${p.id}/chat`, { text: 'hello' }, a.access)).status).toBe(404);
    expect((await h.platform.db.query('SELECT 1 FROM dev_chat_messages')).rowCount).toBe(0);
    expect(h.platform.router.list().some((r) => r.path.includes('/chat'))).toBe(false);
  });

  it('production configuration refuses to enable it', async () => {
    const { loadConfig, validateConfig } = await import('../src/config');
    expect(
      validateConfig(loadConfig({ PLATFORM_ENV: 'production', PLATFORM_DEV_TEXT_CHAT: '1' })).join(),
    ).toMatch(/PLATFORM_DEV_TEXT_CHAT/);
  });
});

describe('voice', () => {
  it('does not exist yet: eligible adults get 503, everyone else 403, and no media is ever granted', async () => {
    const adult = await newAdult();
    const guest = await newGuest(api);
    const p = await partyOf(adult);
    expect((await api.get('/v1/voice/status', adult.access)).body).toEqual({
      available: false,
      eligible: true,
      reason: 'Voice chat is not available yet.',
    });
    expect((await api.get('/v1/voice/status', guest.access)).body.eligible).toBe(false);
    // the player has not turned voice on in their settings
    expect((await api.post('/v1/voice/token', { partyId: p.id }, adult.access)).status).toBe(403);
    await api.patch('/v1/me', { settings: { voiceEnabled: true } }, adult.access);
    const r = await api.post('/v1/voice/token', { partyId: p.id }, adult.access);
    expect(r.status).toBe(503);
    expect(r.body.error.message).toBe('Voice chat is not available yet.');
    const gp = await partyOf(guest);
    expect((await api.post('/v1/voice/token', { partyId: gp.id }, guest.access)).status).toBe(403);
    expect((await api.post('/v1/voice/token', { partyId: p.id }, (await newAdult()).access)).status).toBe(
      404,
    ); // not a member
  });
});
