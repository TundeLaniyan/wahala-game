/**
 * The Colyseus room of one City Rumble lobby + match.
 *
 * Colyseus is used for what it is good at: matchmaking, room codes, WebSocket sessions, reconnection tokens and room
 * lifetime. There is NO Colyseus state: game state travels only as our binary frames (`MSG.keyframe` / `MSG.frames`,
 * `deflate-raw(pack(...))`, compressed once per message for everybody). Control messages are small plain objects.
 * The authoritative simulation is `RumbleMatch`, stepped by our own fixed 60 Hz `TickLoop` (not Colyseus' patch rate).
 *
 * What a client may send is exactly: input (`in`), `ping`, `resync`, `ready`, `start` / `rematch` / `settings` (host
 * only). Anything else is counted and ignored; a client that sends too many invalid messages is disconnected.
 */
import { createHash, randomInt } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { CloseCode, ErrorCode, Room, ServerError, matchMaker } from '@colyseus/core';
import type { Client } from '@colyseus/core';
import { pack } from '../../../src/net/pack';
import { CLOSE, MATCH_SEATS, MAX_HUMANS, MSG } from '../../../src/net/protocol';
import type { NoticeMsg, PongMsg, ResultsMsg, WelcomeMsg } from '../../../src/net/protocol';
import {
  validateEmptyMsg,
  validateInput,
  validatePing,
  validateReady,
  validateSettingsMsg,
} from '../../../src/net/protocol';
import { Lobby } from '../core/Lobby';
import type { LobbyResult } from '../core/Lobby';
import { RoomMetrics } from '../core/metrics';
import type { MetricsRegistry, RoomMetricsSnapshot } from '../core/metrics';
import {
  DEFAULT_RUNTIME,
  makeRoomCode,
  parseJoinOptions,
  parseRoomOptions,
  parseSettingsPatch,
} from '../core/options';
import type { RuntimeConfig } from '../core/options';
import { RumbleMatch } from '../core/RumbleMatch';
import { TickLoop } from '../core/TickLoop';

/** More than this many invalid messages inside the window gets the client disconnected. */
export const INVALID_LIMIT = 20;
export const INVALID_WINDOW_MS = 10_000;
/** A client may ask for a fresh keyframe at most this often. */
export const RESYNC_MIN_INTERVAL_MS = 1000;
/** Hard backstop on any client's message rate (a real client sends inputs on change plus one ping a second). */
const MAX_MESSAGES_PER_SECOND = 120;
/** A finished match keeps its room this long waiting for a rematch. */
const RESULTS_LINGER_MS = 10 * 60 * 1000;
const CODE_ATTEMPTS = 64;

interface Peer {
  client: Client;
  seat: number | null;
  bytesOut: number;
  messagesIn: number;
  invalid: number;
  invalidAt: number[];
  lastResyncAt: number;
  kicked: boolean;
}

export interface RoomDeps {
  runtime: RuntimeConfig;
  metrics: MetricsRegistry;
  /** Room codes currently in use by this process (checked before the matchmaker's own lookup). */
  usedCodes: Set<string>;
  log?: (message: string) => void;
}

/** Only an unexpected drop may reconnect: our own kicks, consented leaves and server shutdown (4000 range) may not. */
export function isReconnectableClose(code: number | undefined): boolean {
  if (code === undefined) return true;
  if (code === CloseCode.MAY_TRY_RECONNECT) return true;
  return !(code >= 4000 && code <= 4999);
}

export class RumbleRoom extends Room {
  /** Replaced per server by `createRumbleRoomClass`. */
  protected deps: RoomDeps | null = null;

  private rt: RuntimeConfig = DEFAULT_RUNTIME;
  private code = '';
  private lobby!: Lobby;
  private match: RumbleMatch | null = null;
  private loop: TickLoop | null = null;
  private readonly peers = new Map<string, Peer>();
  private readonly metrics = new RoomMetrics();
  private housekeeping: NodeJS.Timeout | null = null;
  private lingerTimer: NodeJS.Timeout | null = null;
  private lastResults: ResultsMsg | null = null;
  private matchCount = 0;
  private disposed = false;

