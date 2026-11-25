/**
 * The online City Rumble screens rendered to static HTML with the game session mocked (the project's pattern, see
 * menuScreens.test.ts): every screen state, host versus guest controls, bots labelled, the 32-seat bar, and names
 * rendered as text (never HTML).
 */
import { createElement } from 'react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import { FLAG_DEFAULTS, setFlagsForTests } from '../../src/platform';
import type { FeatureFlags } from '../../src/platform';
import type { LobbyMemberView, LobbyMsg, ResultsMsg } from '../../src/net/protocol';
import { RUMBLE_ARENA_IDS } from '../../src/sim';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
  liveMatch: () => null,
}));

const { useGameStore } = await import('../../src/app/store');
const { HomeScreen } = await import('../../src/ui/menu/HomeScreen');
const { EntryScreen } = await import('../../src/ui/online/rumble/EntryScreen');
const { RoomScreen } = await import('../../src/ui/online/rumble/RoomScreen');
const { ConnectingScreen, ErrorScreen, LoadingScreen } =
  await import('../../src/ui/online/rumble/StatusScreens');
const { NetStatusChip, ReconnectBanner } = await import('../../src/ui/online/rumble/NetStatus');
const { ResultsPanel } = await import('../../src/ui/online/rumble/ResultsPanel');
const { resultsModel } = await import('../../src/ui/online/rumble/models');
const { useRumbleOnline } = await import('../../src/app/rumbleOnline');
const { default: RumbleOnlineScreen } = await import('../../src/ui/online/rumble/RumbleOnlineScreen');

const html = (el: ReactElement): string => renderToStaticMarkup(el);
const noop = () => undefined;

beforeEach(() => {
  Object.assign(useGameStore.getInitialState(), { settings: { ...DEFAULT_GAME_SETTINGS }, loading: null });
});
afterEach(() => setFlagsForTests(null));

const flagsWith = (over: Record<string, unknown>): FeatureFlags =>
  ({ ...FLAG_DEFAULTS, ...over }) as FeatureFlags;

describe('Home entry', () => {
  // the entry is also behind the build-time constant (false in tests and in every public build)
  beforeEach(() => vi.stubGlobal('__WAHALA_SERVER_ONLINE__', true));
  afterEach(() => vi.unstubAllGlobals());

  it('is absent with the default flags and with the flag explicitly off', () => {
    setFlagsForTests({ ...FLAG_DEFAULTS });
    expect(html(createElement(HomeScreen))).not.toContain('home-rumble-online');
    setFlagsForTests(flagsWith({ rumbleOnline: false, onlineEndpoint: 'ws://x:1' }));
    const out = html(createElement(HomeScreen));
    expect(out).not.toContain('home-rumble-online');
    expect(out).not.toMatch(/PLAY ONLINE/);
  });
  it('is absent in a build made without the online switch, whatever the flag says', () => {
    vi.stubGlobal('__WAHALA_SERVER_ONLINE__', false);
    setFlagsForTests(flagsWith({ rumbleOnline: true, onlineEndpoint: 'ws://x:1' }));
    expect(html(createElement(HomeScreen))).not.toContain('home-rumble-online');
  });
  it('is a small button in the utility row (the four main buttons keep their room) when the flag is on', () => {
    setFlagsForTests(flagsWith({ rumbleOnline: true, onlineEndpoint: 'ws://x:1' }));
    const out = html(createElement(HomeScreen));
    expect(out).toMatch(/class="mn-util mn-online rumble-online"[^>]*data-testid="home-rumble-online"/);
    expect(out).toContain('PLAY ONLINE');
    expect(out).toContain('data-testid="home-play"'); // the existing buttons are untouched
    expect(out).toContain('data-testid="home-academy"');
  });
});

const entry = (over: Partial<Parameters<typeof EntryScreen>[0]> = {}) =>
  html(
    createElement(EntryScreen, {
      name: 'Player',
      codeInput: '',
      configured: true,
      fake: false,
      fighter: 'streetBaller',
      quickMode: 'ffa',
      onQuickMode: noop,
      onName: noop,
      onCode: noop,
      onCreate: noop,
      onJoin: noop,
      onQuick: noop,
      onChangeFighter: noop,
      onBack: noop,
      ...over,
    }),
  );

