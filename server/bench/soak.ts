/* eslint-disable @typescript-eslint/no-explicit-any -- IPC messages, the SDK's internals and the result JSON are untyped records by design */
/**
 * Memory / stability SOAK of the City Rumble server (`npm run soak`; results and method: docs/CITY_RUMBLE_ONLINE.md
 * "Server memory soak").
 *
 * What runs. The REAL server code (`server/src`: rooms, lobby, match, tick loop, replication, the real `src/sim` and
 * `src/ai` bots) in a child process started with `--expose-gc` (bench/soakServer.ts), and this orchestrator process
 * holding light WebSocket clients (the real `@colyseus/sdk`; no replica, no rendering: only the traffic the server sees
 * from a player: join, ready/start, inputs, drops and reconnections, rematch, leave). The server and its clients are
 * separate processes, so the server's heap, CPU and event loop are not polluted by the clients.
 *
 * What it does. N concurrent room slots (default 3). Slot 0 is ONE long match (1 human + 31 bots, the longest legal
 * length, 300 s) that never ends during the run: it shows whether a single match grows with time. The other slots loop
 * through short life cycles: create a private room, 1-3 (sometimes 6) humans join, the host starts, play for a few
 * seconds with the bots (30 or more of them) running, one human's socket is cut mid-match (it reconnects in time, or never
 * returns and a bot keeps the seat), then the room ends one of two ways: everybody leaves mid-match (room teardown), or
 * the match is ended early through the server's own finish path (results message, lobby phase, rematch, a second match
 * in the same room) and everybody leaves. Then the next cycle starts a brand-new room.
 *
 * What it records, every `--sample-sec` seconds (cheap) and every `--gc-sec` seconds after a FORCED FULL GC (the number
 * that matters): process.memoryUsage (rss / heapUsed / external / arrayBuffers), V8 heap statistics and per-space use,
 * event-loop delay (monitorEventLoopDelay p50 / p99 / max), CPU, active handles by kind (timers, sockets), live rooms and
 * clients, and retained room objects (a WeakRef to every room ever created: a disposed room that still resolves after a
 * full GC is a leak). The verdict is the regression slope of the post-GC heap over the steady-state window
 * (bench/soakStats.ts), never a single before / after number.
 *
 * Usage: npm run soak [-- --duration 300 --rooms 3 --warmup-sec 60 --sample-sec 5 --gc-sec 15 --cycle-sec 14
 *                        --humans 2 --bots-level standard --long 1 --seed 1 --label NAME --out FILE --heap-snapshots DIR]
 */
import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus as cpuList, loadavg } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client as SdkClient } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import { MSG } from '../../src/net/protocol';
import { RUMBLE_ARENA_IDS } from '../../src/sim';
import { percentile, trend, verdictOf } from './soakStats';
import type { Point } from './soakStats';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(HERE, '..');
const ROOT = path.resolve(SERVER_DIR, '..');

export interface SoakConfig {
  durationSec: number;
  rooms: number;
  warmupSec: number;
  sampleSec: number;
  gcSec: number;
  cycleSec: number;
  humans: number;
  botsLevel: string;
  longSlot: boolean;
  seed: number;
  label: string;
  out: string | null;
  heapSnapshots: string | null;
}