  /** Validates join options before a seat is reserved (and before an empty room could be created for nothing). */
  static override async onAuth(_token: string, options: unknown): Promise<unknown> {
    const parsed = parseJoinOptions(options);
    if (!parsed.ok) throw new ServerError(ErrorCode.APPLICATION_ERROR, parsed.error);
    return parsed.value;
  }

  // ---------------------------------------------------------------- lifecycle

  override async onCreate(options: unknown): Promise<void> {
    const deps = this.deps;
    if (!deps) throw new ServerError(ErrorCode.APPLICATION_ERROR, 'room is not configured');
    this.rt = deps.runtime;
    const parsed = parseRoomOptions(options, this.rt);
    if (!parsed.ok) throw new ServerError(ErrorCode.APPLICATION_ERROR, parsed.error);
    const opts = parsed.value;

    this.code = await this.pickCode(deps);
    this.roomId = this.code;
    this.maxClients = MAX_HUMANS;
    this.autoDispose = true;
    this.patchRate = null; // no Colyseus state: nothing to patch
    this.maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND;
    if (opts.private) await this.setPrivate(true);

    this.lobby = new Lobby(
      {
        maxHumans: MAX_HUMANS,
        seats: MATCH_SEATS,
        isPrivate: opts.private,
        autoStartMs: opts.autoStartSec * 1000,
        countdownMs: this.rt.countdownMs,
        settings: opts.settings,
      },
      () => performance.now(),
    );
    this.registerMessages();
    this.housekeeping = setInterval(() => this.lobbyTick(), 50);
    deps.metrics.register(this.code, () => this.snapshot());
    deps.log?.(`room ${this.code} created (${opts.private ? 'private' : 'public'})`);
  }

  private async pickCode(deps: RoomDeps): Promise<string> {
    for (let i = 0; i < CODE_ATTEMPTS; i++) {
      const code = makeRoomCode((n) => randomInt(n));
      if (deps.usedCodes.has(code)) continue;
      deps.usedCodes.add(code); // reserved synchronously: two rooms created at once cannot pick the same code
      if (matchMaker.getLocalRoomById(code) === undefined && !(await matchMaker.getRoomById(code)))
        return code;
      deps.usedCodes.delete(code);
    }
    throw new ServerError(ErrorCode.APPLICATION_ERROR, 'could not allocate a room code');
  }

  override onJoin(client: Client, options: unknown): void {
    const parsed = parseJoinOptions(options);
    if (!parsed.ok) throw new ServerError(ErrorCode.APPLICATION_ERROR, parsed.error);
    const joined = this.lobby.join(client.sessionId, parsed.value);
    if (!joined.ok) throw new ServerError(ErrorCode.APPLICATION_ERROR, joined.message);
    this.peers.set(client.sessionId, {
      client,
      seat: null,
      bytesOut: 0,
      messagesIn: 0,
      invalid: 0,
      invalidAt: [],
      lastResyncAt: -Infinity,
      kicked: false,
    });
    this.sendWelcome(this.peers.get(client.sessionId)!);
    this.broadcastLobby();
  }

  /** An unexpected drop (0.18: `onDrop`). A playing human's seat is autopiloted while we wait for them to come back. */
  override async onDrop(client: Client, code?: number): Promise<void> {
    const peer = this.peers.get(client.sessionId);
    const match = this.match;
    if (!peer || peer.kicked || !match || peer.seat === null) return; // onLeave follows
    if (this.lobby.phase !== 'playing' || match.ended || !isReconnectableClose(code)) return;
    match.disconnect(peer.seat);
    this.lobby.setConnected(client.sessionId, false);
    this.broadcastLobby();
    try {
      await this.allowReconnection(client, this.rt.reconnectSeconds);
    } catch {
      // the window expired (or the room is closing): Colyseus calls onLeave next, which gives the seat to a bot
    }
  }

  /** The dropped client came back on a new socket (same sessionId). */
  override onReconnect(client: Client): void {
    const peer = this.peers.get(client.sessionId);
    if (!peer) return;
    peer.client = client;
    this.metrics.reconnections++;
    if (peer.seat !== null) this.match?.connect(peer.seat);
    this.lobby.setConnected(client.sessionId, true);
    this.broadcastLobby();
    this.sendWelcome(peer);
    if (this.match && peer.seat !== null) this.sendKeyframe(peer);
    if (this.lobby.phase === 'results' && this.lastResults) this.sendTo(peer, MSG.results, this.lastResults);
  }

