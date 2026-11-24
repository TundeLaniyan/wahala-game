/**
 * PUBLIC MATCHMAKING (approved requirement, decision PI1): a public room waits up to 30 seconds after its first human
 * joined, then starts and bots (clearly marked BOT, counted apart from the humans) fill the empty seats; it starts
 * sooner when 32 humans are in; later public players join the waiting room; a started room is locked.
 *
 * Part 1 drives the pure `Lobby` with a fake clock and the PRODUCTION defaults (nothing here shortens the 30 s).
 * Part 2 drives a real server: the wait is shortened only through the test-only fast mode, and one server runs with
 * the production rule to prove a client cannot choose its own wait.
 */
import { describe, expect, it } from 'vitest';
import { MATCH_SEATS, MAX_HUMANS, PUBLIC_WAIT_SECONDS } from '../../src/net/protocol';
import { CHARACTER_IDS } from '../../src/sim';
import { Lobby } from '../src/core/Lobby';
import { DEFAULT_RUNTIME, loadRuntimeConfig, parseRoomOptions } from '../src/core/options';
import { TestContext, joinById, joinOrCreate, startTestServer, until } from './helpers';
import type { TestPlayer } from './helpers';

const who = (name: string): { name: string; characterId: (typeof CHARACTER_IDS)[number] } => ({
  name,
  characterId: CHARACTER_IDS[0]!,
});

/** A public lobby exactly as `RumbleRoom.onCreate` builds it from a client's options with the production runtime. */
function publicLobby(clientOptions: unknown = {}): { lobby: Lobby; clock: { t: number } } {
  const parsed = parseRoomOptions(clientOptions, DEFAULT_RUNTIME);
  if (!parsed.ok) throw new Error(parsed.error);
  const clock = { t: 5_000 };
  const lobby = new Lobby(
    {
      maxHumans: MAX_HUMANS,
      seats: MATCH_SEATS,
      isPrivate: parsed.value.private,
      autoStartMs: parsed.value.autoStartSec * 1000,
      countdownMs: DEFAULT_RUNTIME.countdownMs,
      settings: parsed.value.settings,
    },
    () => clock.t,
  );
  return { lobby, clock };
}