export function parseArgs(argv: string[]): SoakConfig {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const num = (name: string, fallback: number): number => {
    const v = get(name);
    if (v === undefined) return fallback;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`--${name} must be a non-negative number`);
    return n;
  };
  const label = get('label') ?? 'soak';
  return {
    durationSec: num('duration', 300),
    rooms: Math.max(1, Math.round(num('rooms', 3))),
    warmupSec: num('warmup-sec', 60),
    sampleSec: Math.max(1, num('sample-sec', 5)),
    gcSec: Math.max(1, num('gc-sec', 15)),
    cycleSec: Math.max(3, num('cycle-sec', 14)),
    humans: Math.max(1, Math.min(32, Math.round(num('humans', 2)))),
    botsLevel: get('bots-level') ?? 'standard',
    longSlot: num('long', 1) !== 0,
    seed: num('seed', 1),
    label,
    out:
      get('out') === 'none'
        ? null
        : path.resolve(get('out') ?? path.join(ROOT, 'docs/measurements/rumble-online', `${label}.json`)),
    heapSnapshots: get('heap-snapshots') ? path.resolve(get('heap-snapshots')!) : null,
  };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function until(what: string, cond: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for: ${what}`);
    await sleep(25);
  }
}

/** Small seeded generator so the mix of cycles is the same every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------------------------------------ the server child

class ServerProc {
  port = 0;
  pid = 0;
  node = '';
  private child!: ChildProcess;
  private nextId = 1;
  private readonly pending = new Map<number, (m: any) => void>();
  log: string[] = [];

  async start(): Promise<void> {
    // plain node (not the tsx wrapper): the measured process is exactly the one that runs the server code
    this.child = fork(path.join(HERE, 'soakServer.ts'), [], {
      cwd: ROOT,
      execArgv: ['--expose-gc', '--import', 'tsx'],
      env: { ...process.env, NODE_ENV: 'development' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    this.child.stdout?.on('data', (d) => this.log.push(String(d)));
    this.child.stderr?.on('data', (d) => this.log.push(String(d)));
    const ready = new Promise<void>((resolve, reject) => {
      this.child.once('exit', (code) =>
        reject(new Error(`server exited early (${code}): ${this.log.join('').slice(-2000)}`)),
      );
      this.child.on('message', (m: any) => {
        if (m?.type === 'ready') {
          this.port = m.port;
          this.pid = m.pid;
          this.node = m.node;
          resolve();
        } else if (m?.id !== undefined) this.pending.get(m.id)?.(m);
      });
    });
    await ready;
  }

  request(msg: Record<string, unknown>, timeoutMs = 60_000): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no answer to ${String(msg.type)}`)), timeoutMs);
      this.pending.set(id, (m) => {
        clearTimeout(timer);
        this.pending.delete(id);
        if (m.type === 'error') reject(new Error(m.message));
        else resolve(m);
      });
      this.child.send({ ...msg, id });
    });
  }

  async stop(): Promise<void> {
    if (!this.child || this.child.exitCode !== null) return;
    const exited = new Promise<void>((r) => this.child.once('exit', () => r()));
    this.child.send({ type: 'shutdown' });
    await Promise.race([exited, sleep(10_000)]);
    if (this.child.exitCode === null) this.child.kill('SIGKILL');
  }
}

// ------------------------------------------------------------------------------------------------ light clients

const DIRS = ['up', 'right', 'down', 'left'] as const;

class LiteClient {
  room!: Room;
  frames = 0;
  keyframes = 0;
  results = 0;
  lobbyMembers = 0;
  lobbyPhase = '';
  welcomes = 0;
  drops = 0;
  reconnects = 0;
  left = false;
  private seq = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly counters: Counters) {}

  attach(room: Room): this {
    this.room = room;
    // the real browser client's settings (src/net/client/connection.ts): always try to come back, outlast the window
    room.reconnection.maxRetries = 30;
    room.reconnection.maxDelay = 2000;
    room.reconnection.minUptime = 0;
    room.onMessage(MSG.frames, () => void this.frames++);
    room.onMessage(MSG.keyframe, () => void this.keyframes++);
    room.onMessage(MSG.welcome, () => void this.welcomes++);
    room.onMessage(MSG.results, () => void this.results++);
    room.onMessage(MSG.lobby, (m: any) => {
      this.lobbyMembers = m.members.length;
      this.lobbyPhase = m.phase;
    });
    room.onMessage(MSG.notice, () => undefined);
    room.onMessage(MSG.pong, () => undefined);
    room.onDrop(() => {
      this.drops++;
      this.counters.drops++;
    });
    room.onReconnect(() => {
      this.reconnects++;
      this.counters.reconnects++;
    });
    room.onLeave(() => {
      this.left = true;
    });
    room.onError(() => void this.counters.clientErrors++);
    return this;
  }

  /** Inputs at a human pace (about 11 / s) with an occasional generator and the one-second ping. */
  play(rand: () => number): void {
    let i = 0;
    this.timer = setInterval(() => {
      if (this.left) return;
      i++;
      try {
        this.room.send(MSG.input, {
          s: ++this.seq,
          m: DIRS[Math.floor(rand() * 4)],
          h: false,
          b: i % 9 === 0 ? 1 : 0,
        });
        if (i % 11 === 0) this.room.send(MSG.ping, { c: i });
      } catch {
        // the socket is down right now: a real client sends nothing then either
      }
    }, 90);
  }

  stopPlaying(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async leave(): Promise<void> {
    this.stopPlaying();
    try {
      await this.room.leave();
    } catch {
      /* already closed */
    }
  }
}

