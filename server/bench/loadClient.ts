/**
 * A headless, human-like City Rumble client for the load harness (docs/measurements/rumble-online/LOAD_RESULTS.md).
 *
 * It behaves like the browser client: real `@colyseus/sdk` WebSocket through an impairment proxy, a `NetReplica` fed by
 * the binary keyframe / frames messages, played out by a real 60 Hz timer with `advance(dt)` from `performance.now()`
 * deltas, a resync request when the replica asks for one, a ping every second. It plays its seat the way a human would
 * see it: every applied tick it runs a `standard` bot's `decide(observe(replica.state, seat))` on the REPLICA (what a
 * player sees, a little in the past), converts the Intent to an `InputMsg` and sends it only when it changes.
 *
 * It measures: bytes, messages, RTT, tick lag, jitter-buffer depth, input-to-visible latency, replica statistics, the
 * eliminations / explosions it saw, its final state hash and the server's results message, plus the scenario events
 * (connection drop + reconnect, backgrounded tab).
 */
import { inflateRawSync } from 'node:zlib';
import { Client as SdkClient } from '@colyseus/sdk';
import type { Room as SdkRoom } from '@colyseus/sdk';
import { createBot } from '../../src/ai';
import type { Bot } from '../../src/ai';
import { canonicalHash } from '../../src/net/hash';
import { unpack } from '../../src/net/pack';
import { BUTTON, MSG } from '../../src/net/protocol';
import type {
  FramesPayload,
  InputMsg,
  KeyframePayload,
  LobbyMsg,
  PongMsg,
  ResultsMsg,
  WelcomeMsg,
} from '../../src/net/protocol';
import { publicState } from '../../src/net/publicState';
import { NetReplica } from '../../src/net/replica';
import { observe } from '../../src/sim';
import type { Dir, Intent, SimEvent } from '../../src/sim';
import { PROFILES, startImpairProxy } from './impairProxy';
import type { ImpairProxy } from './impairProxy';

export interface DropSpec {
  /** Match time (server ticks / 60) at which the connection is cut. */
  atSec: number;
  /** Reconnect this long after the cut (ms); ignored when `returns` is false. */
  afterMs: number;
  returns: boolean;
}

export interface BackgroundSpec {
  /** Match time (server ticks / 60) at which the tab goes to the background. */
  atSec: number;
  forMs: number;
}

export interface ClientSpec {
  index: number;
  name: string;
  role: 'host' | 'joiner';
  profile: string;
  seed: number;
  serverPort: number;
  /** Room creation options (host only). */
  roomOptions?: Record<string, unknown>;
  drop?: DropSpec;
  background?: BackgroundSpec;
  /** Min ms between input messages (default 80 = at most 12.5/s, a busy human; 0 = every change at once). */
  inputGapMs?: number;
  /** A seat whose movement this client counts from server tick `watchFromTick` on (the never-returning seat). */
  watchSeat?: number | null;
  watchFromTick?: number;
}

export interface ElimRec {
  tick: number;
  playerId: number;
  creditId: number | null;
  /** Elimination cause kind (`suddenDeath` = a stand-down: the sim emits the event but counts no death). */
  cause: string;
}
export interface ExplRec {
  tick: number;
  generatorId: number;
}

export interface ClientRecord {
  index: number;
  name: string;
  profile: string;
  seat: number | null;
  roomCode: string | null;
  /** Wall ms the client played (first keyframe to results). */
  matchWallMs: number;
  bytesDown: number;
  bytesUp: number;
  /** Proxy bytes between the first keyframe and the results (WebSocket framing included). */
  matchBytesDown: number;
  matchBytesUp: number;
  payload: {
    framesMsgs: number;
    framesBytes: number;
    keyframes: number;
    keyframeBytes: number;
    control: number;
  };
  messagesIn: number;
  inputsSent: number;
  maxInputsPerSecond: number;
  rttMs: number[];
  tickLagMs: number[];
  bufferTicks: number[];
  /** Input-to-visible latency samples (ms) and how many measurements timed out unresolved. */
  inputLatencyMs: number[];
  inputLatencyUnresolved: number;
  replica: NetReplica['stats'];
  resyncRequests: number;
  proxy: ImpairProxy['stats'];
  eliminations: ElimRec[];
  explosions: ExplRec[];
  /** Tick ranges (from, to] this client never applied because a keyframe replaced them (join, reconnect, resync). */
  gaps: [number, number][];
  results: ResultsMsg | null;
  finalHash: number | null;
  finalTick: number | null;
  departed: boolean;
  leaveCodes: number[];
  notices: string[];
  errors: string[];
  reconnect: null | {
    droppedAtTick: number;
    reconnectCallMs: number;
    keyframeMs: number;
    consistentMs: number | null;
    resyncsDuring: number;
  };
  background: null | {
    forMs: number;
    peakBuffer: number;
    bufferAtResume: number;
    catchUpMs: number | null;
    skippedAheadDelta: number;
    hashMismatchesDelta: number;
  };
  /** Movement observed on the watched seat after the watch started (a bot-played seat keeps moving). */
  watch: null | { seat: number; stepsSeen: number; aliveAtEnd: boolean; lastLobbyConnected: boolean | null };
}

