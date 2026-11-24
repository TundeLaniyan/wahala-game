/**
 * The pure view models of the online City Rumble screens (docs/ONLINE_INTEGRATION.md, decision ON10): name and code
 * handling, failure wording, who may do what in the room, the 32-seat bar, the connection chip / banner and the results table.
 */
import { describe, expect, it } from 'vitest';
import { MATCH_SEATS } from '../../src/net/protocol';
import type { LobbyMemberView, LobbyMsg, ResultsMsg } from '../../src/net/protocol';
import { RUMBLE_ARENA_IDS } from '../../src/sim';
import {
  DEFAULT_PLAYER_NAME,
  DURATION_OPTIONS,
  PING_GOOD_MS,
  PING_OK_MS,
  botsLine,
  codeView,
  countdownSeconds,
  entryModel,
  errorMessage,
  gameIsTimed,
  initialName,
  inviteLink,
  lobbyModel,
  loadingModel,
  modeOptions,
  nameCheck,
  netStatusModel,
  ordinal,
  pingTone,
  remainingMs,
  resultsModel,
  roomCodeFromSearch,
  roomConnectionNote,
  roomRules,
  seatBar,
  settingsView,
  stageOptions,
} from '../../src/ui/online/rumble/models';

const member = (name: string, over: Partial<LobbyMemberView> = {}): LobbyMemberView => ({
  name,
  characterId: 'streetBaller',
  ready: false,
  isHost: false,
  seat: null,
  connected: true,
  ...over,
});

const lobby = (over: Partial<LobbyMsg> = {}): LobbyMsg => ({
  code: 'K7M3QX',
  phase: 'lobby',
  private: true,
  members: [member('Ada', { isHost: true }), member('Tunde', { ready: true }), member('Ngozi')],
  settings: { arenaId: 'rumbleOshodi', game: 'deathmatch', durationSec: 300, botDifficulty: 'standard' },
  countdownMs: null,
  autoStartMs: null,
  botsToFill: 29,
  you: 0,
  ...over,
});

describe('name', () => {
  it('accepts the server rule and returns the cleaned name', () => {
    expect(nameCheck('  Ada   Obi ')).toEqual({ ok: true, name: 'Ada Obi' });
    expect(nameCheck('Chidi_77')).toEqual({ ok: true, name: 'Chidi_77' });
    expect(nameCheck('Ọlá')).toMatchObject({ ok: true });
  });
  it('says why a name fails, in words', () => {
    const why = (s: string) => {
      const c = nameCheck(s);
      return c.ok ? null : c.reason;
    };
    expect(why('A')).toMatch(/at least 2/);
    expect(why('')).toMatch(/at least 2/);
    expect(why('x'.repeat(25))).toMatch(/at most 24/);
    expect(why('Ada!')).toMatch(/letters, numbers/);
    expect(why('<i onerror=1>')).toMatch(/letters, numbers/);
    expect(why('__')).toMatch(/letter or number/);
  });
  it('starts from the last valid stored name, else "Player"', () => {
    expect(DEFAULT_PLAYER_NAME).toBe('Player');
    expect(initialName(null)).toBe('Player');
    expect(initialName(undefined)).toBe('Player');
    expect(initialName('Tunde')).toBe('Tunde');
    expect(initialName('  Tunde  ')).toBe('Tunde');
    expect(initialName('<b>')).toBe('Player');
    expect(initialName('')).toBe('Player');
  });
});

