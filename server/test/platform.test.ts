/**
 * The optional player-platform link (decision MP-PLAT): signed match tickets, trusted result reporting and the preset-signal
 * relay with the platform's filter. Real server, real sockets, real Ed25519 tickets minted by the platform's own signer; the platform
 * itself is faked at the HTTP boundary (its real behaviour is covered by player-platform/test and by the end-to-end run).
 */
import { describe, expect, it, afterAll, beforeAll } from 'vitest';
import { createHandoffSigner } from '../../player-platform/src/handoff/signer';
import { signServiceRequest } from '../../player-platform/src/http/serviceAuth';
import { MSG, SIGNAL_IDS } from '../../src/net/protocol';
import type { SignalInMsg } from '../../src/net/protocol';
import { PlatformLink } from '../src/core/platform';
import type { PlatformConfig } from '../src/core/platform';
import {
  startTestServer,
  create,
  dropSocket,
  joinById,
  joinOrCreate,
  until,
  sleep,
  TestPlayer,
} from './helpers';
import type { TestServer } from './helpers';

const SECRET = 'test-secret-test-secret-test-secret';
const NOW = () => new Date();
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

interface Call {
  path: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  raw: string;
}

let signer: Awaited<ReturnType<typeof createHandoffSigner>>;
let server: TestServer;
let link: PlatformLink;
const calls: Call[] = [];
let platformMode: 'ok' | 'down' | 'slow' = 'ok';
/** Players the fake platform's filter will NOT let `senderId` reach: `${sender}>${recipient}`. */
const muted = new Set<string>();
let senderRestricted = false;
let skewMs = 0;

const cfg: PlatformConfig = {
  jwksUrl: 'http://platform.invalid/.well-known/jwks.json',
  audience: 'wahala-rumble',
  internalUrl: 'http://platform.invalid',
  secret: SECRET,
  requireTicket: false,
};

async function ticket(
  sub: string,
  name: string,
  room: string,
  over: Record<string, unknown> = {},
): Promise<string> {
  return (
    await signer.sign({ sub, name, char: 'streetBaller', room, party: null, restricted: false, ...over })
  ).token;
}

beforeAll(async () => {
  signer = await createHandoffSigner({ audience: 'wahala-rumble', clock: NOW });
  link = new PlatformLink(cfg, {
    keys: signer.keys(),
    now: () => Date.now() + skewMs,
    fetch: async (url, init) => {
      const path = new URL(url).pathname;
      const call: Call = {
        path,
        body: JSON.parse(init.body) as Record<string, unknown>,
        headers: init.headers,
        raw: init.body,
      };
      calls.push(call);
      if (platformMode === 'down') throw new Error('ECONNREFUSED');
      if (platformMode === 'slow')
        await new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
      if (path.endsWith('/comms/filter')) {
        const sender = String(call.body.senderId);
        const ids = call.body.recipientIds as string[];
        return {
          ok: true,
          status: 200,
          json: async () => ({
            senderAllowed: !senderRestricted,
            reason: null,
            recipients: ids.filter((r) => !muted.has(`${sender}>${r}`) && !muted.has(`${r}>${sender}`)),
          }),
        };
      }
      return { ok: true, status: 201, json: async () => ({ ok: true }) };
    },
  });
  server = await startTestServer({ defaultAutoStartSec: 0.4 }, { platform: link });
});
afterAll(async () => {
  await server.close();
});

async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return String((e as Error).message);
  }
  return 'accepted';
}