const TICK_MS = 1000 / 60;

export class LoadClient {
  readonly rec: ClientRecord;
  roomCode: string | null = null;
  /** Resolves when the first keyframe has been loaded (the match is on). */
  readonly started: Promise<void>;
  /** Resolves when the match results arrived and the replica drained, or the client left for good. */
  readonly finished: Promise<void>;

  private proxy!: ImpairProxy;
  private sdk!: SdkClient;
  private room!: SdkRoom;
  private replica: NetReplica | null = null;
  private bot: Bot | null = null;
  private seat: number | null = null;
  private resolveStarted!: () => void;
  private resolveFinished!: () => void;
  private frameTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private sampleTimer: NodeJS.Timeout | null = null;
  private lastFrameAt = 0;
  private seq = 0;
  private want: { m: Dir | null; h: boolean; b: number } = { m: null, h: false, b: 0 };
  private lastSendAt = -Infinity;
  private lastM: Dir | null = null;
  private lastH = false;
  private prevDir: Dir | null = null;
  private pending: { dir: Dir; t0: number; x: number; y: number } | null = null;
  private catchingUp = false;
  private lastAppliedTick = -1;
  private lastResyncAt = -Infinity;
  private matchStartAt = 0;
  private matchStartBytes = { up: 0, down: 0 };
  private inputWindow: number[] = [];
  private stopped = false;
  private dropped = false;
  private dropDone = false;
  private bgState: 'none' | 'background' | 'resumed' | 'done' = 'none';
  private bgUntil = 0;
  private bgResumeAt = 0;
  private bgBase = { skipped: 0, mismatches: 0 };
  private reconnectBase: { at: number; checks: number; mismatches: number; resyncs: number } | null = null;
  private watchLast: string | null = null;
  private lastLobby: LobbyMsg | null = null;

  constructor(readonly spec: ClientSpec) {
    this.rec = {
      index: spec.index,
      name: spec.name,
      profile: spec.profile,
      seat: null,
      roomCode: null,
      matchWallMs: 0,
      bytesDown: 0,
      bytesUp: 0,
      matchBytesDown: 0,
      matchBytesUp: 0,
      payload: { framesMsgs: 0, framesBytes: 0, keyframes: 0, keyframeBytes: 0, control: 0 },
      messagesIn: 0,
      inputsSent: 0,
      maxInputsPerSecond: 0,
      rttMs: [],
      tickLagMs: [],
      bufferTicks: [],
      inputLatencyMs: [],
      inputLatencyUnresolved: 0,
      replica: { framesApplied: 0, hashChecks: 0, hashMismatches: 0, resyncs: 0, skippedAhead: 0 },
      resyncRequests: 0,
      proxy: undefined as unknown as ImpairProxy['stats'],
      eliminations: [],
      explosions: [],
      gaps: [],
      results: null,
      finalHash: null,
      finalTick: null,
      departed: false,
      leaveCodes: [],
      notices: [],
      errors: [],
      reconnect: null,
      background: null,
      watch: null,
    };
    this.started = new Promise<void>((r) => (this.resolveStarted = r));
    this.finished = new Promise<void>((r) => (this.resolveFinished = r));
  }

