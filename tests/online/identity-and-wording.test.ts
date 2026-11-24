/**
 * Online City Rumble, client side of the approved multiplayer requirements (docs/ONLINE_REQUIREMENTS_MATRIX.md):
 *  - the temporary identity is held in memory only: no token, session id or room secret is ever written to storage;
 *  - the guest nickname the entry screen accepts is exactly what the server accepts, with plain-words reasons;
 *  - the wording of a refused join to a started match, of QUICK PLAY's wait, and the team / friendly-fire lines.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRumbleOnlineFlow } from '../../src/app/rumbleOnlineFlow';
import type { FlowDeps } from '../../src/app/rumbleOnlineFlow';
import { nameCheck } from '../../src/app/rumbleEntryInput';
import { classifyFailure } from '../../src/net/client/connection';
import type { RumbleSession, RumbleSessionEvents } from '../../src/net/client/types';
import { PUBLIC_WAIT_SECONDS, validatePlayerName } from '../../src/net/protocol';
import type { LobbyMsg } from '../../src/net/protocol';
import {
  NAME_STORAGE_KEY,
  errorMessage,
  quickPlayNote,
  settingsView,
} from '../../src/ui/online/rumble/models';

const ROOT = path.resolve(__dirname, '..', '..');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
};

describe('identity is in memory only (no accounts, no stored token)', () => {
  const onlineClient = [
    ...walk(path.join(ROOT, 'src/net')),
    ...walk(path.join(ROOT, 'src/ui/online/rumble')),
    path.join(ROOT, 'src/app/rumbleOnline.ts'),
    path.join(ROOT, 'src/app/rumbleOnlineFlow.ts'),
    path.join(ROOT, 'src/app/rumbleOnlineSession.ts'),
    path.join(ROOT, 'src/app/rumbleEntryInput.ts'),
  ];

  it('the only place the online client touches web storage is the display-name helper', () => {
    const users = onlineClient.filter((f) =>
      /localStorage|sessionStorage|indexedDB|document\.cookie|caches\.open/.test(readFileSync(f, 'utf8')),
    );
    expect(users.map((f) => path.relative(ROOT, f))).toEqual(['src/app/rumbleOnline.ts']);
  });

  it('the flow writes exactly one key, the guest display name; nothing else is stored, whatever the room does', () => {
    const writes: [string, string][] = [];
    let events: RumbleSessionEvents | null = null;
    const session: RumbleSession = {
      driver: null,
      status: 'idle',
      open: async () => undefined,
      ready: () => undefined,
      start: () => undefined,
      rematch: () => undefined,
      settings: () => undefined,
      leave: async () => undefined,
    };
    const deps: FlowDeps = {
      createSession: (e) => {
        events = e;
        return session;
      },
      startRemote: () => undefined,
      endpoint: () => 'ws://example.test:2567',
      character: () => 'streetBaller',
      storage: { get: () => null, set: (k, v) => void writes.push([k, v]) },
      search: () => '',
      now: () => 0,
      fake: false,
      nav: { show() {}, home() {}, toRoom() {}, toTitle() {}, chooseFighter() {}, overlay() {} },
    };
    const flow = createRumbleOnlineFlow(deps);
    flow.actions.open();
    flow.actions.setName('Ada');
    flow.actions.quickPlay();
    const lobby: LobbyMsg = {
      code: 'K7M3QX',
      phase: 'lobby',
      private: false,
      members: [
        { name: 'Ada', characterId: 'streetBaller', ready: false, isHost: true, seat: null, connected: true },
      ],
      settings: {
        arenaId: 'rumbleOshodi',
        game: 'team',
        durationSec: 300,
        botDifficulty: 'standard',
        friendlyFire: false,
      },
      countdownMs: null,
      autoStartMs: 30_000,
      botsToFill: 31,
      you: 0,
    };
    events!.welcome({ descriptor: null, seat: null, roomCode: 'K7M3QX' });
    events!.lobby(lobby);
    events!.notice({ code: 'x', message: 'y' });
    events!.status('reconnecting', 'connection lost');
    events!.status('connected', 'reconnected');
    flow.actions.leaveRoom();
    expect(writes).toEqual([[NAME_STORAGE_KEY, 'Ada']]);
  });

  it('the connection module never reads or keeps the reconnection token itself (the SDK holds it in memory)', () => {
    const src = readFileSync(path.join(ROOT, 'src/net/client/connection.ts'), 'utf8');
    expect(src).not.toMatch(/reconnectionToken|sessionId/);
    const sdkAuthUsers = onlineClient.filter((f) => /\.auth\b|Auth\b/.test(readFileSync(f, 'utf8')));
    expect(sdkAuthUsers).toEqual([]); // the SDK's own persistent auth token store is never used
  });
});

describe('the guest nickname: one rule, on the entry screen and on the server', () => {
  it.each([
    ['BOT Emeka', /BOT/],
    ['bot', /BOT/],
    ['Аda', /Cyrillic or Greek/],
    ['a', /at least 2/],
    ['a'.repeat(30), /at most 24/],
    ['...', /letter or number/],
    ['Ada‮', /letters, numbers/],
    ['Ada​', /letters, numbers/],
    ['Ada 😀', /letters, numbers/],
  ])('says why %j is not accepted', (raw, reason) => {
    const check = nameCheck(raw);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(reason);
    expect(validatePlayerName(raw)).toBeNull(); // and the server rule agrees
  });

  it('accepts the cleaned form the server will store', () => {
    expect(nameCheck('  Ａｄａ  Obi ')).toEqual({ ok: true, name: 'Ada Obi' });
  });
});

describe('a started match, QUICK PLAY and the Team Rumble room lines', () => {
  it('a locked room or a started match reads "Match already started", never "Room is full"', () => {
    expect(classifyFailure(new Error('room "K7M3QX" is locked')).reason).toBe('match-started');
    expect(classifyFailure(new Error('the match has started')).reason).toBe('match-started');
    expect(classifyFailure(new Error('the room is full')).reason).toBe('room-full');
    const view = errorMessage('match-started');
    expect(view.title).toBe('Match already started');
    expect(view.text).toMatch(/nobody new can join a running match/);
    expect(view.canRetry).toBe(false);
  });

  it('QUICK PLAY says up to 30 seconds, then BOT-marked bots fill the seats', () => {
    expect(PUBLIC_WAIT_SECONDS).toBe(30);
    expect(quickPlayNote()).toMatch(/waits up to 30 seconds/);
    expect(quickPlayNote()).toMatch(/bots, clearly marked BOT/);
    expect(quickPlayNote()).toMatch(/32 are in/);
  });

  it('Team Rumble shows its friendly-fire state and says the teams are picked and kept even', () => {
    const team = settingsView({
      arenaId: 'rumbleOshodi',
      game: 'team',
      durationSec: 300,
      botDifficulty: 'standard',
    });
    expect(team.friendlyFire).toBe('Off'); // a server that does not send the field means off, like offline
    expect(team.teams).toMatch(/Two teams of 16/);
    const on = settingsView({
      arenaId: 'rumbleOshodi',
      game: 'team',
      durationSec: 300,
      botDifficulty: 'standard',
      friendlyFire: true,
    });
    expect(on.friendlyFire).toBe('On');
    for (const game of ['deathmatch', 'survival'] as const) {
      const ffa = settingsView({
        arenaId: 'rumbleOshodi',
        game,
        durationSec: 300,
        botDifficulty: 'standard',
        friendlyFire: true,
      });
      expect(ffa.friendlyFire).toBeNull();
      expect(ffa.teams).toBeNull();
    }
  });
});

describe('server refusals reach the player as a reason and a retry time (decision FU2S-C3)', () => {
  it('classifies the server_busy / rate_limited / room_unavailable messages the server sends', () => {
    expect(classifyFailure(new Error('server_busy;retry=25;The servers are full right now.'))).toEqual({
      reason: 'server-busy',
      detail: 'The servers are full right now.',
      retryAfterSec: 25,
    });
    expect(
      classifyFailure(new Error('rate_limited;retry=7;You are opening rooms too quickly.')),
    ).toMatchObject({
      reason: 'rate-limited',
      retryAfterSec: 7,
    });
    expect(classifyFailure(new Error('room_unavailable;retry=0;That room is not open.'))).toMatchObject({
      reason: 'room-unavailable',
    });
    // a plain "full" or "locked" from an old server still maps as before
    expect(classifyFailure(new Error('the room is full')).reason).toBe('room-full');
  });
});
