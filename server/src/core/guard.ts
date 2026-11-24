/**
 * Admission control and abuse limits of one server process (decision FU2S-C3). Pure: time and the event-loop reading are
 * injected, so every rule is unit-testable. The Colyseus glue (`app.ts`, `RumbleRoom.ts`) only asks it questions.
 *
 *  - Who: the temporary guest session id a page sends (`gid`, random, in memory) plus the client address as resolved by
 *    `clientIp.ts`. Per-player limits key on the guest id; the address only carries a generous ceiling (carrier-grade NAT
 *    puts many honest players behind one address) and the counters for requests that carry no guest id.
 *  - Rooms: a global cap, a cap on rooms owned per guest / per address, and a cap on rooms counting down or playing.
 *  - Matches: a cost budget (`roomCost`, percent of one core) and a FIFO start queue, so N rooms of 31 bots cannot starve
 *    the event loop and nobody is overtaken; refused starts WAIT (the room stays in its lobby) and are told so.
 *  - Failed joins by code are limited separately (code guessing), whoever sends them.
 */
import { roomCost } from './limits';
import type { BucketSpec, LimitsConfig } from './limits';
import type { BusyCode } from '../../../src/net/protocol';

/** A refusal that carries what the player should be told. */
export class BusyError extends Error {
  constructor(
    readonly busy: BusyCode,
    readonly retryAfterSec: number,
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = 'BusyError';
  }
}

export interface Who {
  /** `clientIp.ipKey` of the peer. */
  ip: string;
  /** The guest session id, when the client sent a well-formed one. */
  gid: string | null;
  /** Server-internal call (tests, `matchMaker.create` from code): exempt from per-client limits, not from global caps. */
  internal?: boolean;
}

/** A token bucket: `burst` tokens, refilled at `perMin` per minute. Time is injected. */
export class TokenBucket {
  private tokens: number;
  private at: number;
  constructor(
    private readonly spec: BucketSpec,
    now: number,
  ) {
    this.tokens = spec.burst;
    this.at = now;
  }

  private refill(now: number): void {
    const dt = Math.max(0, now - this.at);
    this.at = now;
    this.tokens = Math.min(this.spec.burst, this.tokens + (dt / 60_000) * this.spec.perMin);
  }

  /** Takes `n` tokens if there are enough. */
  take(now: number, n = 1): boolean {
    this.refill(now);
    if (this.tokens + 1e-9 < n) return false;
    this.tokens -= n;
    return true;
  }

  /** Whether `n` tokens exist right now (nothing is taken). */
  has(now: number, n = 1): boolean {
    this.refill(now);
    return this.tokens + 1e-9 >= n;
  }

  /** Seconds until `n` tokens exist. */
  waitSec(now: number, n = 1): number {
    this.refill(now);
    return Math.max(1, Math.ceil(((n - this.tokens) / this.spec.perMin) * 60));
  }

  /** Full and unused: safe to forget. */
  idle(now: number): boolean {
    this.refill(now);
    return this.tokens >= this.spec.burst - 1e-9;
  }
}

/** One bucket per key, bounded: past `maxKeys` the full (idle) ones are dropped first, then the oldest. */
export class KeyedBuckets {
  private readonly map = new Map<string, TokenBucket>();
  constructor(
    private readonly spec: BucketSpec,
    private readonly maxKeys: number,
  ) {}

  get size(): number {
    return this.map.size;
  }

  private bucket(key: string, now: number): TokenBucket {
    let b = this.map.get(key);
    if (!b) {
      if (this.map.size >= this.maxKeys) this.sweep(now);
      b = new TokenBucket(this.spec, now);
      this.map.set(key, b);
    } else {
      // keep recently used keys last (Map keeps insertion order): the oldest is first to go
      this.map.delete(key);
      this.map.set(key, b);
    }
    return b;
  }

  take(key: string, now: number, n = 1): boolean {
    return this.bucket(key, now).take(now, n);
  }

  has(key: string, now: number, n = 1): boolean {
    return this.bucket(key, now).has(now, n);
  }

  waitSec(key: string, now: number, n = 1): number {
    return this.bucket(key, now).waitSec(now, n);
  }

