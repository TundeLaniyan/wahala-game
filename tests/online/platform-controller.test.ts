/**
 * The platform controller (src/online/platform/controller.ts) with an in-memory platform and a scripted room bridge: guest
 * entry, polling only while a panel is visible, nickname errors, friends, parties, the leader's host-ticket room creation and
 * code report, members joining with a FRESH ticket, a Quick Play room never reported, and a platform outage that never
 * touches the room.
 */
import { describe, expect, it } from 'vitest';
import { PlatformClient } from '../../src/online/platform/client';
import {
  cleanCode,
  cleanReportNote,
  createPlatformController,
  errorText,
  nameErrorText,
  reportContext,
} from '../../src/online/platform/controller';
import type { RoomBridge } from '../../src/online/platform/controller';
import { createTokenStore } from '../../src/online/platform/tokens';
import { FakePlatform, memStorage } from './fakePlatform';

class Room implements RoomBridge {
  room: string | null = null;
  entry = true;
  typed = 'Player';
  names: string[] = [];
  opened: {
    req: { kind: 'create' } | { kind: 'join'; code: string };
    ticket: string;
    refetch: () => Promise<string | null>;
  }[] = [];
  currentRoom() {
    return this.room;
  }
  atEntry() {
    return this.entry;
  }
  open(
    req: { kind: 'create' } | { kind: 'join'; code: string },
    ticket: string,
    refetch: () => Promise<string | null>,
  ) {
    this.opened.push({ req, ticket, refetch });
    this.entry = false;
  }
  name() {
    return this.typed;
  }
  setName(n: string) {
    this.names.push(n);
  }
  character() {
    return 'streetBaller';
  }
}

class Timers {
  fns = new Map<number, { fn: () => void; ms: number }>();
  private id = 0;
  setInterval(fn: () => void, ms: number) {
    this.fns.set(++this.id, { fn, ms });
    return this.id;
  }
  clearInterval(id: unknown) {
    this.fns.delete(id as number);
  }
  /** Fires every interval with this period once. */
  fire(ms: number) {
    for (const t of [...this.fns.values()]) if (t.ms === ms) t.fn();
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));
async function settle() {
  for (let i = 0; i < 6; i++) await flush();
}

function setup(fake = new FakePlatform(), room = new Room()) {
  const timers = new Timers();
  const storage = memStorage();
  const client = new PlatformClient({
    baseUrl: 'http://p.test',
    tokens: createTokenStore(() => storage),
    fetch: fake.fetch,
  });
  const c = createPlatformController({ client, room, timers });
  return { fake, room, timers, c, client, s: () => c.useStore.getState() };
}

describe('entering as a guest', () => {
  it('nothing is requested before open(); open signs in, loads the lists and shows the nickname on the entry', async () => {
    const { fake, c, s, room } = setup();
    expect(fake.requests).toEqual([]);
    room.typed = 'Ada';
    await c.actions.open();
    expect(s().phase).toBe('ready');
    expect(s().me?.displayName).toBe('Ada');
    expect(room.names).toEqual(['Ada']);
    const paths = fake.requests.map((r) => `${r.method} ${r.path}`);
    expect(paths).toContain('POST /v1/auth/guest');
    expect(paths).toContain('PUT /v1/presence');
    expect(paths).toContain('GET /v1/friends');
    expect(paths).toContain('GET /v1/invites');
  });

  it('the platform being down leaves the panels "unavailable" and retry recovers', async () => {
    const { fake, c, s } = setup();
    fake.down = true;
    await c.actions.open();
    expect(s().phase).toBe('unavailable');
    expect(s().stale).toBe(true);
    fake.down = false;
    await c.actions.retry();
    expect(s().phase).toBe('ready');
  });

  it("the YOU tab shows the player's own recorded matches, loaded on sign-in and again when the tab is opened", async () => {
    const fake = new FakePlatform();
    const { c, s } = setup(fake);
    await c.actions.open();
    expect(s().history).toEqual([]);
    fake.matches = [
      {
        matchId: 'm1:abc',
        game: 'team',
        arenaId: 'rumbleOshodi',
        endedAt: 'x',
        durationSec: 180,
        you: { placement: 3, kills: 5, deaths: 2 },
        humans: 2,
      },
    ];
    c.actions.setTab('friends');
    c.actions.setTab('you');
    await settle();
    expect(s().history).toHaveLength(1);
    expect(s().history[0]!.you.placement).toBe(3);
    c.actions.close();
  });

  it('an invite-only platform asks for the code, refuses a wrong one, and a right one creates the account (the code is sent once and never kept)', async () => {
    const fake = new FakePlatform();
    fake.inviteCodes = ['BETA-CODE-1234567'];
    const { c, s, room } = setup(fake);
    room.typed = 'Ada';
    await c.actions.open();
    expect(s().phase).toBe('unavailable');
    expect(s().inviteNeeded).toBe(true);
    expect(s().inviteRefused).toBe(false);
    await c.actions.signInWithInvite('wrong-code');
    expect(s().phase).toBe('unavailable');
    expect(s().inviteNeeded).toBe(true);
    expect(s().inviteRefused).toBe(true);
    await c.actions.signInWithInvite('  BETA-CODE-1234567 ');
    expect(s().phase).toBe('ready');
    expect(s().inviteNeeded).toBe(false);
    expect(s().me?.displayName).toBe('Ada');
    // the code went to the account creation only: no other request carries it, and a later retry does not resend it
    const withCode = fake.requests.filter((r) => JSON.stringify(r.body ?? '').includes('BETA-CODE'));
    expect(withCode.map((r) => r.path)).toEqual(['/v1/auth/guest']);
    c.actions.close();
  });

  it('polls the party only while a panel is visible, and stops every timer on close', async () => {
    const { fake, c, timers } = setup();
    await c.actions.open();
    const count = () => fake.requests.filter((r) => r.path === '/v1/parties/current').length;
    const base = count();
    timers.fire(2000);
    await settle();
    expect(count()).toBe(base); // nothing visible
    const hide = c.actions.show();
    await settle();
    timers.fire(2000);
    await settle();
    expect(count()).toBeGreaterThan(base + 1);
    hide();
    const after = count();
    timers.fire(2000);
    await settle();
    expect(count()).toBe(after);
    timers.fire(30_000);
    await settle();
    expect(fake.requests.filter((r) => r.path === '/v1/presence').length).toBe(2);
    c.actions.close();
    expect(timers.fns.size).toBe(0);
  });
});

