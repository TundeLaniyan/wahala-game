/**
 * The Online preview UI, rendered to static HTML with the session mocked. With default flags none of it is
 * reachable (no Home entry); with the mock flag the screens show the preview banner and the mock flow's data.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLAG_DEFAULTS, setFlagsForTests } from '../../src/platform';
import type { FeatureFlags } from '../../src/platform';
import { createMockOnline, manualClock } from '../../src/online/mock';
import { memoryStore } from '../../src/platform';
import {
  PREVIEW_BANNER,
  flagRows,
  lobbyActions,
  memberRows,
  queueText,
  rankChangeText,
  teamName,
  xpRows,
} from '../../src/ui/online/model';
import type { Room } from '../../src/online';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
  liveMatch: () => null,
}));

const { useGameStore } = await import('../../src/app/store');
const { useOnlineStore } = await import('../../src/app/online');
const { HomeScreen } = await import('../../src/ui/menu/HomeScreen');
const { SettingsPanel } = await import('../../src/ui/menu/SettingsScreen');
const { OnlineScreen } = await import('../../src/ui/online/OnlineScreen');
const { VoiceStatus } = await import('../../src/ui/online/VoiceStatus');
const { BuildFlags } = await import('../../src/ui/online/BuildFlags');

/** Server rendering reads the store's initial snapshot, so a scenario is written there (as in menuScreens.test.ts). */
const BASE = { ...useOnlineStore.getInitialState() };
const scenario = (p: Record<string, unknown>): void => {
  Object.assign(useOnlineStore.getInitialState(), p);
};

const MOCK: FeatureFlags = { ...FLAG_DEFAULTS, online: true, onlineMode: 'mock' };
const html = (c: () => React.JSX.Element | null) => renderToStaticMarkup(createElement(c));

beforeEach(() => {
  Object.assign(useGameStore.getInitialState(), { loading: null });
  useGameStore.setState({ loading: null });
});
afterEach(() => {
  setFlagsForTests(null);
  Object.assign(useOnlineStore.getInitialState(), BASE);
});

describe('default flags: nothing online is reachable', () => {
  it('Home has no Online entry and the page says nothing about online play', () => {
    setFlagsForTests({ ...FLAG_DEFAULTS });
    const out = html(HomeScreen);
    expect(out).not.toContain('home-online');
    expect(out).not.toMatch(/online|pvp|server status|mock server/i);
    for (const t of ['home-rumble', 'home-classic', 'home-academy', 'home-settings', 'quick-play'])
      expect(out).toContain(`data-testid="${t}"`);
  });

  it('voice chat UI is not rendered at all', () => {
    setFlagsForTests({ ...FLAG_DEFAULTS });
    expect(html(VoiceStatus)).toBe('');
  });

  it('Settings shows the read-only flag rows: Online off, Voice off, Campaign on', () => {
    setFlagsForTests({ ...FLAG_DEFAULTS });
    const out = html(() => createElement(SettingsPanel, { initialTab: 'access' }));
    expect(out).toContain('data-testid="build-flags"');
    expect(out).toMatch(/data-testid="flag-online"[^>]*data-value="off"/);
    expect(out).toMatch(/data-testid="flag-voice"[^>]*data-value="off"/);
    expect(out).toMatch(/data-testid="flag-campaign"[^>]*data-value="on"/);
    expect(out).not.toContain('voice-status');
  });
});