describe('room code', () => {
  it('upper-cases, drops spaces and punctuation and stops at six characters', () => {
    expect(codeView('k7m 3qx').text).toBe('K7M3QX');
    expect(codeView('k7m-3qx99').text).toBe('K7M3QX');
    expect(codeView('  ').text).toBe('');
  });
  it('knows a complete valid code and only then', () => {
    expect(codeView('k7m3qx').code).toBe('K7M3QX');
    expect(codeView('k7m3q').code).toBeNull();
    expect(codeView('k7m3q0').code).toBeNull(); // 0 is not in the alphabet
    expect(codeView('ABCDEO').code).toBeNull(); // nor is O
  });
  it('explains a short code and a code with characters no code uses', () => {
    expect(codeView('K7M').hint).toBe('3 more characters.');
    expect(codeView('K7M3Q').hint).toBe('1 more character.');
    expect(codeView('K7M3Q0').hint).toMatch(/never use 0, O, 1, I or L/);
    expect(codeView('').hint).toBeNull();
    expect(codeView('K7M3QX').hint).toBeNull();
  });
  it('accepts a pasted invite link', () => {
    expect(codeView('https://example.test/wahala-game/?online&room=k7m3qx').code).toBe('K7M3QX');
    expect(codeView('?room=%4B7M3QX').code).toBe('K7M3QX');
    expect(codeView('?room=%E0%A4%A').text).toBe('E0A4A'); // a broken escape never throws
  });
  it('prefills only from a valid ?room= value of the page URL', () => {
    expect(roomCodeFromSearch('?online&room=k7m3qx')).toBe('K7M3QX');
    expect(roomCodeFromSearch('?online&room=nope')).toBeNull();
    expect(roomCodeFromSearch('?online')).toBeNull();
    expect(roomCodeFromSearch('')).toBeNull();
  });
  it('builds the invite link from this page, with the runtime switch', () => {
    expect(inviteLink('K7M3QX', { origin: 'http://192.168.1.5:5173', pathname: '/wahala-game/' })).toBe(
      'http://192.168.1.5:5173/wahala-game/?online&room=K7M3QX',
    );
  });
});

describe('entry', () => {
  it('allows the three actions only with a valid name and a configured build; join also needs a full code', () => {
    const ok = entryModel('Ada', '', true);
    expect(ok).toMatchObject({ canCreate: true, canQuick: true, canJoin: false });
    expect(ok.joinReason).toMatch(/6-character/);
    expect(entryModel('Ada', 'k7m3qx', true)).toMatchObject({ canJoin: true, joinReason: null });
    expect(entryModel('A', 'k7m3qx', true)).toMatchObject({
      canCreate: false,
      canQuick: false,
      canJoin: false,
    });
    expect(entryModel('Ada', 'k7m3qx', false)).toMatchObject({
      canCreate: false,
      canQuick: false,
      canJoin: false,
      configured: false,
    });
    expect(entryModel('Ada', 'k7m3qx', false).joinReason).toMatch(/not configured/);
  });
});

