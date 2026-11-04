/**
 * Online PREVIEW controller (docs/ONLINE_ARCHITECTURE.md). Reachable only when `flags().online` is true (the
 * `?mockonline` URL switch or a build-time opt-in); a default build never constructs it, and nothing in the
 * normal match path imports it.
 *
 * It drives the MOCK multiplayer flow end to end through the service interfaces: guest sign-in -> Quick Match
 * (mock players join) or party (code, invite a mock friend, ready toggles, team assignment) -> lobby ready check
 * and countdown -> a match -> results with XP / rank and a leaderboard -> a reconnect demo. The match is either run
 * by the mock server on the real simulation ("let the mock server play it") or played locally with the normal game
 * (`commands.start()`), after which the final state is handed to the mock server in place of its own simulation.
 * The saved menu settings are never written: the local match uses a temporary in-memory copy.
 */
import { create } from 'zustand';
import { browserKeyValueStore, flags } from '../platform';
import { createOnline } from '../online';
import type {
  Friend,
  LeaderboardPage,
  MatchDescriptor,
  MatchResults,
  MatchSnapshot,
  OnlineClient,
  OnlineGame,
  Party,
  Profile,
  ProgressionSummary,
  ProgressionUpdate,
  QueueStatus,
  RatingInfo,
  Room,
  ServerEvent,
} from '../online';
import type { MockOnline } from '../online/mock';
import { describeError } from '../online';
import type { Result } from '../online';
import { commands, liveMatch } from './session';
import { patch, useGameStore } from './store';
import type { GameSettings } from './settings';

export type OnlineStep = 'signIn' | 'hub' | 'queue' | 'party' | 'lobby' | 'match' | 'results';

export interface MatchView {
  id: string;
  descriptor: MatchDescriptor | null;
  snapshot: MatchSnapshot | null;
  /** null until the player chooses; 'server' = the mock server plays it, 'local' = the normal local game. */
  mode: 'server' | 'local' | null;
  connection: 'connected' | 'reconnecting';
  graceMs: number | null;
  /** The last reconnect: where the state was rebuilt from. */
  resync: { tick: number; inputs: number; hash: number } | null;
}

export interface OnlineUi {
  ready: boolean;
  step: OnlineStep;
  busy: boolean;
  error: string | null;
  profile: Profile | null;
  friends: Friend[];
  game: OnlineGame;
  arenaId: string;
  queue: QueueStatus | null;
  party: Party | null;
  room: Room | null;
  countdown: number | null;
  match: MatchView | null;
  results: MatchResults | null;
  update: ProgressionUpdate | null;
  progress: ProgressionSummary | null;
  rating: RatingInfo | null;
  leaderboard: LeaderboardPage | null;
}

export const DEFAULT_ONLINE_ARENA: Record<'classic' | 'rumble', string> = {
  classic: 'danfoBusPark',
  rumble: 'rumbleOshodi',
};

const initial: OnlineUi = {
  ready: false,
  step: 'signIn',
  busy: false,
  error: null,
  profile: null,
  friends: [],
  game: 'classic',
  arenaId: DEFAULT_ONLINE_ARENA.classic,
  queue: null,
  party: null,
  room: null,
  countdown: null,
  match: null,
  results: null,
  update: null,
  progress: null,
  rating: null,
  leaderboard: null,
};

export const useOnlineStore = create<OnlineUi>(() => ({ ...initial }));
const set = (p: Partial<OnlineUi>): void => useOnlineStore.setState(p);
const get = (): OnlineUi => useOnlineStore.getState();

/** Mock server clock tick (ms) and the sim ticks run per timer tick while "the server plays it" (8x real time). */
const PUMP_MS = 250;
const ACCELERATED_TICKS = 120;

let client: OnlineClient | null = null;
let unsubscribe: (() => void) | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let unsubMain: (() => void) | null = null;
let starting: Promise<OnlineClient | null> | null = null;
/** A locally played match waiting for its results to be handed to the mock server. */
let local: { matchId: string; restore: GameSettings; done: boolean } | null = null;

const mockOf = (): MockOnline | null => (client && client.kind === 'mock' ? (client as MockOnline) : null);

function seedFromUrl(): number {
  const n = Number(new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('seed'));
  return Number.isFinite(n) && n > 0 ? n : Date.now() & 0x7fffffff || 1;
}