  sweep(now: number): void {
    for (const [k, b] of this.map) if (b.idle(now)) this.map.delete(k);
    // still over the bound (a flood of distinct keys, all busy): forget the least recently used quarter
    if (this.map.size >= this.maxKeys) {
      let drop = Math.ceil(this.maxKeys / 4);
      for (const k of this.map.keys()) {
        if (drop-- <= 0) break;
        this.map.delete(k);
      }
    }
  }
}

export type Matchmake = 'create' | 'joinOrCreate' | 'join' | 'joinById' | 'reconnect';

export interface StartDecision {
  ok: boolean;
  /** Why not (for the log and the room's notice). */
  reason?: string;
  /** Position in the start queue (1 = next), when waiting. */
  position?: number;
  retryAfterSec?: number;
}

interface PlayingRoom {
  cost: number;
}

export interface GuardSnapshot {
  rooms: number;
  playingRooms: number;
  costInUse: number;
  cpuBudget: number;
  waitingToStart: number;
  connections: number;
  trackedKeys: number;
  refused: Record<string, number>;
}

export class Guard {
  private readonly rooms = new Map<string, { guest: string | null; ip: string; at: number }>();
  private readonly playing = new Map<string, PlayingRoom>();
  /** Rooms that asked to start and did not get a slot, in arrival order. */
  private readonly waiting = new Map<string, number>();
  private readonly guestRooms = new Map<string, Set<string>>();
  private readonly ipRooms = new Map<string, Set<string>>();
  private readonly conns = new Map<string, number>();
  private connections = 0;
  private readonly guestCreate: KeyedBuckets;
  private readonly guestJoin: KeyedBuckets;
  private readonly guestFail: KeyedBuckets;
  private readonly ipCreate: KeyedBuckets;
  private readonly ipJoin: KeyedBuckets;
  private readonly ipFail: KeyedBuckets;
  private readonly ipUpgrade: KeyedBuckets;
  readonly refused: Record<string, number> = {};

  constructor(
    readonly cfg: LimitsConfig,
    private readonly now: () => number = () => performance.now(),
    /** Recent event-loop p99 delay in ms (0 when unknown). */
    private readonly loopLagMs: () => number = () => 0,
    private readonly jitter: () => number = Math.random,
  ) {
    const k = cfg.maxTrackedKeys;
    this.guestCreate = new KeyedBuckets(cfg.guestCreate, k);
    this.guestJoin = new KeyedBuckets(cfg.guestJoin, k);
    this.guestFail = new KeyedBuckets(cfg.guestJoinFail, k);
    this.ipCreate = new KeyedBuckets(cfg.ipCreate, k);
    this.ipJoin = new KeyedBuckets(cfg.ipJoin, k);
    this.ipFail = new KeyedBuckets(cfg.ipJoinFail, k);
    this.ipUpgrade = new KeyedBuckets(cfg.ipUpgrade, k);
  }

  // ---------------------------------------------------------------- refusals

  private count(kind: string): void {
    this.refused[kind] = (this.refused[kind] ?? 0) + 1;
  }

  /** Capacity refusal with a jittered retry hint (so a crowd refused together does not return together). */
  private busy(kind: string, text: string, baseSec = this.cfg.busyRetrySec): BusyError {
    this.count(kind);
    const retry = Math.ceil(baseSec * (1 + 0.25 * this.jitter()));
    return new BusyError('server_busy', retry, kind, text);
  }

  private limited(kind: string, waitSec: number, text: string): BusyError {
    this.count(kind);
    return new BusyError('rate_limited', waitSec, kind, text);
  }

  private guestKey = (w: Who): string => (w.gid ? `g:${w.gid}` : `i:${w.ip}`);

  // ---------------------------------------------------------------- matchmaking requests

  /**
   * First gate of every matchmaking request (HTTP). A `create` is charged here; a `joinOrCreate` only when it finds no
   * room to join (the wrapper then calls `checkCreate`). The global caps are enforced again where the room is built.
   */
  checkMatchmake(kind: Matchmake, who: Who): void {
    if (who.internal) return;
    const t = this.now();
    const g = this.guestKey(who);
    if (kind === 'reconnect') {
      // a reconnection is a single-use secret: an honest one is rare (the browser's own reconnect uses the socket), so only
      // the failed-attempt buckets apply (token guessing)
      this.requireFailBudget(who, g, t);
      return;
    }
    if (kind === 'create') {
      this.checkCreate(who);
      return;
    }
    if (!this.ipJoin.take(who.ip, t))
      throw this.limited(
        'ip_join',
        this.ipJoin.waitSec(who.ip, t),
        'Too many requests from this connection. Try again in a moment.',
      );
    if (!this.guestJoin.take(g, t))
      throw this.limited(
        'guest_join',
        this.guestJoin.waitSec(g, t),
        'You are asking too quickly. Wait a moment and try again.',
      );
    // joinById with a bad code: a failed attempt is charged by `joinFailed`; here only refuse when already out
    if (kind === 'joinById') this.requireFailBudget(who, g, t);
  }