  /** Connects (host: creates a private room; joiner: joins by code) and returns the room code. */
  async connect(code?: string): Promise<string> {
    const profile = PROFILES[this.spec.profile];
    if (!profile) throw new Error(`unknown profile ${this.spec.profile}`);
    this.proxy = await startImpairProxy({ targetPort: this.spec.serverPort, profile, seed: this.spec.seed });
    this.rec.proxy = this.proxy.stats;
    this.sdk = new SdkClient(`http://127.0.0.1:${this.proxy.port}`);
    const options = { name: this.spec.name };
    const room =
      this.spec.role === 'host'
        ? await this.sdk.create('rumble', { ...options, ...this.spec.roomOptions })
        : await this.sdk.joinById(code!, options);
    this.attach(room);
    this.roomCode = room.roomId;
    this.rec.roomCode = room.roomId;
    this.pingTimer = setInterval(() => this.ping(), 1000);
    this.sampleTimer = setInterval(() => this.sample(), 250);
    return room.roomId;
  }

  /** Scenario helper: from server tick `fromTick` on, count the steps the replica shows for `seat`. */
  setWatch(seat: number, fromTick: number): void {
    this.spec.watchSeat = seat;
    this.spec.watchFromTick = fromTick;
  }

  /** Host only: starts the match. */
  start(): void {
    this.room.send(MSG.start);
  }

  private attach(room: SdkRoom): void {
    this.room = room;
    room.onLeave((code) => {
      this.rec.leaveCodes.push(code);
    });
    room.onError((code, message) => {
      this.rec.errors.push(`${code}: ${message ?? ''}`);
    });
    room.onMessage(MSG.welcome, (m: WelcomeMsg) => {
      this.rec.payload.control++;
      this.rec.messagesIn++;
      if (m.seat !== null) {
        this.seat = m.seat;
        this.rec.seat = m.seat;
      }
      if (m.descriptor && this.replica?.descriptor.matchId !== m.descriptor.matchId) {
        this.replica = new NetReplica(m.descriptor);
        this.hookReplica(this.replica);
        this.bot = createBot({ difficulty: 'standard', seed: this.spec.seed, playerId: m.seat ?? 0 });
      }
    });
    room.onMessage(MSG.lobby, (m: LobbyMsg) => {
      this.rec.payload.control++;
      this.rec.messagesIn++;
      this.lastLobby = m;
    });
    room.onMessage(MSG.pong, (m: PongMsg) => {
      this.rec.payload.control++;
      this.rec.messagesIn++;
      this.onPong(m);
    });
    room.onMessage(MSG.notice, (m: { code: string; message: string }) => {
      this.rec.payload.control++;
      this.rec.messagesIn++;
      this.rec.notices.push(`${m.code}: ${m.message}`);
    });
    room.onMessage(MSG.keyframe, (bytes: Uint8Array) => {
      this.rec.messagesIn++;
      this.rec.payload.keyframes++;
      this.rec.payload.keyframeBytes += bytes.length;
      const replica = this.replica;
      if (!replica) return;
      const kf = unpack(inflateRawSync(bytes)) as KeyframePayload;
      const from = replica.tick;
      if (from < kf.t) this.rec.gaps.push([from, kf.t]);
      replica.loadKeyframe(kf);
      this.lastAppliedTick = replica.tick;
      if (this.reconnectBase && this.rec.reconnect && this.rec.reconnect.keyframeMs === 0) {
        this.rec.reconnect.keyframeMs = Math.round(performance.now() - this.reconnectBase.at);
        this.reconnectBase.checks = replica.stats.hashChecks;
        this.reconnectBase.mismatches = replica.stats.hashMismatches;
        this.reconnectBase.resyncs = replica.stats.resyncs;
      }
      if (this.matchStartAt === 0) this.beginPlay();
    });
    room.onMessage(MSG.frames, (bytes: Uint8Array) => {
      this.rec.messagesIn++;
      this.rec.payload.framesMsgs++;
      this.rec.payload.framesBytes += bytes.length;
      this.replica?.receive(unpack(inflateRawSync(bytes)) as FramesPayload);
    });
    room.onMessage(MSG.results, (m: ResultsMsg) => {
      this.rec.payload.control++;
      this.rec.messagesIn++;
      if (this.rec.results) return;
      this.rec.results = m;
      this.matchEnded();
    });
  }

  // ------------------------------------------------------------------ play-out

  private hookReplica(replica: NetReplica): void {
    const orig = replica.applyOne.bind(replica);
    replica.applyOne = (): SimEvent[] | null => {
      const ev = orig();
      if (ev !== null && replica.tick !== this.lastAppliedTick) {
        this.lastAppliedTick = replica.tick;
        this.onApplied(replica, ev);
      }
      return ev;
    };
  }