describe('with the mock flag', () => {
  it('Home shows "Online" marked Preview', () => {
    setFlagsForTests(MOCK);
    const out = html(HomeScreen);
    expect(out).toContain('data-testid="home-online"');
    expect(out).toMatch(/Online[\s\S]*Preview/);
    expect(out).toContain('no real players');
  });

  it('Settings shows Online mock', () => {
    setFlagsForTests(MOCK);
    expect(html(BuildFlags)).toMatch(/data-testid="flag-online"[^>]*data-value="mock"/);
  });

  it('every step carries the preview banner', () => {
    setFlagsForTests(MOCK);
    for (const step of ['signIn', 'hub', 'queue', 'party', 'lobby', 'match', 'results'] as const) {
      scenario({ step });
      const out = html(OnlineScreen);
      expect(out, step).toContain('data-testid="online-banner"');
      expect(out, step).toContain(PREVIEW_BANNER);
      expect(out, step).toContain(`data-testid="online-step-${step}"`);
    }
    expect(PREVIEW_BANNER).toBe('Preview · mock server · no real players');
  });

  it('sign-in offers a guest account and says there is no real server', () => {
    setFlagsForTests(MOCK);
    scenario({ step: 'signIn' });
    const out = html(OnlineScreen);
    expect(out).toContain('data-testid="online-guest"');
    expect(out).toMatch(/scripted bot/);
  });

  it('hub: profile, friends, the four games, Quick Match and Create Party', () => {
    setFlagsForTests(MOCK);
    scenario({
      step: 'hub',
      profile: { id: 'g1', displayName: 'Guest1234', guest: true, createdAt: 0 },
      friends: [{ accountId: 'f1', displayName: 'Ada_Danfo', presence: 'online' }],
    });
    const out = html(OnlineScreen);
    for (const t of [
      'online-quick',
      'online-party',
      'online-game-classic',
      'online-game-team',
      'online-game-deathmatch',
      'online-game-survival',
    ]) {
      expect(out).toContain(`data-testid="${t}"`);
    }
    expect(out).toContain('Guest1234');
    expect(out).toContain('Ada_Danfo');
    expect(out).toContain('Guest account');
  });

  it('voice is not offered in the hub or lobby unless the voice flag is on, and then only as "not available yet"', () => {
    setFlagsForTests(MOCK);
    scenario({ step: 'hub' });
    expect(html(OnlineScreen)).not.toContain('voice-status');
    setFlagsForTests({ ...MOCK, voice: true });
    const out = html(OnlineScreen);
    expect(out).toContain('data-testid="voice-status"');
    expect(out).toContain('Voice chat is not available yet');
    expect(out.match(/<button[^>]*disabled=""[^>]*>[^<]*(Mute|Deafen|microphone|Report)/g)).toHaveLength(4);
  });

  it('a real mock lobby (team game) renders teams, ready states and the team notice', async () => {
    setFlagsForTests(MOCK);
    const clock = manualClock();
    const online = createMockOnline({ clock, seed: 3, store: memoryStore() });
    const me = (await online.accounts.signInGuest()) as {
      ok: true;
      value: { profile: { id: string; displayName: string; guest: boolean; createdAt: number } };
    };
    const party = (await online.parties.create()) as { ok: true; value: { id: string } };
    await online.parties.invite(party.value.id, 'friend-ada');
    clock.advance(1000);
    online.control.pump();
    const room = (await online.lobbies.createFromParty(party.value.id, {
      game: 'team',
      arenaId: 'rumbleOshodi',
    })) as { ok: true; value: Room };
    scenario({ step: 'lobby', profile: me.value.profile, room: room.value });
    const out = html(OnlineScreen);
    expect(out).toContain('data-testid="online-lobby"');
    expect(out).toContain('Team Deathmatch');
    expect(out).toContain('Green');
    expect(out).toContain('White');
    expect(out).toContain('data-testid="online-switch-team"');
    expect(out).toContain('data-testid="online-balance"');
    expect(out).toContain('The server assigns teams');
    expect(out).toContain('data-testid="online-readycheck"');
    expect(out).not.toContain('data-testid="online-countdown"');
    scenario({ room: { ...room.value, state: 'starting' }, countdown: 2 });
    expect(html(OnlineScreen)).toContain('data-testid="online-countdown"');
  });

  it('the match step offers both ways to play; the server view offers the reconnect demo', () => {
    setFlagsForTests(MOCK);
    scenario({
      step: 'match',
      match: {
        id: 'm',
        descriptor: null,
        snapshot: null,
        mode: null,
        connection: 'connected',
        graceMs: null,
        resync: null,
      },
    });
    let out = html(OnlineScreen);
    expect(out).toContain('data-testid="online-play-local"');
    expect(out).toContain('data-testid="online-play-server"');
    scenario({
      match: {
        id: 'm',
        descriptor: null,
        snapshot: null,
        mode: 'server',
        connection: 'reconnecting',
        graceMs: 30000,
        resync: { tick: 120, inputs: 4, hash: 255 },
      },
    });
    out = html(OnlineScreen);
    expect(out).toContain('data-testid="online-drop"');
    expect(out).toContain('data-testid="online-reconnect"');
    expect(out).toContain('data-testid="online-dropped"');
    expect(out).toContain('Resynced from the server snapshot at tick 120 plus 4 logged inputs');
  });
});

