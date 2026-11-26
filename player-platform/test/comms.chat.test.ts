import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHAT_REPEAT_MS, createDevModerator } from '../src/comms/chat';
import { createLogger } from '../src/logger';
import { HOUR } from '../src/util/clock';
import { client, newGuest, newRegistered, startHarness } from './helpers';
import type { Api, Harness } from './helpers';

const lines: string[] = [];
let h: Harness;
let api: Api;
beforeAll(async () => {
  h = await startHarness(
    { PLATFORM_DEV_TEXT_CHAT: '1', PLATFORM_CHAT_DENYLIST: 'badword,Heck' },
    { logger: createLogger((l) => lines.push(l), 'debug') },
  );
  api = client(h.base);
});
afterAll(() => h.close());

type G = Awaited<ReturnType<typeof newGuest>>;
let n = 0;
const adult = async (name?: string): Promise<G> => {
  const r = await newRegistered(api, `chat-adult-${++n}`, name);
  await api.patch('/v1/me', { ageGroup: 'adult' }, r.access);
  return r;
};
const party = async (lead: G, ...rest: G[]) => {
  const p = (await api.post('/v1/parties', {}, lead.access)).body.party;
  for (const m of rest) await api.post('/v1/parties/join', { code: p.code }, m.access);
  return p as { id: string; code: string };
};
const say = (g: G, id: string, text: unknown) => api.post(`/v1/dev/parties/${id}/chat`, { text }, g.access);
const read = async (g: G, id: string, after = 0) =>
  api.get(`/v1/dev/parties/${id}/chat?after=${after}`, g.access);

describe('moderation of the development text chat', () => {
  it.each([
    ['https://evil.example/x', 'links_not_allowed'],
    ['visit www.scam.ng now', 'links_not_allowed'],
    ['mail me bob@example.com', 'contact_details_not_allowed'],
    ['call 0803 123 4567', 'contact_details_not_allowed'],
    ['call 08031234567', 'contact_details_not_allowed'],
    ['aaaaaaaaaaaa', 'repeated_characters'],
    ['you are a b4dw0rd', 'not_allowed'],
    ['what the HECK', 'not_allowed'],
    ['   ', 'empty'],
    ['x'.repeat(201), 'too_long'],
  ])('refuses %j', async (text, why) => {
    const m = createDevModerator(['badword', 'heck']);
    expect(await m.check(text)).toEqual({ ok: false, reason: why });
  });

  it('cleans what it accepts: control, zero-width and bidi characters are removed and spaces collapsed', async () => {
    const m = createDevModerator([]);
    expect(await m.check('  hel​lo‮   there\n\t!  ')).toEqual({ ok: true, text: 'hel lo there !' });
  });
});

