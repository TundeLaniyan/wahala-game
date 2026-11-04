import { describe, expect, it } from 'vitest';
import { createMockOnline, manualClock } from '../../src/online/mock';
import type { ServerEvent } from '../../src/online/schema';
import type { Intent } from '../../src/sim';
import { createBot } from '../../src/ai';
import { createGame, observe, tick } from '../../src/sim';
import { mock, quickMatchRoom, val } from './helpers';

type M = ReturnType<typeof mock>;

/** Quick match all the way to a running (paused) server match. */
async function runningMatch(m: M, game: 'classic' | 'team' = 'classic', arenaId = 'danfoBusPark') {
  const room = await quickMatchRoom(m, game, arenaId);
  val(await m.online.lobbies.setReady(room.id, true));
  let r = val(await m.online.lobbies.get(room.id));
  for (let i = 0; i < 200 && r.state !== 'inProgress'; i++) {
    m.wait(100);
    r = val(await m.online.lobbies.get(room.id));
  }
  expect(r.state).toBe('inProgress');
  const descriptor = val(await m.online.matches.join(r.matchId!));
  m.online.control.pause(descriptor.matchId, true); // the tests drive the clock with `step`
  return { room: r, matchId: descriptor.matchId, descriptor };
}

describe('mock match authority', () => {
  it('the descriptor and snapshots expose only public state: no seed, no hidden pickups, no rng', async () => {
    const m = mock();
    const { matchId, descriptor } = await runningMatch(m);
    expect(descriptor.seats).toHaveLength(4);
    expect(descriptor.yourSeat).toBe(0);
    expect(descriptor.resumeToken.length).toBeGreaterThanOrEqual(16);
    const snap = val(await m.online.matches.snapshot(matchId));
    const text = JSON.stringify({ descriptor, snap });
    for (const secret of ['"seed"', 'rngState', 'hidden', '"pickups"']) expect(text).not.toContain(secret);
    expect(snap.players).toHaveLength(4);
    expect(snap.tiles).toHaveLength(snap.width * snap.height);
    expect(snap.phase).toBe('playing');
  });

  it('inputs move your fighter; the server owns the state and applies one intent set per tick', async () => {
    const m = mock();
    const { matchId } = await runningMatch(m);
    m.online.control.step(matchId, 200); // past the sim's own countdown
    const start = val(await m.online.matches.snapshot(matchId)).players[0]!;
    let moved = false;
    for (const move of ['right', 'down', 'left', 'up'] as const) {
      const snap0 = val(await m.online.matches.snapshot(matchId));
      val(await m.online.matches.submitInput(matchId, snap0.tick, { move }));
      m.online.control.step(matchId, 30);
      const after = val(await m.online.matches.snapshot(matchId)).players[0]!;
      if (after.x !== start.x || after.y !== start.y) {
        moved = true;
        break;
      }
    }
    expect(moved).toBe(true);
    // a null move stops you (held movement is level-triggered)
    const s1 = val(await m.online.matches.snapshot(matchId));
    val(await m.online.matches.submitInput(matchId, s1.tick, { move: null }));
    m.online.control.step(matchId, 40);
    const a = val(await m.online.matches.snapshot(matchId)).players[0]!;
    m.online.control.step(matchId, 40);
    const b = val(await m.online.matches.snapshot(matchId)).players[0]!;
    expect([b.x, b.y]).toEqual([a.x, a.y]);
  });

  it('the server re-validates: bad intents, wild ticks and wrong phases are refused', async () => {
    const m = mock();
    const { matchId } = await runningMatch(m);
    const t = val(await m.online.matches.snapshot(matchId)).tick;
    expect(await m.online.matches.submitInput(matchId, t, { move: 'sideways' } as unknown as Intent)).toMatchObject({ error: { code: 'invalidMessage' } });
    expect(await m.online.matches.submitInput(matchId, t, { x: 5 } as unknown as Intent)).toMatchObject({ error: { code: 'invalidMessage' } });
    expect(await m.online.matches.submitInput(matchId, t + 5000, { place: true })).toMatchObject({ error: { code: 'invalidMessage' } });
    expect(await m.online.matches.submitInput(matchId, -500, { place: true })).toMatchObject({ error: { code: 'invalidMessage' } });
    expect(await m.online.matches.submitInput('nope', t, {})).toMatchObject({ error: { code: 'notFound' } });
    expect(await m.online.matches.ready(matchId, true)).toMatchObject({ error: { code: 'invalidState' } });
    expect(await m.online.matches.results(matchId)).toMatchObject({ error: { code: 'invalidState' } });
    expect(await m.online.progression.settle(matchId)).toMatchObject({ error: { code: 'invalidState' } });
  });

  it('input is rate limited per player on the injected clock', async () => {
    const m = mock({ inputsPerSecond: 10 });
    const { matchId } = await runningMatch(m);
    const t = val(await m.online.matches.snapshot(matchId)).tick;
    const codes: string[] = [];
    for (let i = 0; i < 80; i++) {
      const r = await m.online.matches.submitInput(matchId, t, { place: false });
      codes.push(r.ok ? 'ok' : r.error.code);
    }
    expect(codes.filter((c) => c === 'ok').length).toBeLessThan(80);
    expect(codes).toContain('rateLimited');
    m.clock.advance(1000);
    expect((await m.online.matches.submitInput(matchId, t, {})).ok).toBe(true);
  });

  it('every accepted input is logged and a replay from the seed reproduces the live state exactly', async () => {
    const m = mock();
    const { matchId } = await runningMatch(m);
    m.online.control.step(matchId, 160);
    const moves = ['right', 'down', 'left', 'up', 'right', 'down'] as const;
    for (const move of moves) {
      const t = val(await m.online.matches.snapshot(matchId)).tick;
      val(await m.online.matches.submitInput(matchId, t, { move, place: move === 'down' }));
      m.online.control.step(matchId, 25);
    }
    m.online.control.step(matchId, 100);
    const check = m.online.control.verifyReplay(matchId)!;
    expect(check.tick).toBeGreaterThan(400);
    expect(check.replayed).toBe(check.live);
    expect(m.online.control.inspect(matchId)!.log.some((e) => e.seat === 0)).toBe(true);
  });

  it('the snapshot hash detects divergence', async () => {
    const m = mock();
    const { matchId } = await runningMatch(m);
    m.online.control.step(matchId, 200);
    const a = val(await m.online.matches.snapshot(matchId));
    m.online.control.step(matchId, 1);
    const b = val(await m.online.matches.snapshot(matchId));
    expect(b.stateHash).not.toBe(a.stateHash);
    expect(val(await m.online.matches.snapshot(matchId)).stateHash).toBe(b.stateHash);
  });

  it('you cannot read or drive a match you are not in', async () => {
    const m = mock();
    const { matchId } = await runningMatch(m);
    const rec = m.online.control.inspect(matchId)!;
    rec.seats[0]!.accountId = 'someone-else';
    expect(await m.online.matches.snapshot(matchId)).toMatchObject({ error: { code: 'forbidden' } });
    expect(await m.online.matches.submitInput(matchId, 0, {})).toMatchObject({ error: { code: 'forbidden' } });
    expect(await m.online.matches.join(matchId)).toMatchObject({ error: { code: 'forbidden' } });
  });
});