  /** The client is gone for good: left on purpose, or its reconnection window expired. */
  override onLeave(client: Client): void {
    const peer = this.peers.get(client.sessionId);
    if (!peer) return;
    this.peers.delete(client.sessionId);
    if (peer.seat !== null && this.match && this.lobby.phase === 'playing')
      this.match.replaceWithBot(peer.seat);
    this.lobby.leave(client.sessionId);
    if (!this.disposed) this.broadcastLobby();
  }

  override onDispose(): void {
    this.disposed = true;
    this.loop?.stop();
    if (this.housekeeping) clearInterval(this.housekeeping);
    if (this.lingerTimer) clearTimeout(this.lingerTimer);
    this.housekeeping = this.lingerTimer = null;
    this.deps?.metrics.unregister(this.code);
    this.deps?.usedCodes.delete(this.code);
    this.deps?.log?.(`room ${this.code} disposed`);
  }

  // ---------------------------------------------------------------- messages in

  private registerMessages(): void {
    this.onMessage(MSG.input, (client, raw) => {
      const peer = this.count(client);
      if (!peer) return;
      const parsed = validateInput(raw);
      if (!parsed.ok) return this.invalid(peer);
      const match = this.match;
      if (!match || this.lobby.phase !== 'playing' || peer.seat === null) return; // not in a match: nothing to apply
      if (match.input(peer.seat, parsed.value, Date.now()) === 'rateLimited') this.invalid(peer);
    });

    this.onMessage(MSG.ping, (client, raw) => {
      const peer = this.count(client);
      if (!peer) return;
      const ping = validatePing(raw);
      if (!ping) return this.invalid(peer);
      const pong: PongMsg = { c: ping.c, t: this.match?.state.tick ?? 0 };
      this.sendTo(peer, MSG.pong, pong);
    });

    this.onMessage(MSG.resync, (client, raw) => {
      const peer = this.count(client);
      if (!peer) return;
      if (!validateEmptyMsg(raw)) return this.invalid(peer);
      if (!this.match || peer.seat === null) return;
      const now = performance.now();
      if (now - peer.lastResyncAt < RESYNC_MIN_INTERVAL_MS) {
        this.metrics.resyncsLimited++;
        return;
      }
      peer.lastResyncAt = now;
      this.metrics.resyncsServed++;
      this.sendKeyframe(peer);
    });

    this.onMessage(MSG.ready, (client, raw) => {
      const peer = this.count(client);
      if (!peer) return;
      const ready = validateReady(raw);
      if (!ready) return this.invalid(peer);
      this.lobbyAction(peer, this.lobby.setReady(client.sessionId, ready.ready));
    });

    this.onMessage(MSG.start, (client, raw) => {
      const peer = this.count(client);
      if (!peer) return;
      if (!validateEmptyMsg(raw)) return this.invalid(peer);
      this.lobbyAction(peer, this.lobby.start(client.sessionId));
    });

    this.onMessage(MSG.rematch, (client, raw) => {
      const peer = this.count(client);
      if (!peer) return;
      if (!validateEmptyMsg(raw)) return this.invalid(peer);
      const res = this.lobby.rematch(client.sessionId);
      if (res.ok) this.afterRematch();
      this.lobbyAction(peer, res);
    });

    this.onMessage(MSG.settings, (client, raw) => {
      const peer = this.count(client);
      if (!peer) return;
      const msg = validateSettingsMsg(raw);
      if (!msg) return this.invalid(peer);
      const patch = parseSettingsPatch(msg, this.rt);
      if (!patch.ok) return this.reject(peer, 'bad_settings', patch.error);
      this.lobbyAction(peer, this.lobby.updateSettings(client.sessionId, patch.value));
    });

    // Anything else (unknown type, a position, a kill, a team, a seed ...) has no handler: counted and ignored.
    this.onMessage('*', (client) => {
      const peer = this.count(client);
      if (!peer) return;
      this.metrics.unknownMessages++;
      this.invalid(peer);
    });
  }

  private count(client: Client): Peer | undefined {
    const peer = this.peers.get(client.sessionId);
    if (!peer) return undefined;
    peer.messagesIn++;
    this.metrics.messagesIn++;
    return peer;
  }