interface Counters {
  cyclesStarted: number;
  cyclesFinished: number;
  roomsCreated: number;
  forcedEnds: number;
  rematches: number;
  drops: number;
  reconnects: number;
  goneForGood: number;
  abandoned: number;
  clientErrors: number;
  cycleFailures: number;
}

const round = (x: number, d = 2): number => Math.round(x * 10 ** d) / 10 ** d;

/** The verdict blocks of the summary, derived from the steady-state post-GC points only (also used by `--analyse --write`). */
function trendBlocks(points: Point[]) {
  const v = verdictOf(points);
  return {
    v,
    verdict: v.verdict,
    heap: {
      firstSteady: points[0]?.heapMB ?? null,
      lastSteady: points.at(-1)?.heapMB ?? null,
      firstThirdMean: round(v.firstThirdMB),
      lastThirdMean: round(v.lastThirdMB),
      min: points.length ? Math.min(...points.map((p) => p.heapMB)) : null,
      max: points.length ? Math.max(...points.map((p) => p.heapMB)) : null,
    },
    steadyTrendRaw: {
      slopeMBPerMin: round(v.raw.slopeMBPerMin, 3),
      seMBPerMin: round(v.raw.seMBPerMin, 3),
      tStat: round(v.raw.tStat, 2),
      r2: round(v.raw.r2, 3),
    },
    steadyTrendAdjustedForLiveRooms: v.adjusted,
    steadyTrend: {
      points: v.trend.n,
      spanSec: points.length > 1 ? round(points.at(-1)!.t - points[0]!.t, 0) : 0,
      slopeMBPerMin: round(v.trend.slopeMBPerMin, 3),
      seMBPerMin: round(v.trend.seMBPerMin, 3),
      tStat: round(v.trend.tStat, 2),
      r2: round(v.trend.r2, 3),
      projectedMBPerHour: round(v.trend.projectedMBPerHour, 1),
    },
  };
}

// ------------------------------------------------------------------------------------------------ the run

