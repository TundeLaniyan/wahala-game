/**
 * Operational metrics for `GET /metrics` (bearer token; never public). Counters are per process and reset on restart: a monitor
 * computes rates. Nothing here holds a player identifier, a token, a path or a body: route PATTERNS and status classes only.
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { Db } from './db/types';

export interface MetricsSnapshot {
  uptimeSec: number;
  process: { rssMb: number; heapUsedMb: number; externalMb: number };
  eventLoop: { p50Ms: number; p99Ms: number; maxMs: number };
  db: { total: number; idle: number; waiting: number; max: number } | null;
  requests: {
    total: number;
    byStatusClass: Record<string, number>;
    rateLimited: number;
    unauthenticated: number;
    errors5xx: number;
    draining: boolean;
  };
  latencyMs: { p50: number; p95: number; p99: number; samples: number };
}

export class Metrics {
  private readonly started = Date.now();
  private readonly loop = monitorEventLoopDelay({ resolution: 20 });
  private total = 0;
  private readonly classes: Record<string, number> = {};
  private limited = 0;
  private unauth = 0;
  private e5xx = 0;
  private readonly lat: number[] = [];
  draining = false;

  constructor() {
    this.loop.enable();
  }

  record(status: number, ms: number): void {
    this.total++;
    const k = `${Math.floor(status / 100)}xx`;
    this.classes[k] = (this.classes[k] ?? 0) + 1;
    if (status === 429) this.limited++;
    if (status === 401) this.unauth++;
    if (status >= 500) this.e5xx++;
    this.lat.push(ms);
    if (this.lat.length > 2000) this.lat.splice(0, this.lat.length - 2000); // a rolling window, bounded
  }

  snapshot(db: Db): MetricsSnapshot {
    const mem = process.memoryUsage();
    const sorted = [...this.lat].sort((a, b) => a - b);
    const q = (p: number): number =>
      sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
    const ms = (ns: number): number => Math.round((ns / 1e6) * 10) / 10;
    return {
      uptimeSec: Math.round((Date.now() - this.started) / 1000),
      process: {
        rssMb: Math.round(mem.rss / 1048576),
        heapUsedMb: Math.round(mem.heapUsed / 1048576),
        externalMb: Math.round(mem.external / 1048576),
      },
      eventLoop: {
        p50Ms: ms(this.loop.percentile(50)),
        p99Ms: ms(this.loop.percentile(99)),
        maxMs: ms(this.loop.max),
      },
      db: db.stats(),
      requests: {
        total: this.total,
        byStatusClass: { ...this.classes },
        rateLimited: this.limited,
        unauthenticated: this.unauth,
        errors5xx: this.e5xx,
        draining: this.draining,
      },
      latencyMs: { p50: q(0.5), p95: q(0.95), p99: q(0.99), samples: sorted.length },
    };
  }

  stop(): void {
    this.loop.disable();
  }
}