  private beginPlay(): void {
    this.matchStartAt = performance.now();
    this.matchStartBytes = { up: this.proxy.stats.bytesUp, down: this.proxy.stats.bytesDown };
    this.lastFrameAt = this.matchStartAt;
    this.frameTimer = setInterval(() => this.frame(), 1000 / 60);
    this.resolveStarted();
  }

  private frame(): void {
    const replica = this.replica;
    const now = performance.now();
    const dt = now - this.lastFrameAt;
    this.lastFrameAt = now;
    if (!replica?.state || this.stopped) return;

    this.scenarioHooks(replica, now);
    this.maybeSend();
    if (this.bgState === 'background') {
      if (now < this.bgUntil) return; // a backgrounded tab: the socket is open, nothing is played out
      this.bgState = 'resumed';
      this.bgResumeAt = now;
      const bg = this.rec.background!;
      bg.bufferAtResume = replica.bufferedTicks;
      bg.peakBuffer = Math.max(bg.peakBuffer, replica.bufferedTicks);
      this.bgBase = { skipped: replica.stats.skippedAhead, mismatches: replica.stats.hashMismatches };
      // the browser hands the first frame after the pause the whole pause as `dt`: pass it on as is
    }
    if (replica.resyncReason !== null) {
      if (now - this.lastResyncAt > 1100 && !this.dropped) {
        this.lastResyncAt = now;
        this.rec.resyncRequests++;
        this.room.send(MSG.resync);
      }
      return;
    }
    this.catchingUp = replica.bufferedTicks > 45;
    replica.advance(dt);
    this.catchingUp = false;
    if (this.bgState === 'resumed') {
      const target = replica.descriptor.sendEvery + 3 + replica.descriptor.sendEvery;
      if (replica.bufferedTicks <= target) {
        const bg = this.rec.background!;
        bg.catchUpMs = Math.round(now - this.bgResumeAt);
        bg.skippedAheadDelta = replica.stats.skippedAhead - this.bgBase.skipped;
        bg.hashMismatchesDelta = replica.stats.hashMismatches - this.bgBase.mismatches;
        this.bgState = 'done';
      }
    }
    if (this.reconnectBase && this.rec.reconnect && this.rec.reconnect.consistentMs === null) {
      const b = this.reconnectBase;
      if (
        this.rec.reconnect.keyframeMs > 0 &&
        replica.stats.hashChecks > b.checks &&
        replica.stats.hashMismatches === b.mismatches &&
        replica.stats.resyncs === b.resyncs
      ) {
        this.rec.reconnect.consistentMs = Math.round(now - b.at);
        this.rec.reconnect.resyncsDuring = replica.stats.resyncs - b.resyncs;
      }
    }
  }

  private onApplied(replica: NetReplica, events: SimEvent[]): void {
    const tick = replica.tick;
    for (const e of events) {
      if (e.type === 'playerEliminated') {
        this.rec.eliminations.push({ tick, playerId: e.playerId, creditId: e.creditId, cause: e.cause.kind });
      } else if (e.type === 'generatorExploded') {
        this.rec.explosions.push({ tick, generatorId: e.generatorId });
      }
    }
    const state = replica.state!;
    const seat = this.seat;
    if (seat === null) return;
    const me = state.players[seat];
    if (me && this.pending) {
      const p = this.pending;
      const dx = Math.abs(me.x - p.x);
      const dy = Math.abs(me.y - p.y);
      if (me.x !== p.x || me.y !== p.y) {
        // a step starting in the pressed direction: one tile, facing it, alive (a respawn or knock-back is not one)
        if (me.facing === p.dir && me.alive && dx + dy === 1)
          this.rec.inputLatencyMs.push(Math.round((performance.now() - p.t0) * 10) / 10);
        else this.rec.inputLatencyUnresolved++;
        this.pending = null;
      } else if (performance.now() - p.t0 > 3000) {
        this.rec.inputLatencyUnresolved++;
        this.pending = null;
      }
    }
    if (this.spec.watchSeat != null && tick >= (this.spec.watchFromTick ?? Infinity)) {
      const w = state.players[this.spec.watchSeat];
      if (w) {
        const key = `${w.x},${w.y}`;
        if (this.rec.watch === null)
          this.rec.watch = {
            seat: this.spec.watchSeat,
            stepsSeen: 0,
            aliveAtEnd: w.alive,
            lastLobbyConnected: null,
          };
        else if (key !== this.watchLast) this.rec.watch.stepsSeen++;
        this.watchLast = key;
        this.rec.watch.aliveAtEnd = w.alive;
      }
    }
    if (this.catchingUp || this.dropped || this.bgState === 'background' || !this.bot || this.stopped) return;
    if (!me) return;
    const intent = this.bot.decide(observe(state, seat));
    this.sendIntent(intent);
  }