  /** Counts an invalid message; a client over the limit is disconnected (not allowed to reconnect). */
  private invalid(peer: Peer): void {
    this.metrics.invalidMessages++;
    peer.invalid++;
    const now = performance.now();
    peer.invalidAt.push(now);
    while (peer.invalidAt.length > 0 && now - peer.invalidAt[0]! > INVALID_WINDOW_MS) peer.invalidAt.shift();
    if (peer.invalidAt.length > INVALID_LIMIT && !peer.kicked) {
      peer.kicked = true;
      this.metrics.kicks++;
      this.deps?.log?.(`room ${this.code}: kicked a client for too many invalid messages`);
      this.sendTo(peer, MSG.notice, {
        code: 'kicked',
        message: 'too many invalid messages',
      } satisfies NoticeMsg);
      peer.client.leave(CLOSE.abuse, 'too many invalid messages');
    }
  }

  /** A well-formed but refused request (not the host, wrong phase ...): tell the sender, count it. */
  private reject(peer: Peer, code: string, message: string): void {
    this.metrics.rejectedActions++;
    this.sendTo(peer, MSG.notice, { code, message } satisfies NoticeMsg);
  }

  private lobbyAction(peer: Peer, res: LobbyResult): void {
    if (!res.ok) return this.reject(peer, res.code, res.message);
    this.broadcastLobby();
  }

  // ---------------------------------------------------------------- lobby -> match

  private lobbyTick(): void {
    if (this.disposed) return;
    const r = this.lobby.tick();
    if (r.begin) this.beginMatch();
    else if (r.changed) this.broadcastLobby();
  }

  private afterRematch(): void {
    this.match = null;
    this.lastResults = null;
    for (const p of this.peers.values()) p.seat = null;
    if (this.lingerTimer) clearTimeout(this.lingerTimer);
    this.lingerTimer = null;
    void this.unlock();
  }

  private beginMatch(): void {
    const seats = this.lobby.begin();
    const s = this.lobby.settings;
    this.matchCount++;
    let match: RumbleMatch;
    try {
      match = new RumbleMatch({
        matchId: `${this.code}-${this.matchCount}`,
        arenaId: s.arenaId,
        game: s.game,
        durationSec: s.durationSec,
        seats,
        seed: randomInt(1, 2 ** 31 - 1),
      });
    } catch (e) {
      this.deps?.log?.(`room ${this.code}: could not build the match: ${String(e)}`);
      this.lobby.abort();
      for (const p of this.peers.values()) {
        this.sendTo(p, MSG.notice, {
          code: 'match_failed',
          message: 'could not start the match',
        } satisfies NoticeMsg);
      }
      this.broadcastLobby();
      return;
    }
    this.match = match;
    for (const m of this.lobby.members) {
      const peer = this.peers.get(m.sessionId);
      if (!peer || m.seat === null) continue;
      peer.seat = m.seat;
      match.connect(m.seat);
    }
    void this.lock();
    this.metrics.matchesStarted++;
    this.broadcastLobby();
    for (const peer of this.peers.values()) {
      this.sendWelcome(peer);
      this.sendKeyframe(peer);
    }
    this.loop = new TickLoop({
      stepMs: 1000 / this.rt.tickRate,
      maxCatchUp: this.rt.maxCatchUpTicks,
      onTick: () => this.tick(),
      onError: (e) => this.deps?.log?.(`room ${this.code}: tick failed: ${String(e)}`),
    });
    this.loop.start();
  }

  /** One 60 Hz tick: step, ship the frames due, and finish the match when the simulation says so. */
  private tick(): boolean {
    const match = this.match!;
    const t0 = performance.now();
    match.step();
    const t1 = performance.now();
    this.metrics.stepMs.push(t1 - t0);
    const frames = match.flush();
    if (frames) {
      this.sendFrames(frames);
      this.metrics.broadcastMs.push(performance.now() - t1);
    }
    if (!match.ended) return true;
    this.finishMatch(match);
    return false;
  }

  private finishMatch(match: RumbleMatch): void {
    const last = match.flush(true);
    if (last) this.sendFrames(last);
    const results = match.results();
    this.lastResults = results;
    for (const peer of this.peers.values()) this.sendTo(peer, MSG.results, results);
    this.lobby.endMatch();
    this.metrics.matchesFinished++;
    this.broadcastLobby();
    this.lingerTimer = setTimeout(() => void this.disconnect(), RESULTS_LINGER_MS);
  }

