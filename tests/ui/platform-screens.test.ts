/**
 * The player-platform panels and quick signals rendered to static HTML (the project's SSR pattern, see
 * rumble-online-screens.test.ts): identity card with the Guest label and friend code, friends / requests / blocks, party
 * (leader and member, the match handoff buttons), the room's verified badge and member menu (platform actions for a verified
 * player, a local mute only for a guest), the report form (categories, 200-character note), the quick-signal picker per
 * phase, names as text, and the online screens of a platform build versus a build without it.
 */
import { createElement } from 'react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLAG_DEFAULTS } from '../../src/platform';
import type { FeatureFlags } from '../../src/platform';
import type { PlatformState } from '../../src/online/platform/controller';
import type { LobbyMsg } from '../../src/net/protocol';
import { signalsFor } from '../../src/online/platform/signals';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
  liveMatch: () => null,
}));

const { PlatformPanel } = await import('../../src/ui/online/platform/PlatformPanel');
const { MemberMenu, VerifiedBadge } = await import('../../src/ui/online/platform/MemberMenu');
const { SignalPanel, MatchSignalButton } = await import('../../src/ui/online/platform/Signals');
const { RoomScreen } = await import('../../src/ui/online/rumble/RoomScreen');
const { ResultsPanel } = await import('../../src/ui/online/rumble/ResultsPanel');
const { partyLine, memberTarget, groupedCode } = await import('../../src/ui/online/platform/models');

const html = (el: ReactElement): string => renderToStaticMarkup(el);
const noop = () => undefined;
const act = new Proxy({}, { get: () => () => Promise.resolve(true) }) as never;

const me = {
  id: 'me-1',
  displayName: 'Ada <b>',
  kind: 'guest' as const,
  friendCode: 'K7M3QXAB',
  selectedCharacter: 'streetBaller',
  capabilities: { textChat: false, voice: false, purchases: false, friendCodeOnly: true },
};

const party = (over: Record<string, unknown> = {}) => ({
  id: 'party-1',
  code: 'PQRS2345',
  codeExpiresAt: 'x',
  status: 'open' as const,
  mode: 'ffa' as const,
  maxSize: 8,
  leaderId: 'me-1',
  members: [
    {
      playerId: 'me-1',
      displayName: 'Ada <b>',
      selectedCharacter: 'streetBaller',
      ready: true,
      isLeader: true,
      joinedAt: 'x',
      presence: 'online' as const,
    },
    {
      playerId: 'p-2',
      displayName: 'Bisi',
      selectedCharacter: 'streetBaller',
      ready: false,
      isLeader: false,
      joinedAt: 'x',
      presence: 'away' as const,
    },
  ],
  match: null,
  you: {
    isLeader: true,
    canInvite: true,
    canKick: true,
    canPromote: true,
    canOpenMatch: true,
    canLeave: true,
  },
  ...over,
});

const state = (over: Partial<PlatformState> = {}): PlatformState => ({
  phase: 'ready',
  me,
  friends: [
    {
      playerId: 'f-1',
      displayName: 'Chidi',
      selectedCharacter: 'streetBaller',
      presence: 'in_match',
      since: 'x',
    },
  ],
  incoming: [{ id: 'r-1', playerId: 'p-9', displayName: 'Emeka', createdAt: 'x' }],
  outgoing: [{ id: 'r-2', playerId: 'p-8', displayName: 'Funmi', createdAt: 'x' }],
  blocks: [{ playerId: 'p-7', displayName: 'Gbenga', since: 'x' }],
  mutes: [],
  invites: [],
  party: null,
  tab: 'you',
  busy: null,
  message: null,
  nameError: null,
  stale: false,
  handoff: 'idle',
  ...over,
});

const panel = (s: PlatformState, inRoom: string | null = null) =>
  html(createElement(PlatformPanel, { state: s, act, fighterName: 'Street Baller', inRoom }));