describe('the public wait is 30 seconds by default (pure lobby, fake clock)', () => {
  it('the production default is 30 s and nothing in the environment can change it outside test-fast mode', () => {
    expect(PUBLIC_WAIT_SECONDS).toBe(30);
    expect(DEFAULT_RUNTIME.defaultAutoStartSec).toBe(30);
    expect(loadRuntimeConfig({}).defaultAutoStartSec).toBe(30);
    expect(loadRuntimeConfig({ RUMBLE_AUTOSTART_SEC: '1' }).defaultAutoStartSec).toBe(30);
    expect(loadRuntimeConfig({ RUMBLE_TEST_FAST: '1', RUMBLE_AUTOSTART_SEC: '1' }).defaultAutoStartSec).toBe(
      1,
    );
  });

  it('a client cannot shorten or stretch it: autoStartSec in the create options is ignored in production', () => {
    for (const asked of [0, 1, 599]) {
      const { lobby } = publicLobby({ autoStartSec: asked });
      lobby.join('a', who('Ada'));
      expect(lobby.view('X').autoStartMs).toBe(30_000);
    }
  });

  it('starts the countdown exactly 30 s after the FIRST human, then the match 3 s later, with bots in the empty seats', () => {
    const { lobby, clock } = publicLobby();
    expect(lobby.view('X').autoStartMs).toBeNull(); // nobody yet: no timer
    lobby.join('a', who('Ada'));
    expect(lobby.view('X').autoStartMs).toBe(30_000);
    clock.t += 10_000;
    lobby.join('b', who('Bayo')); // a later public player joins the waiting room and does not restart the timer
    expect(lobby.phase).toBe('lobby');
    expect(lobby.view('X').autoStartMs).toBe(20_000);
    clock.t += 19_999;
    expect(lobby.tick()).toEqual({ changed: false, begin: false });
    clock.t += 1;
    expect(lobby.tick()).toEqual({ changed: true, begin: false });
    expect(lobby.phase).toBe('countdown');
    expect(lobby.view('X').autoStartMs).toBeNull();
    // still joinable during the 3 s countdown
    expect(lobby.join('c', who('Chi')).ok).toBe(true);
    clock.t += 3000;
    expect(lobby.tick().begin).toBe(true);
    const seats = lobby.begin();
    expect(seats).toHaveLength(32);
    const humans = seats.filter((s) => s.kind === 'human');
    const bots = seats.filter((s) => s.kind === 'bot');
    expect(humans.map((s) => s.name)).toEqual(['Ada', 'Bayo', 'Chi']);
    expect(bots).toHaveLength(29); // counted apart from the humans
    expect(bots.every((s) => s.name.startsWith('BOT '))).toBe(true); // clearly identified
  });

  it('the room is locked from the start of the match: nobody new joins a running match', () => {
    const { lobby, clock } = publicLobby();
    lobby.join('a', who('Ada'));
    clock.t += 30_000;
    lobby.tick();
    clock.t += 3000;
    lobby.tick();
    lobby.begin();
    expect(lobby.joinable).toBe(false);
    expect(lobby.join('late', who('Late'))).toMatchObject({ ok: false, code: 'in_progress' });
  });

  it('starts at once when the 32nd human joins, with no bots to fill', () => {
    const { lobby, clock } = publicLobby();
    for (let i = 0; i < 31; i++) lobby.join(`s${i}`, who(`Player ${i}`));
    clock.t += 5000;
    expect(lobby.phase).toBe('lobby');
    expect(lobby.view('X').autoStartMs).toBe(25_000);
    expect(lobby.view('X').botsToFill).toBe(1);
    lobby.join('s31', who('Player 31'));
    expect(lobby.phase).toBe('countdown'); // well before the 30 s
    expect(lobby.view('X').botsToFill).toBe(0);
    expect(lobby.view('X').countdownMs).toBe(3000);
    expect(lobby.joinable).toBe(false); // full
    clock.t += 3000;
    expect(lobby.begin().filter((s) => s.kind === 'bot')).toHaveLength(0);
  });

  it('keeps counting from the first human even if that human leaves; empties re-arm it', () => {
    const { lobby, clock } = publicLobby();
    lobby.join('a', who('Ada'));
    clock.t += 5000;
    lobby.join('b', who('Bayo'));
    lobby.leave('a');
    expect(lobby.view('X').autoStartMs).toBe(25_000);
    lobby.leave('b'); // nobody left: forgotten
    expect(lobby.view('X').autoStartMs).toBeNull();
    clock.t += 60_000;
    expect(lobby.tick()).toEqual({ changed: false, begin: false });
    lobby.join('c', who('Chi'));
    expect(lobby.view('X').autoStartMs).toBe(30_000);
  });

  it('every human count from 1 to 32 gets exactly 32 fighters, humans first and the rest BOT', () => {
    for (let n = 1; n <= 32; n++) {
      const { lobby, clock } = publicLobby();
      for (let i = 0; i < n; i++) lobby.join(`s${i}`, who(`Player ${i}`));
      clock.t += 30_000;
      lobby.tick();
      clock.t += 3000;
      lobby.tick();
      const seats = lobby.begin();
      expect(seats).toHaveLength(32);
      expect(seats.filter((s) => s.kind === 'human')).toHaveLength(n);
      expect(seats.slice(0, n).every((s) => s.kind === 'human')).toBe(true);
      expect(seats.slice(n).every((s) => s.kind === 'bot' && s.name.startsWith('BOT '))).toBe(true);
    }
  });
});