  // ---------------------------------------------------------------- messages out

  /** Compressed once, sent to every client of the room. */
  private sendFrames(raw: Uint8Array): void {
    const z = deflateRawSync(raw);
    this.broadcastBytes(MSG.frames, z, {});
    this.metrics.framesMessages++;
    this.metrics.framesBytesPerClient += z.length;
    this.metrics.framesBytesRaw += raw.length;
    for (const peer of this.peers.values()) {
      peer.bytesOut += z.length;
      this.metrics.bytesSentTotal += z.length;
    }
  }

  private sendKeyframe(peer: Peer): void {
    const match = this.match;
    if (!match) return;
    const z = deflateRawSync(pack(match.keyframe())); // packed at once: the keyframe IS the live mirror
    peer.client.sendBytes(MSG.keyframe, z);
    peer.bytesOut += z.length;
    this.metrics.bytesSentTotal += z.length;
    this.metrics.keyframesSent++;
    this.metrics.keyframeBytes += z.length;
  }

  private sendWelcome(peer: Peer): void {
    const welcome: WelcomeMsg = {
      descriptor: peer.seat !== null && this.match ? this.match.descriptor : null,
      seat: peer.seat,
      roomCode: this.code,
    };
    this.sendTo(peer, MSG.welcome, welcome);
  }

  private sendTo(peer: Peer, type: string, message: unknown): void {
    peer.client.send(type, message);
  }

  private broadcastLobby(): void {
    for (const peer of this.peers.values()) {
      this.sendTo(peer, MSG.lobby, this.lobby.view(this.code, peer.client.sessionId));
    }
  }

  // ---------------------------------------------------------------- metrics

  private snapshot(): RoomMetricsSnapshot {
    const m = this.metrics;
    const c = this.match?.counters;
    const loop = this.loop;
    return {
      code: this.lobby.isPrivate ? null : this.code,
      id: createHash('sha256').update(this.code).digest('hex').slice(0, 8),
      phase: this.lobby.phase,
      isPrivate: this.lobby.isPrivate,
      humans: this.lobby.humanCount,
      connectedHumans: this.lobby.members.filter((x) => x.connected).length,
      uptimeSec: Math.round((Date.now() - m.createdAt) / 1000),
      ticks: {
        run: loop?.ticksRun ?? 0,
        dropped: loop?.ticksDropped ?? 0,
        stepMs: m.stepMs.snapshot(),
        broadcastMs: m.broadcastMs.snapshot(),
        timerLatenessMs: loop?.lateness.snapshot() ?? { count: 0, mean: 0, p99: 0, max: 0 },
      },
      net: {
        framesMessages: m.framesMessages,
        framesBytesPerClient: m.framesBytesPerClient,
        framesBytesRaw: m.framesBytesRaw,
        keyframesSent: m.keyframesSent,
        keyframeBytes: m.keyframeBytes,
        bytesSentTotal: m.bytesSentTotal,
        messagesIn: m.messagesIn,
        invalidMessages: m.invalidMessages,
        unknownMessages: m.unknownMessages,
        rejectedActions: m.rejectedActions,
        resyncsServed: m.resyncsServed,
        resyncsLimited: m.resyncsLimited,
        kicks: m.kicks,
        reconnections: m.reconnections,
      },
      inputs: {
        accepted: c?.inputsAccepted ?? 0,
        stale: c?.inputsStale ?? 0,
        rateLimited: c?.inputsRateLimited ?? 0,
      },
      matches: { started: m.matchesStarted, finished: m.matchesFinished },
      clients: [...this.peers.values()].map((p) => ({
        seat: p.seat,
        bytesOut: p.bytesOut,
        messagesIn: p.messagesIn,
        invalidMessages: p.invalid,
      })),
    };
  }
}

/** The room class for one server: the same room, bound to that server's runtime config and metrics registry. */
export function createRumbleRoomClass(deps: RoomDeps): typeof RumbleRoom {
  return class ConfiguredRumbleRoom extends RumbleRoom {
    protected override deps: RoomDeps | null = deps;
  };
}