describe('platform panel on the entry screen', () => {
  it('while signing in and when the platform is unavailable (guest play still offered)', () => {
    expect(panel(state({ phase: 'connecting', me: null }))).toContain('data-testid="pf-connecting"');
    const down = panel(state({ phase: 'unavailable', me: null }));
    expect(down).toContain('data-testid="pf-unavailable"');
    expect(down).toMatch(/You can still play online as a guest/);
    expect(down).toContain('data-testid="pf-retry"');
    expect(down).not.toContain('pf-tab-');
  });

  it('identity: nickname as text, the Guest label, the friend code with Copy, the fighter, and the device-only warning', () => {
    const out = panel(state());
    expect(out).toContain('data-testid="pf-nickname">Ada &lt;b&gt;');
    expect(out).toContain('data-testid="pf-guest-label"');
    expect(out).toMatch(/data-testid="pf-friend-code"[^>]*>K7M3 QXAB/);
    expect(out).toContain('data-testid="pf-copy-friend-code"');
    expect(out).toContain('data-testid="pf-name-edit"');
    expect(out).toMatch(/data-testid="pf-fighter">Fighter: <b>Street Baller/);
    expect(out).toMatch(/this device only/);
    expect(out).toContain('data-testid="pf-tab-friends"');
    expect(out).toMatch(/Friends \(1\)/); // one incoming request
    // a registered account has no Guest label
    expect(panel(state({ me: { ...me, kind: 'registered' } }))).not.toContain('pf-guest-label');
  });

  it('friends tab: add by code, incoming / outgoing requests, friends with presence, blocked players with Unblock', () => {
    const out = panel(state({ tab: 'friends' }));
    for (const id of [
      'pf-friend-code-input',
      'pf-add-friend',
      'pf-request-accept',
      'pf-request-decline',
      'pf-request-cancel',
      'pf-friend-remove',
      'pf-blocks',
      'pf-unblock',
    ])
      expect(out, id).toContain(`data-testid="${id}"`);
    expect(out).toMatch(/data-testid="pf-friend-presence">In a match/);
    expect(out).toMatch(/data-testid="pf-add-friend"[^>]*disabled/); // no code typed yet
    expect(out).not.toContain('pf-friend-invite'); // no party: nothing to invite to
    expect(panel(state({ tab: 'friends', party: party() }))).toContain('data-testid="pf-friend-invite"');
  });

  it('party tab without a party: create (mode), join by code, invitations', () => {
    const out = panel(
      state({
        tab: 'party',
        invites: [
          {
            id: 'i-1',
            partyId: 'x',
            fromId: 'f-1',
            fromName: 'Chidi',
            expiresAt: 'x',
            members: 2,
            maxSize: 8,
          },
        ],
      }),
    );
    for (const id of [
      'pf-no-party',
      'pf-party-new-mode-ffa',
      'pf-party-new-mode-team',
      'pf-party-create',
      'pf-party-code-input',
      'pf-party-join',
      'pf-invite-accept',
      'pf-invite-decline',
    ])
      expect(out, id).toContain(`data-testid="${id}"`);
    expect(out).toMatch(/Party \(1\)/);
  });

  it('party tab, leader: code, mode choice, members with leader controls, ready, start, invite list, leave', () => {
    const out = panel(state({ tab: 'party', party: party() }));
    for (const id of [
      'pf-party',
      'pf-party-code',
      'pf-party-copy-code',
      'pf-party-mode-ffa',
      'pf-party-mode-team',
      'pf-member-promote',
      'pf-member-kick',
      'pf-party-ready',
      'pf-party-start',
      'pf-party-invite',
      'pf-party-leave',
    ])
      expect(out, id).toContain(`data-testid="${id}"`);
    expect(out.match(/data-testid="pf-party-member"/g)).toHaveLength(2);
    expect(out).toMatch(/1 of 2 ready\. Start when your party is here\./);
    expect(out).not.toContain('pf-party-join-match');
  });

  it('party tab, member: no leader controls; the open room offers Join match; the handoff shows progress', () => {
    const member = party({
      leaderId: 'p-2',
      you: {
        isLeader: false,
        canInvite: false,
        canKick: false,
        canPromote: false,
        canOpenMatch: false,
        canLeave: true,
      },
    });
    const out = panel(state({ tab: 'party', party: member }));
    expect(out).not.toContain('pf-member-kick');
    expect(out).not.toContain('pf-party-start');
    expect(out).toContain('data-testid="pf-party-mode"');
    expect(out).toMatch(/The leader starts the match/);
    const inMatch = panel(
      state({
        tab: 'party',
        party: { ...member, status: 'in_match', match: { roomCode: 'K7M3QX', openedAt: 'x' } },
      }),
    );
    expect(inMatch).toContain('data-testid="pf-party-join-match"');
    expect(inMatch).toMatch(/Your party is in room K7M3QX/);
    expect(panel(state({ tab: 'party', party: member, handoff: 'joining' }))).toMatch(
      /Joining the party room/,
    );
  });

  it('a stale platform and a message are shown plainly, with a dismiss button', () => {
    const out = panel(
      state({ stale: true, message: { id: 3, tone: 'bad', text: 'That name is already taken.' } }),
    );
    expect(out).toContain('data-testid="pf-stale"');
    expect(out).toMatch(/data-testid="pf-message"[^>]*>.*That name is already taken\./s);
    expect(out).toContain('data-testid="pf-message-dismiss"');
  });
});

