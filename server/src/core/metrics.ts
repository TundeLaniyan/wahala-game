/**
 * Per-room and per-process measurements, exposed on `GET /metrics`.
 * Rolling windows keep the memory bounded and make the numbers reflect "now", not the whole uptime.
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';

export interface StatSnapshot {
  /** Samples currently in the window. */
  count: number;
  mean: number;
  p99: number;
  max: number;
}

/** Mean / p99 / max over the last `size` samples. */
export class RollingStats {
  private readonly buf: Float64Array;
  private n = 0;
  private next = 0;

  constructor(readonly size = 600) {
    this.buf = new Float64Array(size);
  }

  push(v: number): void {
    this.buf[this.next] = v;
    this.next = (this.next + 1) % this.size;
    if (this.n < this.size) this.n++;
  }

  snapshot(): StatSnapshot {
    if (this.n === 0) return { count: 0, mean: 0, p99: 0, max: 0 };
    const v = Array.from(this.buf.subarray(0, this.n)).sort((a, b) => a - b);
    let sum = 0;
    for (const x of v) sum += x;
    const round = (x: number): number => Math.round(x * 1000) / 1000;
    return {
      count: this.n,
      mean: round(sum / this.n),
      p99: round(v[Math.min(v.length - 1, Math.ceil(v.length * 0.99) - 1)]!),
      max: round(v[v.length - 1]!),
    };
  }
}

export interface ClientMetrics {
  /** Seat of the client's player, or null in the lobby. */
  seat: number | null;
  bytesOut: number;
  messagesIn: number;
  invalidMessages: number;
}

/** Counters of one room (the room fills them; `snapshot` adds the loop and match numbers). */
export class RoomMetrics {
  readonly createdAt = Date.now();
  readonly stepMs = new RollingStats();
  readonly broadcastMs = new RollingStats();
  framesMessages = 0;
  /** Sum of the compressed frames payload sizes: what ONE client receives of them. */
  framesBytesPerClient = 0;
  /** The same payloads before deflate. */
  framesBytesRaw = 0;
  keyframesSent = 0;
  keyframeBytes = 0;
  /** Everything sent to clients (frames x recipients, keyframes, control messages' payload not counted). */
  bytesSentTotal = 0;
  messagesIn = 0;
  invalidMessages = 0;
  unknownMessages = 0;
  rejectedActions = 0;
  resyncsServed = 0;
  resyncsLimited = 0;
  kicks = 0;
  /** Clients cut off because their unsent output grew past the limit (they were not reading). */
  backpressureKicks = 0;
  reconnections = 0;
  /** Connection drops of a playing human, and times a replacement bot took over a dropped seat. */
  drops = 0;
  botTakeovers = 0;
  matchesStarted = 0;
  matchesFinished = 0;
}

export interface RoomMetricsSnapshot {
  /** Public rooms only: a private room's code is its only protection, so it is never listed. */
  code: string | null;
  /** Stable short id (a hash of the code) to tell rooms apart without revealing a private code. */
  id: string;
  phase: string;
  isPrivate: boolean;
  humans: number;
  connectedHumans: number;
  uptimeSec: number;
  ticks: {
    run: number;
    dropped: number;
    stepMs: StatSnapshot;
    broadcastMs: StatSnapshot;
    timerLatenessMs: StatSnapshot;
  };
  net: {
    framesMessages: number;
    framesBytesPerClient: number;
    framesBytesRaw: number;
    keyframesSent: number;
    keyframeBytes: number;
    bytesSentTotal: number;
    messagesIn: number;
    invalidMessages: number;
    unknownMessages: number;
    rejectedActions: number;
    resyncsServed: number;
    resyncsLimited: number;
    kicks: number;
    backpressureKicks: number;
    reconnections: number;
    drops: number;
    botTakeovers: number;
  };
  inputs: { accepted: number; stale: number; overRate: number };
  matches: { started: number; finished: number };
  clients: ClientMetrics[];
}

/** Rooms register a snapshot function here; `/metrics` and the tests read them. */
export class MetricsRegistry {
  private readonly rooms = new Map<string, () => RoomMetricsSnapshot>();
  private readonly loopDelay = monitorEventLoopDelay({ resolution: 10 });
  private readonly startedAt = Date.now();
  private lastCpu = process.cpuUsage();
  private lastCpuAt = process.hrtime.bigint();

  constructor() {
    this.loopDelay.enable();
  }

  register(code: string, snapshot: () => RoomMetricsSnapshot): void {
    this.rooms.set(code, snapshot);
  }

  unregister(code: string): void {
    this.rooms.delete(code);
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  roomSnapshots(): RoomMetricsSnapshot[] {
    return [...this.rooms.values()].map((f) => f());
  }

  /** Process stats; the event-loop delay and cpu percent cover the time since the previous call. */
  processSnapshot(): Record<string, unknown> {
    const cpu = process.cpuUsage();
    const nowNs = process.hrtime.bigint();
    const wallUs = Number(nowNs - this.lastCpuAt) / 1000;
    const usedUs = cpu.user - this.lastCpu.user + (cpu.system - this.lastCpu.system);
    this.lastCpu = cpu;
    this.lastCpuAt = nowNs;
    const h = this.loopDelay;
    // the histogram samples a 10 ms timer: an idle loop reads ~10 ms, so report the delay beyond that
    const ms = (ns: number): number => Math.max(0, Math.round((ns / 1e6 - 10) * 1000) / 1000);
    const out = {
      uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
      pid: process.pid,
      node: process.version,
      cpuUsage: cpu,
      cpuPercentSinceLastRead: wallUs > 0 ? Math.round((usedUs / wallUs) * 1000) / 10 : 0,
      memoryUsage: process.memoryUsage(),
      eventLoopDelayMs: {
        mean: ms(h.mean),
        p50: ms(h.percentile(50)),
        p99: ms(h.percentile(99)),
        max: ms(h.max),
      },
    };
    h.reset();
    return out;
  }

  snapshot(): { process: Record<string, unknown>; rooms: RoomMetricsSnapshot[] } {
    return { process: this.processSnapshot(), rooms: this.roomSnapshots() };
  }

  close(): void {
    this.loopDelay.disable();
    this.rooms.clear();
  }
}