/** Whether the button with this test id has the `disabled` attribute. */
const disabled = (out: string, id: string): boolean => {
  const m = new RegExp(`<button[^>]*data-testid="${id}"[^>]*>`).exec(out);
  expect(m, `button ${id}`).not.toBeNull();
  return /\sdisabled(=|\s|>)/.test(m![0]);
};

describe('entry screen: QUICK PLAY mode choice (decision FU2S-C1)', () => {
  it('offers Free-for-All and Team Rumble, marks the chosen one, and names the mode on the button and in the note', () => {
    const ffa = entry();
    expect(ffa).toContain('data-testid="ro-quick-mode-ffa"');
    expect(ffa).toContain('data-testid="ro-quick-mode-team"');
    expect(ffa).toMatch(
      /data-testid="ro-quick-mode-ffa"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-testid="ro-quick-mode-ffa"/,
    );
    expect(ffa).toMatch(/Quick play: Free-for-All/);
    expect(ffa).toMatch(/public Free-for-All room/);
    const team = entry({ quickMode: 'team' });
    expect(team).toMatch(/Quick play: Team Rumble/);
    expect(team).toMatch(/public Team Rumble room/);
    expect(team).toMatch(/two even teams/);
    expect(team).toMatch(/friendly fire is off/);
    expect(team).toMatch(/nobody in a public room changes them/);
  });
});