describe('party lines (pure)', () => {
  it('in the party room / outside it / leader outside it', () => {
    const p = party({ status: 'in_match', match: { roomCode: 'K7M3QX', openedAt: 'x' } }) as never;
    expect(partyLine(p, 'K7M3QX', 'idle')).toMatchObject({ canJoin: false, canEnd: false });
    expect(partyLine(p, null, 'idle')).toMatchObject({ canJoin: true, canEnd: true });
    expect(partyLine(p, 'OTHER1', 'idle')).toMatchObject({ canJoin: true, canEnd: false });
    expect(partyLine(party() as never, null, 'opening').text).toMatch(/Opening a private room/);
    expect(groupedCode('ABCDEFGH')).toBe('ABCD EFGH');
  });

  it('a member is verified only with verified:true AND a player id; guests never are', () => {
    const base = {
      name: 'X',
      characterId: 'streetBaller',
      ready: false,
      isHost: false,
      seat: null,
      connected: true,
    };
    expect(memberTarget({ ...base, verified: true, playerId: 'p-1' })).toEqual({
      name: 'X',
      playerId: 'p-1',
      verified: true,
    });
    expect(memberTarget({ ...base, verified: true })).toMatchObject({ verified: false, playerId: null });
    expect(memberTarget({ ...base, playerId: 'p-1' })).toMatchObject({ verified: false, playerId: null });
    expect(memberTarget(base)).toMatchObject({ verified: false });
  });
});

describe('member menu and report form', () => {
  const menu = (over: Record<string, unknown> = {}) =>
    html(
      createElement(MemberMenu, {
        target: { name: 'Bisi <i>', playerId: 'p-2', verified: true },
        muted: false,
        blocked: false,
        localMuted: false,
        platformReady: true,
        busy: false,
        onMute: noop,
        onBlock: noop,
        onLocalMute: noop,
        onReport: () => Promise.resolve(true),
        onClose: noop,
        ...over,
      }),
    );

  it('a verified player: Mute / Block / Report through the platform, the badge, the name as text', () => {
    const out = menu();
    for (const id of [
      'pf-member-dialog',
      'pf-member-mute',
      'pf-member-block',
      'pf-member-report',
      'pf-member-close',
      'pf-verified',
    ])
      expect(out, id).toContain(`data-testid="${id}"`);
    expect(out).toContain('Bisi &lt;i&gt;');
    expect(out).not.toContain('pf-member-local-mute');
    expect(menu({ muted: true })).toContain('data-testid="pf-member-unmute"');
    expect(menu({ blocked: true })).toContain('data-testid="pf-member-blocked"');
  });

  it('a guest (no platform id): only the local mute, and it says it stays on this device', () => {
    const out = menu({ target: { name: 'Guesty', playerId: null, verified: false } });
    expect(out).toContain('data-testid="pf-member-local-mute"');
    expect(out).toMatch(/only hides their signals on this device/);
    for (const id of ['pf-member-mute', 'pf-member-block', 'pf-member-report']) expect(out).not.toContain(id);
    expect(menu({ target: { name: 'G', playerId: null, verified: false }, localMuted: true })).toContain(
      'data-testid="pf-member-local-unmute"',
    );
  });

  it('a verified player while the platform is down: local mute only, said plainly', () => {
    const out = menu({ platformReady: false });
    expect(out).toContain('pf-member-local-mute');
    expect(out).toMatch(/player service is unavailable/);
  });

  it('the badge is a small tag', () => {
    expect(html(createElement(VerifiedBadge))).toMatch(
      /class="ro-tag pf-verified"[^>]*data-testid="pf-verified"/,
    );
  });
});