describe('nickname', () => {
  it('shows name_taken, name_rejected and the once-a-day cooldown plainly', async () => {
    const { fake, c, s, room } = setup();
    fake.addPlayer('Bisi');
    await c.actions.open();
    expect(await c.actions.setNickname('Bisi')).toBe(false);
    expect(s().nameError).toBe('That name is already taken. Try another one.');
    expect(await c.actions.setNickname('Admin Ada')).toBe(false);
    expect(s().nameError).toBe('That name reads as staff.');
    expect(await c.actions.setNickname('Chidi')).toBe(true);
    expect(s().me?.displayName).toBe('Chidi');
    expect(room.names.at(-1)).toBe('Chidi');
    expect(await c.actions.setNickname('Chidi Two')).toBe(false);
    expect(s().nameError).toMatch(/once a day\. Try again in about 20 hours\./);
  });
});

describe('friends', () => {
  it('adds by friend code, both sides accept, and removing works', async () => {
    const fake = new FakePlatform();
    const a = setup(fake);
    await a.c.actions.open();
    const b = setup(fake);
    await b.c.actions.open();
    expect(await a.c.actions.addFriend('xx')).toBe(false);
    expect(a.s().message?.text).toMatch(/8 letters and digits/);
    expect(await a.c.actions.addFriend(a.s().me!.friendCode)).toBe(false);
    expect(await a.c.actions.addFriend(b.s().me!.friendCode.toLowerCase())).toBe(true);
    expect(a.s().outgoing).toHaveLength(1);
    await b.c.actions.open();
    const hide = b.c.actions.show();
    await settle();
    expect(b.s().incoming).toHaveLength(1);
    await b.c.actions.acceptRequest(b.s().incoming[0]!.id);
    expect(b.s().friends.map((f) => f.displayName)).toEqual([a.s().me!.displayName]);
    await b.c.actions.removeFriend(a.s().me!.id);
    expect(b.s().friends).toEqual([]);
    hide();
  });

  it('block / unblock and mute / unmute update the lists', async () => {
    const { fake, c, s } = setup();
    const other = fake.addPlayer('Bisi');
    await c.actions.open();
    expect(await c.actions.block(other.id)).toBe(true);
    expect(c.actions.isBlocked(other.id)).toBe(true);
    await c.actions.unblock(other.id);
    expect(s().blocks).toEqual([]);
    expect(await c.actions.mute(other.id)).toBe(true);
    expect(c.actions.isMuted(other.id)).toBe(true);
    await c.actions.unmute(other.id);
    expect(c.actions.isMuted(other.id)).toBe(false);
  });
});