  private requireFailBudget(who: Who, g: string, t: number): void {
    if (!this.guestFail.has(g, t))
      throw this.limited(
        'guest_join_fail',
        this.guestFail.waitSec(g, t),
        'Too many wrong room codes. Wait a moment and try again.',
      );
    if (!this.ipFail.has(who.ip, t))
      throw this.limited(
        'ip_join_fail',
        this.ipFail.waitSec(who.ip, t),
        'Too many wrong room codes from this connection. Try again in a moment.',
      );
  }

  /**
   * About to create a room for this player (a `create`, or a quick play that found no room to join): per-guest and
   * per-address creation rates, then a free room slot.
   */
  checkCreate(who: Who): void {
    if (who.internal) return;
    const t = this.now();
    const g = this.guestKey(who);
    if (!this.ipCreate.take(who.ip, t))
      throw this.limited(
        'ip_create',
        this.ipCreate.waitSec(who.ip, t),
        'Too many rooms were opened from this connection. Try again in a moment.',
      );
    if (!this.guestCreate.take(g, t))
      throw this.limited(
        'guest_create',
        this.guestCreate.waitSec(g, t),
        'You are opening rooms too quickly. Wait a moment and try again.',
      );
    this.requireRoomSlot(who);
  }

  /** A join by code that did not find an open room: counts against the guard's code-guessing buckets. */
  joinFailed(who: Who): void {
    if (who.internal) return;
    const t = this.now();
    this.guestFail.take(this.guestKey(who), t);
    this.ipFail.take(who.ip, t);
  }

  /** A WebSocket upgrade from this address (per-address backstop only). */
  checkUpgrade(ip: string): void {
    const t = this.now();
    if (!this.ipUpgrade.take(ip, t))
      throw this.limited(
        'ip_upgrade',
        this.ipUpgrade.waitSec(ip, t),
        'Too many connections from this address. Try again in a moment.',
      );
  }

  // ---------------------------------------------------------------- rooms

  private requireRoomSlot(who: Who): void {
    if (this.rooms.size >= this.cfg.maxRooms)
      throw this.busy('rooms_full', 'The servers are full right now. Try again in a little while.');
    if (who.internal) return;
    const g = who.gid;
    if (g && (this.guestRooms.get(g)?.size ?? 0) >= this.cfg.maxRoomsPerGuest)
      throw this.limited(
        'guest_rooms',
        this.cfg.busyRetrySec,
        'You already have rooms open. Leave one before opening another.',
      );
    if ((this.ipRooms.get(who.ip)?.size ?? 0) >= this.cfg.maxRoomsPerIp)
      throw this.busy(
        'ip_rooms',
        'Too many rooms are open from this connection. Try again in a little while.',
      );
  }

  /** A room is being created (called from `onCreate`, before it exists for anybody). Throws when it may not be. */
  roomCreating(roomId: string, who: Who): void {
    this.requireRoomSlot(who);
    this.rooms.set(roomId, { guest: who.gid, ip: who.ip, at: this.now() });
    if (who.gid && !who.internal) this.add(this.guestRooms, who.gid, roomId);
    if (!who.internal) this.add(this.ipRooms, who.ip, roomId);
  }

  private add(m: Map<string, Set<string>>, key: string, id: string): void {
    let s = m.get(key);
    if (!s) m.set(key, (s = new Set()));
    s.add(id);
  }

  private remove(m: Map<string, Set<string>>, key: string | null, id: string): void {
    if (key === null) return;
    const s = m.get(key);
    if (!s) return;
    s.delete(id);
    if (s.size === 0) m.delete(key);
  }