describe('guest-only play is unchanged', () => {
  it('a join without a ticket is a guest with the name it typed, never verified', async () => {
    const a = await create(server, 'Gus', { private: true, durationSec: 10 });
    await until('lobby', () => a.lobby !== null);
    expect(a.lobby!.members[0]).not.toHaveProperty('verified');
    expect(a.lobby!.members[0]).not.toHaveProperty('playerId');
    expect(a.lobby!.members[0]!.name).toBe('Gus');
    await a.leave();
  });

  it('a guest cannot smuggle an identity: option keys starting with an underscore are stripped, and a ticket field is never forwarded', async () => {
    const a = await create(server, 'Mallory', {
      private: true,
      durationSec: 10,
      _acct: { sub: A, name: 'Ada', restricted: false, party: null },
      accountId: A,
      verified: true,
    });
    await until('lobby', () => a.lobby !== null);
    expect(a.lobby!.members[0]).not.toHaveProperty('verified');
    expect(a.lobby!.members[0]!.name).toBe('Mallory');
    await a.leave();
  });

  it('a guest who types a verified player name gets a different name and no badge', async () => {
    const host = await create(server, 'Ignored', {
      private: true,
      durationSec: 10,
      ticket: await ticket(A, 'Ada', '*'),
    });
    await until('host lobby', () => host.lobby !== null);
    expect(host.lobby!.members[0]).toMatchObject({ name: 'Ada', verified: true, playerId: A });
    const guest = await joinById(server, host.room.roomId, 'Ada');
    await until('both', () => host.lobby?.members.length === 2);
    expect(host.lobby!.members[1]!.name).toBe('Ada 2');
    expect(host.lobby!.members[1]).not.toHaveProperty('verified');
    await guest.leave();
    await host.leave();
  });
});

describe('signed tickets', () => {
  it('a host ticket creates a private room; the seat shows the PLATFORM nickname and id, not the typed name', async () => {
    const host = await create(server, 'typed name', {
      private: true,
      durationSec: 10,
      ticket: await ticket(A, 'Ada', '*'),
    });
    await until('lobby', () => host.lobby !== null);
    expect(host.lobby!.members[0]).toMatchObject({ name: 'Ada', verified: true, playerId: A, isHost: true });
    const code = host.room.roomId;
    const member = await joinById(server, code, 'whatever', { ticket: await ticket(B, 'Bayo', code) });
    await until('two', () => host.lobby?.members.length === 2);
    expect(host.lobby!.members[1]).toMatchObject({ name: 'Bayo', verified: true, playerId: B });
    await member.leave();
    await host.leave();
  });

  it('refuses forged, expired, wrong-room, wrong-audience, replayed and wrongly scoped tickets', async () => {
    const host = await create(server, 'Ada', { private: true, durationSec: 10 });
    const code = host.room.roomId;
    await until('lobby', () => host.lobby !== null);
    // `forged`: a well-formed ticket for this very room and audience, signed by a DIFFERENT key (an attacker's own signer)
    const attacker = await createHandoffSigner({ audience: 'wahala-rumble', clock: NOW });
    const forged = (
      await attacker.sign({ sub: C, name: 'Eve', char: '', room: code, party: null, restricted: false })
    ).token;
    // `expired`: genuinely signed by the platform key, then the server's clock moves ten minutes on (a ticket lives 120 s)
    const oldTicket = await ticket(C, 'Old', code);
    skewMs = 600_000;
    const wrongAudience = await createHandoffSigner({ audience: 'something-else', clock: NOW });
    expect(await refusal(joinById(server, code, 'x', { ticket: forged }))).toMatch(/ticket/);
    expect(await refusal(joinById(server, code, 'x', { ticket: oldTicket }))).toMatch(/ticket/);
    skewMs = 0;
    expect(await refusal(joinById(server, code, 'x', { ticket: 'not-a-jwt' }))).toMatch(/ticket/);
    expect(
      await refusal(
        joinById(server, code, 'x', {
          ticket: (
            await wrongAudience.sign({
              sub: C,
              name: 'Cee',
              char: '',
              room: code,
              party: null,
              restricted: false,
            })
          ).token,
        }),
      ),
    ).toMatch(/ticket/);
    // a ticket for ANOTHER room, a host ticket used to join, a member ticket used to create, a ticket on quick play
    expect(await refusal(joinById(server, code, 'x', { ticket: await ticket(C, 'Cee', 'ZZZZZZ') }))).toMatch(
      /not valid for this room/,
    );
    expect(await refusal(joinById(server, code, 'x', { ticket: await ticket(C, 'Cee', '*') }))).toMatch(
      /not valid for this room/,
    );
    expect(
      await refusal(create(server, 'x', { private: true, ticket: await ticket(C, 'Cee', code) })),
    ).toMatch(/not valid for this room/);
    expect(await refusal(joinOrCreate(server, 'x', { ticket: await ticket(C, 'Cee', code) }))).toMatch(
      /quick play/,
    );
    // replay: the same ticket works once
    const once = await ticket(C, 'Cee', code);
    const first = await joinById(server, code, 'x', { ticket: once });
    expect(await refusal(joinById(server, code, 'x', { ticket: once }))).toMatch(/already used/);
    await until('lobby sees Cee', () => host.lobby?.members.some((m) => m.name === 'Cee') === true);
    // nobody got in with a refused ticket
    expect(host.lobby!.members.map((m) => m.name).sort()).toEqual(['Ada', 'Cee']);
    await first.leave();
    await host.leave();
  });

  it('gives one seat per platform player: a second ticket for the same account is refused', async () => {
    const host = await create(server, 'Ada', {
      private: true,
      durationSec: 10,
      ticket: await ticket(A, 'Ada', '*'),
    });
    const code = host.room.roomId;
    await until('lobby', () => host.lobby !== null);
    expect(await refusal(joinById(server, code, 'x', { ticket: await ticket(A, 'Ada', code) }))).toMatch(
      /already in the room/,
    );
    await host.leave();
  });

  it('the same verified seat reconnects after a drop (the reconnection token, not a second ticket): identity kept', async () => {
    const host = await create(server, 'Ada', {
      private: true,
      durationSec: 30,
      ticket: await ticket(A, 'Ada', '*'),
    });
    const code = host.room.roomId;
    const b = await joinById(server, code, 'xx', { ticket: await ticket(B, 'Bayo', code) });
    await until('two', () => host.lobby?.members.length === 2);
    host.room.send(MSG.start);
    await until('seats', () => host.seat !== null && b.seat !== null);
    const token = b.room.reconnectionToken;
    b.room.reconnection.enabled = false;
    dropSocket(code, b.room.sessionId);
    await until('host sees Bayo down', () => host.lobby?.members[1]?.connected === false);
    const calls0 = link.stats.ticketsAccepted;
    const room2 = await server.client().reconnect(token);
    b.attach(room2);
    await until('host sees Bayo back', () => host.lobby?.members[1]?.connected === true);
    expect(host.lobby!.members[1]).toMatchObject({ name: 'Bayo', verified: true, playerId: B });
    expect(link.stats.ticketsAccepted).toBe(calls0); // reconnecting consumed no ticket
    await b.leave();
    await host.leave();
  }, 60_000);
});