describe('party and the private-match handoff', () => {
  async function party() {
    const fake = new FakePlatform();
    const lead = setup(fake);
    lead.room.typed = 'Lead';
    await lead.c.actions.open();
    await lead.c.actions.createParty('team');
    const mem = setup(fake);
    mem.room.typed = 'Member';
    await mem.c.actions.open();
    expect(await mem.c.actions.joinParty(lead.s().party!.code.toLowerCase())).toBe(true);
    return { fake, lead, mem };
  }

  it('the leader starts: HOST ticket -> create room -> report the code; members auto-join ONCE with their own fresh ticket', async () => {
    const { fake, lead, mem } = await party();
    expect(lead.s().party?.mode).toBe('team');
    await lead.c.actions.startMatch();
    expect(lead.room.opened).toHaveLength(1);
    expect(lead.room.opened[0]!.req).toEqual({ kind: 'create' });
    expect(lead.room.opened[0]!.ticket).toMatch(/^tk\.\*-/); // a host ticket
    // the room exists: the flow reports its code
    lead.room.room = 'K7M3QX';
    await lead.c.actions.roomChanged('K7M3QX', true);
    expect(
      fake.requests.filter((r) => r.path.endsWith('/match') && r.method === 'POST').map((r) => r.body),
    ).toEqual([{ roomCode: 'K7M3QX' }]);
    expect(lead.s().party?.status).toBe('in_match');
    // the member's panel polls and sees the code: joins with a member ticket bound to that room
    const hide = mem.c.actions.show();
    await settle();
    expect(mem.room.opened).toHaveLength(1);
    expect(mem.room.opened[0]!.req).toEqual({ kind: 'join', code: 'K7M3QX' });
    expect(mem.room.opened[0]!.ticket).toMatch(/^tk\.K7M3QX-/);
    // a retry gets a NEW ticket, never the same one
    const again = await mem.room.opened[0]!.refetch();
    expect(again).toMatch(/^tk\.K7M3QX-/);
    expect(again).not.toBe(mem.room.opened[0]!.ticket);
    // the member leaves the room for the entry: polling does not drag them back into the same room
    mem.room.entry = true;
    mem.room.room = null;
    mem.timers.fire(2000);
    await settle();
    expect(mem.room.opened).toHaveLength(1);
    // but "Join match" does (fresh ticket again)
    await mem.c.actions.joinMatch();
    expect(mem.room.opened).toHaveLength(2);
    expect(new Set(fake.tickets.map((t) => t.ticket)).size).toBe(fake.tickets.length);
    hide();
  });

  it('after the match the party is a lobby again; the leader can send the room (still open for a rematch) once more', async () => {
    const { fake, lead } = await party();
    await lead.c.actions.startMatch();
    await lead.c.actions.roomChanged('K7M3QX', true);
    fake.parties.get(lead.s().party!.id)!.room = null; // the server reported the match finished
    const hide = lead.c.actions.show();
    await settle();
    expect(lead.s().party?.status).toBe('open');
    await lead.c.actions.shareRoom('K7M3QX');
    expect(lead.s().party?.match?.roomCode).toBe('K7M3QX');
    expect(lead.room.opened).toHaveLength(1); // the leader is not sent anywhere
    hide();
  });

  it('a Quick Play (unticketed) room is never reported to the party', async () => {
    const { fake, lead } = await party();
    await lead.c.actions.startMatch();
    await lead.c.actions.roomChanged('QQQQQQ', false);
    await lead.c.actions.roomChanged('K7M3QX', true);
    expect(fake.requests.filter((r) => r.path.endsWith('/match') && r.method === 'POST')).toEqual([]);
  });

  it('starting again while the party is still marked in a match closes the old match first', async () => {
    const { fake, lead } = await party();
    await lead.c.actions.startMatch();
    await lead.c.actions.roomChanged('K7M3QX', true);
    lead.room.room = null;
    lead.room.entry = true;
    await lead.c.actions.startMatch();
    expect(fake.requests.some((r) => r.method === 'DELETE' && r.path.endsWith('/match'))).toBe(true);
    expect(lead.room.opened.at(-1)!.req).toEqual({ kind: 'create' });
  });

  it('leader controls: mode, kick, promote; leaving and being removed are told apart', async () => {
    const { lead, mem } = await party();
    await lead.c.actions.setMode('ffa');
    expect(lead.s().party?.mode).toBe('ffa');
    const memberId = mem.s().me!.id;
    await lead.c.actions.promote(memberId);
    expect(lead.s().party?.leaderId).toBe(memberId);
    await mem.c.actions.open();
    const hide = mem.c.actions.show();
    await settle();
    expect(mem.s().party?.you.isLeader).toBe(true);
    await mem.c.actions.kick(lead.s().me!.id);
    // the old leader's next poll: no party, and a plain line says so
    const h2 = lead.c.actions.show();
    await settle();
    expect(lead.s().party).toBeNull();
    expect(lead.s().message?.text).toMatch(/no longer in a party/);
    await mem.c.actions.leaveParty();
    expect(mem.s().party).toBeNull();
    expect(mem.s().message?.text).toBe('You left the party.');
    hide();
    h2();
  });

  it('invitations: the leader invites a friend, the friend accepts and is in the party', async () => {
    const fake = new FakePlatform();
    const lead = setup(fake);
    await lead.c.actions.open();
    const friend = setup(fake);
    await friend.c.actions.open();
    await lead.c.actions.addFriend(friend.s().me!.friendCode);
    await friend.c.actions.addFriend(lead.s().me!.friendCode); // mutual request = friends
    await lead.c.actions.createParty();
    await lead.c.actions.invite(friend.s().me!.id);
    expect(lead.s().message?.text).toMatch(/Invitation sent/);
    const hide = friend.c.actions.show();
    await settle();
    expect(friend.s().invites).toHaveLength(1);
    await friend.c.actions.acceptInvite(friend.s().invites[0]!.id);
    expect(friend.s().party?.members).toHaveLength(2);
    expect(friend.s().tab).toBe('party');
    hide();
  });

  it('a platform outage during polling marks the panel stale and never touches the room', async () => {
    const { fake, lead } = await party();
    const hide = lead.c.actions.show();
    await settle();
    fake.down = true;
    lead.timers.fire(2000);
    await settle();
    expect(lead.s().stale).toBe(true);
    expect(lead.room.opened).toEqual([]);
    expect(lead.s().party).not.toBeNull(); // the last known party stays on screen
    fake.down = false;
    lead.timers.fire(2000);
    await settle();
    expect(lead.s().stale).toBe(false);
    hide();
  });
});

