/**
 * The Online preview controller (app/online.ts) driven headlessly over the real mock services, with the session
 * (commands, live match) stubbed. Regression: handing a locally played match to the mock server must not loop on
 * its own settings patches (it once recursed until the stack overflowed).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLAG_DEFAULTS, setFlagsForTests } from '../../src/platform';
import { createBot } from '../../src/ai';
import { createGame, observe, tick } from '../../src/sim';
import type { GameState } from '../../src/sim';

let finalState: GameState | null = null;
const calls: string[] = [];

vi.mock('../../src/app/session', async () => {
  const { patch } = await import('../../src/app/store');
  return {
    commands: {
      start: () => {
        calls.push('start');
        patch({ screen: 'playing' });
      },
      menuOpen: (s: string) => calls.push(`menuOpen:${s}`),
    },
    liveMatch: () => (finalState ? { state: finalState, focusId: 0 } : null),
  };
});

const { onlineApi, useOnlineStore } = await import('../../src/app/online');
const { patch, useGameStore } = await import('../../src/app/store');

function finishedLocalMatch(): GameState {
  const s = createGame({
    seed: 77,
    arenaId: 'danfoBusPark',
    players: [0, 1, 2, 3].map((i) => ({
      name: `L${i}`,
      characterId: 'streetBaller' as const,
      isBot: i > 0,
      difficulty: 'rookie' as const,
    })),
    settings: { game: 'classic', mode: 'crush' },
  });
  const bots = [0, 1, 2, 3].map((i) => createBot({ difficulty: 'rookie', seed: i, playerId: i }));
  while (s.match.phase !== 'ended' && s.tick < 60 * 400) {
    tick(s, Object.fromEntries(bots.map((b, i) => [i, b.decide(observe(s, i))])));
  }
  return s;
}

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const until = async (cond: () => boolean, maxMs = 30_000) => {
  for (let t = 0; t < maxMs && !cond(); t += 250) await advance(250);
  expect(cond()).toBe(true);
};

beforeEach(() => {
  vi.useFakeTimers();
  setFlagsForTests({ ...FLAG_DEFAULTS, online: true, onlineMode: 'mock' });
  calls.length = 0;
  finalState = null;
});
afterEach(() => {
  onlineApi.dispose();
  setFlagsForTests(null);
  patch({ screen: 'title' });
  vi.useRealTimers();
});

describe('online controller', () => {
  it('does nothing and builds no client when the online flag is off', async () => {
    setFlagsForTests({ ...FLAG_DEFAULTS });
    await onlineApi.open();
    await onlineApi.signIn();
    expect(useOnlineStore.getState()).toMatchObject({ ready: false, profile: null, step: 'signIn' });
  });

  it('guest -> quick match -> lobby -> countdown -> match; the server plays it; reconnect; results with XP', async () => {
    await onlineApi.open();
    await onlineApi.signIn();
    expect(useOnlineStore.getState()).toMatchObject({ step: 'hub', profile: { guest: true } });
    await onlineApi.quickMatch();
    expect(useOnlineStore.getState().step).toBe('queue');
    await until(() => useOnlineStore.getState().step === 'lobby');
    expect(useOnlineStore.getState().room?.state).toBe('readyCheck');
    await onlineApi.toggleReady();
    await until(() => useOnlineStore.getState().step === 'match');
    const m0 = useOnlineStore.getState().match!;
    expect(m0).toMatchObject({ mode: null, connection: 'connected' });
    onlineApi.playOnServer();
    await advance(1500);
    onlineApi.simulateDrop();
    expect(useOnlineStore.getState().match!.connection).toBe('reconnecting');
    await onlineApi.reconnect();
    const m1 = useOnlineStore.getState().match!;
    expect(m1.connection).toBe('connected');
    expect(m1.resync!.tick).toBeGreaterThan(0);
    await until(() => useOnlineStore.getState().step === 'results', 120_000);
    const s = useOnlineStore.getState();
    expect(s.update!.xpGained).toBeGreaterThan(0);
    expect(s.leaderboard!.rows.some((r) => r.isYou)).toBe(true);
    expect(s.progress!.profile.totals.matches).toBe(1);
    expect(calls).toEqual([]); // the server-played path never touches the local game
  });

  it('a locally played match is handed back without recursion; settings are restored; the Online screen reopens', async () => {
    await onlineApi.open();
    await onlineApi.signIn();
    await onlineApi.quickMatch();
    await until(() => useOnlineStore.getState().step === 'lobby');
    await onlineApi.toggleReady();
    await until(() => useOnlineStore.getState().step === 'match');
    const before = useGameStore.getState().settings;

    onlineApi.playLocal();
    expect(calls).toEqual(['start']);
    expect(useGameStore.getState().settings).toMatchObject({
      play: 'classic',
      arenaId: 'danfoBusPark',
      competitors: 4,
    });

    finalState = finishedLocalMatch();
    patch({ screen: 'results' });
    expect(useGameStore.getState().settings).toEqual(before); // restored the moment the match ends
    await until(() => useOnlineStore.getState().step === 'results', 5000);
    expect(useOnlineStore.getState().update!.xpGained).toBeGreaterThan(0);
    expect(useOnlineStore.getState().results!.players).toHaveLength(4);

    patch({ screen: 'title' });
    await advance(10);
    expect(calls).toEqual(['start', 'menuOpen:online']);
    // later screen changes are no longer tracked
    patch({ screen: 'playing' });
    patch({ screen: 'title' });
    expect(calls).toEqual(['start', 'menuOpen:online']);
  });

  it('quitting a local match before the end restores the settings and returns to the Online screen', async () => {
    await onlineApi.open();
    await onlineApi.signIn();
    await onlineApi.quickMatch();
    await until(() => useOnlineStore.getState().step === 'lobby');
    await onlineApi.toggleReady();
    await until(() => useOnlineStore.getState().step === 'match');
    const before = useGameStore.getState().settings;
    onlineApi.playLocal();
    patch({ screen: 'title' }); // quit from the pause menu
    await advance(10);
    expect(useGameStore.getState().settings).toEqual(before);
    expect(calls).toEqual(['start', 'menuOpen:online']);
    expect(useOnlineStore.getState().match).toMatchObject({ mode: null });
    expect(useOnlineStore.getState().step).toBe('match');
  });

  it('errors from the services become a readable message, never an exception', async () => {
    await onlineApi.open();
    await onlineApi.quickMatch(); // not signed in
    expect(useOnlineStore.getState().error).toMatch(/sign in/i);
    onlineApi.dismissError();
    expect(useOnlineStore.getState().error).toBeNull();
  });
});