describe('trusted result reporting', () => {
  it('reports started and finished to the platform with the verified player ids only, signed, and never reports a guest-only match', async () => {
    calls.length = 0;
    // a guest-only match: nothing is reported
    const g = await create(server, 'Gus', { private: true, game: 'deathmatch', durationSec: 5 });
    await until('lobby', () => g.lobby !== null);
    g.room.send(MSG.start);
    await until('guest match ends', () => g.results.length > 0, 120_000);
    await link.idle();
    expect(calls.filter((c) => c.path.startsWith('/internal/v1/matches')).length).toBe(0);
    await g.leave();

    // a match with one verified player and one guest
    const host = await create(server, 'x', {
      private: true,
      game: 'deathmatch',
      durationSec: 5,
      ticket: await ticket(A, 'Ada', '*'),
    });
    const code = host.room.roomId;
    const guest = await joinById(server, code, 'Gus');
    await until('two', () => host.lobby?.members.length === 2);
    host.room.send(MSG.start);
    await until('match ends', () => host.results.length > 0 && guest.results.length > 0, 120_000);
    await link.idle();
    const ofThisRoom = (path: string) => calls.filter((c) => c.path === path && c.body.roomCode === code);
    const started = ofThisRoom('/internal/v1/matches/started');
    const finished = ofThisRoom('/internal/v1/matches/finished');
    expect(started).toHaveLength(1);
    expect(finished).toHaveLength(1);
    const f = finished[0]!;
    // signed exactly as the platform expects (HMAC over ts.METHOD.path.body)
    expect(f.headers['x-wahala-signature']).toBe(
      signServiceRequest(SECRET, Number(f.headers['x-wahala-timestamp']), 'POST', f.path, f.raw),
    );
    const parts = f.body.participants as { seat: number; playerId?: string; name: string; isBot: boolean }[];
    expect(parts).toHaveLength(32);
    expect(parts.filter((p) => p.playerId).map((p) => p.playerId)).toEqual([A]);
    expect(
      parts
        .filter((p) => !p.isBot)
        .map((p) => p.name)
        .sort(),
    ).toEqual(['Ada', 'Gus']);
    expect(parts.filter((p) => p.isBot).every((p) => p.playerId === undefined)).toBe(true);
    expect(f.body.roomCode).toBe(code);
    expect(f.body.game).toBe('deathmatch');
    expect((f.body.results as unknown[]).length).toBe(32);
    expect(String(f.body.matchId)).toMatch(/^[A-Za-z0-9_.:-]{6,64}$/);
    // the platform's rule: the id the server announced at the start is the one it finishes with
    expect(started[0]!.body.matchId).toBe(f.body.matchId);
    await guest.leave();
    await host.leave();
  }, 300_000);

  it('a platform that is down or too slow never delays or fails a match', async () => {
    for (const mode of ['down', 'slow'] as const) {
      platformMode = mode;
      calls.length = 0;
      const t0 = Date.now();
      const host = await create(server, 'x', {
        private: true,
        game: 'deathmatch',
        durationSec: 5,
        ticket: await ticket(A, 'Ada', '*'),
      });
      await until('lobby', () => host.lobby !== null);
      host.room.send(MSG.start);
      await until('seat', () => host.seat !== null, 10_000);
      expect(Date.now() - t0).toBeLessThan(5000); // the start did not wait for the platform
      await until('results', () => host.results.length > 0, 120_000);
      await host.leave();
    }
    platformMode = 'ok';
  }, 300_000);
});

