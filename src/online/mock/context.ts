/**
 * Shared plumbing of the mock server: injectable clock and seeded rng, fault injection, optional latency, the
 * event bus and the in-memory state every mock service reads and writes. Deterministic: nothing here uses
 * `Math.random`, and time only moves when the injected clock moves (or the caller pumps).
 */
import type { Bot } from '../../ai';
import type { KeyValueStore } from '../../platform';
import type { ProgressionProfile } from '../../progression';
import { createRng, nextInt } from '../../sim';
import type { GameOptions, GameState, Intent, RngHolder } from '../../sim';
import { E } from '../errors';
import type { OnlineError } from '../errors';
import { err } from '../result';
import type { Result } from '../result';
import type { ServerEvent } from '../schema';
import type {
  AccountId,
  ConnectionState,
  Friend,
  FriendRequest,
  Invitation,
  LoggedInput,
  MatchId,
  MatchPhase,
  MatchResults,
  MatchSeat,
  Party,
  PartyId,
  Profile,
  QueueRequest,
  Room,
  RoomId,
  Session,
  TicketId,
} from '../types';
import type { RateLimiter } from '../util';

export interface Clock {
  now(): number;
}
export const systemClock: Clock = { now: () => Date.now() };

/** A clock tests move by hand. */
export function manualClock(start = 1_700_000_000_000): Clock & { advance(ms: number): void; set(ms: number): void } {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => void (t += ms),
    set: (ms) => void (t = ms),
  };
}

export interface MockOptions {
  clock?: Clock;
  /** Seeds ids, names and match seeds: the same seed and the same calls give the same results. */
  seed?: number;
  /** Where the guest account is remembered (this device only). null = memory only. */
  store?: KeyValueStore | null;
  /** Where the (mock) progression profile is kept. null = memory only. */
  progressStore?: KeyValueStore | null;
  /** Simulated network latency per call; off by default. */
  latencyMs?: { min: number; max: number } | null;
  sleep?: (ms: number) => Promise<void>;
  /** How long a dropped player's seat is held. */
  graceMs?: number;
  /** One mock player joins a queue every this many ms. */
  fillIntervalMs?: number;
  /** A mock player readies this long after the ready check starts (stacked per player). */
  botReadyMs?: number;
  /** The "starting" countdown before a match begins. */
  startCountdownMs?: number;
  /** Input rate limit per account. */
  inputsPerSecond?: number;
}

export interface ResolvedOptions {
  clock: Clock;
  seed: number;
  store: KeyValueStore | null;
  progressStore: KeyValueStore | null;
  latencyMs: { min: number; max: number } | null;
  sleep: (ms: number) => Promise<void>;
  graceMs: number;
  fillIntervalMs: number;
  botReadyMs: number;
  startCountdownMs: number;
  inputsPerSecond: number;
}

export function resolveOptions(o: MockOptions): ResolvedOptions {
  return {
    clock: o.clock ?? systemClock,
    seed: o.seed ?? 1,
    store: o.store ?? null,
    progressStore: o.progressStore ?? null,
    latencyMs: o.latencyMs ?? null,
    sleep: o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    graceMs: o.graceMs ?? 30_000,
    fillIntervalMs: o.fillIntervalMs ?? 700,
    botReadyMs: o.botReadyMs ?? 400,
    startCountdownMs: o.startCountdownMs ?? 3000,
    inputsPerSecond: o.inputsPerSecond ?? 90,
  };
}

// ---------------------------------------------------------------- faults

export type ServiceName =
  | 'accounts'
  | 'matchmaking'
  | 'parties'
  | 'teams'
  | 'lobbies'
  | 'matches'
  | 'reconnect'
  | 'progression'
  | 'ranking'
  | 'social';

export interface FaultRule {
  /** '*' matches any service / method. */
  service: ServiceName | '*';
  method: string;
  error: OnlineError;
  /** How many calls fail before the rule is spent (default 1; Infinity = until cleared). */
  times?: number;
}

/** Test hooks: make the next calls fail with a chosen error (serverUnavailable, timeout, roomFull ...). */
export class Faults {
  private rules: (FaultRule & { left: number })[] = [];
  inject(rule: FaultRule): void {
    this.rules.push({ ...rule, left: rule.times ?? 1 });
  }
  clear(): void {
    this.rules = [];
  }
  /** @internal */
  take(service: ServiceName, method: string): OnlineError | null {
    const rule = this.rules.find(
      (r) => r.left > 0 && (r.service === '*' || r.service === service) && (r.method === '*' || r.method === method),
    );
    if (!rule) return null;
    rule.left--;
    return rule.error;
  }
}

// ---------------------------------------------------------------- events

export class Emitter {
  private listeners = new Set<(e: ServerEvent) => void>();
  get size(): number {
    return this.listeners.size;
  }
  subscribe(l: (e: ServerEvent) => void): () => void {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  }
  emit(e: ServerEvent): void {
    for (const l of [...this.listeners]) {
      try {
        l(e);
      } catch {
        /* a listener must never break the server */
      }
    }
  }
  clear(): void {
    this.listeners.clear();
  }
}

