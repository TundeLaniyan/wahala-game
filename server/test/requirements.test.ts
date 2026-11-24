/**
 * The approved multiplayer requirements that are not covered by a more specific file (docs/ONLINE_REQUIREMENTS_MATRIX.md
 * lists which test proves which requirement):
 *  1. production disconnect defaults: grace 5 s, bot takeover without pausing, window 30 s counted from the drop
 *  4. nobody new joins a started match (the refusal), the existing members can still reconnect
 *  6. nothing persists a ranking, reward or account; results carry no reward fields
 *  7. Classic Blast is not reachable from the online code
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { Room } from '@colyseus/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTER_IDS } from '../../src/sim';
import {
  DEFAULT_RUNTIME,
  GAME_KINDS,
  loadRuntimeConfig,
  parseRoomOptions,
  parseSettingsPatch,
} from '../src/core/options';
import { RumbleMatch } from '../src/core/RumbleMatch';
import type { SeatSpec } from '../src/core/RumbleMatch';
import { TestContext, dropSocket, joinById, joinOrCreate, matchOf, sleep, until } from './helpers';
import type { TestPlayer } from './helpers';

const ROOT = path.resolve(__dirname, '..', '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const rel = (p: string): string => path.relative(ROOT, p);

describe('1. disconnect defaults: 5 s grace, then a bot, window 30 s from the drop, the match never pauses', () => {
  it('the production configuration is 5 s / 30 s / bot, with and without an empty environment', () => {
    for (const rt of [DEFAULT_RUNTIME, loadRuntimeConfig({})]) {
      expect(rt.reconnectSeconds).toBe(30);
      expect(rt.graceSeconds).toBe(5);
      expect(rt.dropPolicy).toBe('bot');
    }
    // out-of-range or hostile values fall back to the defaults, never to "no window"
    expect(loadRuntimeConfig({ RUMBLE_RECONNECT_SECONDS: '0' }).reconnectSeconds).toBe(30);
    expect(loadRuntimeConfig({ RUMBLE_RECONNECT_SECONDS: '-5' }).reconnectSeconds).toBe(30);
    expect(loadRuntimeConfig({ RUMBLE_RECONNECT_SECONDS: 'NaN' }).reconnectSeconds).toBe(30);
    expect(loadRuntimeConfig({ RUMBLE_GRACE_SECONDS: '600' }).graceSeconds).toBe(5);
  });

  it('at the default grace a dropped seat stands for exactly 300 ticks (5 s), then a bot plays it; the clock never stops', () => {
    const seats: SeatSpec[] = Array.from({ length: 8 }, (_, i) => ({
      name: i < 2 ? `Human${i}` : `BOT ${i}`,
      characterId: CHARACTER_IDS[i]!,
      kind: i < 2 ? 'human' : 'bot',
    }));
    const takeovers: number[] = [];
    const match = new RumbleMatch({
      matchId: 'defaults',
      arenaId: 'rumbleOshodi',
      game: 'deathmatch',
      durationSec: 120,
      seats,
      seed: 99,
      graceSeconds: DEFAULT_RUNTIME.graceSeconds,
      dropPolicy: DEFAULT_RUNTIME.dropPolicy,
      onBotTakeover: (s) => takeovers.push(s),
    });
    match.connect(0);
    match.connect(1);
    for (let i = 0; i < 600 && match.state.match.phase !== 'playing'; i++) match.step();
    const t0 = match.state.tick;
    match.disconnect(0);
    const step = (n: number): void => {
      for (let i = 0; i < n; i++) match.step();
    };
    step(299);
    expect(match.controlOf(0)).toBe('absent');
    expect(takeovers).toEqual([]);
    step(1);
    expect(match.controlOf(0)).toBe('bot');
    step(1);
    expect(takeovers).toEqual([0]);
    expect(match.state.tick).toBe(t0 + 301); // every call advanced the simulation: nothing paused for the drop
    expect(match.controlOf(1)).toBe('human');
  });

  describe('against a real room with the production window', () => {
    const ctx = new TestContext({ reconnectSeconds: DEFAULT_RUNTIME.reconnectSeconds, graceSeconds: 5 });
    afterEach(() => vi.restoreAllMocks());

    it('the room holds the dropped seat for 30 s from the drop (allowReconnection(client, 30)) while the match keeps ticking', async () => {
      const windows: number[] = [];
      const original = Room.prototype.allowReconnection;
      vi.spyOn(Room.prototype, 'allowReconnection').mockImplementation(function (
        this: Room,
        ...args: Parameters<typeof original>
      ) {
        windows.push(args[1] as number);
        return original.apply(this, args);
      });
      const { all, code } = await ctx.privateMatch(['Ada', 'Bayo']);
      const [a, b] = all as [TestPlayer, TestPlayer];
      await until('frames', () => a.frameMessages > 10 && b.frameMessages > 10);
      const tickBefore = matchOf(code).state.tick;
      const token = a.room.reconnectionToken;
      a.room.reconnection.enabled = false;
      dropSocket(code, a.room.sessionId);
      await until(
        'b sees the drop',
        () => b.lobby?.members.find((m) => m.seat === a.seat)?.connected === false,
      );
      expect(windows).toEqual([30]);
      await sleep(400);
      expect(matchOf(code).state.tick).toBeGreaterThan(tickBefore + 10); // no pause while a is away
      expect(ctx.metricsOf(code).net.drops).toBe(1);
      // the seat is still ours well inside the window: take it back (also lets the room end cleanly)
      a.attach(await ctx.server.client().reconnect(token));
      await until('back', () => b.lobby?.members.find((m) => m.seat === a.seat)?.connected === true);
    });
  });
});

describe('4. no new human joins a started match; the members already in it can still come back', () => {
  const ctx = new TestContext({ graceSeconds: 0.5, reconnectSeconds: 5 });

  it('a join by code to a started room gets the ONE uniform "room not available" answer (same as a wrong code); quick play opens another room', async () => {
    const { all, code } = await ctx.privateMatch(['Ada', 'Bayo']);
    const [a] = all as [TestPlayer, TestPlayer];
    const err = await joinById(ctx.server, code, 'Late').then(
      () => null,
      (e: unknown) => e as { code?: number; message?: string },
    );
    expect(err).not.toBeNull();
    // decision FU2S-C4: not found / locked / full / started / public all answer alike, so a code cannot be probed
    const wrong = await joinById(ctx.server, 'ZZZZZZ', 'Late').then(
      () => null,
      (e: unknown) => e as { message?: string },
    );
    expect(err!.message).toBe(wrong!.message);
    const { classifyFailure } = await import('../../src/net/client/connection');
    expect(classifyFailure(err)).toMatchObject({ reason: 'room-unavailable' });
    const other = ctx.track(await joinOrCreate(ctx.server, 'Late', { durationSec: 10 }));
    expect(other.room.roomId).not.toBe(code);
    expect(matchOf(code).humanSeatsConnected().sort()).toEqual([0, 1]);
    expect(a.lobby!.members).toHaveLength(2);
  });

  it('an existing member whose socket dropped reconnects in the playing phase and keeps the same seat', async () => {
    const { all, code } = await ctx.privateMatch(['Ada', 'Bayo']);
    const [a, b] = all as [TestPlayer, TestPlayer];
    const seat = a.seat!;
    const token = a.room.reconnectionToken;
    a.room.reconnection.enabled = false;
    dropSocket(code, a.room.sessionId);
    await until('b sees the drop', () => b.lobby?.members.find((m) => m.seat === seat)?.connected === false);
    const room2 = await ctx.server.client().reconnect(token);
    a.leftWith = null;
    a.attach(room2);
    await until('welcome again', () => a.welcomes.length >= 3 && a.keyframes >= 2);
    expect(a.welcomes.at(-1)).toMatchObject({ seat, roomCode: code });
    expect(a.lobby!.phase).toBe('playing');
    expect(matchOf(code).humanSeatsConnected().sort()).toEqual([0, 1]);
  });

  it('the join refusal inside the room itself (a seat reserved just before the start) says the match has started', () => {
    // the pure lobby message the room turns into a ServerError; the client maps it to the same "match-started" reason
    return import('../../src/net/client/connection').then(({ classifyFailure }) => {
      expect(classifyFailure(new Error('the match has started'))).toMatchObject({ reason: 'match-started' });
      expect(classifyFailure(new Error('room "ABC123" is locked'))).toMatchObject({
        reason: 'match-started',
      });
      expect(classifyFailure(new Error('the room is full'))).toMatchObject({ reason: 'room-full' });
    });
  });
});

describe('6. ranked play and persistent rewards are deferred: nothing is stored, results carry no reward fields', () => {
  const REWARD_WORD =
    /\b(xp|rank|ranked|rating|elo|mmr|coins?|currency|reward|rewards|account|accounts|wallet|trophy|trophies|season|prestige)\b/i;

  it('the server code imports no file system, database, cache or account module and keeps no stored profile', () => {
    const forbidden =
      /from\s+['"](node:)?(fs|fs\/promises|sqlite3|better-sqlite3|redis|ioredis|pg|mysql2?|mongodb|level|@colyseus\/(redis-driver|redis-presence|mongoose-driver|postgres-driver|auth))['"]|require\(['"](node:)?fs['"]\)|localStorage|sessionStorage|indexedDB/;
    const offenders = sourceFiles(path.join(ROOT, 'server', 'src'))
      .filter((f) => forbidden.test(readFileSync(f, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('the server never imports the progression layer (XP / rank / season / cosmetics live outside the match path)', () => {
    const offenders = sourceFiles(path.join(ROOT, 'server', 'src'))
      .filter((f) =>
        /from\s+['"][^'"]*\/(progression|seasons|cosmetics|online\/mock)(\/|['"])/.test(
          readFileSync(f, 'utf8'),
        ),
      )
      .map(rel)
      // `matchResultFrom` (placement from the sim's own result) is the one read-only helper the results use
      .filter((f) => !f.endsWith('RumbleMatch.ts'));
    expect(offenders).toEqual([]);
    const match = readFileSync(path.join(ROOT, 'server/src/core/RumbleMatch.ts'), 'utf8');
    const progressionImports = [...match.matchAll(/from\s+['"]([^'"]*progression[^'"]*)['"]/g)].map(
      (m) => m[1],
    );
    expect(progressionImports).toEqual(['../../../src/progression/matchResult']);
  });

  it('the results message has exactly the documented fields: no reward, XP, rank or account', () => {
    const seats: SeatSpec[] = Array.from({ length: 4 }, (_, i) => ({
      name: i === 0 ? 'Ada' : `BOT ${i}`,
      characterId: CHARACTER_IDS[i]!,
      kind: i === 0 ? 'human' : 'bot',
    }));
    const match = new RumbleMatch({
      matchId: 'r',
      arenaId: 'rumbleOshodi',
      game: 'deathmatch',
      durationSec: 60,
      seats,
      seed: 5,
    });
    match.connect(0);
    const r = match.results();
    expect(Object.keys(r).sort()).toEqual(
      ['draw', 'matchId', 'players', 'stateHash', 'tick', 'winnerSeat', 'winnerTeam'].sort(),
    );
    const human = r.players[0]!;
    expect(Object.keys(human).sort()).toEqual(
      [
        'absentSeconds',
        'assists',
        'autopilotSeconds',
        'botAssists',
        'botDeaths',
        'botKills',
        'controlledByBotAtEnd',
        'deaths',
        'drops',
        'isBot',
        'kills',
        'name',
        'placement',
        'seat',
        'team',
      ].sort(),
    );
    expect(Object.keys(r.players[1]!).sort()).toEqual(
      ['assists', 'deaths', 'isBot', 'kills', 'name', 'placement', 'seat', 'team'].sort(),
    );
    for (const key of [...Object.keys(r), ...Object.keys(human)]) expect(key).not.toMatch(REWARD_WORD);
  });

  it('the wire protocol and the client source name no reward, rank or account field', () => {
    const protocol = readFileSync(path.join(ROOT, 'src/net/protocol.ts'), 'utf8');
    // identifiers and property names only (comments may say "ranking": that is the documented open policy)
    const code = protocol.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(
      code.match(
        /\b(xp|rank|rating|reward|account|coin|currency)\w*|[a-z](Xp|Rank|Rating|Reward|Account|Coin)\w*/g,
      ) ?? [],
    ).toEqual([]);
    const flow = readFileSync(path.join(ROOT, 'src/app/rumbleOnlineFlow.ts'), 'utf8');
    expect(flow).not.toMatch(/progression|profile|reward/i);
  });
});