async function main(): Promise<void> {
  const cfg = parseArgs(process.argv.slice(2));
  const rand = rng(cfg.seed);
  const startedAt = Date.now();
  const server = new ServerProc();
  console.log(`[soak] starting the server process (node --expose-gc) ...`);
  await server.start();
  const http = `http://127.0.0.1:${server.port}`;
  console.log(`[soak] server pid ${server.pid} on :${server.port}, ${server.node}`);

  const counters: Counters = {
    cyclesStarted: 0,
    cyclesFinished: 0,
    roomsCreated: 0,
    forcedEnds: 0,
    rematches: 0,
    drops: 0,
    reconnects: 0,
    goneForGood: 0,
    abandoned: 0,
    clientErrors: 0,
    cycleFailures: 0,
  };
  const t = (): number => (Date.now() - startedAt) / 1000;
  const sdk = (): SdkClient => {
    const c = new SdkClient(http);
    (c.http as any).options.credentials = 'omit';
    return c;
  };

  // ---- a baseline before any room exists
  const baseline = (await server.request({ type: 'sample', gc: true })).data;
  const loadStart = Date.now();
  const deadline = loadStart + cfg.durationSec * 1000;

  // ---- the slots
  const slotLoop = async (slot: number): Promise<void> => {
    const long = cfg.longSlot && slot === 0;
    for (let cycle = 0; Date.now() < deadline - (long ? 0 : 3000); cycle++) {
      counters.cyclesStarted++;
      const humans = long ? 1 : [cfg.humans, 1, cfg.humans, 3, cfg.humans, 6][cycle % 6]!;
      const game = long ? 'deathmatch' : (['deathmatch', 'team', 'survival'] as const)[(cycle + slot) % 3]!;
      const arenaId = RUMBLE_ARENA_IDS[(cycle * 3 + slot) % RUMBLE_ARENA_IDS.length]!;
      const clients: LiteClient[] = [];
      try {
        const host = new LiteClient(counters).attach(
          await sdk().create('rumble', {
            name: `Soak ${slot}-${cycle}-0`,
            private: true,
            game,
            arenaId,
            durationSec: long ? 300 : 20,
            botDifficulty: cfg.botsLevel,
          }),
        );
        clients.push(host);
        counters.roomsCreated++;
        const code = host.room.roomId;
        for (let h = 1; h < humans; h++)
          clients.push(
            new LiteClient(counters).attach(
              await sdk().joinById(code, { name: `Soak ${slot}-${cycle}-${h}` }),
            ),
          );
        await until('lobby', () => clients.every((c) => c.lobbyMembers === humans), 10_000);
        host.room.send(MSG.start, {});
        await until('match start', () => clients.every((c) => c.keyframes >= 1), 20_000);
        for (const c of clients) c.play(rand);

        const playMs = long
          ? Math.max(0, deadline - Date.now() - 1000)
          : (cfg.cycleSec * 1000 * (0.7 + rand() * 0.6)) | 0;
        // one socket is cut mid-match (the server's own terminate: an abrupt 1006 drop)
        let victim: LiteClient | null = null;
        let goneForGood = false;
        if (!long || rand() < 0.3) {
          await sleep(Math.min(playMs, 2500 + ((rand() * 1500) | 0)));
          victim = clients[(rand() * clients.length) | 0]!;
          goneForGood = cycle % 4 === 3;
          if (goneForGood) {
            victim.room.reconnection.enabled = false;
            counters.goneForGood++;
          }
          await server.request({ type: 'dropSocket', code, sessionId: victim.room.sessionId });
          await sleep(Math.max(0, playMs - 2500));
        } else {
          await sleep(playMs);
        }

        if (!long && cycle % 3 === 0) {
          // the natural end: results, then a rematch and a second match in the same room
          await server.request({ type: 'forceEnd', code });
          counters.forcedEnds++;
          // somebody who is still connected sees the results (a seat that never came back sees nothing)
          const watcher = clients.find((c) => c !== victim) ?? (goneForGood ? null : victim);
          if (watcher) await until('results', () => watcher.results >= 1, 15_000);
          else await sleep(1500);
          if (cycle % 6 === 0 && watcher === host && !(goneForGood && victim === host)) {
            const before = host.keyframes;
            host.room.send(MSG.rematch, {});
            counters.rematches++;
            await until('rematch lobby', () => host.lobbyPhase === 'lobby', 10_000);
            host.room.send(MSG.start, {});
            await until('second match', () => host.keyframes > before, 20_000);
            await sleep(3000);
          }
        } else if (!long) counters.abandoned++;
      } catch (e) {
        counters.cycleFailures++;
        console.log(`[soak] slot ${slot} cycle ${cycle}: ${String(e).slice(0, 160)}`);
      } finally {
        await Promise.all(clients.map((c) => c.leave()));
      }
      counters.cyclesFinished++;
      await sleep(300);
    }
  };
  const slots = Array.from({ length: cfg.rooms }, (_, i) => slotLoop(i));

  // ---- the sampler
  interface Row {
    t: number;
    gc: boolean;
    data: any;
  }
  const rows: Row[] = [];
  let sampleIdx = 0;
  const gcEvery = Math.max(1, Math.round(cfg.gcSec / cfg.sampleSec));
  let snapshotsTaken = 0;
  const take = async (gc: boolean): Promise<Row> => {
    const at = t(); // the moment the sample was ASKED for (the forced GC itself takes a moment)
    const data = (await server.request({ type: 'sample', gc })).data;
    data.machineLoad1 = loadavg()[0]; // what ELSE was running on this machine (a loaded box makes loop and CPU figures pessimistic)
    const row = { t: at, gc, data };
    rows.push(row);
    return row;
  };
  let running = true;
  const sampler = (async () => {
    while (running) {
      await sleep(cfg.sampleSec * 1000);
      if (!running) break;
      sampleIdx++;
      const row = await take(sampleIdx % gcEvery === 0);
      if (row.gc && cfg.heapSnapshots && (snapshotsTaken === 0 ? t() >= cfg.warmupSec : false)) {
        mkdirSync(cfg.heapSnapshots, { recursive: true });
        await server.request(
          {
            type: 'snapshot',
            file: path.join(cfg.heapSnapshots, `soak-${cfg.label}-t${Math.round(t())}.heapsnapshot`),
          },
          180_000,
        );
        snapshotsTaken++;
      }
      if (row.gc) {
        const m = row.data.memory;
        console.log(
          `[soak] t=${String(Math.round(row.t)).padStart(4)}s  heap(post-GC) ${String(m.heapUsedMB).padStart(7)} MB  rss ${String(m.rssMB).padStart(7)} MB  ext ${m.externalMB} MB  rooms ${row.data.rooms.live} clients ${row.data.rooms.clients}  loop p99 ${row.data.eventLoopDelayMs.p99} ms  cpu ${row.data.cpuPercent}%  cycles ${counters.cyclesFinished}`,
        );
      }
    }
  })();

  // ---- run, then tear everything down and look at what is left
  await Promise.all(slots);
  const loadEnd = t();
  await sleep(Math.max(cfg.sampleSec, 5) * 1000 + 4000); // reconnection windows and room disposal
  running = false;
  await sampler;
  const quiet = await take(true);
  if (cfg.heapSnapshots) {
    await server.request(
      { type: 'snapshot', file: path.join(cfg.heapSnapshots, `soak-${cfg.label}-end.heapsnapshot`) },
      180_000,
    );
  }
  await sleep(2000);
  const finalGc = await take(true);
  await server.stop();

  // ---- statistics
  const gcRows = rows.filter((r) => r.gc);
  // steady state = after the warm-up, while the load runs, with rooms alive (a sample taken after the teardown is not it)
  const steady = gcRows.filter((r) => r.t >= cfg.warmupSec && r.t <= loadEnd && r.data.rooms.live > 0);
  const heapPoints: Point[] = steady.map((r) => ({
    t: r.t,
    heapMB: r.data.memory.heapUsedMB,
    rooms: r.data.rooms.live,
  }));
  const b = trendBlocks(heapPoints);
  const loadRows = rows.filter((r) => r.t >= cfg.warmupSec && r.t <= loadEnd);
  const p99s = loadRows.map((r) => r.data.eventLoopDelayMs.p99 as number);
  const cpus = loadRows.map((r) => r.data.cpuPercent as number);
  const rss = rows.map((r) => r.data.memory.rssMB as number);
  const res = finalGc.data;
  // what grew over the whole steady window: each series is regressed over time (units per minute), so a slow leak of timers,
  // sockets, listeners or resident memory shows even when the heap after GC is flat
  const seriesTrend = (pick: (r: Row) => number) => {
    const pts = steady.map((r) => ({ t: r.t, heapMB: pick(r), rooms: r.data.rooms.live as number }));
    const tr = trend(pts);
    return {
      first: pts[0]?.heapMB ?? null,
      last: pts.at(-1)?.heapMB ?? null,
      slopePerMin: round(tr.slopeMBPerMin, 4),
      tStat: round(tr.tStat, 2),
      growing: tr.n >= 6 && tr.tStat >= 3 && tr.projectedMBPerHour > 0,
    };
  };
  const kindOf = (kind: string) => (r: Row) => (r.data.activeResources[kind] as number | undefined) ?? 0;
  const loads = rows.map((r) => r.data.machineLoad1 as number);
  const dropTotal = res.rooms.ticksDroppedTotal as number;
  const runTotal = res.rooms.ticksRunTotal as number;
  const kindsBase = baseline.activeResources as Record<string, number>;
  const kindsEnd = res.activeResources as Record<string, number>;
  const summary = {
    label: cfg.label,
    when: new Date(startedAt).toISOString(),
    node: server.node,
    config: {
      durationSec: cfg.durationSec,
      rooms: cfg.rooms,
      longSlot: cfg.longSlot,
      humansPerRoom: cfg.humans,
      botsLevel: cfg.botsLevel,
      cycleSec: cfg.cycleSec,
      warmupSec: cfg.warmupSec,
      sampleSec: cfg.sampleSec,
      gcSec: cfg.gcSec,
      seed: cfg.seed,
    },
    wallSec: round(t(), 1),
    counters,
    verdict: b.verdict,
    postGcHeapMB: {
      baselineEmpty: baseline.memory.heapUsedMB,
      ...b.heap,
      afterTeardown: quiet.data.memory.heapUsedMB,
      afterTeardownPlus2s: res.memory.heapUsedMB,
    },
    steadyTrendRaw: b.steadyTrendRaw,
    steadyTrendAdjustedForLiveRooms: b.steadyTrendAdjustedForLiveRooms,
    steadyTrend: b.steadyTrend,
    rssMB: { first: rss[0], max: Math.max(...rss), last: rss.at(-1), afterTeardown: res.memory.rssMB },
    external: {
      baselineMB: baseline.memory.externalMB,
      endMB: res.memory.externalMB,
      arrayBuffersEndMB: res.memory.arrayBuffersMB,
    },
    eventLoopDelayMs: {
      p99MedianOfSamples: round(percentile(p99s, 0.5)),
      p99Worst: round(Math.max(...p99s, 0)),
      maxWorst: round(Math.max(...loadRows.map((r) => r.data.eventLoopDelayMs.max as number), 0)),
    },
    cpuPercentOfOneCore: {
      mean: round(cpus.reduce((a, b) => a + b, 0) / Math.max(1, cpus.length), 1),
      max: Math.max(...cpus, 0),
    },
    ticksOverTheWholeRun: {
      run: runTotal,
      dropped: dropTotal,
      droppedPercent: runTotal > 0 ? round((dropTotal / (runTotal + dropTotal)) * 100, 3) : 0,
    },
    machine: {
      cpus: cpuList().length,
      loadAverage1m: { mean: round(loads.reduce((a, b) => a + b, 0) / Math.max(1, loads.length), 2), max: round(Math.max(...loads, 0), 2), first: round(loads[0] ?? 0, 2) },
      note: 'load average of the whole machine at each sample: a value above the CPU count means other work was competing with the soak',
    },
    resourceTrendsSteadyWindow: {
      rssMB: seriesTrend((r) => r.data.memory.rssMB),
      externalMB: seriesTrend((r) => r.data.memory.externalMB),
      timers: seriesTrend(kindOf('Timeout')),
      sockets: seriesTrend((r) => kindOf('TCPSocketWrap')(r) + kindOf('TCPServerWrap')(r)),
      processListeners: seriesTrend((r) => r.data.listeners.process),
      roomTypeListeners: seriesTrend((r) => r.data.listeners.roomType),
      liveRoomsAtSamples: seriesTrend((r) => r.data.rooms.live),
    },
    ticksDroppedPeakInLiveRooms: Math.max(...loadRows.map((r) => r.data.rooms.ticksDropped as number), 0),
    rooms: {
      created: res.rooms.created,
      disposed: res.rooms.disposed,
      finalizedByGc: res.rooms.finalized,
      liveAtEnd: res.rooms.live,
      registeredInMetricsAtEnd: res.rooms.registered,
      clientsAtEnd: res.rooms.clients,
      retainedAfterGc: res.rooms.retainedAfterGc,
    },
    activeResourcesBaseline: kindsBase,
    activeResourcesEnd: kindsEnd,
    postGcSeries: gcRows.map((r) => [
      Math.round(r.t),
      r.data.memory.heapUsedMB,
      r.data.memory.rssMB,
      r.data.memory.externalMB,
      r.data.memory.arrayBuffersMB,
      r.data.rooms.live,
      r.data.rooms.clients,
    ]),
    seriesColumns: [
      'tSec',
      'heapUsedMB(post-GC)',
      'rssMB',
      'externalMB',
      'arrayBuffersMB',
      'liveRooms',
      'clients',
    ],
  };

  console.log('\n[soak] SUMMARY');
  console.log(
    `  verdict                 ${summary.verdict.toUpperCase()}   (steady window ${summary.steadyTrend.spanSec} s, ${summary.steadyTrend.points} post-GC samples)`,
  );
  console.log(
    `  post-GC heap            first ${summary.postGcHeapMB.firstSteady} -> last ${summary.postGcHeapMB.lastSteady} MB (thirds: ${summary.postGcHeapMB.firstThirdMean} -> ${summary.postGcHeapMB.lastThirdMean}); empty server ${summary.postGcHeapMB.baselineEmpty}; after teardown ${summary.postGcHeapMB.afterTeardown}`,
  );
  console.log(
    `  trend                   ${summary.steadyTrend.slopeMBPerMin} +/- ${summary.steadyTrend.seMBPerMin} MB/min (t=${summary.steadyTrend.tStat}, r2=${summary.steadyTrend.r2}); projects ${summary.steadyTrend.projectedMBPerHour} MB/h`,
  );
  console.log(
    `  rss                     first ${summary.rssMB.first} max ${summary.rssMB.max} last ${summary.rssMB.last}`,
  );
  console.log(
    `  event loop delay p99    median ${summary.eventLoopDelayMs.p99MedianOfSamples} ms, worst ${summary.eventLoopDelayMs.p99Worst} ms (max ${summary.eventLoopDelayMs.maxWorst} ms)`,
  );
  console.log(
    `  whole run ticks         ${summary.ticksOverTheWholeRun.run} run, ${summary.ticksOverTheWholeRun.dropped} dropped (${summary.ticksOverTheWholeRun.droppedPercent} %)`,
    `  machine load (1 min)    mean ${summary.machine.loadAverage1m.mean}, max ${summary.machine.loadAverage1m.max} on ${summary.machine.cpus} CPUs`,
    `  growing series          ${Object.entries(summary.resourceTrendsSteadyWindow).filter(([, v]) => v.growing).map(([k]) => k).join(', ') || 'none (rss, external, timers, sockets, listeners all flat)'}`,
    `  cpu                     mean ${summary.cpuPercentOfOneCore.mean}% max ${summary.cpuPercentOfOneCore.max}% of one core; dropped ticks ${summary.ticksDroppedPeakInLiveRooms}`,
  );
  console.log(
    `  rooms                   created ${summary.rooms.created}, disposed ${summary.rooms.disposed}, finalized ${summary.rooms.finalizedByGc}, live at end ${summary.rooms.liveAtEnd}, retained after GC ${summary.rooms.retainedAfterGc}`,
  );
  console.log(`  cycles                  ${JSON.stringify(counters)}`);
  console.log(
    `  active handles          baseline ${JSON.stringify(kindsBase)} -> end ${JSON.stringify(kindsEnd)}`,
  );

  if (cfg.out) {
    mkdirSync(path.dirname(cfg.out), { recursive: true });
    writeFileSync(cfg.out, JSON.stringify(summary) + '\n');
    console.log(`[soak] wrote ${path.relative(ROOT, cfg.out)}`);
  }
  process.exit(0);
}