  /**
   * The bot's decision becomes the WANTED input state; it is sent when it differs from what was last sent and at least
   * `inputGapMs` have passed since the previous message (a thumb cannot change the stick or press buttons 60 times a
   * second: the real InputManager sends on change, a few messages per second). Button presses are never lost: they
   * accumulate until sent. Gap 0 sends every change at once (stress mode, not human-like).
   */
  private sendIntent(intent: Intent): void {
    this.want.m = (intent.move ?? null) as Dir | null;
    this.want.h = intent.placeHeld === true;
    this.want.b |=
      (intent.place ? BUTTON.place : 0) |
      (intent.special ? BUTTON.special : 0) |
      (intent.detonate ? BUTTON.detonate : 0);
    this.maybeSend();
  }

  private maybeSend(): void {
    const w = this.want;
    if (w.m === this.lastM && w.h === this.lastH && w.b === 0) return;
    const now = performance.now();
    if (now - this.lastSendAt < (this.spec.inputGapMs ?? 80)) return;
    const me = this.seat !== null ? this.replica?.state?.players[this.seat] : undefined;
    if (!me || this.dropped || this.stopped || this.bgState === 'background') return;
    if (w.m !== null && w.m !== this.prevDir && me.stepRemaining === 0 && me.alive) {
      if (this.pending) this.rec.inputLatencyUnresolved++;
      this.pending = { dir: w.m, t0: now, x: me.x, y: me.y };
    }
    if (w.m !== null) this.prevDir = w.m;
    this.lastM = w.m;
    this.lastH = w.h;
    const b = w.b;
    w.b = 0;
    this.lastSendAt = now;
    this.send({ s: ++this.seq, m: w.m, h: w.h, b });
  }

  private send(msg: InputMsg): void {
    this.room.send(MSG.input, msg);
    this.rec.inputsSent++;
    const now = performance.now();
    this.inputWindow.push(now);
    while (this.inputWindow.length > 0 && now - this.inputWindow[0]! > 1000) this.inputWindow.shift();
    this.rec.maxInputsPerSecond = Math.max(this.rec.maxInputsPerSecond, this.inputWindow.length);
  }

  // ------------------------------------------------------------------ scenarios

  private scenarioHooks(replica: NetReplica, now: number): void {
    const { drop, background } = this.spec;
    if (drop && !this.dropDone && replica.tick >= drop.atSec * 60) {
      this.dropDone = true;
      void this.doDrop(replica, drop);
    }
    if (background && this.bgState === 'none' && replica.tick >= background.atSec * 60) {
      this.bgState = 'background';
      this.bgUntil = now + background.forMs;
      this.rec.background = {
        forMs: background.forMs,
        peakBuffer: 0,
        bufferAtResume: 0,
        catchUpMs: null,
        skippedAheadDelta: 0,
        hashMismatchesDelta: 0,
      };
      // a well-behaved client lets go of the stick when the tab hides; the server keeps the last held input otherwise
      this.lastM = null;
      this.lastH = false;
      this.want = { m: null, h: false, b: 0 };
      this.send({ s: ++this.seq, m: null, h: false, b: 0 });
    }
  }

  private async doDrop(replica: NetReplica, drop: DropSpec): Promise<void> {
    this.dropped = true;
    const token = this.room.reconnectionToken;
    this.room.reconnection.enabled = false;
    this.rec.reconnect = {
      droppedAtTick: replica.tick,
      reconnectCallMs: 0,
      keyframeMs: 0,
      consistentMs: null,
      resyncsDuring: 0,
    };
    this.proxy.killAll();
    if (!drop.returns) {
      this.rec.departed = true;
      this.stopAll();
      this.resolveFinished();
      return;
    }
    await new Promise((r) => setTimeout(r, drop.afterMs));
    const t0 = performance.now();
    this.reconnectBase = { at: t0, checks: 0, mismatches: 0, resyncs: 0 };
    try {
      const room = await this.sdk.reconnect(token);
      this.rec.reconnect.reconnectCallMs = Math.round(performance.now() - t0);
      this.attach(room);
      this.dropped = false;
      // the connection is back: the first input of a new session starts from a neutral stick
      this.lastM = null;
      this.lastH = false;
      this.want = { m: null, h: false, b: 0 };
    } catch (e) {
      this.rec.errors.push(`reconnect failed: ${String(e)}`);
      this.rec.departed = true;
      this.stopAll();
      this.resolveFinished();
    }
  }