  roomDisposed(roomId: string): void {
    const r = this.rooms.get(roomId);
    this.rooms.delete(roomId);
    this.playing.delete(roomId);
    this.waiting.delete(roomId);
    if (r) {
      this.remove(this.guestRooms, r.guest, roomId);
      this.remove(this.ipRooms, r.ip, roomId);
    }
  }

  // ---------------------------------------------------------------- match starts (the CPU budget)

  get costInUse(): number {
    let c = 0;
    for (const p of this.playing.values()) c += p.cost;
    return c;
  }

  /**
   * A room's countdown ended and it wants to run its match with `bots` server bots. Granted when the room is first in the
   * queue, a playing slot is free, the estimated cost fits the budget and the event loop is not already struggling.
   * Otherwise it WAITS (its lobby stays as it is) and is told its place. A room that is already playing is always ok.
   */
  requestStart(roomId: string, bots: number): StartDecision {
    if (this.playing.has(roomId)) return { ok: true };
    const t = this.now();
    if (!this.waiting.has(roomId)) this.waiting.set(roomId, t);
    const queue = [...this.waiting.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
    const position = queue.indexOf(roomId) + 1;
    const cost = roomCost(bots);
    const retryAfterSec = Math.ceil(this.cfg.busyRetrySec / 2);
    if (position > 1) return { ok: false, reason: 'queued', position, retryAfterSec };
    if (this.playing.size >= this.cfg.maxPlayingRooms)
      return { ok: false, reason: 'playing_rooms_full', position, retryAfterSec };
    // an empty process can always run one room, whatever the budget says (a tiny budget must not deadlock honest play)
    if (this.playing.size > 0 && this.costInUse + cost > this.cfg.cpuBudget)
      return { ok: false, reason: 'cpu_budget', position, retryAfterSec };
    if (this.playing.size > 0 && this.loopLagMs() > this.cfg.startLoopLagMs)
      return { ok: false, reason: 'loop_lag', position, retryAfterSec };
    this.waiting.delete(roomId);
    this.playing.set(roomId, { cost });
    return { ok: true };
  }

  /** How long this room has been waiting for a slot, in seconds (0 when it is not waiting). */
  waitedSec(roomId: string): number {
    const since = this.waiting.get(roomId);
    return since === undefined ? 0 : (this.now() - since) / 1000;
  }

  /** The room gave up waiting (or went back to its lobby): leave the queue. */
  cancelStart(roomId: string): void {
    this.waiting.delete(roomId);
  }

  /** A match ended (or its room is closing): its cost is free again. */
  matchEnded(roomId: string): void {
    this.playing.delete(roomId);
    this.waiting.delete(roomId);
  }

  /** Busy error for a refused start, in the words the room tells its players. */
  startBusy(d: StartDecision): BusyError {
    this.count(`start_${d.reason ?? 'refused'}`);
    return new BusyError(
      'server_busy',
      d.retryAfterSec ?? this.cfg.busyRetrySec,
      d.reason ?? 'busy',
      'The servers are busy. Your match starts as soon as a slot is free.',
    );
  }

  // ---------------------------------------------------------------- connections

  /** A human connection is joining a room. Throws `server_busy` over the cap. */
  connectionOpened(who: Who): void {
    if (this.connections >= this.cfg.maxConnections)
      throw this.busy('connections_full', 'The servers are full right now. Try again in a little while.');
    this.connections++;
    this.conns.set(who.ip, (this.conns.get(who.ip) ?? 0) + 1);
  }

  connectionClosed(who: Who): void {
    if (this.connections > 0) this.connections--;
    const n = (this.conns.get(who.ip) ?? 0) - 1;
    if (n <= 0) this.conns.delete(who.ip);
    else this.conns.set(who.ip, n);
  }

  snapshot(): GuardSnapshot {
    return {
      rooms: this.rooms.size,
      playingRooms: this.playing.size,
      costInUse: Math.round(this.costInUse * 10) / 10,
      cpuBudget: this.cfg.cpuBudget,
      waitingToStart: this.waiting.size,
      connections: this.connections,
      trackedKeys:
        this.guestCreate.size +
        this.guestJoin.size +
        this.guestFail.size +
        this.ipCreate.size +
        this.ipJoin.size +
        this.ipFail.size +
        this.ipUpgrade.size,
      refused: { ...this.refused },
    };
  }
}