describe('reports', () => {
  it('picks the context the platform needs (match, else party, else friend) and sends the note cleaned', async () => {
    const { fake, c, s } = setup();
    const other = fake.addPlayer('Bisi');
    await c.actions.open();
    expect(await c.actions.report(other.id, 'spam', 'x', null)).toBe(false);
    expect(s().message?.text).toMatch(/after a match with them/);
    expect(await c.actions.report(other.id, 'harassment', `  rude \n  ${'a'.repeat(300)}`, 'match-1')).toBe(
      true,
    );
    const sent = fake.reports.at(-1)!;
    expect(sent).toMatchObject({
      reportedId: other.id,
      category: 'harassment',
      context: 'match',
      contextRef: 'match-1',
    });
    expect(String(sent.note).length).toBe(200);
    expect(String(sent.note).startsWith('rude a')).toBe(true);
  });

  it('reportContext / cleanReportNote are pure', () => {
    const party = { id: 'p', members: [{ playerId: 'x' }] } as never;
    expect(reportContext('x', { matchId: null, party, friends: [] })).toEqual({
      context: 'party',
      contextRef: 'p',
    });
    expect(reportContext('y', { matchId: null, party, friends: [{ playerId: 'y' } as never] })).toEqual({
      context: 'profile',
      contextRef: null,
    });
    expect(reportContext('z', { matchId: 'm', party: null, friends: [] })).toEqual({
      context: 'match',
      contextRef: 'm',
    });
    expect(cleanReportNote('   ')).toBeNull();
  });
});

describe('words', () => {
  it('outages and refusals read plainly; codes are cleaned', () => {
    const e = (code: string, status: number, message = 'm', retryAfterMs: number | null = null) => ({
      code,
      status,
      message,
      requestId: null,
      retryAfterMs,
    });
    expect(errorText(e('network', 0))).toMatch(/not reachable.*Online play still works/);
    expect(errorText(e('unavailable', 503))).toMatch(/not reachable/);
    expect(errorText(e('conflict', 409, 'The party is full.'))).toBe('The party is full.');
    expect(errorText(e('rate_limited', 429, 'Slow down.', 1000))).toBe(
      'Slow down. Wait a moment and try again.',
    );
    expect(nameErrorText(e('rate_limited', 429, 'x', null))).toBe('You can change your name once a day.');
    expect(cleanCode('ab-cd efgh')).toEqual({ text: 'ABCDEFGH', code: 'ABCDEFGH' });
    expect(cleanCode('ABCDEFG0').code).toBeNull(); // 0 is not in the code alphabet
  });
});