describe('presentation helpers', () => {
  it('flag rows read the real flags', () => {
    expect(flagRows(FLAG_DEFAULTS).map((r) => [r.id, r.value])).toEqual([
      ['online', 'off'],
      ['voice', 'off'],
      ['campaign', 'on'],
    ]);
    expect(
      flagRows({ ...FLAG_DEFAULTS, onlineMode: 'server', online: true, voice: true, campaign: false }).map(
        (r) => r.value,
      ),
    ).toEqual(['server', 'on (not available yet)', 'off']);
  });

  it('team names, queue text and member rows', () => {
    expect(teamName(0)).toBe('Green');
    expect(teamName(1)).toBe('White');
    expect(teamName(null)).toBe('');
    expect(
      queueText({
        ticketId: 't',
        state: 'searching',
        game: 'classic',
        arenaId: 'a',
        found: 1,
        needed: 3,
        waitedMs: 0,
        roomId: null,
      }),
    ).toBe('Found 1 of 3 players');
    const room = {
      id: 'r',
      state: 'open',
      hostId: 'a',
      game: 'team',
      arenaId: 'x',
      maxPlayers: 4,
      teamCount: 2,
      matchId: null,
      source: 'party',
      createdAt: 0,
      members: [
        {
          accountId: 'a',
          displayName: 'A',
          isBot: false,
          ready: true,
          team: 0,
          characterId: 'streetBaller',
          connected: true,
        },
        {
          accountId: 'b',
          displayName: 'B',
          isBot: true,
          ready: false,
          team: 1,
          characterId: 'streetBaller',
          connected: true,
        },
      ],
    } as Room;
    expect(memberRows(room, 'a')).toMatchObject([
      { you: true, host: true, ready: true, team: 'Green', ai: false },
      { you: false, team: 'White', ai: true },
    ]);
    expect(lobbyActions(room, 'a')).toMatchObject({
      canReady: true,
      ready: true,
      showTeams: true,
      isHost: true,
    });
    expect(lobbyActions(room, 'a').canSwitchTeam).toBe(false); // ready players cannot switch
    expect(lobbyActions(room, 'b').canSwitchTeam).toBe(true);
    expect(lobbyActions({ ...room, game: 'classic' }, 'b').showTeams).toBe(false);
  });

  it('progression rows and rank text', () => {
    const update = {
      matchId: 'm',
      duplicate: false,
      xpParts: { participation: 20, win: 50, kills: 16 },
      xpGained: 86,
      levelBefore: 1,
      levelAfter: 2,
      rankBefore: {
        tierIndex: 0,
        tier: 'Bronze',
        division: 3,
        progress: 0,
        toNext: 100,
        label: 'Bronze III',
      },
      rankAfter: { tierIndex: 0, tier: 'Bronze', division: 2, progress: 5, toNext: 95, label: 'Bronze II' },
      rankDelta: 25,
      winStreak: 1,
      seasonPointsGained: 0,
      newUnlocks: [],
    };
    expect(xpRows(update)).toEqual([
      { label: 'Played', xp: 20 },
      { label: 'Win', xp: 50 },
      { label: 'Eliminations', xp: 16 },
    ]);
    expect(rankChangeText(update)).toBe('Bronze III → Bronze II · +25 rank points');
    expect(rankChangeText({ ...update, rankAfter: update.rankBefore, rankDelta: -10 })).toBe(
      'Bronze III · -10 rank points',
    );
  });
});