// ---------------------------------------------------------------- state

export interface TicketRec {
  id: TicketId;
  request: QueueRequest;
  needed: number;
  createdAt: number;
  state: 'searching' | 'matched' | 'cancelled';
  found: number;
  roomId: RoomId | null;
}

export interface RoomTimers {
  /** Account id -> time a mock member readies. */
  readyAt: Record<AccountId, number>;
  /** When the "starting" countdown ends. */
  startAt: number | null;
  lastCountdownShown: number;
}

export interface SeatLink {
  connected: boolean;
  graceUntil: number | null;
  /** Past the grace window: the seat is played by a bot and cannot be resumed. */
  expired: boolean;
  /** A bot plays this seat for good (a mock player, or a takeover after the grace window / a leave). */
  bot: boolean;
  /** A bot plays this seat while its owner is connected (demo: "let the server play it"). */
  autopilot: boolean;
  resumeToken: string;
  ready: boolean;
}

export interface MatchRec {
  id: MatchId;
  roomId: RoomId;
  options: GameOptions;
  state: GameState;
  seats: MatchSeat[];
  mySeat: number;
  phase: MatchPhase;
  bots: Map<number, Bot>;
  links: SeatLink[];
  /** Held movement per human seat (level-triggered, kept until the next input that carries `move`). */
  held: Map<number, { move: Intent['move']; placeHeld: boolean }>;
  /** One-shot actions waiting for the next tick. */
  oneShots: Map<number, Intent>;
  log: LoggedInput[];
  /** Wall-clock ms the sim was last advanced to, and the fractional tick carry. */
  lastAdvanceAt: number;
  carry: number;
  results: MatchResults | null;
  limiter: RateLimiter;
  /** The match is held (the clock does not move it): the preview pauses it while you choose how to play. */
  paused: boolean;
}

export interface MockState {
  session: Session | null;
  profiles: Map<AccountId, Profile>;
  parties: Map<PartyId, Party>;
  rooms: Map<RoomId, Room>;
  roomTimers: Map<RoomId, RoomTimers>;
  tickets: Map<TicketId, TicketRec>;
  matches: Map<MatchId, MatchRec>;
  friends: Friend[];
  friendRequests: FriendRequest[];
  invitations: Invitation[];
  /** Mock friends that accept an invitation at the given time: invitation id -> { time, party, friend }. */
  pendingJoins: { at: number; partyId: PartyId; friendId: AccountId; kind: 'join' | 'ready' }[];
  progression: { accountId: AccountId; profile: ProgressionProfile } | null;
  connection: ConnectionState;
}

export interface MockCtx {
  opts: ResolvedOptions;
  rng: RngHolder;
  faults: Faults;
  events: Emitter;
  state: MockState;
  now(): number;
  /** A new opaque id such as `room-3f9a1c`. */
  id(prefix: string): string;
  /** Wraps one service method: fault injection, optional latency, never throws. */
  call<T>(service: ServiceName, method: string, fn: () => Result<T> | Promise<Result<T>>): Promise<Result<T>>;
  /** The signed-in profile, or `unauthenticated`. */
  user(): Result<Profile>;
}

export function createContext(options: MockOptions = {}): MockCtx {
  const opts = resolveOptions(options);
  const rng = createRng(opts.seed);
  const faults = new Faults();
  const state: MockState = {
    session: null,
    profiles: new Map(),
    parties: new Map(),
    rooms: new Map(),
    roomTimers: new Map(),
    tickets: new Map(),
    matches: new Map(),
    friends: [],
    friendRequests: [],
    invitations: [],
    pendingJoins: [],
    progression: null,
    connection: 'connected',
  };
  const ctx: MockCtx = {
    opts,
    rng,
    faults,
    events: new Emitter(),
    state,
    now: () => opts.clock.now(),
    id(prefix) {
      let s = '';
      for (let i = 0; i < 6; i++) s += nextInt(rng, 16).toString(16);
      return `${prefix}-${s}`;
    },
    async call(service, method, fn) {
      const fault = faults.take(service, method);
      if (opts.latencyMs) {
        const { min, max } = opts.latencyMs;
        await opts.sleep(min + nextInt(rng, Math.max(1, max - min + 1)));
      }
      if (fault) return err(fault);
      try {
        return await fn();
      } catch {
        return err(E.internal());
      }
    },
    user() {
      const s = state.session;
      if (!s) return err(E.unauthenticated());
      if (s.token.expiresAt <= opts.clock.now()) return err(E.unauthenticated('Your session has expired.'));
      return { ok: true, value: s.profile };
    },
  };
  return ctx;
}

// ---------------------------------------------------------------- publishers

export const publishParty = (ctx: MockCtx, party: Party): void =>
  ctx.events.emit({ type: 'party.update', party: structuredClone(party) });

export const publishRoom = (ctx: MockCtx, room: Room): void =>
  ctx.events.emit({ type: 'room.update', room: structuredClone(room) });