describe('public matchmaking over a real server (quick play = joinOrCreate)', () => {
  const ctx = new TestContext({ defaultAutoStartSec: 2.5 });

  it('a lone public player waits, the lobby tells the client the wait, then bots fill the 31 other seats', async () => {
    const a = ctx.track(await joinOrCreate(ctx.server, 'Ada', { durationSec: 10 }));
    await until('the lobby announces the wait', () => a.lobby?.autoStartMs != null);
    expect(a.lobby!.private).toBe(false);
    expect(a.lobby!.botsToFill).toBe(31);
    expect(a.lobby!.autoStartMs!).toBeLessThanOrEqual(2500);
    await until('the match starts by itself', () => a.seat !== null && a.keyframes >= 1);
    const players = a.welcomes.at(-1)!.descriptor!.players;
    expect(players).toHaveLength(32);
    expect(players.filter((p) => !p.isBot).map((p) => p.name)).toEqual(['Ada']);
    const bots = players.filter((p) => p.isBot);
    expect(bots).toHaveLength(31);
    expect(bots.every((p) => p.name.startsWith('BOT '))).toBe(true);
  });

  it('later public players land in the SAME waiting room, then a started room is locked and a new player gets a new room', async () => {
    const a = ctx.track(await joinOrCreate(ctx.server, 'Ada', { durationSec: 10 }));
    const b = ctx.track(await joinOrCreate(ctx.server, 'Bayo'));
    const c = ctx.track(await joinOrCreate(ctx.server, 'Chi'));
    expect(b.room.roomId).toBe(a.room.roomId);
    expect(c.room.roomId).toBe(a.room.roomId);
    await until('all see three members', () => [a, b, c].every((p) => p.lobby?.members.length === 3));
    await until('the match started', () => [a, b, c].every((p) => p.seat !== null && p.keyframes >= 1));
    const late = ctx.track(await joinOrCreate(ctx.server, 'Late', { durationSec: 10 }));
    expect(late.room.roomId).not.toBe(a.room.roomId);
    expect(late.lobby === null || late.lobby.phase !== 'playing').toBe(true);
  });

  it('32 humans fill a room at once (no waiting), the 33rd goes to a new room; no bot is seated', async () => {
    // a long production-like wait: only the 32nd joiner can start this room
    const wait = await startTestServer({ defaultAutoStartSec: 120 });
    const players: TestPlayer[] = [];
    try {
      for (let i = 0; i < 32; i++) {
        const p = await joinOrCreate(wait, `Player ${i}`, { durationSec: 5 });
        players.push(p);
      }
      const code = players[0]!.room.roomId;
      expect(new Set(players.map((p) => p.room.roomId))).toEqual(new Set([code]));
      await until(
        'everybody has a seat',
        () => players.every((p) => p.seat !== null && p.keyframes >= 1),
        60_000,
      );
      const players32 = players[0]!.welcomes.at(-1)!.descriptor!.players;
      expect(players32).toHaveLength(32);
      expect(players32.filter((p) => p.isBot)).toHaveLength(0);
      expect(new Set(players.map((p) => p.seat)).size).toBe(32);
      const extra = await joinOrCreate(wait, 'Extra', { durationSec: 5 });
      players.push(extra);
      expect(extra.room.roomId).not.toBe(code);
      await expect(joinById(wait, code, 'Nope')).rejects.toThrow();
    } finally {
      await Promise.all(players.map((p) => p.leave()));
      await until('rooms gone', () => wait.metrics.roomCount === 0, 20_000);
      await wait.close();
    }
  }, 120_000);
});

describe('the production rule over a real server: the client does not pick the wait', () => {
  it('a client asking for autoStartSec 0 still gets the 30 s wait on a non-test server', async () => {
    const prod = await startTestServer({ fast: false, defaultAutoStartSec: 30 });
    let a: TestPlayer | null = null;
    try {
      a = await joinOrCreate(prod, 'Ada', { autoStartSec: 0 });
      await until('lobby', () => a!.lobby?.autoStartMs != null);
      expect(a.lobby!.autoStartMs!).toBeGreaterThan(28_000);
      expect(a.lobby!.autoStartMs!).toBeLessThanOrEqual(30_000);
      expect(a.lobby!.phase).toBe('lobby');
    } finally {
      await a?.leave();
      await until('room gone', () => prod.metrics.roomCount === 0, 20_000);
      await prod.close();
    }
  });
});