async function ensureClient(): Promise<OnlineClient | null> {
  if (client) return client;
  if (!flags().online) return null;
  starting ??= (async () => {
    const store = browserKeyValueStore();
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
    const c = await createOnline(flags(), {
      serverUrl: env.WAHALA_ONLINE_URL,
      mock: { seed: seedFromUrl(), store, progressStore: store },
    });
    client = c;
    if (c) unsubscribe = c.events.subscribe(onEvent);
    set({ ready: c !== null });
    return c;
  })();
  return starting;
}

function startTimer(): void {
  if (timer !== null) return;
  timer = setInterval(tickTimer, PUMP_MS);
}
function stopTimer(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

function tickTimer(): void {
  const mock = mockOf();
  if (!mock) return;
  mock.control.pump();
  const m = get().match;
  // "let the mock server play it": the sim runs faster than real time while the player stays connected
  if (m && m.mode === 'server' && m.connection === 'connected' && !get().results) {
    mock.control.step(m.id, ACCELERATED_TICKS);
  }
}

const fail = (r: { ok: false; error: Parameters<typeof describeError>[0] }): void =>
  set({ error: describeError(r.error), busy: false });

async function run<T>(r: Promise<Result<T>>, then: (v: T) => void | Promise<void>): Promise<void> {
  set({ busy: true, error: null });
  const res = await r;
  if (!res.ok) return fail(res);
  await then(res.value);
  set({ busy: false });
}

// ---------------------------------------------------------------- events

function isMine(room: Room): boolean {
  const me = get().profile?.id;
  return !!me && room.members.some((m) => m.accountId === me);
}

function onEvent(e: ServerEvent): void {
  switch (e.type) {
    case 'queue.update':
      set({ queue: e.status });
      if (e.status.state === 'matched' && e.status.roomId) void openRoom(e.status.roomId);
      break;
    case 'party.update':
      if (get().party?.id === e.party.id) set({ party: e.party });
      break;
    case 'party.closed':
      if (get().party?.id === e.partyId) set({ party: null });
      break;
    case 'room.update':
      if (!isMine(e.room)) break;
      set({ room: e.room });
      if (e.room.state === 'inProgress' && get().step !== 'match' && get().step !== 'results')
        void enterMatch(e.room);
      if (e.room.state === 'open' || e.room.state === 'readyCheck') set({ countdown: null });
      break;
    case 'match.countdown':
      set({ countdown: e.secondsLeft });
      break;
    case 'match.snapshot': {
      const m = get().match;
      if (m && m.id === e.snapshot.matchId) set({ match: { ...m, snapshot: e.snapshot } });
      break;
    }
    case 'match.connection': {
      const m = get().match;
      if (m && m.id === e.matchId && e.seat === m.descriptor?.yourSeat) {
        set({ match: { ...m, connection: e.connected ? 'connected' : 'reconnecting', graceMs: e.graceMs } });
      }
      break;
    }
    case 'match.results': {
      const m = get().match;
      if (m && m.id === e.results.matchId) void finishMatch(e.results);
      break;
    }
    default:
      break;
  }
}

async function openRoom(roomId: string): Promise<void> {
  if (!client) return;
  const r = await client.lobbies.get(roomId);
  if (!r.ok) return fail(r);
  set({ room: r.value, step: 'lobby', queue: null });
}

async function enterMatch(room: Room): Promise<void> {
  if (!client || !room.matchId) return;
  const r = await client.matches.join(room.matchId);
  if (!r.ok) return fail(r);
  // hold the server clock while the player chooses how to play it
  mockOf()?.control.pause(room.matchId, true);
  set({
    step: 'match',
    countdown: null,
    match: {
      id: room.matchId,
      descriptor: r.value,
      snapshot: null,
      mode: null,
      connection: 'connected',
      graceMs: null,
      resync: null,
    },
  });
}

async function finishMatch(results: MatchResults): Promise<void> {
  if (!client) return;
  set({ results, busy: true });
  const settled = await client.progression.settle(results.matchId);
  if (!settled.ok) return fail(settled);
  const [progress, rating, board] = await Promise.all([
    client.progression.get(),
    client.ranking.rating(),
    client.ranking.leaderboard('global', 8),
  ]);
  set({
    update: settled.value,
    progress: progress.ok ? progress.value : null,
    rating: rating.ok ? rating.value : null,
    leaderboard: board.ok ? board.value : null,
    step: 'results',
    busy: false,
  });
}

// ---------------------------------------------------------------- the public API for the screens

async function refreshAccount(): Promise<void> {
  if (!client) return;
  const [friends, progress, rating] = await Promise.all([
    client.social.friends(),
    client.progression.get(),
    client.ranking.rating(),
  ]);
  set({
    friends: friends.ok ? friends.value : [],
    progress: progress.ok ? progress.value : null,
    rating: rating.ok ? rating.value : null,
  });
}

function arenaFor(game: OnlineGame): string {
  return game === 'classic' ? DEFAULT_ONLINE_ARENA.classic : DEFAULT_ONLINE_ARENA.rumble;
}

export const onlineApi = {
  /** The Online screen opened: create the (mock) client and start its clock. */
  async open(): Promise<void> {
    const c = await ensureClient();
    if (!c) return;
    startTimer();
    if (!get().profile) {
      const p = await c.accounts.currentProfile();
      if (p.ok) {
        set({ profile: p.value, step: get().step === 'signIn' ? 'hub' : get().step });
        await refreshAccount();
      }
    }
  },
  /** The Online screen closed (or a local match started): stop the clock; the session stays. */
  close(): void {
    stopTimer();
  },
  async signIn(name?: string): Promise<void> {
    const c = await ensureClient();
    if (!c) return;
    await run(c.accounts.signInGuest(name), async (s) => {
      set({ profile: s.profile, step: 'hub' });
      await refreshAccount();
    });
  },
  async signOut(): Promise<void> {
    if (!client) return;
    await client.accounts.signOut();
    set({ ...initial, ready: true });
  },
  setGame(game: OnlineGame): void {
    set({ game, arenaId: arenaFor(game) });
  },
  async quickMatch(): Promise<void> {
    if (!client) return;
    const { game, arenaId } = get();
    await run(client.matchmaking.enqueue({ game, arenaId }), (q) => set({ queue: q, step: 'queue' }));
  },
  async cancelQueue(): Promise<void> {
    const q = get().queue;
    if (client && q) await client.matchmaking.cancel(q.ticketId);
    set({ queue: null, step: 'hub' });
  },
  async createParty(): Promise<void> {
    if (!client) return;
    await run(client.parties.create(), (party) => set({ party, step: 'party' }));
  },
  async invite(friendId: string): Promise<void> {
    const party = get().party;
    if (!client || !party) return;
    await run(client.parties.invite(party.id, friendId), () => undefined);
  },
  async toggleReadyParty(): Promise<void> {
    const { party, profile } = get();
    if (!client || !party || !profile) return;
    const mine = party.members.find((m) => m.accountId === profile.id);
    await run(client.parties.setReady(party.id, !mine?.ready), (p) => set({ party: p }));
  },
  async leaveParty(): Promise<void> {
    const party = get().party;
    if (client && party) await client.parties.leave(party.id);
    set({ party: null, step: 'hub' });
  },
  /** Party leader: turn the party into a room and open the lobby. */
  async openLobby(): Promise<void> {
    const { party, game, arenaId } = get();
    if (!client || !party) return;
    await run(client.lobbies.createFromParty(party.id, { game, arenaId }), (room) =>
      set({ room, step: 'lobby' }),
    );
  },
  async setLobbyGame(game: OnlineGame): Promise<void> {
    const room = get().room;
    set({ game, arenaId: arenaFor(game) });
    if (!client || !room) return;
    await run(client.lobbies.setSettings(room.id, { game, arenaId: arenaFor(game) }), (r) =>
      set({ room: r }),
    );
  },
  async startReadyCheck(): Promise<void> {
    const room = get().room;
    if (!client || !room) return;
    await run(client.lobbies.startReadyCheck(room.id), (r) => set({ room: r }));
  },
  async toggleReady(): Promise<void> {
    const { room, profile } = get();
    if (!client || !room || !profile) return;
    const mine = room.members.find((m) => m.accountId === profile.id);
    await run(client.lobbies.setReady(room.id, !mine?.ready), (r) => set({ room: r }));
  },
  async switchTeam(): Promise<void> {
    const room = get().room;
    if (!client || !room) return;
    await run(client.teams.requestSwitch(room.id), (r) => set({ room: r }));
  },
  async balanceTeams(): Promise<void> {
    const room = get().room;
    if (!client || !room) return;
    await run(client.teams.balance(room.id), (r) => set({ room: r }));
  },
  async leaveRoom(): Promise<void> {
    const room = get().room;
    if (client && room) await client.lobbies.leave(room.id);
    set({ room: null, countdown: null, match: null, step: get().party ? 'party' : 'hub' });
  },
  /** Leaves a match that has not been played (the server gives your seat to a bot). */
  async leaveMatch(): Promise<void> {
    const m = get().match;
    if (client && m) await client.matches.leave(m.id);
    set({ match: null, room: null, countdown: null, step: 'hub' });
  },
  /** The mock server runs the match on the real simulation; a bot drives your seat. */
  playOnServer(): void {
    const m = get().match;
    const mock = mockOf();
    if (!m || !mock) return;
    mock.control.autopilot(m.id, true);
    mock.control.pause(m.id, false);
    set({ match: { ...m, mode: 'server' } });
  },
  /** The normal local game plays the match; its final state is handed to the mock server afterwards. */
  playLocal(): void {
    const { room, match } = get();
    if (!room || !match) return;
    const restore = useGameStore.getState().settings;
    const rumble = room.game !== 'classic';
    const next: GameSettings = {
      ...restore,
      play: rumble ? 'rumble' : 'classic',
      ...(rumble
        ? {
            rumbleArenaId: room.arenaId,
            rumbleMode: room.game as 'survival' | 'deathmatch' | 'team',
            rumbleCompetitors: 8 as const,
          }
        : { arenaId: room.arenaId, competitors: 4 as const }),
    };
    local = { matchId: match.id, restore, done: false };
    watchMain();
    stopTimer();
    set({ match: { ...match, mode: 'local' } });
    patch({ settings: next }); // in memory only: the saved menu settings are never written
    commands.start();
  },
  /** Reconnect demo, part 1: the connection drops; the server holds your seat for the grace window. */
  simulateDrop(): void {
    const m = get().match;
    const mock = mockOf();
    if (!m || !mock || m.connection !== 'connected') return;
    const r = mock.control.simulateDrop(m.id);
    if (!r.ok) set({ error: describeError(r.error) });
  },
  /** Reconnect demo, part 2: resume with the token; the state is rebuilt from a snapshot plus the input log. */
  async reconnect(): Promise<void> {
    const m = get().match;
    if (!client || !m || !m.descriptor) return;
    const lastAckedTick = m.snapshot?.tick ?? 0;
    await run(
      client.reconnect.resume({ matchId: m.id, resumeToken: m.descriptor.resumeToken, lastAckedTick }),
      (r) =>
        set({
          match: {
            ...m,
            descriptor: r.descriptor,
            snapshot: r.snapshot,
            connection: 'connected',
            graceMs: null,
            resync: { tick: r.snapshot.tick, inputs: r.inputLog.length, hash: r.snapshot.stateHash },
          },
        }),
    );
  },
  async showLeaderboard(boardId = 'global'): Promise<void> {
    if (!client) return;
    const r = await client.ranking.leaderboard(boardId, 8);
    if (r.ok) set({ leaderboard: r.value });
  },
  /** Back to the hub after results. */
  toHub(): void {
    set({
      step: 'hub',
      room: null,
      match: null,
      results: null,
      update: null,
      countdown: null,
      queue: null,
      error: null,
    });
    void refreshAccount();
  },
  dismissError(): void {
    set({ error: null });
  },
  /** Back / Close from the current step; true when the Online screen should close. */
  back(): boolean {
    const step = get().step;
    if (step === 'queue') void onlineApi.cancelQueue();
    else if (step === 'party') void onlineApi.leaveParty();
    else if (step === 'lobby') void onlineApi.leaveRoom();
    else if (step === 'results') onlineApi.toHub();
    else if (step === 'match') void onlineApi.leaveMatch();
    else return true;
    return false;
  },
  /** Test hook: forget everything (the next open creates a fresh client). */
  dispose(): void {
    stopTimer();
    unsubscribe?.();
    unsubMain?.();
    unsubMain = null;
    client?.dispose();
    client = null;
    starting = null;
    local = null;
    set({ ...initial });
  },
};

// ---------------------------------------------------------------- locally played match

function watchMain(): void {
  if (unsubMain) return;
  unsubMain = useGameStore.subscribe((s, prev) => {
    // react to screen changes only (our own settings patches must not re-enter this handler)
    if (!local || s.screen === prev.screen) return;
    if (s.screen === 'results' && !local.done) {
      local.done = true;
      const final = liveMatch()?.state;
      const mock = mockOf();
      patch({ settings: local.restore });
      if (final && mock) {
        const r = mock.control.adoptLocalMatch(local.matchId, final);
        if (!r.ok) set({ error: describeError(r.error) });
      }
    } else if (s.screen === 'playing' && local.done) {
      local = null; // a rematch is an ordinary local match again
    } else if (s.screen === 'title') {
      const wasDone = local.done;
      patch({ settings: local.restore });
      local = null;
      unsubMain?.();
      unsubMain = null;
      // back from the match: come back to the Online screen (its results are already recorded)
      if (!wasDone) set({ match: get().match ? { ...get().match!, mode: null } : null });
      queueMicrotask(() => commands.menuOpen('online'));
    }
  });
}