/**
 * `--analyse FILE [--warmup-sec N] [--write]`: the verdict again from a saved summary's post-GC series (no server is
 * started). With `--write` the derived blocks of that file (verdict, trends, steady-state heap figures) are rewritten from
 * the raw series, so a summary can always be re-derived from its own data.
 */
function analyse(file: string, warmupSec: number, write: boolean): void {
  const s = JSON.parse(readFileSync(file, 'utf8'));
  const end = (s.config.durationSec as number) + 5;
  const points: Point[] = (s.postGcSeries as number[][])
    .filter((r) => r[0]! >= warmupSec && r[0]! <= end && r[5]! > 0)
    .map((r) => ({ t: r[0]!, heapMB: r[1]!, rooms: r[5]! }));
  const b = trendBlocks(points);
  const v = b.v;
  const f = (x: number): string => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');
  console.log(
    `${path.basename(file)}: ${v.verdict.toUpperCase()} (${points.length} post-GC samples from ${warmupSec} s)`,
  );
  console.log(
    `  raw trend       ${f(v.raw.slopeMBPerMin)} +/- ${f(v.raw.seMBPerMin)} MB/min (t=${f(v.raw.tStat)}, r2=${f(v.raw.r2)})`,
  );
  console.log(
    `  ${v.adjusted ? 'adjusted' : 'used    '}        ${f(v.trend.slopeMBPerMin)} +/- ${f(v.trend.seMBPerMin)} MB/min (t=${f(v.trend.tStat)}, r2=${f(v.trend.r2)}), projects ${f(v.trend.projectedMBPerHour)} MB/h`,
  );
  if (write) {
    s.verdict = b.verdict;
    s.postGcHeapMB = { ...s.postGcHeapMB, ...b.heap };
    s.steadyTrendRaw = b.steadyTrendRaw;
    s.steadyTrendAdjustedForLiveRooms = b.steadyTrendAdjustedForLiveRooms;
    s.steadyTrend = b.steadyTrend;
    s.config = { ...s.config, warmupSec };
    writeFileSync(file, JSON.stringify(s) + '\n');
    console.log(`  rewrote the derived blocks of ${path.basename(file)}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const at = process.argv.indexOf('--analyse');
  if (at >= 0) {
    analyse(
      path.resolve(process.argv[at + 1] ?? ''),
      Number(process.argv[process.argv.indexOf('--warmup-sec') + 1]) || 60,
      process.argv.includes('--write'),
    );
    process.exit(0);
  }
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