describe('quick signals', () => {
  it('the room picker shows only the lobby presets, each with a stable qs- test id; the feed shows names as text', () => {
    const out = html(
      createElement(SignalPanel, {
        options: signalsFor('lobby'),
        feed: [
          { key: 1, id: 'chat.gg', label: 'Good game', name: '<Bisi>', seat: null, mine: false, at: 0 },
          { key: 2, id: 'emote.wave', label: 'Wave', name: 'Ada', seat: null, mine: true, at: 0 },
        ],
        canSend: true,
        blocked: false,
        onSend: noop,
      }),
    );
    expect(out).toContain('data-testid="qs-panel"');
    expect(out).toContain('data-testid="qs-send-chat-rematch"');
    expect(out).not.toContain('qs-send-ping-');
    expect(out).toContain('&lt;Bisi&gt;');
    expect(out).toMatch(/<b>You<\/b> <span>Wave/);
    expect(out.match(/data-testid="qs-feed-item"/g)).toHaveLength(2);
  });

  it('restricted: the picker is replaced by a plain line; disconnected: the buttons are disabled', () => {
    const blocked = html(
      createElement(SignalPanel, {
        options: signalsFor('lobby'),
        feed: [],
        canSend: false,
        blocked: true,
        onSend: noop,
      }),
    );
    expect(blocked).toContain('data-testid="qs-blocked"');
    expect(blocked).not.toContain('qs-picker');
    const off = html(
      createElement(SignalPanel, {
        options: signalsFor('lobby'),
        feed: [],
        canSend: false,
        blocked: false,
        onSend: noop,
      }),
    );
    expect(off).toMatch(
      /data-testid="qs-send-chat-ready"[^>]*disabled|disabled[^>]*data-testid="qs-send-chat-ready"/,
    );
  });

  it('in a match: a single closed toggle (the picker opens on tap; nothing over the board until then)', () => {
    const out = html(
      createElement(MatchSignalButton, {
        options: signalsFor('team'),
        canSend: true,
        blocked: false,
        onSend: noop,
      }),
    );
    expect(out).toContain('data-testid="qs-hud-toggle"');
    expect(out).not.toContain('data-testid="qs-hud-picker"');
    expect(
      html(createElement(MatchSignalButton, { options: [], canSend: false, blocked: true, onSend: noop })),
    ).toBe('');
  });

  it('every quick-signal and platform button is at least 44 px tall in the stylesheet', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/ui/online/platform/platform.css', 'utf8');
    for (const sel of ['.qs-btn', '.pf-member-btn', '.pf-radio', '.pf-row', '.pf-blocks summary'])
      expect(css, sel).toMatch(new RegExp(`${sel.replace('.', '\\.')}\\s*\\{[^}]*min-height: 44px`));
  });
});

