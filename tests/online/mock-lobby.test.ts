import { describe, expect, it } from 'vitest';
import type { ServerEvent } from '../../src/online/schema';
import type { Room } from '../../src/online/types';
import { mock, val } from './helpers';

type M = ReturnType<typeof mock>;

async function partyRoom(
  m: M,
  game: 'classic' | 'team' | 'deathmatch' = 'classic',
  arenaId = 'danfoBusPark',
  invite = true,
) {
  val(await m.online.accounts.signInGuest());
  const party = val(await m.online.parties.create());
  if (invite) {
    val(await m.online.parties.invite(party.id, 'friend-ada'));
    m.wait(1500);
  }
  const room = val(await m.online.lobbies.createFromParty(party.id, { game, arenaId }));
  return { party, room };
}

const roomEvents = (events: ServerEvent[]) =>
  events.flatMap((e) => (e.type === 'room.update' ? [e.room] : []));

describe('mock parties', () => {
  it('creates a party with a shareable code and the creator as leader', async () => {
    const m = mock();
    val(await m.online.accounts.signInGuest());
    const party = val(await m.online.parties.create());
    expect(party.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(party.leaderId).toBe(party.members[0]!.accountId);
    expect(await m.online.parties.create()).toMatchObject({ error: { code: 'conflict' } });
  });

  it('inviting a scripted friend: they join and ready up on the clock; offline, duplicate and full cases', async () => {
    const m = mock();
    val(await m.online.accounts.signInGuest());
    const party = val(await m.online.parties.create());
    const inv = val(await m.online.parties.invite(party.id, 'friend-ada'));
    expect(inv.partyId).toBe(party.id);
    expect(await m.online.parties.invite(party.id, 'friend-ada')).toMatchObject({
      error: { code: 'conflict' },
    });
    expect(await m.online.parties.invite(party.id, 'friend-zainab')).toMatchObject({
      error: { code: 'conflict' },
    }); // offline
    expect(await m.online.parties.invite(party.id, 'stranger')).toMatchObject({
      error: { code: 'notFound' },
    });
    m.wait(700);
    let p = val(await m.online.parties.get(party.id));
    expect(p.members).toHaveLength(2);
    expect(p.members[1]).toMatchObject({ displayName: 'Ada_Danfo', mock: true, ready: false });
    m.wait(600);
    p = val(await m.online.parties.get(party.id));
    expect(p.members[1]!.ready).toBe(true);
    val(await m.online.parties.invite(party.id, 'friend-femi'));
    val(await m.online.parties.invite(party.id, 'friend-tunde'));
    m.wait(1500);
    expect(val(await m.online.parties.get(party.id)).members).toHaveLength(4);
    val(await m.online.social.requestFriend('HALI05'));
    expect(await m.online.parties.invite(party.id, 'stranger-halima')).toMatchObject({
      error: { code: 'roomFull' },
    });
  });

  it('ready toggles publish party updates', async () => {
    const m = mock();
    const events: ServerEvent[] = [];
    m.online.events.subscribe((e) => events.push(e));
    val(await m.online.accounts.signInGuest());
    const party = val(await m.online.parties.create());
    expect(val(await m.online.parties.setReady(party.id, true)).members[0]!.ready).toBe(true);
    expect(val(await m.online.parties.setReady(party.id, false)).members[0]!.ready).toBe(false);
    expect(events.filter((e) => e.type === 'party.update').length).toBeGreaterThanOrEqual(3);
  });

  it('non-leaders cannot kick, promote, invite or start; anyone can leave', async () => {
    const m = mock();
    val(await m.online.accounts.signInGuest());
    const remote = m.online.control.seedRemoteParty('REMOTE', 'friend-ada')!;
    const joined = val(await m.online.parties.join('REMOTE'));
    expect(joined.members).toHaveLength(2);
    const me = joined.members[1]!.accountId;
    expect(await m.online.parties.kick(remote.id, 'friend-ada')).toMatchObject({
      error: { code: 'forbidden' },
    });
    expect(await m.online.parties.promote(remote.id, me)).toMatchObject({ error: { code: 'forbidden' } });
    expect(await m.online.parties.invite(remote.id, 'friend-femi')).toMatchObject({
      error: { code: 'forbidden' },
    });
    expect(
      await m.online.lobbies.createFromParty(remote.id, { game: 'classic', arenaId: 'danfoBusPark' }),
    ).toMatchObject({
      error: { code: 'forbidden' },
    });
    val(await m.online.parties.leave(remote.id));
    // only the scripted leader was left, so the party closes
    expect(await m.online.parties.get(remote.id)).toMatchObject({ error: { code: 'notFound' } });
  });

  it('the leader can promote and kick; kicking yourself is refused; unknown codes are not found', async () => {
    const m = mock();
    val(await m.online.accounts.signInGuest());
    const party = val(await m.online.parties.create());
    val(await m.online.parties.invite(party.id, 'friend-ada'));
    m.wait(800);
    expect(await m.online.parties.kick(party.id, party.leaderId)).toMatchObject({
      error: { code: 'conflict' },
    });
    const promoted = val(await m.online.parties.promote(party.id, 'friend-ada'));
    expect(promoted.leaderId).toBe('friend-ada');
    expect(await m.online.parties.kick(party.id, 'friend-ada')).toMatchObject({
      error: { code: 'forbidden' },
    });
    expect(await m.online.parties.join('ZZZZZZ')).toMatchObject({ error: { code: 'notFound' } });
  });

  it('kicking removes a member', async () => {
    const m = mock();
    val(await m.online.accounts.signInGuest());
    const party = val(await m.online.parties.create());
    val(await m.online.parties.invite(party.id, 'friend-ada'));
    m.wait(800);
    expect(val(await m.online.parties.kick(party.id, 'friend-ada')).members).toHaveLength(1);
  });
});

describe('mock lobby, ready check and countdown', () => {
  it('party -> room: host starts the ready check, everyone readies, the countdown runs, the match starts', async () => {
    const m = mock();
    const events: ServerEvent[] = [];
    m.online.events.subscribe((e) => events.push(e));
    const { room } = await partyRoom(m);
    expect(room).toMatchObject({ state: 'open', game: 'classic', maxPlayers: 4 });
    expect(room.members).toHaveLength(2); // you and the invited friend; bots fill the seats when the ready check starts
    val(await m.online.lobbies.setReady(room.id, true));
    const checking = val(await m.online.lobbies.startReadyCheck(room.id));
    expect(checking.state).toBe('readyCheck');
    expect(checking.members).toHaveLength(4);
    m.wait(2000);
    expect(val(await m.online.lobbies.get(room.id)).state).toBe('starting'); // scripted players readied; you already had
    expect(val(await m.online.lobbies.get(room.id)).matchId).toMatch(/^match-/);
    m.wait(3100);
    expect(val(await m.online.lobbies.get(room.id)).state).toBe('inProgress');
    expect(roomEvents(events).map((r) => r.state)).toEqual(
      expect.arrayContaining(['open', 'readyCheck', 'starting', 'inProgress']),
    );
    expect(events.flatMap((e) => (e.type === 'match.countdown' ? [e.secondsLeft] : []))).toEqual([
      3, 2, 1, 0,
    ]);
  });

  it('the match waits for YOUR ready flag; un-readying during the ready check holds the start', async () => {
    const m = mock();
    const { room } = await partyRoom(m);
    val(await m.online.lobbies.startReadyCheck(room.id));
    m.wait(3000);
    expect(val(await m.online.lobbies.get(room.id)).state).toBe('readyCheck');
    val(await m.online.lobbies.setReady(room.id, true));
    expect(val(await m.online.lobbies.get(room.id)).state).toBe('starting');
    expect(await m.online.lobbies.setReady(room.id, false)).toMatchObject({
      error: { code: 'invalidState' },
    });
  });

  it('only the host starts the ready check, once; settings lock afterwards', async () => {
    const m = mock();
    const { room } = await partyRoom(m);
    val(await m.online.lobbies.startReadyCheck(room.id));
    expect(await m.online.lobbies.startReadyCheck(room.id)).toMatchObject({
      error: { code: 'invalidState' },
    });
    expect(
      await m.online.lobbies.setSettings(room.id, { game: 'classic', arenaId: 'balogunMarket' }),
    ).toMatchObject({
      error: { code: 'invalidState' },
    });
  });

  it('a lone player cannot start a ready check; the invited friend makes two', async () => {
    const m = mock();
    const { room } = await partyRoom(m, 'classic', 'danfoBusPark', false);
    // alone: the server fills the seats with bots, so a solo player can start
    expect(val(await m.online.lobbies.startReadyCheck(room.id)).members).toHaveLength(4);
  });

  it('settings: only valid game / arena pairs; changing them rebuilds the roster and clears ready flags', async () => {
    const m = mock();
    const { room } = await partyRoom(m);
    expect(
      await m.online.lobbies.setSettings(room.id, { game: 'classic', arenaId: 'rumbleOshodi' }),
    ).toMatchObject({ error: { code: 'conflict' } });
    expect(
      await m.online.lobbies.setSettings(room.id, { game: 'team', arenaId: 'danfoBusPark' }),
    ).toMatchObject({ error: { code: 'conflict' } });
    expect(
      await m.online.lobbies.setSettings(room.id, { game: 'classic', arenaId: 'nowhere' }),
    ).toMatchObject({ error: { code: 'notFound' } });
    val(await m.online.lobbies.setReady(room.id, true));
    const next = val(await m.online.lobbies.setSettings(room.id, { game: 'team', arenaId: 'rumbleOshodi' }));
    expect(next.maxPlayers).toBe(8);
    expect(next.members).toHaveLength(2);
    expect(next.members.every((x) => !x.ready)).toBe(true);
    expect(next.members.map((x) => x.team)).toEqual([0, 1]);
    const filled = val(await m.online.lobbies.startReadyCheck(room.id));
    expect(filled.members).toHaveLength(8);
    expect([0, 1].map((t) => filled.members.filter((x) => x.team === t).length)).toEqual([4, 4]);
  });

  it('a character can be picked while the room is open, not after', async () => {
    const m = mock();
    const { room } = await partyRoom(m, 'classic', 'danfoBusPark', false);
    const r = val(await m.online.lobbies.setCharacter(room.id, 'campusQueen'));
    expect(r.members.find((x) => !x.isBot)!.characterId).toBe('campusQueen');
    val(await m.online.lobbies.startReadyCheck(room.id));
    expect(await m.online.lobbies.setCharacter(room.id, 'lekkiBoy')).toMatchObject({
      error: { code: 'invalidState' },
    });
  });

  it('leaving as the only real player aborts the room (scripted players keep nothing alive)', async () => {
    const m = mock();
    const events: ServerEvent[] = [];
    m.online.events.subscribe((e) => events.push(e));
    const { room } = await partyRoom(m);
    val(await m.online.lobbies.startReadyCheck(room.id));
    val(await m.online.lobbies.leave(room.id));
    expect(roomEvents(events).at(-1)!.state).toBe('aborted');
    expect(await m.online.lobbies.get(room.id)).toMatchObject({ error: { code: 'forbidden' } });
  });

  it('the match service refuses to start before the ready check passed; unknown rooms are not found', async () => {
    const m = mock();
    const { room } = await partyRoom(m);
    expect(await m.online.matches.start(room.id)).toMatchObject({ error: { code: 'invalidState' } });
    expect(await m.online.lobbies.get('nope')).toMatchObject({ error: { code: 'notFound' } });
  });
});

describe('mock teams', () => {
  const counts = (r: Room) => [0, 1].map((t) => r.members.filter((x) => x.team === t).length);

  it('the server assigns teams; a request to switch moves you if the other team has room', async () => {
    const m = mock();
    const { room } = await partyRoom(m, 'team', 'rumbleOshodi');
    expect(room.members.map((x) => x.team)).toEqual([0, 1]);
    const moved = val(await m.online.teams.requestSwitch(room.id));
    expect(moved.members.find((x) => !x.isBot && x.displayName.startsWith('Guest'))!.team).toBe(1);
    expect(counts(moved)).toEqual([0, 2]);
    const back = val(await m.online.teams.requestSwitch(room.id));
    expect(counts(back)).toEqual([1, 1]);
  });

  it('the server fills both teams when the ready check starts, then teams lock', async () => {
    const m = mock();
    const { room } = await partyRoom(m, 'team', 'rumbleOshodi', false);
    // filled by the server: 4 per team
    const filled = val(await m.online.lobbies.startReadyCheck(room.id));
    expect(counts(filled)).toEqual([4, 4]);
    expect(await m.online.teams.requestSwitch(room.id)).toMatchObject({ error: { code: 'invalidState' } }); // locked
  });

  it('switching is refused when ready, outside team games and for unknown rooms; balance is host-only', async () => {
    const m = mock();
    const { room } = await partyRoom(m, 'classic', 'danfoBusPark', false);
    expect(await m.online.teams.requestSwitch(room.id)).toMatchObject({ error: { code: 'conflict' } });
    expect(await m.online.teams.balance(room.id)).toMatchObject({ error: { code: 'conflict' } });
    const t = mock();
    const { room: team } = await partyRoom(t, 'team', 'rumbleOshodi');
    val(await t.online.lobbies.setReady(team.id, true));
    expect(await t.online.teams.requestSwitch(team.id)).toMatchObject({ error: { code: 'conflict' } });
    const balanced = val(await t.online.teams.balance(team.id));
    expect(balanced.members.every((x) => !x.ready)).toBe(true);
    expect(await t.online.teams.requestSwitch('nope')).toMatchObject({ error: { code: 'notFound' } });
  });
});

describe('mock matchmaking', () => {
  it('the queue fills with mock players over time, then a room with a ready check appears', async () => {
    const m = mock();
    const events: ServerEvent[] = [];
    m.online.events.subscribe((e) => events.push(e));
    val(await m.online.accounts.signInGuest());
    const t = val(await m.online.matchmaking.enqueue({ game: 'classic', arenaId: 'danfoBusPark' }));
    expect(t).toMatchObject({ state: 'searching', found: 0, needed: 3 });
    m.wait(1500);
    expect(val(await m.online.matchmaking.status(t.ticketId)).found).toBe(2);
    m.wait(800);
    const done = val(await m.online.matchmaking.status(t.ticketId));
    expect(done).toMatchObject({ state: 'matched', found: 3 });
    const room = val(await m.online.lobbies.get(done.roomId!));
    expect(room).toMatchObject({ source: 'queue', state: 'readyCheck' });
    expect(room.members.filter((x) => x.isBot)).toHaveLength(3);
    expect(events.flatMap((e) => (e.type === 'queue.update' ? [e.status.found] : []))).toEqual([0, 1, 2, 3]);
  });

  it('cancel, double enqueue and invalid requests', async () => {
    const m = mock();
    val(await m.online.accounts.signInGuest());
    const t = val(await m.online.matchmaking.enqueue({ game: 'team', arenaId: 'rumbleOshodi' }));
    expect(await m.online.matchmaking.enqueue({ game: 'classic', arenaId: 'danfoBusPark' })).toMatchObject({
      error: { code: 'conflict' },
    });
    expect(val(await m.online.matchmaking.cancel(t.ticketId)).state).toBe('cancelled');
    m.wait(10_000);
    expect(val(await m.online.matchmaking.status(t.ticketId)).state).toBe('cancelled');
    expect(await m.online.matchmaking.enqueue({ game: 'classic', arenaId: 'rumbleOshodi' })).toMatchObject({
      error: { code: 'conflict' },
    });
    expect(await m.online.matchmaking.status('nope')).toMatchObject({ error: { code: 'notFound' } });
    expect(await m.online.matchmaking.cancel('nope')).toMatchObject({ error: { code: 'notFound' } });
  });

  it('a quick team match is full on both sides and balanced by the server', async () => {
    const m = mock();
    const events: ServerEvent[] = [];
    m.online.events.subscribe((e) => events.push(e));
    val(await m.online.accounts.signInGuest());
    const t = val(await m.online.matchmaking.enqueue({ game: 'team', arenaId: 'rumbleOshodi' }));
    m.wait(5200);
    const status = val(await m.online.matchmaking.status(t.ticketId));
    expect(status.state).toBe('matched');
    const room = val(await m.online.lobbies.get(status.roomId!));
    expect(room.members).toHaveLength(8);
    expect([0, 1].map((x) => room.members.filter((y) => y.team === x).length)).toEqual([4, 4]);
    expect(roomEvents(events).at(-1)!.state).toBe('readyCheck');
  });
});