describe('mock match results and progression', () => {
  it('the server plays a match to its end; results, placement, and idempotent settlement', async () => {
    const m = mock();
    const events: ServerEvent[] = [];
    m.online.events.subscribe((e) => events.push(e));
    const { matchId } = await runningMatch(m);
    const results = val(m.online.control.fastForward(matchId));
    expect(results.players).toHaveLength(4);
    expect(results.players.map((p) => p.placement).sort()).toEqual(expect.arrayContaining([1]));
    expect(results.durationSec).toBeGreaterThan(10);
    expect(val(await m.online.matches.results(matchId))).toEqual(results);
    expect(events.filter((e) => e.type === 'match.results')).toHaveLength(1);
    // input after the end is refused
    expect(await m.online.matches.submitInput(matchId, 0, {})).toMatchObject({ error: { code: 'invalidState' } });

    const before = val(await m.online.progression.get());
    expect(before.profile.totals.matches).toBe(0);
    const update = val(await m.online.progression.settle(matchId));
    expect(update).toMatchObject({ duplicate: false });
    expect(update.xpGained).toBeGreaterThan(0);
    const after = val(await m.online.progression.get());
    expect(after.profile.totals.matches).toBe(1);
    expect(after.profile.xp).toBe(update.xpGained);
    const dup = val(await m.online.progression.settle(matchId));
    expect(dup.duplicate).toBe(true);
    expect(val(await m.online.progression.get()).profile.totals.matches).toBe(1);
    expect(m.online.control.inspect(matchId)!.phase).toBe('resultsPosted');
    expect(events.some((e) => e.type === 'progress.update')).toBe(true);
  });

  it('the profile is persisted through the KeyValueStore port and reloaded by a fresh mock', async () => {
    const m = mock();
    const { matchId } = await runningMatch(m);
    val(m.online.control.fastForward(matchId));
    const update = val(await m.online.progression.settle(matchId));
    const fresh = createMockOnline({ clock: manualClock(), store: m.store, progressStore: m.progressStore });
    val(await fresh.accounts.signInGuest());
    expect(val(await fresh.progression.get()).profile.xp).toBe(update.xpGained);
  });

  it('ranking: rating and leaderboards (global and season) with you on the board', async () => {
    const m = mock();
    const { matchId } = await runningMatch(m);
    val(m.online.control.fastForward(matchId));
    const update = val(await m.online.progression.settle(matchId));
    const rating = val(await m.online.ranking.rating());
    expect(rating.rank.label).toBe(update.rankAfter.label);
    const board = val(await m.online.ranking.leaderboard('global', 10));
    expect(board.rows.length).toBeLessThanOrEqual(10);
    expect(board.rows.filter((r) => r.isYou)).toHaveLength(1);
    expect(board.rows.map((r) => r.rank)).toEqual([...board.rows.map((r) => r.rank)].sort((a, b) => a - b));
    expect(val(await m.online.ranking.leaderboard('season-1')).boardId).toBe('season-1');
    expect(await m.online.ranking.leaderboard('nope')).toMatchObject({ error: { code: 'notFound' } });
  });

  it('a team match reports the winning team', async () => {
    const m = mock();
    const { matchId } = await runningMatch(m, 'team', 'rumbleOshodi');
    const results = val(m.online.control.fastForward(matchId));
    expect(results.game).toBe('team');
    expect(results.winnerTeam === null || [0, 1].includes(results.winnerTeam)).toBe(true);
    expect(new Set(results.players.map((p) => p.team))).toEqual(new Set([0, 1]));
  }, 60_000);

  it('PREVIEW ONLY: a locally played match can be handed to the mock server in place of its own simulation', async () => {
    const m = mock();
    const { matchId } = await runningMatch(m);
    const local = createGame({
      seed: 4242,
      arenaId: 'danfoBusPark',
      players: [0, 1, 2, 3].map((i) => ({ name: `L${i}`, characterId: 'streetBaller' as const, isBot: i > 0, difficulty: 'rookie' as const })),
      settings: { game: 'classic', mode: 'crush' },
    });
    const bots = [0, 1, 2, 3].map((i) => createBot({ difficulty: 'rookie', seed: i, playerId: i }));
    while (local.match.phase !== 'ended' && local.tick < 60 * 400) {
      tick(local, Object.fromEntries(bots.map((b, i) => [i, b.decide(observe(local, i))])));
    }
    expect(local.match.phase).toBe('ended');
    expect(m.online.control.adoptLocalMatch(matchId, createGame({ seed: 1, players: [{ name: 'a', characterId: 'streetBaller', isBot: false }, { name: 'b', characterId: 'streetBaller', isBot: true }] }))).toMatchObject({ ok: false });
    const adopted = val(m.online.control.adoptLocalMatch(matchId, local));
    expect(adopted.players).toHaveLength(4);
    expect(val(await m.online.progression.settle(matchId)).xpGained).toBeGreaterThan(0);
  });
});

describe('mock match is deterministic', () => {
  it('the same seed and the same calls give the same match', async () => {
    const play = async () => {
      const m = mock({ seed: 11 });
      const { matchId } = await runningMatch(m);
      m.online.control.step(matchId, 500);
      return val(await m.online.matches.snapshot(matchId)).stateHash;
    };
    expect(await play()).toBe(await play());
  });
});