describe('failure wording', () => {
  it('has plain words for every reason the session reports', () => {
    expect(errorMessage('unreachable').text).toBe(
      "Can't reach the online server. Check your connection and that the server address is right.",
    );
    expect(errorMessage('protocol').text).toMatch(/version of the game and the server don't match/);
    expect(errorMessage('room-not-found').text).toMatch(/no room with that code/);
    expect(errorMessage('room-full').text).toMatch(/no free seat/);
    expect(errorMessage('refused').text).toMatch(/did not accept you/);
    expect(errorMessage('unknown').text).toMatch(/failed/);
    expect(errorMessage('not-configured').text).toBe('Online is not configured in this build.');
  });
  it('offers Try again only where trying again can help', () => {
    expect(errorMessage('unreachable').canRetry).toBe(true);
    expect(errorMessage('room-full').canRetry).toBe(true);
    expect(errorMessage('room-not-found').canRetry).toBe(false);
    expect(errorMessage('protocol').canRetry).toBe(false);
    expect(errorMessage('not-configured').canRetry).toBe(false);
  });
  it('keeps the server detail short and drops an empty one', () => {
    expect(errorMessage('refused', '  ').detail).toBeNull();
    expect(errorMessage('refused', undefined).detail).toBeNull();
    expect(errorMessage('refused', 'x'.repeat(500)).detail).toHaveLength(200);
  });
});

describe('32-seat bar', () => {
  it('is always the match size: humans, then bots, then open seats', () => {
    const bar = seatBar(3, 29);
    expect(bar).toHaveLength(MATCH_SEATS);
    expect(bar.filter((k) => k === 'human')).toHaveLength(3);
    expect(bar.filter((k) => k === 'bot')).toHaveLength(29);
    expect(bar.filter((k) => k === 'open')).toHaveLength(0);
    expect(bar.slice(0, 3)).toEqual(['human', 'human', 'human']);
    expect(bar[3]).toBe('bot');
  });
  it('shows free seats and clamps nonsense', () => {
    expect(seatBar(2, 10).filter((k) => k === 'open')).toHaveLength(20);
    expect(seatBar(40, 5)).toEqual(Array(32).fill('human'));
    expect(seatBar(30, 99).filter((k) => k === 'bot')).toHaveLength(2);
    expect(seatBar(-3, -1)).toEqual(Array(32).fill('open'));
    expect(seatBar(1.9, 0.2).filter((k) => k === 'human')).toHaveLength(1);
  });
  it('says how many bots fill the room', () => {
    expect(botsLine(29)).toBe('29 bots will fill the remaining seats.');
    expect(botsLine(1)).toBe('1 bot will fill the remaining seat.');
    expect(botsLine(0)).toMatch(/No bots/);
  });
});

describe('lobbyModel', () => {
  it('tags every member HUMAN, with HOST / READY / YOU, and adds one BOT row count', () => {
    const v = lobbyModel(lobby());
    expect(v.rows.map((r) => r.tags)).toEqual([['HUMAN', 'HOST', 'YOU'], ['HUMAN', 'READY'], ['HUMAN']]);
    expect(v.humans).toBe(3);
    expect(v.bots).toBe(29);
    expect(v.botsLine).toBe('29 bots will fill the remaining seats.');
    expect(v.seats.filter((k) => k === 'human')).toHaveLength(3);
    expect(v.seatsLine).toBe('3 humans · 29 bots · 32 fighters');
    expect(v.readyLine).toBe('1 of 3 ready');
    expect(v.code).toBe('K7M3QX');
    expect(v.phaseLabel).toBe('Waiting in the lobby');
  });
  it('marks a member whose connection is down as reconnecting', () => {
    const v = lobbyModel(
      lobby({ members: [member('Ada', { isHost: true }), member('Tunde', { connected: false })] }),
    );
    expect(v.rows[1]!.stateNote).toBe('reconnecting');
    expect(v.rows[0]!.stateNote).toBeNull();
  });
  it('a lone human in a 32-seat match has 31 bots; no `you` marks nobody', () => {
    const v = lobbyModel(lobby({ members: [member('Ada', { isHost: true })], botsToFill: 31, you: null }));
    expect(v.bots).toBe(31);
    expect(v.rows[0]!.you).toBe(false);
    expect(v.seatsLine).toBe('1 human · 31 bots · 32 fighters');
  });
  it('a name is only data: markup in a name is kept as the text it is', () => {
    const v = lobbyModel(
      lobby({ members: [member('<img src=x onerror=alert(1)>', { isHost: true })], you: 0 }),
    );
    expect(v.rows[0]!.name).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('roomRules', () => {
  it('the host of a private lobby may change settings, start and ready', () => {
    const r = roomRules(lobby(), 'connected');
    expect(r).toMatchObject({
      isHost: true,
      canReady: true,
      showStart: true,
      canStart: true,
      startReason: null,
      canChangeSettings: true,
      settingsReason: null,
    });
  });
  it('a guest may ready but not start or change settings, and is told why', () => {
    const r = roomRules(lobby({ you: 1 }), 'connected');
    expect(r.isHost).toBe(false);
    expect(r.canReady).toBe(true);
    expect(r.youReady).toBe(true);
    expect(r.canStart).toBe(false);
    expect(r.startReason).toBe('Only the host can start the match.');
    expect(r.canChangeSettings).toBe(false);
    expect(r.settingsReason).toBe('Only the host can change the match.');
  });
  it('a public room has no START: it starts by itself', () => {
    const r = roomRules(lobby({ private: false }), 'connected');
    expect(r.showStart).toBe(false);
    expect(r.canStart).toBe(false);
    expect(r.startReason).toBeNull();
  });
  it('nothing changes once the countdown or the match began', () => {
    for (const phase of ['countdown', 'playing', 'results'] as const) {
      const r = roomRules(lobby({ phase }), 'connected');
      expect(r.inLobby).toBe(false);
      expect(r.canReady).toBe(false);
      expect(r.canStart).toBe(false);
      expect(r.canChangeSettings).toBe(false);
    }
    expect(roomRules(lobby({ phase: 'countdown' }), 'connected').startReason).toBe(
      'The match is already starting.',
    );
  });
  it('is read-only while the connection is down', () => {
    for (const conn of ['reconnecting', 'closed', 'connecting', 'idle'] as const) {
      const r = roomRules(lobby(), conn);
      expect(r.canReady).toBe(false);
      expect(r.canStart).toBe(false);
      expect(r.canChangeSettings).toBe(false);
    }
    expect(roomRules(lobby(), 'reconnecting').startReason).toBe('Reconnecting...');
    expect(roomConnectionNote('reconnecting')?.text).toMatch(/Trying to get you back/);
    expect(roomConnectionNote('closed')?.canRetry).toBe(true);
    expect(roomConnectionNote('connected')).toBeNull();
  });
  it('someone who is not in the member list can do nothing', () => {
    const r = roomRules(lobby({ you: null }), 'connected');
    expect(r.canReady).toBe(false);
    expect(r.isHost).toBe(false);
  });
});

describe('settings', () => {
  it('offers exactly the sim registry stages, with their names', () => {
    const o = stageOptions();
    expect(o.map((s) => s.id)).toEqual([...RUMBLE_ARENA_IDS]);
    for (const s of o) expect(s.name.length).toBeGreaterThan(2);
    expect(o.find((s) => s.id === 'rumbleOshodi')!.name).toMatch(/Oshodi/);
  });
  it('offers the three modes with the game labels and 3 or 5 minutes (the server allows 180 / 300)', () => {
    expect(modeOptions().map((m) => m.id)).toEqual(['deathmatch', 'team', 'survival']);
    expect(modeOptions().map((m) => m.name)).toEqual([
      'Free-for-All',
      'Team Deathmatch',
      'Last Player Standing',
    ]);
    expect(DURATION_OPTIONS.map((d) => d.sec)).toEqual([180, 300]);
    expect(gameIsTimed('survival')).toBe(false);
    expect(gameIsTimed('team')).toBe(true);
  });
  it('describes the room settings for a guest in words', () => {
    const v = settingsView({
      arenaId: 'rumbleOshodi',
      game: 'team',
      durationSec: 180,
      botDifficulty: 'skilled',
    });
    expect(v).toMatchObject({ mode: 'Team Deathmatch', duration: '3 min', difficulty: 'Skilled' });
    expect(v.stage).toMatch(/Oshodi/);
    expect(
      settingsView({ arenaId: 'rumbleOshodi', game: 'survival', durationSec: 300, botDifficulty: 'x' })
        .duration,
    ).toBeNull();
    expect(
      settingsView({ arenaId: 'gone', game: 'deathmatch', durationSec: 300, botDifficulty: 'x' }),
    ).toMatchObject({
      stage: 'gone',
      difficulty: 'x',
    });
  });
});

describe('countdowns', () => {
  it('count down from the message time and never go below zero', () => {
    expect(remainingMs(3000, 1000, 1000)).toBe(3000);
    expect(remainingMs(3000, 1000, 2500)).toBe(1500);
    expect(remainingMs(3000, 1000, 9000)).toBe(0);
    expect(remainingMs(3000, 1000, 500)).toBe(3000); // a clock that went back
    expect(remainingMs(null, 0, 10)).toBeNull();
  });
  it('shows whole seconds rounded up', () => {
    expect(countdownSeconds(3000)).toBe(3);
    expect(countdownSeconds(2001)).toBe(3);
    expect(countdownSeconds(1)).toBe(1);
    expect(countdownSeconds(0)).toBe(0);
  });
});

describe('netStatusModel', () => {
  it('connected: a green chip with the ping and no banner', () => {
    const v = netStatusModel({ connection: 'connected', rttMs: 47.6 });
    expect(v).toMatchObject({ tone: 'good', label: 'Online', ping: '48 ms', pingTone: 'good', banner: null });
  });
  it('grades the ping and shows -- before the first pong', () => {
    expect(pingTone(PING_GOOD_MS)).toBe('good');
    expect(pingTone(PING_GOOD_MS + 1)).toBe('ok');
    expect(pingTone(PING_OK_MS)).toBe('ok');
    expect(pingTone(PING_OK_MS + 1)).toBe('poor');
    expect(pingTone(null)).toBe('unknown');
    expect(pingTone(NaN)).toBe('unknown');
    expect(netStatusModel({ connection: 'connected', rttMs: null }).ping).toBe('-- ms');
  });
  it('reconnecting: says a bot is playing and that the fighter is reserved', () => {
    const v = netStatusModel({ connection: 'reconnecting', rttMs: null });
    expect(v.tone).toBe('warn');
    expect(v.banner).toMatchObject({
      kind: 'reconnecting',
      title: 'Connection lost',
      text: 'Trying to get you back. A bot is playing your fighter.',
      reserve: 'Your fighter is reserved for a short time.',
      actions: [],
    });
    expect(v.announce).toMatch(/A bot is playing your fighter/);
    expect(
      netStatusModel({ connection: 'reconnecting', rttMs: null }, { reserveSeconds: 30 }).banner!.reserve,
    ).toBe('Your fighter is reserved for 30 seconds.');
  });
  it('closed: "You were disconnected" with Retry and Back to menu', () => {
    const v = netStatusModel({ connection: 'closed', rttMs: null, detail: null });
    expect(v.tone).toBe('bad');
    expect(v.banner).toMatchObject({
      kind: 'closed',
      title: 'You were disconnected',
      actions: ['retry', 'menu'],
    });
    expect(
      netStatusModel({ connection: 'closed', rttMs: null, detail: 'Server restarted' }).banner!.text,
    ).toBe('Server restarted');
  });
  it('connecting has no banner', () => {
    expect(netStatusModel({ connection: 'connecting', rttMs: null })).toMatchObject({
      tone: 'idle',
      banner: null,
    });
  });
});

describe('loadingModel', () => {
  it('shows real progress only when the loader reports it', () => {
    expect(loadingModel('connected', null).progress).toBeNull();
    expect(loadingModel('connected', { done: 0, total: 0 }).progress).toBeNull();
    expect(loadingModel('connected', { done: 3, total: 4 }).progress).toEqual({
      done: 3,
      total: 4,
      percent: 75,
    });
    expect(loadingModel('connected', { done: 9, total: 4 }).progress!.percent).toBe(100);
  });
  it('a dropped connection is a stalled state with a way out, never an endless spinner', () => {
    expect(loadingModel('connected', null).stalled).toBe(false);
    expect(loadingModel('connecting', null).stalled).toBe(false);
    expect(loadingModel('closed', null)).toMatchObject({ stalled: true });
    expect(loadingModel('reconnecting', null).stalledText).toMatch(/Trying to get you back/);
    expect(loadingModel('connected', null).text).toBe('Loading the arena and waiting for the match');
  });
});

describe('resultsModel', () => {
  const player = (seat: number, placement: number, over: Record<string, unknown> = {}) => ({
    seat,
    name: `P${seat}`,
    isBot: false,
    team: null,
    placement,
    kills: seat,
    deaths: 1,
    assists: 2,
    ...over,
  });
  const results = (over: Partial<ResultsMsg> = {}): ResultsMsg => ({
    matchId: 'm',
    tick: 100,
    winnerSeat: 2,
    winnerTeam: null,
    draw: false,
    stateHash: 0,
    players: [player(0, 3), player(1, 2, { isBot: true, name: 'Bot 01' }), player(2, 1)],
    ...over,
  });

  it('sorts by placement, tags HUMAN / BOT and marks your row', () => {
    const v = resultsModel(results(), 0);
    expect(v.rows.map((r) => r.seat)).toEqual([2, 1, 0]);
    expect(v.rows.map((r) => r.placementLabel)).toEqual(['1st', '2nd', '3rd']);
    expect(v.rows.map((r) => r.tag)).toEqual(['HUMAN', 'BOT', 'HUMAN']);
    expect(v.rows.filter((r) => r.you).map((r) => r.seat)).toEqual([0]);
    expect(v.rows[0]).toMatchObject({ winner: true, kills: 2, deaths: 1, assists: 2 });
    expect(v.headline).toBe('P2 wins');
    expect(v.youWon).toBe(false);
  });
  it('says "You win" when your seat won', () => {
    const v = resultsModel(results({ winnerSeat: 0 }), 0);
    expect(v.headline).toBe('You win');
    expect(v.youWon).toBe(true);
  });
  it('a draw is a draw, with nobody marked the winner', () => {
    const v = resultsModel(results({ draw: true, winnerSeat: null }), 0);
    expect(v.headline).toBe('Draw');
    expect(v.draw).toBe(true);
    expect(v.rows.some((r) => r.winner)).toBe(false);
  });
  it('team matches name the team and know whether it was yours', () => {
    const teams = results({
      winnerSeat: null,
      winnerTeam: 1,
      players: [player(0, 1, { team: 1 }), player(1, 2, { team: 0 })],
    });
    expect(resultsModel(teams, 0)).toMatchObject({ headline: 'Your team wins', youWon: true });
    expect(resultsModel(teams, 1)).toMatchObject({ headline: 'White team wins', youWon: false });
    expect(resultsModel(teams, 0).rows[0]).toMatchObject({ team: 'White', winner: true });
    expect(resultsModel(teams, null).youWon).toBeNull();
  });
  it('breaks placement ties by seat and survives an unknown local seat', () => {
    const v = resultsModel(results({ players: [player(5, 1), player(3, 1)] }), null);
    expect(v.rows.map((r) => r.seat)).toEqual([3, 5]);
    expect(v.rows.every((r) => !r.you)).toBe(true);
  });
  it('reads the optional bot-time fields defensively', () => {
    const plain = resultsModel(results(), 0);
    expect(plain.rows.every((r) => r.note === null)).toBe(true);
    const withExtras = resultsModel(
      results({
        players: [
          player(0, 3, { autopilotSeconds: 12.4, botKills: 2 }),
          player(1, 2, { isBot: true, autopilotSeconds: 99 }),
          player(2, 1, { autopilotSeconds: 'lots', botKills: -1, drops: NaN }),
        ],
      }),
      0,
    );
    const byseat = (s: number) => withExtras.rows.find((r) => r.seat === s)!;
    expect(byseat(0).note).toBe(
      'A bot played 12 s for this player. 2 kills by the bot are not counted for them.',
    );
    expect(byseat(1).note).toBeNull(); // a bot never gets the note
    expect(byseat(2).note).toBeNull(); // junk values are ignored
  });
  it('ordinals', () => {
    expect(
      ['1', '2', '3', '4', '11', '12', '13', '21', '22', '101', '111'].map((n) => ordinal(Number(n))),
    ).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th']);
  });
});