describe('7. Classic Blast is untouched: City Rumble online has no Classic code path', () => {
  it('the room accepts only the three City Rumble rulesets', () => {
    expect([...GAME_KINDS]).toEqual(['survival', 'deathmatch', 'team']);
    for (const game of ['classic', 'Classic Blast', 'battle', 'campaign', 'tutorial'])
      expect(parseSettingsPatch({ game }, DEFAULT_RUNTIME).ok, game).toBe(false);
    expect(parseRoomOptions({ game: 'classic' }, DEFAULT_RUNTIME).ok).toBe(false);
  });

  it('only Rumble stages can be asked for (a Classic arena id is refused)', () => {
    for (const arenaId of ['classic', 'arena1', 'ojuelegba-classic', 'lagosClassic'])
      expect(parseSettingsPatch({ arenaId }, DEFAULT_RUNTIME).ok, arenaId).toBe(false);
  });

  it('no online source file names Classic Blast or the Classic flow', () => {
    const files = [
      ...sourceFiles(path.join(ROOT, 'server', 'src')),
      ...sourceFiles(path.join(ROOT, 'src', 'net')),
      ...sourceFiles(path.join(ROOT, 'src', 'ui', 'online', 'rumble')),
      path.join(ROOT, 'src/app/rumbleOnline.ts'),
      path.join(ROOT, 'src/app/rumbleOnlineFlow.ts'),
      path.join(ROOT, 'src/app/rumbleOnlineSession.ts'),
      path.join(ROOT, 'src/app/remoteMatch.ts'),
      path.join(ROOT, 'src/online/rumbleEntry.ts'),
    ];
    const offenders = files.filter((f) => /classic/i.test(readFileSync(f, 'utf8'))).map(rel);
    expect(offenders).toEqual([]);
  });
});