describe('the existing room and results screens take the platform parts in their slots', () => {
  const lobby: LobbyMsg = {
    code: 'K7M3QX',
    phase: 'lobby',
    private: true,
    members: [
      {
        name: 'Ada',
        characterId: 'streetBaller',
        ready: false,
        isHost: true,
        seat: null,
        connected: true,
        verified: true,
        playerId: 'me-1',
      },
      {
        name: 'Guest Bisi',
        characterId: 'streetBaller',
        ready: false,
        isHost: false,
        seat: null,
        connected: true,
      },
    ],
    settings: { arenaId: 'rumbleOshodi', game: 'deathmatch', durationSec: 300, botDifficulty: 'standard' },
    countdownMs: null,
    autoStartMs: null,
    botsToFill: 30,
    you: 0,
  };
  const room = (over: Record<string, unknown> = {}) =>
    html(
      createElement(RoomScreen, {
        lobby,
        conn: 'connected',
        fake: false,
        countdownMs: null,
        autoStartMs: null,
        link: 'x',
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

  it('without the slots the room is unchanged (no platform markup at all)', () => {
    const out = room();
    expect(out).not.toMatch(/pf-|qs-/);
  });

  it('memberExtra lands inside each member row, extra after the settings, overlay at the end', () => {
    const out = room({
      memberExtra: (i: number) => createElement('i', { 'data-testid': `slot-${i}` }),
      extra: createElement('section', { 'data-testid': 'slot-extra' }),
      overlay: createElement('div', { 'data-testid': 'slot-overlay' }),
    });
    expect(out).toMatch(/data-testid="ro-member"[^>]*>.*data-testid="slot-0".*<\/li>/s);
    expect(out).toContain('data-testid="slot-1"');
    expect(out.indexOf('slot-extra')).toBeGreaterThan(out.indexOf('ro-settings'));
    expect(out.indexOf('slot-overlay')).toBeGreaterThan(out.indexOf('ro-live'));
  });

  it('the results panel takes an extra block above its buttons', () => {
    const out = html(
      createElement(ResultsPanel, {
        view: { headline: 'You won', sub: null, draw: false, youWon: true, rows: [] } as never,
        isHost: true,
        canRematch: true,
        onRematch: noop,
        onMenu: noop,
        extra: createElement('div', { 'data-testid': 'slot-results' }),
      }),
    );
    expect(out.indexOf('slot-results')).toBeLessThan(out.indexOf('ro-rematch'));
  });
});

describe('the online screens of a platform build versus one without it', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const flagsWith = (over: Partial<FeatureFlags>): FeatureFlags =>
    ({ ...FLAG_DEFAULTS, ...over }) as FeatureFlags;

  /** Fresh modules (the controller is created when the online chunk loads), with these flags installed first. */
  async function entryHtml(f: FeatureFlags): Promise<{ out: string; hasPlatform: boolean }> {
    vi.resetModules();
    const flagsMod = await import('../../src/platform');
    flagsMod.setFlagsForTests(f);
    const { useRumbleOnline, platform } = await import('../../src/app/rumbleOnline');
    const { default: Screen } = await import('../../src/ui/online/rumble/RumbleOnlineScreen');
    useRumbleOnline.setState({ step: 'entry' });
    const out = html(createElement(Screen));
    flagsMod.setFlagsForTests(null);
    return { out, hasPlatform: platform !== null };
  }

  it('no platform flags: the entry has no platform markup and no controller exists', async () => {
    vi.stubGlobal('__WAHALA_PLATFORM__', true);
    const { out, hasPlatform } = await entryHtml(
      flagsWith({ rumbleOnline: true, onlineEndpoint: 'ws://x:1' }),
    );
    expect(hasPlatform).toBe(false);
    expect(out).toContain('data-testid="ro-entry"');
    expect(out).not.toMatch(/pf-|qs-/);
  });

  it('platform flags but a build without the platform constant: still nothing', async () => {
    vi.stubGlobal('__WAHALA_PLATFORM__', false);
    const { out, hasPlatform } = await entryHtml(
      flagsWith({
        rumbleOnline: true,
        onlineEndpoint: 'ws://x:1',
        platform: true,
        platformEndpoint: 'http://p.test',
      }),
    );
    expect(hasPlatform).toBe(false);
    expect(out).not.toMatch(/pf-|qs-/);
  });

  it('a platform build: the entry carries the platform panel, and loading the chunk sent no request', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('a request at load');
    });
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('__WAHALA_PLATFORM__', true);
    const { out, hasPlatform } = await entryHtml(
      flagsWith({
        rumbleOnline: true,
        onlineEndpoint: 'ws://x:1',
        platform: true,
        platformEndpoint: 'http://p.test',
      }),
    );
    expect(hasPlatform).toBe(true);
    expect(out).toContain('data-testid="ro-entry"');
    expect(out).toContain('data-testid="pf-panel"');
    expect(out).toContain('data-testid="pf-connecting"');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