describe('entry screen', () => {
  it('shows the default name, the chosen fighter with a Change link, and the three ways in', () => {
    const out = entry();
    expect(out).toContain('data-testid="menu-rumbleOnline"');
    expect(out).toMatch(/data-testid="ro-name"[^>]*value="Player"/);
    expect(out).toContain('data-testid="ro-fighter-name"');
    expect(out).toMatch(/data-testid="ro-fighter-name">Street Baller/);
    expect(out).toContain('data-testid="ro-change-fighter"');
    for (const id of ['ro-create', 'ro-join', 'ro-quick']) expect(out).toContain(`data-testid="${id}"`);
    expect(out).toContain('Create room');
    expect(out).toContain('Join with code');
    expect(out).toContain('Quick play');
    expect(disabled(out, 'ro-create')).toBe(false);
    expect(disabled(out, 'ro-quick')).toBe(false);
    expect(disabled(out, 'ro-join')).toBe(true); // no code yet
    expect(out).not.toContain('ro-fake-note');
  });
  it('shows why a name is refused and blocks the buttons', () => {
    const out = entry({ name: 'A' });
    expect(out).toMatch(/aria-invalid="true"/);
    expect(out).toMatch(/data-testid="ro-name-hint"[^>]*>Use at least 2 characters/);
    expect(disabled(out, 'ro-create')).toBe(true);
    expect(disabled(out, 'ro-quick')).toBe(true);
  });
  it('shows a typed code upper-cased and normalised, enabling Join only for a whole valid code', () => {
    const out = entry({ codeInput: 'k7m 3qx' });
    expect(out).toMatch(/data-testid="ro-code"[^>]*value="K7M3QX"/);
    expect(disabled(out, 'ro-join')).toBe(false);
    const part = entry({ codeInput: 'k7m' });
    expect(part).toMatch(/value="K7M"/);
    expect(part).toContain('3 more characters.');
    expect(disabled(part, 'ro-join')).toBe(true);
    expect(entry({ codeInput: 'k7m3q0' })).toMatch(/never use 0, O, 1, I or L/);
  });
  it('without an endpoint every way in is disabled and the screen says online is not configured', () => {
    const out = entry({ configured: false, codeInput: 'K7M3QX' });
    expect(out).toContain('Online is not configured in this build.');
    for (const id of ['ro-create', 'ro-join', 'ro-quick']) expect(disabled(out, id)).toBe(true);
  });
  it('a name with markup is escaped, never inserted as HTML', () => {
    const out = entry({ name: '<img src=x onerror=alert(1)>' });
    expect(out).not.toContain('<img src=x');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
  it('labels a fake session', () => {
    expect(entry({ fake: true })).toContain('Test session: no real server');
  });
});

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
const room = (over: Partial<Parameters<typeof RoomScreen>[0]> = {}) =>
  html(
    createElement(RoomScreen, {
      lobby: lobby(),
      conn: 'connected',
      fake: false,
      countdownMs: null,
      autoStartMs: null,
      link: 'http://localhost:5173/wahala-game/?online&room=K7M3QX',
      notice: null,
      confirmLeave: false,
      onReady: noop,
      onStart: noop,
      onSettings: noop,
      onRequestLeave: noop,
      onCancelLeave: noop,
      onLeave: noop,
      onDismissNotice: noop,
      onRetry: noop,
      ...over,
    }),
  );
const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;

describe('room screen: host', () => {
  const out = room();
  it('shows the big code with COPY CODE and COPY LINK, and a leave button that is always there', () => {
    expect(out).toMatch(/data-testid="ro-room-code"[^>]*>K7M3QX</);
    expect(out).toContain('data-testid="ro-copy-code"');
    expect(out).toContain('data-testid="ro-copy-link"');
    expect(out).toContain('Copy code');
    expect(out).toContain('Copy link');
    expect(out).toContain('data-testid="ro-leave"');
  });
  it('lists every member with HUMAN / HOST / READY / YOU tags', () => {
    expect(count(out, /data-testid="ro-member"/g)).toBe(3);
    expect(count(out, /class="ro-tag human"/g)).toBe(3);
    expect(count(out, /class="ro-tag host"/g)).toBe(1);
    expect(count(out, /class="ro-tag ready"/g)).toBe(1);
    expect(count(out, /class="ro-tag you"/g)).toBe(1);
  });
  it('labels the filler bots and draws all 32 seats', () => {
    expect(out).toContain('29 bots will fill the remaining seats.');
    expect(out).toMatch(/data-testid="ro-bots-row"[\s\S]*class="ro-tag bot"/);
    const bar = /<div class="ro-seats"[\s\S]*?<\/div>/.exec(out)![0];
    expect(count(bar, /<i /g)).toBe(32);
    expect(count(bar, /class="human"/g)).toBe(3);
    expect(count(bar, /class="bot"/g)).toBe(29);
    expect(out).toContain('3 humans · 29 bots · 32 fighters');
  });
  it('has editable settings: every stage of the registry by name, the three modes, 3 / 5 minutes and the bot slider', () => {
    expect(out).toContain('data-testid="ro-settings"');
    expect(out).not.toMatch(/<fieldset[^>]*disabled/);
    const select = /<select[\s\S]*?<\/select>/.exec(out)![0];
    for (const id of RUMBLE_ARENA_IDS) expect(select).toContain(`value="${id}"`);
    expect(select).toMatch(/value="rumbleOshodi" selected|selected=""[^>]*value="rumbleOshodi"/);
    expect(out).toMatch(/data-testid="ro-mode-deathmatch" aria-pressed="true"/);
    expect(out).toContain('Free-for-All');
    expect(out).toContain('Team Deathmatch');
    expect(out).toContain('Last Player Standing');
    expect(out).toContain('data-testid="ro-duration-180"');
    expect(out).toMatch(/data-testid="ro-duration-300" aria-pressed="true"/);
    expect(out).toContain('data-testid="ro-difficulty"');
    expect(out).toContain('Standard');
  });
  it('the untimed mode has no length choice', () => {
    const survival = room({
      lobby: lobby({ settings: { ...lobby().settings, game: 'survival' } }),
    });
    expect(survival).not.toContain('ro-duration-180');
  });
  it('can start (private) and ready; START is enabled', () => {
    expect(disabled(out, 'ro-start')).toBe(false);
    expect(disabled(out, 'ro-ready')).toBe(false);
    expect(out).toMatch(/data-testid="ro-ready"[^>]*>Ready</);
  });
  it('the ready button turns into Not ready once ready', () => {
    const ready = room({
      lobby: lobby({ members: [member('Ada', { isHost: true, ready: true }), member('Tunde')] }),
    });
    expect(ready).toMatch(/data-testid="ro-ready"[^>]*>Not ready</);
    expect(ready).toMatch(/data-testid="ro-ready" aria-pressed="true"/);
  });
});

describe('room screen: guest', () => {
  const out = room({ lobby: lobby({ you: 2 }) });
  it('reads the settings, cannot start, and is told why', () => {
    expect(out).toContain('data-testid="ro-settings-read"');
    expect(out).not.toContain('<select');
    expect(out).not.toContain('data-testid="ro-mode-team"');
    expect(out).toContain('Only the host can change the match.');
    expect(disabled(out, 'ro-start')).toBe(true);
    expect(out).toContain('Only the host can start the match.');
    expect(disabled(out, 'ro-ready')).toBe(false);
    expect(out).toContain('data-testid="ro-leave"');
  });
  it('shows the stage, mode and length in words', () => {
    expect(out).toMatch(/data-testid="ro-set-mode">Free-for-All</);
    expect(out).toMatch(/data-testid="ro-set-duration">5 min</);
    expect(out).toMatch(/data-testid="ro-set-stage">[^<]*Oshodi/);
  });
});

describe('room screen: other states', () => {
  it('a public room has no START and shows the auto-start timer', () => {
    const out = room({ lobby: lobby({ private: false, autoStartMs: 12400 }), autoStartMs: 12400 });
    expect(out).not.toContain('data-testid="ro-start"');
    expect(out).toContain('Starts by itself in 13 s');
    expect(out).toContain('Public room');
  });
  it('the pre-match countdown is shown big and locks the controls', () => {
    const out = room({ lobby: lobby({ phase: 'countdown', countdownMs: 2100 }), countdownMs: 2100 });
    expect(out).toMatch(/data-testid="ro-countdown"[^>]*>3</);
    expect(out).toContain('Match starts in 3');
    expect(disabled(out, 'ro-ready')).toBe(true);
    expect(disabled(out, 'ro-start')).toBe(true);
    expect(out).toMatch(/<fieldset[^>]*disabled/);
  });
  it('a member whose connection is down is marked reconnecting', () => {
    const out = room({
      lobby: lobby({ members: [member('Ada', { isHost: true }), member('Tunde', { connected: false })] }),
    });
    expect(out).toMatch(/data-testid="ro-member-state">reconnecting</);
  });
  it('a lost connection disables the controls and offers Try again when it is closed', () => {
    const reconnecting = room({ conn: 'reconnecting' });
    expect(reconnecting).toContain('Connection lost. Trying to get you back.');
    expect(disabled(reconnecting, 'ro-ready')).toBe(true);
    expect(reconnecting).not.toContain('ro-conn-retry');
    const closed = room({ conn: 'closed' });
    expect(closed).toContain('You were disconnected from the room.');
    expect(closed).toContain('data-testid="ro-conn-retry"');
    expect(closed).toContain('data-testid="ro-leave"');
  });
  it('shows a server notice with a dismiss button, as text', () => {
    const out = room({ notice: { id: 1, message: '<b>Only the host can do that</b>' } });
    expect(out).toContain('data-testid="ro-notice"');
    expect(out).toContain('&lt;b&gt;Only the host can do that&lt;/b&gt;');
    expect(out).not.toContain('<b>Only');
  });
  it('asks before leaving, with Stay first', () => {
    const out = room({ confirmLeave: true });
    expect(out).toMatch(/role="alertdialog"/);
    expect(out.indexOf('ro-leave-stay')).toBeLessThan(out.indexOf('ro-leave-confirm'));
    expect(room()).not.toContain('ro-leave-dialog');
  });
  it('escapes a player name with markup', () => {
    const out = room({
      lobby: lobby({ members: [member('<img src=x onerror=alert(1)>', { isHost: true })] }),
    });
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
  it('a room with no bots to fill says so', () => {
    const out = room({ lobby: lobby({ botsToFill: 0 }) });
    expect(out).not.toContain('data-testid="ro-bots-row"');
  });
});

describe('connecting, failures, loading', () => {
  it('connecting always has a Cancel', () => {
    const out = html(createElement(ConnectingScreen, { what: 'Connecting', fake: false, onCancel: noop }));
    expect(out).toContain('data-testid="ro-connecting"');
    expect(out).toContain('data-testid="ro-cancel"');
  });
  it('each failure shows its words; only retryable ones offer Try again', () => {
    const e = (reason: Parameters<typeof ErrorScreen>[0]['reason']) =>
      html(createElement(ErrorScreen, { reason, detail: null, onRetry: noop, onBack: noop }));
    expect(e('unreachable')).toContain(
      'Can&#x27;t reach the online server. Check your connection and that the server address is right.',
    );
    expect(e('unreachable')).toContain('data-testid="ro-retry"');
    expect(e('room-not-found')).toContain('There is no room with that code');
    expect(e('room-not-found')).not.toContain('data-testid="ro-retry"');
    expect(e('room-full')).toContain('no free seat');
    expect(e('refused')).toContain('did not accept you');
    expect(e('protocol')).toContain('version of the game and the server don&#x27;t match');
    expect(e('protocol')).not.toContain('data-testid="ro-retry"');
    expect(e('not-configured')).toContain('Online is not configured in this build.');
    expect(e('unreachable')).toContain('data-testid="ro-error-back"');
  });
  it('a failure detail from the server is shown as text', () => {
    const out = html(
      createElement(ErrorScreen, {
        reason: 'refused',
        detail: '<script>1</script>',
        onRetry: noop,
        onBack: noop,
      }),
    );
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });
  it('loading says what it waits for, with an indeterminate bar until there is real progress', () => {
    const wait = html(
      createElement(LoadingScreen, {
        conn: 'connected',
        progress: null,
        fake: false,
        onRetry: noop,
        onBack: noop,
      }),
    );
    expect(wait).toContain('Loading the arena and waiting for the match');
    expect(wait).toContain('ro-bar indeterminate');
    expect(wait).not.toContain('ro-loading-count');
    const real = html(
      createElement(LoadingScreen, {
        conn: 'connected',
        progress: { done: 3, total: 4 },
        fake: false,
        onRetry: noop,
        onBack: noop,
      }),
    );
    expect(real).toContain('aria-valuenow="75"');
    expect(real).toContain('3 / 4');
    expect(real).not.toContain('indeterminate');
  });
  it('loading with a dropped connection offers Retry and Back, never a bare spinner', () => {
    const out = html(
      createElement(LoadingScreen, {
        conn: 'closed',
        progress: null,
        fake: false,
        onRetry: noop,
        onBack: noop,
      }),
    );
    expect(out).toContain('data-testid="ro-loading-stalled"');
    expect(out).toContain('data-testid="ro-retry"');
    expect(out).toContain('data-testid="ro-loading-back"');
    expect(out).not.toContain('ro-bar');
  });
});

describe('connection chip and reconnect banner', () => {
  it('connected: a chip with the ping, no banner', () => {
    const chip = html(createElement(NetStatusChip, { status: { connection: 'connected', rttMs: 52 } }));
    expect(chip).toContain('data-state="connected"');
    expect(chip).toContain('52 ms');
    expect(html(createElement(ReconnectBanner, { status: { connection: 'connected', rttMs: 52 } }))).toBe('');
  });
  it('reconnecting: the banner says a bot is playing and the window is reserved', () => {
    const out = html(
      createElement(ReconnectBanner, {
        status: { connection: 'reconnecting', rttMs: null },
        reserveSeconds: 30,
      }),
    );
    expect(out).toContain('role="alert"');
    expect(out).toContain('Connection lost');
    expect(out).toContain('Trying to get you back. A bot is playing your fighter.');
    expect(out).toContain('Your fighter is reserved for 30 seconds.');
    expect(out).not.toContain('net-retry');
  });
  it('closed: You were disconnected with Retry and Back to menu', () => {
    const out = html(
      createElement(ReconnectBanner, { status: { connection: 'closed', rttMs: null, detail: null } }),
    );
    expect(out).toContain('You were disconnected');
    expect(out).toContain('data-testid="net-retry"');
    expect(out).toContain('data-testid="net-menu"');
    expect(html(createElement(NetStatusChip, { status: { connection: 'closed', rttMs: null } }))).toContain(
      'Disconnected',
    );
  });
});

const results = (over: Partial<ResultsMsg> = {}): ResultsMsg => ({
  matchId: 'm',
  tick: 1,
  winnerSeat: 1,
  winnerTeam: null,
  draw: false,
  stateHash: 0,
  players: [
    { seat: 0, name: 'Ada', isBot: false, team: null, placement: 2, kills: 5, deaths: 2, assists: 1 },
    {
      seat: 1,
      name: '<img src=x onerror=alert(1)>',
      isBot: false,
      team: null,
      placement: 1,
      kills: 8,
      deaths: 1,
      assists: 0,
    },
    { seat: 2, name: 'Bot 01', isBot: true, team: null, placement: 3, kills: 1, deaths: 4, assists: 0 },
    {
      seat: 3,
      name: 'Chidi',
      isBot: false,
      team: null,
      placement: 4,
      kills: 0,
      deaths: 5,
      assists: 0,
      autopilotSeconds: 14,
      botKills: 2,
    } as ResultsMsg['players'][number],
  ],
  ...over,
});
const resultsHtml = (r: ResultsMsg, isHost: boolean, seat: number | null = 0) =>
  html(
    createElement(ResultsPanel, {
      view: resultsModel(r, seat),
      isHost,
      canRematch: true,
      onRematch: noop,
      onMenu: noop,
    }),
  );

describe('results panel', () => {
  const out = resultsHtml(results(), true);
  it('lists the placements in order with HUMAN / BOT tags and marks your row', () => {
    expect(count(out, /data-testid="ro-result-row"/g)).toBe(4);
    const order = [...out.matchAll(/class="ro-result-name">([^<]*)</g)].map((m) => m[1]);
    expect(order).toEqual(['&lt;img src=x onerror=alert(1)&gt;', 'Ada', 'Bot 01', 'Chidi']);
    expect(count(out, /class="ro-tag bot"/g)).toBe(1);
    expect(count(out, /class="ro-tag human"/g)).toBe(3);
    expect(count(out, /data-you="true"/g)).toBe(1);
    expect(out).toMatch(/data-you="true"[^>]*data-bot="false"/);
    expect(out).toContain('class="ro-tag you"');
  });
  it('names the winner (as text) and shows K / D / A', () => {
    expect(out).toMatch(/data-testid="ro-result-headline">&lt;img src=x onerror=alert\(1\)&gt; wins</);
    expect(out).not.toContain('<img');
    expect(out).toMatch(/<td>8<\/td><td>1<\/td><td>0<\/td>/);
  });
  it('adds the bot-played note only where the server reported bot time', () => {
    expect(count(out, /data-testid="ro-result-note"/g)).toBe(1);
    expect(out).toContain('A bot played 14 s for this player.');
  });
  it('the host can start a rematch; a guest waits for the host; both can go back to the menu', () => {
    expect(out).toContain('data-testid="ro-rematch"');
    expect(out).toContain('data-testid="ro-results-menu"');
    const guest = resultsHtml(results(), false);
    expect(guest).not.toContain('data-testid="ro-rematch"');
    expect(guest).toContain('Waiting for the host to start a rematch.');
    expect(guest).toContain('data-testid="ro-results-menu"');
  });
  it('you win / draw lines', () => {
    expect(resultsHtml(results({ winnerSeat: 0 }), true)).toMatch(/ro-result-headline">You win</);
    expect(resultsHtml(results({ draw: true, winnerSeat: null }), true)).toMatch(/ro-result-headline">Draw</);
  });
});

describe('connected menu screen', () => {
  const setStep = (patch: Record<string, unknown>) =>
    Object.assign(useRumbleOnline.getInitialState(), {
      name: 'Player',
      codeInput: '',
      fake: false,
      ...patch,
    });
  it('renders the step the flow is on', () => {
    setFlagsForTests(flagsWith({ rumbleOnline: true, onlineEndpoint: 'ws://x:1' }));
    setStep({ step: 'entry' });
    expect(html(createElement(RumbleOnlineScreen))).toContain('data-testid="ro-entry"');
    setStep({ step: 'connecting' });
    expect(html(createElement(RumbleOnlineScreen))).toContain('data-testid="ro-connecting"');
    setStep({ step: 'error', error: { reason: 'room-full', detail: null } });
    expect(html(createElement(RumbleOnlineScreen))).toContain('data-reason="room-full"');
    setStep({ step: 'loading', error: null, status: 'connected' });
    expect(html(createElement(RumbleOnlineScreen))).toContain('data-testid="ro-loading"');
    setStep({ step: 'room', lobby: lobby(), lobbyAt: 0, status: 'connected' });
    const out = html(createElement(RumbleOnlineScreen));
    expect(out).toContain('data-testid="ro-room"');
    expect(out).toMatch(/data-testid="ro-room-code"[^>]*>K7M3QX</);
  });
  it('without an endpoint the entry says online is not configured', () => {
    setFlagsForTests(flagsWith({ rumbleOnline: true, onlineEndpoint: null }));
    setStep({ step: 'entry', lobby: null });
    expect(html(createElement(RumbleOnlineScreen))).toContain('data-testid="ro-not-configured"');
  });
});