  // ------------------------------------------------------------------ measurement

  private ping(): void {
    if (this.dropped || this.stopped) return;
    try {
      this.room.send(MSG.ping, { c: performance.now() });
    } catch {
      /* socket not open */
    }
  }

  private onPong(m: PongMsg): void {
    const now = performance.now();
    const rtt = now - m.c;
    this.rec.rttMs.push(Math.round(rtt * 10) / 10);
    const replica = this.replica;
    if (!replica?.state || this.bgState === 'background' || this.rec.results || replica.tick < 0) return;
    // the server was at tick m.t when it answered; it has run another rtt/2 since: that is where it is now
    const serverNow = m.t + rtt / 2 / TICK_MS;
    this.rec.tickLagMs.push(Math.round((serverNow - replica.tick) * TICK_MS));
  }

  private sample(): void {
    const replica = this.replica;
    if (!replica?.state || this.dropped || this.stopped) return;
    if (this.bgState === 'background') {
      if (this.rec.background)
        this.rec.background.peakBuffer = Math.max(this.rec.background.peakBuffer, replica.bufferedTicks);
      return;
    }
    if (this.rec.results === null) this.rec.bufferTicks.push(replica.bufferedTicks);
  }

  private matchEnded(): void {
    // keep playing out until the replica reaches the results tick (a short drain), then freeze the final numbers
    const t0 = performance.now();
    const check = setInterval(() => {
      const r = this.replica;
      const res = this.rec.results;
      if (!r?.state || !res) return;
      const done = (r.tick >= res.tick && r.bufferedTicks === 0) || performance.now() - t0 > 4000;
      if (!done) return;
      clearInterval(check);
      this.rec.finalTick = r.tick;
      this.rec.finalHash = canonicalHash(publicState(r.state));
      this.rec.matchWallMs = Math.round(performance.now() - this.matchStartAt);
      this.rec.matchBytesDown = this.proxy.stats.bytesDown - this.matchStartBytes.down;
      this.rec.matchBytesUp = this.proxy.stats.bytesUp - this.matchStartBytes.up;
      if (this.rec.watch) this.rec.watch.lastLobbyConnected = this.watchLobbyFlag();
      this.stopAll();
      this.resolveFinished();
    }, 50);
  }

  private watchLobbyFlag(): boolean | null {
    const w = this.spec.watchSeat;
    if (w == null || !this.lastLobby) return null;
    const m = this.lastLobby.members.find((x) => x.seat === w);
    return m ? m.connected : null;
  }

  private stopAll(): void {
    this.stopped = true;
    for (const t of [this.frameTimer, this.pingTimer, this.sampleTimer]) if (t) clearInterval(t);
    this.frameTimer = this.pingTimer = this.sampleTimer = null;
    if (this.replica) this.rec.replica = { ...this.replica.stats };
    this.rec.bytesDown = this.proxy.stats.bytesDown;
    this.rec.bytesUp = this.proxy.stats.bytesUp;
  }

  /** Called by the worker when the run is over (also for clients that never finished). */
  async shutdown(): Promise<ClientRecord> {
    if (!this.stopped) this.stopAll();
    if (this.replica && this.rec.finalHash === null && this.replica.state) {
      this.rec.finalTick = this.replica.tick;
    }
    this.rec.replica = this.replica ? { ...this.replica.stats } : this.rec.replica;
    this.rec.bytesDown = this.proxy.stats.bytesDown;
    this.rec.bytesUp = this.proxy.stats.bytesUp;
    try {
      this.room.reconnection.enabled = false;
      await Promise.race([this.room.leave(), new Promise((r) => setTimeout(r, 1500))]);
    } catch {
      /* already closed */
    }
    await this.proxy.close();
    return this.rec;
  }

  get hasSeat(): boolean {
    return this.seat !== null;
  }
}