async function signalRoom(names: string[], game: 'deathmatch' | 'team', ids: string[]) {
  const host = await create(server, names[0]!, {
    private: true,
    game,
    durationSec: 60,
    ticket: await ticket(ids[0]!, names[0]!, '*'),
  });
  const code = host.room.roomId;
  const all: TestPlayer[] = [host];
  for (let i = 1; i < names.length; i++)
    all.push(await joinById(server, code, 'x', { ticket: await ticket(ids[i]!, names[i]!, code) }));
  await until('lobby full', () => all.every((p) => p.lobby?.members.length === names.length));
  const got = new Map<TestPlayer, SignalInMsg[]>();
  for (const p of all) {
    got.set(p, []);
    p.room.onMessage(MSG.signalIn, (m: SignalInMsg) => got.get(p)!.push(m));
  }
  return { all, code, got, host };
}

describe('preset signals', () => {
  it('the vocabulary is exactly the platform catalogue (21 presets, same ids)', async () => {
    const { SIGNALS } = await import('../../player-platform/src/comms/catalogue');
    expect([...SIGNAL_IDS].sort()).toEqual(SIGNALS.map((s) => s.id).sort());
    expect(SIGNAL_IDS).toHaveLength(21);
  });

  it('relays a lobby signal to the room mates (not back to the sender) with the sender name; nothing else is accepted', async () => {
    const { all, got, host } = await signalRoom(['Ada', 'Bayo'], 'deathmatch', [A, B]);
    host.room.send(MSG.signal, { id: 'chat.wait' });
    await until('bayo hears', () => got.get(all[1]!)!.length === 1);
    expect(got.get(all[1]!)![0]).toMatchObject({
      id: 'chat.wait',
      seat: null,
      name: 'Ada',
      x: null,
      tick: null,
    });
    expect(got.get(host)!).toHaveLength(0);
    // free text, unknown ids and extra keys are invalid messages: nothing is relayed
    host.room.send(MSG.signal, { id: 'hello everybody' });
    host.room.send(MSG.signal, { id: 'chat.nice', text: 'free text' });
    host.room.send(MSG.signal, 'chat.nice');
    await sleep(300);
    expect(got.get(all[1]!)).toHaveLength(1);
    for (const p of all) await p.leave();
  });

  it('applies the platform filter: a muted or blocked player does not receive the signal; the rest do; a restricted sender is refused', async () => {
    const { all, got } = await signalRoom(['Ada', 'Bayo', 'Cee'], 'deathmatch', [A, B, C]);
    muted.add(`${A}>${B}`); // Ada <-> Bayo muted / blocked
    all[0]!.room.send(MSG.signal, { id: 'chat.gg' });
    await until('cee hears', () => got.get(all[2]!)!.length === 1);
    await sleep(200);
    expect(got.get(all[1]!)).toHaveLength(0);
    muted.clear();
    senderRestricted = true;
    all[2]!.room.send(MSG.signal, { id: 'chat.gg' });
    await until('restricted refused', () => all[2]!.notices.some((n) => n.code === 'signal_restricted'));
    senderRestricted = false;
    for (const p of all) await p.leave();
  });

  it('an outage of the platform filter still delivers presets', async () => {
    const { all, got } = await signalRoom(['Ada', 'Bayo'], 'deathmatch', [A, B]);
    platformMode = 'down';
    all[0]!.room.send(MSG.signal, { id: 'chat.nice' });
    await until('bayo hears anyway', () => got.get(all[1]!)!.length === 1);
    platformMode = 'ok';
    for (const p of all) await p.leave();
  });

  it('during a match: team signals reach teammates only with the sender tile, never in Free-for-All; the rate limit drops the excess', async () => {
    const { all, got, host } = await signalRoom(['Ada', 'Bayo', 'Cee', 'Dayo'], 'team', [
      A,
      B,
      C,
      '44444444-4444-4444-8444-444444444444',
    ]);
    host.room.send(MSG.start);
    await until('seats', () => all.every((p) => p.seat !== null));
    const teams = all.map((p) => p.replica?.state?.players[p.seat!]?.team ?? -1);
    // same team as Ada
    const mates = all.filter((_p, i) => i > 0 && teams[i] === teams[0]);
    const rivals = all.filter((_p, i) => i > 0 && teams[i] !== teams[0]);
    host.room.send(MSG.signal, { id: 'ping.danger' });
    host.room.send(MSG.signal, { id: 'chat.nice' }); // match-wide
    await until('mates hear both', () => mates.every((p) => got.get(p)!.length === 2));
    await sleep(200);
    for (const r of rivals) expect(got.get(r)!.map((m) => m.id)).toEqual(['chat.nice']); // the ping stayed in the team
    const ping = got.get(mates[0]!)!.find((m) => m.id === 'ping.danger')!;
    expect(ping.seat).toBe(host.seat);
    expect(typeof ping.x).toBe('number');
    expect(typeof ping.y).toBe('number');
    expect(ping.tick).toBeGreaterThanOrEqual(0);
    // a lobby-only signal during a match is refused to the sender
    host.room.send(MSG.signal, { id: 'chat.rematch' });
    await until('refused', () => host.notices.some((n) => n.code === 'signal_not_allowed'));
    // rate limit: a burst of 12 delivers about SIGNAL_BURST
    const before = got.get(all[1]!)!.length;
    for (let i = 0; i < 12; i++) host.room.send(MSG.signal, { id: 'emote.wave' });
    await sleep(400);
    const delivered = got.get(all[1]!)!.length - before;
    expect(delivered).toBeLessThanOrEqual(5);
    expect(delivered).toBeGreaterThanOrEqual(1);
    for (const p of all) await p.leave();
  }, 120_000);

  it('Free-for-All refuses team-only signals', async () => {
    const { all, host } = await signalRoom(['Ada', 'Bayo'], 'deathmatch', [A, B]);
    host.room.send(MSG.start);
    await until('seats', () => all.every((p) => p.seat !== null));
    host.room.send(MSG.signal, { id: 'ping.attack' });
    await until('refused', () => host.notices.some((n) => n.code === 'signal_not_allowed'));
    for (const p of all) await p.leave();
  }, 60_000);
});

void TestPlayer;