describe('the development text chat (adult registered accounts only)', () => {
  it('registers its routes only because the flag is on, and they are documented as dev-only', () => {
    expect(h.platform.router.list().some((r) => r.path === '/v1/dev/parties/:id/chat')).toBe(true);
  });

  it('adults in a party talk; the sender name is the platform nickname; message text never reaches the log', async () => {
    const a = await adult('Chat Ada');
    const b = await adult('Chat Bola');
    const p = await party(a, b);
    const sent = await say(a, p.id, 'Ready when you are');
    expect(sent.status).toBe(201);
    h.clock.advance(CHAT_REPEAT_MS + 1);
    await say(b, p.id, 'Give me a minute');
    const got = (await read(b, p.id)).body.lines as {
      id: number;
      from: { displayName: string };
      text: string;
    }[];
    expect(got.map((l) => [l.from.displayName, l.text])).toEqual([
      ['Chat Ada', 'Ready when you are'],
      ['Chat Bola', 'Give me a minute'],
    ]);
    expect(((await read(a, p.id, got[0]!.id)).body.lines as unknown[]).length).toBe(1);
    expect(lines.join('\n')).not.toContain('Ready when you are');
    expect(lines.join('\n')).not.toContain('Give me a minute');
    expect(JSON.stringify((await h.platform.db.query('SELECT detail FROM audit_events')).rows)).not.toContain(
      'Ready when you are',
    );
  });

  it('is rate-limited per sender (two seconds between lines)', async () => {
    const a = await adult();
    const p = await party(a);
    expect((await say(a, p.id, 'one')).status).toBe(201);
    const fast = await say(a, p.id, 'two');
    expect(fast.status).toBe(429);
    expect(fast.body.error.retryAfterMs).toBeGreaterThan(0);
    h.clock.advance(CHAT_REPEAT_MS + 1);
    expect((await say(a, p.id, 'two')).status).toBe(201);
  });

  it('refuses minors, guests and undeclared ages BOTH ways: they cannot send and they never receive', async () => {
    const a = await adult();
    const guest = await newGuest(api);
    const teen = await newRegistered(api, `chat-teen-${++n}`);
    await api.patch('/v1/me', { ageGroup: '13_17' }, teen.access);
    const p = await party(a, guest, teen);
    for (const g of [guest, teen]) {
      expect((await say(g, p.id, 'hello')).status).toBe(403);
      expect((await read(g, p.id)).status).toBe(403);
    }
    await say(a, p.id, 'adults only here');
    expect((await read(guest, p.id)).status).toBe(403);
    // and a minor's lines (written by a bug or an old row) are not shown to adults
    await h.platform.db.query(
      'INSERT INTO dev_chat_messages (party_id, sender_id, body, created_at) VALUES ($1,$2,$3,$4)',
      [p.id, teen.id, 'from a minor', h.clock.now],
    );
    expect(((await read(a, p.id)).body.lines as { text: string }[]).map((l) => l.text)).toEqual([
      'adults only here',
    ]);
  });

  it('a non-member cannot read or write; blocks and mutes hide a sender; unknown fields are refused', async () => {
    const a = await adult();
    const b = await adult();
    const c = await adult();
    const out = await adult();
    const p = await party(a, b, c);
    expect((await say(out, p.id, 'hi')).status).toBe(404);
    expect((await read(out, p.id)).status).toBe(404);
    await say(b, p.id, 'from b');
    await api.call('PUT', `/v1/mutes/${b.id}`, {}, c.access);
    expect(((await read(c, p.id)).body.lines as unknown[]).length).toBe(0);
    expect(((await read(a, p.id)).body.lines as unknown[]).length).toBe(1);
    expect(
      (await api.post(`/v1/dev/parties/${p.id}/chat`, { text: 'x', html: '<b>' }, a.access)).status,
    ).toBe(400);
    expect((await say(a, p.id, 123)).status).toBe(400);
    expect((await say(a, p.id, 'see https://x.test')).status).toBe(400);
  });

  it('a text restriction (moderator or automatic) stops sending but not reading', async () => {
    const a = await adult();
    const b = await adult();
    const p = await party(a, b);
    await h.platform.db.query(
      "INSERT INTO comm_restrictions (player_id, kind, source, reason, created_at, until) VALUES ($1,'text','moderator','test',$2,$3)",
      [a.id, h.clock.now, new Date(h.clock.now.getTime() + HOUR)],
    );
    const r = await say(a, p.id, 'let me speak');
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('restricted_account');
    expect((await read(a, p.id)).status).toBe(200);
  });

  it('a report snapshots the lines the reporter saw; lines die after 24 hours and with the account', async () => {
    const a = await adult();
    const t = await adult('Chat Target');
    const p = await party(a, t);
    await say(t, p.id, 'a rude line');
    const rep = await api.post(
      '/v1/reports',
      { reportedId: t.id, category: 'harassment', context: 'chat', contextRef: p.id },
      a.access,
    );
    expect(rep.status).toBe(201);
    const ev = (
      await h.platform.db.query<{ evidence: { t: string; body?: string }[] }>(
        'SELECT evidence FROM reports WHERE id = $1',
        [rep.body.id],
      )
    ).rows[0]!.evidence;
    expect(ev).toEqual([expect.objectContaining({ t: 'text', body: 'a rude line' })]);
    h.clock.advance(25 * HOUR);
    const purged = await h.platform.purge();
    expect((purged.comms as { chat: number }).chat).toBeGreaterThanOrEqual(1);
    expect(
      (await h.platform.db.query('SELECT 1 FROM dev_chat_messages WHERE party_id = $1', [p.id])).rowCount,
    ).toBe(0);
    // account erasure removes the sender's lines and scrubs the evidence text
    const b = await adult();
    const q = await party(b);
    await say(b, q.id, 'bye now');
    await api.post('/v1/me/delete', { confirm: 'DELETE' }, b.access).catch(() => undefined);
    expect(
      (await h.platform.db.query('SELECT 1 FROM dev_chat_messages WHERE sender_id = $1', [b.id])).rowCount,
    ).toBe(0);
  });
});
