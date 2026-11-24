/* eslint-disable @typescript-eslint/no-explicit-any -- the result JSON and IPC messages are untyped records by design */
/**
 * Load / network-impairment orchestrator for City Rumble online (results: docs/measurements/rumble-online/).
 *
 * Starts the server as a SEPARATE process (`tsx server/src/main.ts`, RUMBLE_TEST_FAST=1), spreads headless clients over
 * 1-4 worker processes (each client dials the server through its own impairment proxy, see impairProxy.ts), runs one
 * match per room, polls `GET /metrics` every second, and writes one JSON per run plus a printed summary.
 *
 * Examples:
 *   npm run load -- --clients 32 --profile mobile
 *   npm run load -- --clients 32 --profile mobile --scenario reconnect
 *   npm run load -- --clients 4 --scenario background
 *   npm run load -- --clients 2 --rooms 4            (4 rooms x 2 humans + 30 bots)
 *
 * Flags: --clients N (humans per room, 1-32) --rooms K --profile clean|europe|mobile|bad-mobile
 *   --scenario basic|reconnect|background --procs P (1-4) --duration SEC (match length, default 60)
 *   --reconnect-seconds S (server window, default 30; 10 for the reconnect scenario) --cap SEC (default 150)
 *   --server-bundle PATH (run the bundled server with plain node)
 *   --label NAME --out DIR --seed N --arena ID --input-gap MS (min ms between input messages, default 80; 0 = unthrottled)
 */
import { spawn, fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClientRecord, ClientSpec } from './loadClient';
import { PROFILES } from './impairProxy';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(HERE, '..');
const ROOT = path.resolve(SERVER_DIR, '..');

export interface LoadConfig {
  clients: number;
  rooms: number;
  profile: string;
  scenario: 'basic' | 'reconnect' | 'background';
  procs: number;
  durationSec: number;
  reconnectSeconds: number;
  capSec: number;
  label: string;
  out: string;
  seed: number;
  arena: string;
  inputGapMs: number;
  /** Run this bundled server (`npm run bundle` output) with plain `node` instead of the TypeScript sources. */
  serverBundle: string | null;
}

function parseArgs(argv: string[]): LoadConfig {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const clients = Number(get('clients') ?? 4);
  const rooms = Number(get('rooms') ?? 1);
  const profile = get('profile') ?? 'clean';
  const scenario = (get('scenario') ?? 'basic') as LoadConfig['scenario'];
  if (!PROFILES[profile]) throw new Error(`unknown profile ${profile}`);
  if (!['basic', 'reconnect', 'background'].includes(scenario))
    throw new Error(`unknown scenario ${scenario}`);
  if (!(clients >= 1 && clients <= 32)) throw new Error('--clients must be 1..32');
  const total = clients * rooms;
  const procs = Number(get('procs') ?? Math.min(3, Math.max(1, Math.ceil(total / 12))));
  return {
    clients,
    rooms,
    profile,
    scenario,
    procs: Math.min(4, Math.max(1, procs)),
    durationSec: Number(get('duration') ?? 60),
    reconnectSeconds: Number(get('reconnect-seconds') ?? (scenario === 'reconnect' ? 10 : 30)),
    capSec: Number(get('cap') ?? 150),
    label: get('label') ?? `${scenario}-${profile}-c${String(clients).padStart(2, '0')}-r${rooms}`,
    out: path.resolve(get('out') ?? path.join(ROOT, 'docs/measurements/rumble-online')),
    seed: Number(get('seed') ?? 1),
    arena: get('arena') ?? 'rumbleOshodi',
    inputGapMs: Number(get('input-gap') ?? 80),
    serverBundle: get('server-bundle') ? path.resolve(get('server-bundle')!) : null,
  };
}

// ---------------------------------------------------------------------------------------------------- helpers

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function pct(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(s.length * p) - 1))]!;
}
const mean = (v: number[]): number => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const r1 = (x: number): number => (Number.isFinite(x) ? Math.round(x * 10) / 10 : x);
const r2 = (x: number): number => (Number.isFinite(x) ? Math.round(x * 100) / 100 : x);
const dist = (v: number[]): { n: number; p50: number; p95: number; max: number; mean: number } => ({
  n: v.length,
  p50: r1(pct(v, 0.5)),
  p95: r1(pct(v, 0.95)),
  max: r1(v.length ? Math.max(...v) : NaN),
  mean: r1(mean(v)),
});

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

interface MetricsSample {
  t: number;
  process: {
    pid: number;
    cpuUsage: { user: number; system: number };
    memoryUsage: { rss: number; heapUsed: number; heapTotal: number };
    eventLoopDelayMs: { mean: number; p50: number; p99: number; max: number };
  };
  rooms: RoomSnap[];
}
interface Stat {
  count: number;
  mean: number;
  p99: number;
  max: number;
}
interface RoomSnap {
  id: string;
  phase: string;
  humans: number;
  connectedHumans: number;
  ticks: { run: number; dropped: number; stepMs: Stat; broadcastMs: Stat; timerLatenessMs: Stat };
  net: Record<string, number>;
  inputs: { accepted: number; stale: number; overRate: number };
  clients: { seat: number | null; bytesOut: number; messagesIn: number; invalidMessages: number }[];
}

// ---------------------------------------------------------------------------------------------------- run

interface Worker {
  proc: ChildProcess;
  call(msg: Record<string, unknown>): Promise<Record<string, any>>;
}

function startWorker(
  onEvent: (e: Record<string, any>) => void,
  workerLog: (s: string) => void,
): Promise<Worker> {
  return new Promise((resolve, reject) => {
    const proc = fork(path.join(HERE, 'loadWorker.ts'), [], {
      cwd: ROOT,
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    proc.stdout?.on('data', (d) => workerLog(String(d)));
    proc.stderr?.on('data', (d) => workerLog(String(d)));
    let nextId = 1;
    const waiting = new Map<number, (m: Record<string, any>) => void>();
    proc.on('message', (m: Record<string, any>) => {
      if (m.evt === 'ready') {
        resolve({
          proc,
          call: (msg) =>
            new Promise((res) => {
              const id = nextId++;
              waiting.set(id, res);
              proc.send({ ...msg, id });
            }),
        });
      } else if (m.evt) onEvent(m);
      else if (typeof m.id === 'number') {
        waiting.get(m.id)?.(m);
        waiting.delete(m.id);
      }
    });
    proc.on('error', reject);
    proc.on('exit', (code) => {
      for (const w of waiting.values()) w({ ok: false, error: `worker exited (${code})` });
    });
  });
}

export async function runLoad(cfg: LoadConfig): Promise<Record<string, any>> {
  const warnings: string[] = [];
  const total = cfg.clients * cfg.rooms;
  const port = await freePort();
  const serverLog: string[] = [];
  const tsxBin = path.join(ROOT, 'node_modules/.bin/tsx');
  const [serverCmd, serverArgs] = cfg.serverBundle
    ? [process.execPath, [cfg.serverBundle]]
    : [tsxBin, ['server/bench/rumbleServerProc.ts']];
  const server = spawn(serverCmd, serverArgs, {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      RUMBLE_TEST_FAST: '1',
      RUMBLE_LIMITS: 'off', // many clients from one address, on purpose
      RUMBLE_RECONNECT_SECONDS: String(cfg.reconnectSeconds),
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', (d) => serverLog.push(String(d)));
  server.stderr?.on('data', (d) => serverLog.push(String(d)));
  let serverExited: number | null = null;
  let serverExit = '';
  let stopping = false;
  server.on('exit', (c, sig) => {
    serverExited = c ?? -1;
    serverExit = `code ${c} signal ${sig}`;
    if (!stopping) warnings.push(`SERVER EXITED during the run: ${serverExit}`);
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) break;
    } catch {
      /* not yet */
    }
    if (i > 100) throw new Error(`server did not start: ${serverLog.join('')}`);
    await sleep(100);
  }

  // ---- workers
  const started = new Map<number, number | null>();
  const finished = new Set<number>();
  const workerLogs: string[] = [];
  const workers: Worker[] = [];
  for (let i = 0; i < cfg.procs; i++) {
    workers.push(
      await startWorker(
        (e) => {
          if (e.evt === 'started') started.set(e.index, e.seat);
          else if (e.evt === 'finished') finished.add(e.index);
        },
        (s) => workerLogs.push(s),
      ),
    );
  }

  // ---- metrics poller
  const samples: MetricsSample[] = [];
  const machine: number[] = [];
  let polling = true;
  const t00 = performance.now();
  let lastStat: { busy: number; total: number } | null = null;
  const poll = async (): Promise<void> => {
    try {
      // whole-machine CPU (all vCPUs, every process): shows when something else competes with the run
      const f = readFileSync('/proc/stat', 'utf8').split('\n')[0]!.split(/\s+/).slice(1).map(Number);
      const total = f.reduce((a, b) => a + b, 0);
      const busy = total - f[3]! - (f[4] ?? 0);
      if (lastStat)
        machine.push(((busy - lastStat.busy) / (total - lastStat.total)) * os.cpus().length * 100);
      lastStat = { busy, total };
    } catch {
      /* not linux */
    }
    try {
      const r = await fetch(`${base}/metrics`, { signal: AbortSignal.timeout(3000) });
      const j = (await r.json()) as Omit<MetricsSample, 't'>;
      samples.push({ ...j, t: performance.now() - t00 } as MetricsSample);
    } catch (e) {
      warnings.push(`metrics poll failed at ${Math.round(performance.now() - t00)} ms: ${String(e)}`);
    }
  };
  const pollLoop = (async () => {
    while (polling) {
      await poll();
      await sleep(1000);
    }
  })();

  // ---- specs
  const specs: ClientSpec[] = [];
  const seats: { room: number; slot: number }[] = [];
  for (let room = 0; room < cfg.rooms; room++) {
    for (let slot = 0; slot < cfg.clients; slot++) {
      const index = room * cfg.clients + slot;
      seats.push({ room, slot });
      const spec: ClientSpec = {
        index,
        name: `Load ${String(index).padStart(2, '0')}`,
        role: slot === 0 ? 'host' : 'joiner',
        profile: cfg.profile,
        seed: cfg.seed * 100_000 + index * 7 + 1,
        serverPort: port,
        inputGapMs: cfg.inputGapMs,
        ...(slot === 0
          ? {
              roomOptions: {
                private: true,
                game: 'deathmatch',
                durationSec: cfg.durationSec,
                arenaId: cfg.arena,
              },
            }
          : {}),
      };
      if (cfg.scenario === 'reconnect' && room === 0) {
        // never the host (slot 0): slots 3, 6, 9, 12 drop and come back after 3 s, slot 15 never returns
        if ([3, 6, 9, 12].includes(slot)) spec.drop = { atSec: 20, afterMs: 3000, returns: true };
        if (slot === 15) spec.drop = { atSec: 20, afterMs: 0, returns: false };
      }
      if (cfg.scenario === 'background' && room === 0 && slot >= 1 && slot <= 4) {
        spec.background = { atSec: 15, forMs: 10_000 };
      }
      specs.push(spec);
    }
  }
  const workerOf = (index: number): Worker => workers[index % workers.length]!;
  const connectFailures: string[] = [];
  const connected = new Set<number>();
  const codes: string[] = [];

  // ---- connect: hosts first, then joiners (a bounded number at a time)
  const tConnect0 = performance.now();
  const hosts = specs.filter((s) => s.role === 'host');
  await Promise.all(
    hosts.map(async (spec) => {
      const r = await workerOf(spec.index).call({ cmd: 'connect', spec });
      if (r.ok) {
        connected.add(spec.index);
        codes[Math.floor(spec.index / cfg.clients)] = r.code;
      } else connectFailures.push(`host ${spec.index}: ${r.error}`);
    }),
  );
  const joiners = specs.filter((s) => s.role === 'joiner');
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (cursor < joiners.length) {
        const spec = joiners[cursor++]!;
        const code = codes[Math.floor(spec.index / cfg.clients)];
        if (!code) {
          connectFailures.push(`joiner ${spec.index}: room had no host`);
          continue;
        }
        const r = await workerOf(spec.index).call({ cmd: 'connect', spec, code });
        if (r.ok) connected.add(spec.index);
        else connectFailures.push(`joiner ${spec.index}: ${r.error}`);
      }
    }),
  );
  const connectMs = Math.round(performance.now() - tConnect0);
  // let the last lobby messages travel over the slowest profile before the host starts
  await sleep(1500 + 6 * (PROFILES[cfg.profile]?.oneWayMs ?? 0));

  // ---- start every room, wait for the matches
  const tStart = performance.now();
  for (const spec of hosts)
    if (connected.has(spec.index)) await workerOf(spec.index).call({ cmd: 'start', index: spec.index });
  const startDeadline = Date.now() + 30_000;
  while (started.size < connected.size && Date.now() < startDeadline) await sleep(100);
  if (started.size < connected.size)
    warnings.push(`${connected.size - started.size} connected clients never received a keyframe`);

  // reconnect scenario: tell everybody which seat is never coming back
  let watchSeat: number | null = null;
  if (cfg.scenario === 'reconnect') {
    const gone = specs.find((s) => s.drop && !s.drop.returns);
    if (gone && started.get(gone.index) != null) {
      watchSeat = started.get(gone.index)!;
      const fromTick = (20 + cfg.reconnectSeconds + 3) * 60;
      for (const w of workers) await w.call({ cmd: 'watch', seat: watchSeat, fromTick });
    }
  }

  const deadline = Date.now() + cfg.capSec * 1000;
  while (Date.now() < deadline) {
    const pending = [...connected].filter((i) => started.has(i) && !finished.has(i));
    if (pending.length === 0) break;
    await sleep(250);
  }
  const unfinished = [...connected].filter((i) => !finished.has(i));
  if (unfinished.length > 0)
    warnings.push(`clients without a final result at the ${cfg.capSec}s cap: ${unfinished.join(',')}`);
  await sleep(300);
  await poll();
  const matchWallSec = (performance.now() - tStart) / 1000;
  polling = false;
  await pollLoop;
  const finalSample = samples[samples.length - 1];

  // ---- collect
  const records: ClientRecord[] = [];
  const workerProcs: Record<string, unknown>[] = [];
  for (const w of workers) {
    const r = await w.call({ cmd: 'collect' });
    if (r.ok) {
      records.push(...(r.records as ClientRecord[]));
      workerProcs.push(r.process);
    } else warnings.push(`worker collect failed: ${r.error}`);
  }
  records.sort((a, b) => a.index - b.index);
  for (const w of workers) {
    await w.call({ cmd: 'exit' });
  }
  stopping = true;
  server.kill('SIGTERM');
  await sleep(300);
  if (serverExited === null) server.kill('SIGKILL');
  const serverErrors = serverLog
    .join('')
    .split('\n')
    .filter((l) => /error|exception|unhandled|fail/i.test(l));
  const workerErrors = workerLogs
    .join('')
    .split('\n')
    .filter((l) => /error|exception|unhandled/i.test(l));

  return analyse(cfg, {
    specs,
    records,
    samples,
    finalSample,
    workerProcs,
    machine,
    connectFailures,
    warnings,
    connectMs,
    matchWallSec,
    serverErrors: [...serverErrors, ...serverLog.slice(-8)],
    workerErrors,
    watchSeat,
    total,
  });
}

// ---------------------------------------------------------------------------------------------------- analysis

interface Raw {
  specs: ClientSpec[];
  records: ClientRecord[];
  samples: MetricsSample[];
  finalSample: MetricsSample | undefined;
  workerProcs: Record<string, unknown>[];
  machine: number[];
  connectFailures: string[];
  warnings: string[];
  connectMs: number;
  matchWallSec: number;
  serverErrors: string[];
  workerErrors: string[];
  watchSeat: number | null;
  total: number;
}

const roomId = (code: string): string => createHash('sha256').update(code).digest('hex').slice(0, 8);

function windowStats(rooms: { ms: Stat }[][]): {
  mean: number;
  p99Median: number;
  p99Worst: number;
  max: number;
} {
  // rooms[sampleIndex][room]: each sample's stat covers the last 600 ticks (10 s) of that room
  const means: number[] = [];
  const p99s: number[] = [];
  let max = 0;
  for (const s of rooms)
    for (const r of s) {
      if (r.ms.count === 0) continue;
      means.push(r.ms.mean);
      p99s.push(r.ms.p99);
      max = Math.max(max, r.ms.max);
    }
  return {
    mean: r2(mean(means)),
    p99Median: r2(pct(p99s, 0.5)),
    p99Worst: r2(p99s.length ? Math.max(...p99s) : NaN),
    max: r2(max),
  };
}

function analyse(cfg: LoadConfig, raw: Raw): Record<string, any> {
  const { records, samples } = raw;
  // ---------------- server
  const playing = samples.filter((s) => s.rooms.some((r) => r.phase === 'playing'));
  const cpuPct: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    if (!(b.rooms.some((r) => r.phase === 'playing') && a.rooms.some((r) => r.phase === 'playing'))) continue;
    const used =
      b.process.cpuUsage.user -
      a.process.cpuUsage.user +
      (b.process.cpuUsage.system - a.process.cpuUsage.system);
    cpuPct.push((used / 1000 / (b.t - a.t)) * 100);
  }
  const rssMB = playing.map((s) => s.process.memoryUsage.rss / 1048576);
  const heapMB = playing.map((s) => s.process.memoryUsage.heapUsed / 1048576);
  const loopP99 = playing.map((s) => s.process.eventLoopDelayMs.p99);
  const loopMax = playing.map((s) => s.process.eventLoopDelayMs.max);
  const stepWindows = playing.map((s) =>
    s.rooms.filter((r) => r.phase === 'playing').map((r) => ({ ms: r.ticks.stepMs })),
  );
  const lateWindows = playing.map((s) =>
    s.rooms.filter((r) => r.phase === 'playing').map((r) => ({ ms: r.ticks.timerLatenessMs })),
  );
  const bcastWindows = playing.map((s) =>
    s.rooms.filter((r) => r.phase === 'playing').map((r) => ({ ms: r.ticks.broadcastMs })),
  );
  const finalRooms = raw.finalSample?.rooms ?? [];
  const roomSummaries = finalRooms.map((r) => ({
    id: r.id,
    humans: r.humans,
    ticksRun: r.ticks.run,
    ticksDropped: r.ticks.dropped,
    framesBytesPerClient: r.net.framesBytesPerClient,
    framesBytesRaw: r.net.framesBytesRaw,
    keyframesSent: r.net.keyframesSent,
    bytesSentTotal: r.net.bytesSentTotal,
    messagesIn: r.net.messagesIn,
    invalidMessages: r.net.invalidMessages,
    kicks: r.net.kicks,
    resyncsServed: r.net.resyncsServed,
    reconnections: r.net.reconnections,
    inputs: r.inputs,
    matches: r.phase,
    clientsBytesOut: r.clients.map((c) => c.bytesOut),
  }));
  const matchSecServer = Math.max(
    0,
    (playing.length ? playing[playing.length - 1]!.t - playing[0]!.t : 0) / 1000,
  );
  const server = {
    pid: raw.finalSample?.process.pid,
    cpuPercentOfOneCore: {
      mean: r1(mean(cpuPct)),
      p95: r1(pct(cpuPct, 0.95)),
      max: r1(cpuPct.length ? Math.max(...cpuPct) : NaN),
      samples: cpuPct.length,
    },
    rssMB: { mean: r1(mean(rssMB)), max: r1(rssMB.length ? Math.max(...rssMB) : NaN) },
    heapUsedMB: { mean: r1(mean(heapMB)), max: r1(heapMB.length ? Math.max(...heapMB) : NaN) },
    eventLoopDelayMs: {
      p99Median: r2(pct(loopP99, 0.5)),
      p99Worst: r2(loopP99.length ? Math.max(...loopP99) : NaN),
      max: r2(loopMax.length ? Math.max(...loopMax) : NaN),
    },
    stepMs: windowStats(stepWindows),
    broadcastMs: windowStats(bcastWindows),
    timerLatenessMs: windowStats(lateWindows),
    ticksDropped: roomSummaries.reduce((a, r) => a + r.ticksDropped, 0),
    ticksRun: roomSummaries.reduce((a, r) => a + r.ticksRun, 0),
    inputs: {
      accepted: roomSummaries.reduce((a, r) => a + r.inputs.accepted, 0),
      stale: roomSummaries.reduce((a, r) => a + r.inputs.stale, 0),
      overRate: roomSummaries.reduce((a, r) => a + r.inputs.overRate, 0),
    },
    invalidMessages: roomSummaries.reduce((a, r) => a + r.invalidMessages, 0),
    kicks: roomSummaries.reduce((a, r) => a + r.kicks, 0),
    resyncsServed: roomSummaries.reduce((a, r) => a + r.resyncsServed, 0),
    reconnections: roomSummaries.reduce((a, r) => a + r.reconnections, 0),
    bytesSentTotal: roomSummaries.reduce((a, r) => a + r.bytesSentTotal, 0),
    matchWindowSec: r1(matchSecServer),
    rooms: roomSummaries,
  };

  // ---------------- clients
  const active = records.filter((r) => !r.departed && r.results !== null);
  const kb = (bytes: number, ms: number): number => (ms > 0 ? bytes / 1024 / (ms / 1000) : NaN);
  const perClient = records.map((r) => ({
    index: r.index,
    seat: r.seat,
    departed: r.departed,
    kbDownPerSec: r2(kb(r.matchBytesDown, r.matchWallMs)),
    kbUpPerSec: r2(kb(r.matchBytesUp, r.matchWallMs)),
    rtt: dist(r.rttMs),
    inputLatency: dist(r.inputLatencyMs),
    inputLatencyUnresolved: r.inputLatencyUnresolved,
    tickLag: dist(r.tickLagMs),
    buffer: dist(r.bufferTicks),
    inputsSent: r.inputsSent,
    maxInputsPerSecond: r.maxInputsPerSecond,
    replica: r.replica,
    resyncRequests: r.resyncRequests,
    proxyStalls: r.proxy?.stalls,
    proxyHolMs: r2(r.proxy?.holMs ?? 0),
    keyframes: r.payload.keyframes,
    leaveCodes: r.leaveCodes,
    notices: r.notices,
    errors: r.errors,
  }));
  const down = active.map((r) => kb(r.matchBytesDown, r.matchWallMs)).filter(Number.isFinite);
  const up = active.map((r) => kb(r.matchBytesUp, r.matchWallMs)).filter(Number.isFinite);
  const pool = (f: (r: ClientRecord) => number[]): number[] => active.flatMap(f);
  const replicaSum = (k: keyof ClientRecord['replica']): number =>
    records.reduce((a, r) => a + r.replica[k], 0);
  const clients = {
    configured: raw.total,
    connected: records.length,
    played: active.length,
    departed: records.filter((r) => r.departed).length,
    connectFailures: raw.connectFailures,
    kbDownPerSec: {
      mean: r2(mean(down)),
      p50: r2(pct(down, 0.5)),
      max: r2(down.length ? Math.max(...down) : NaN),
    },
    kbUpPerSec: { mean: r2(mean(up)), p50: r2(pct(up, 0.5)), max: r2(up.length ? Math.max(...up) : NaN) },
    totalDownKBps: r1(down.reduce((a, b) => a + b, 0)),
    totalUpKBps: r1(up.reduce((a, b) => a + b, 0)),
    rttMs: dist(pool((r) => r.rttMs)),
    inputLatencyMs: dist(pool((r) => r.inputLatencyMs)),
    inputLatencyUnresolved: records.reduce((a, r) => a + r.inputLatencyUnresolved, 0),
    tickLagMs: dist(pool((r) => r.tickLagMs)),
    bufferTicks: dist(pool((r) => r.bufferTicks)),
    hashChecks: replicaSum('hashChecks'),
    hashMismatches: replicaSum('hashMismatches'),
    resyncs: replicaSum('resyncs'),
    resyncRequests: records.reduce((a, r) => a + r.resyncRequests, 0),
    skippedAhead: replicaSum('skippedAhead'),
    framesApplied: replicaSum('framesApplied'),
    inputsSent: records.reduce((a, r) => a + r.inputsSent, 0),
    maxInputsPerSecond: records.reduce((a, r) => Math.max(a, r.maxInputsPerSecond), 0),
    proxyStalls: records.reduce((a, r) => a + (r.proxy?.stalls ?? 0), 0),
    matchWallSecMean: r1(mean(active.map((r) => r.matchWallMs / 1000))),
  };

  // ---------------- consistency (per room: clients of one room share one match)
  const byRoom = new Map<string, ClientRecord[]>();
  for (const r of records) {
    const key = r.roomCode ?? 'none';
    if (!byRoom.has(key)) byRoom.set(key, []);
    byRoom.get(key)!.push(r);
  }
  const consistency = [...byRoom.entries()].map(([code, group]) => {
    const live = group.filter((r) => !r.departed && r.results !== null && r.finalHash !== null);
    const hashes = new Set(live.map((r) => r.finalHash));
    const stateHashes = new Set(live.map((r) => r.results!.stateHash));
    const hashEqualsServer = live.every((r) => r.finalHash === r.results!.stateHash);
    const resultsJson = new Set(live.map((r) => JSON.stringify(r.results)));
    const finalTicks = new Set(live.map((r) => r.finalTick));
    const evCheck = <T>(key: (t: T) => string, tickOf: (t: T) => number, get: (r: ClientRecord) => T[]) => {
      const union = new Set<string>();
      const sets = live.map((r) => {
        const keys = get(r).map(key);
        for (const k of keys) union.add(k);
        return keys;
      });
      let missedUnexplained = 0;
      let missedInGap = 0;
      let duplicated = 0;
      const byKey = new Map<string, T>();
      for (const r of live) for (const e of get(r)) byKey.set(key(e), e);
      live.forEach((r, i) => {
        const have = new Set(sets[i]);
        duplicated += sets[i]!.length - have.size;
        for (const k of union) {
          if (have.has(k)) continue;
          const tick = tickOf(byKey.get(k)!);
          if (r.gaps.some(([from, to]) => tick > from && tick <= to)) missedInGap++;
          else missedUnexplained++;
        }
      });
      return { union: union.size, missedUnexplained, missedInGap, duplicated };
    };
    const elim = evCheck<ClientRecord['eliminations'][number]>(
      (e) => `${e.tick}:${e.playerId}:${e.creditId}`,
      (e) => e.tick,
      (r) => r.eliminations,
    );
    const expl = evCheck<ClientRecord['explosions'][number]>(
      (e) => `${e.tick}:${e.generatorId}`,
      (e) => e.tick,
      (r) => r.explosions,
    );
    // the union of eliminations vs what the server's own results say
    const res = live[0]?.results;
    const killsSum = res ? res.players.reduce((a, p) => a + p.kills, 0) : null;
    const deathsSum = res ? res.players.reduce((a, p) => a + p.deaths, 0) : null;
    const elimUnion = new Map<string, ClientRecord['eliminations'][number]>();
    for (const r of live)
      for (const e of r.eliminations) elimUnion.set(`${e.tick}:${e.playerId}:${e.creditId}`, e);
    const credited = [...elimUnion.values()].filter((e) => e.creditId !== null).length;
    const suddenDeathEvents = [...elimUnion.values()].filter((e) => e.cause === 'suddenDeath').length;
    return {
      room: roomId(code),
      clientsCompared: live.length,
      finalHashesEqual: hashes.size === 1,
      finalHashEqualsResultsStateHash: hashEqualsServer && stateHashes.size === 1,
      resultsIdentical: resultsJson.size === 1,
      finalTicksEqual: finalTicks.size === 1,
      finalTick: [...finalTicks][0] ?? null,
      eliminations: elim,
      explosions: expl,
      resultsKillsSum: killsSum,
      resultsDeathsSum: deathsSum,
      eliminationEventsSeen: elimUnion.size,
      eliminationEventsCredited: credited,
      eliminationEventsSuddenDeath: suddenDeathEvents,
      winnerSeat: res?.winnerSeat ?? null,
      draw: res?.draw ?? null,
      matchTick: res?.tick ?? null,
    };
  });
  const allConsistent =
    consistency.length > 0 &&
    consistency.every(
      (c) =>
        c.finalHashesEqual && c.finalHashEqualsResultsStateHash && c.resultsIdentical && c.finalTicksEqual,
    );

  // ---------------- scenario specifics
  const reconnects = records
    .filter((r) => r.reconnect)
    .map((r) => ({
      index: r.index,
      seat: r.seat,
      returned: !r.departed,
      droppedAtTick: r.reconnect!.droppedAtTick,
      reconnectCallMs: r.reconnect!.reconnectCallMs,
      keyframeMs: r.reconnect!.keyframeMs,
      consistentMs: r.reconnect!.consistentMs,
      resyncsDuring: r.reconnect!.resyncsDuring,
      finalHashOk: r.finalHash !== null && r.finalHash === r.results?.stateHash,
      hashMismatches: r.replica.hashMismatches,
      leaveCodes: r.leaveCodes,
      errors: r.errors,
      gaps: r.gaps,
    }));
  const backgrounds = records
    .filter((r) => r.background)
    .map((r) => ({
      index: r.index,
      ...r.background!,
      finalHashOk: r.finalHash !== null && r.finalHash === r.results?.stateHash,
      hashMismatches: r.replica.hashMismatches,
      resyncs: r.replica.resyncs,
      skippedAheadTotal: r.replica.skippedAhead,
    }));
  const watches = records.filter((r) => r.watch).map((r) => ({ index: r.index, ...r.watch! }));
  const departedSeat = raw.watchSeat;
  const departedRes =
    departedSeat !== null ? active[0]?.results?.players.find((p) => p.seat === departedSeat) : undefined;

  const worst = (xs: number[]): number => (xs.length ? Math.max(...xs) : NaN);
  const result = {
    meta: {
      label: cfg.label,
      date: new Date().toISOString(),
      scenario: cfg.scenario,
      profile: cfg.profile,
      profileParams: PROFILES[cfg.profile],
      humansPerRoom: cfg.clients,
      rooms: cfg.rooms,
      totalClients: raw.total,
      workerProcesses: cfg.procs,
      durationSec: cfg.durationSec,
      reconnectSeconds: cfg.reconnectSeconds,
      capSec: cfg.capSec,
      arena: cfg.arena,
      inputGapMs: cfg.inputGapMs,
      seed: cfg.seed,
      machine: {
        cpu: os.cpus()[0]?.model,
        vcpus: os.cpus().length,
        ramGB: Math.round(os.totalmem() / 1e9),
        node: process.version,
      },
      connectMs: raw.connectMs,
      matchWallSec: r1(raw.matchWallSec),
    },
    server,
    clients,
    workerProcesses: raw.workerProcs,
    foreignCpuPercent: r1(
      mean(raw.machine) -
        server.cpuPercentOfOneCore.mean -
        raw.workerProcs.reduce((a, w: any) => a + (w.cpuPercent as number), 0),
    ),
    machineCpuPercentOfAllCores: {
      mean: r1(mean(raw.machine)),
      p95: r1(pct(raw.machine, 0.95)),
      max: r1(raw.machine.length ? Math.max(...raw.machine) : NaN),
      note: '100 = one vCPU fully busy; 400 = all four',
    },
    consistency,
    allConsistent,
    reconnects,
    backgrounds,
    neverReturning:
      departedSeat === null
        ? null
        : {
            seat: departedSeat,
            watchers: watches.length,
            watcherStepsSeenMin: watches.length ? Math.min(...watches.map((w) => w.stepsSeen)) : null,
            watcherStepsSeenMax: watches.length ? Math.max(...watches.map((w) => w.stepsSeen)) : null,
            lobbyConnectedFlagAtEnd: [...new Set(watches.map((w) => w.lastLobbyConnected))],
            results: departedRes ?? null,
          },
    perClient,
    proxy: {
      stalls: clients.proxyStalls,
      worstClientStalls: worst(records.map((r) => r.proxy?.stalls ?? 0)),
    },
    warnings: raw.warnings,
    serverLogErrors: raw.serverErrors.slice(0, 20),
    workerLogErrors: raw.workerErrors.slice(0, 20),
    timeline: raw.samples.map((s, i) => {
      const prev = raw.samples[i - 1];
      const cpu = prev
        ? ((s.process.cpuUsage.user -
            prev.process.cpuUsage.user +
            (s.process.cpuUsage.system - prev.process.cpuUsage.system)) /
            1000 /
            (s.t - prev.t)) *
          100
        : 0;
      const live = s.rooms.filter((r) => r.phase === 'playing');
      return {
        t: Math.round(s.t / 1000),
        cpu: r1(cpu),
        rssMB: r1(s.process.memoryUsage.rss / 1048576),
        stepP99: live.length ? r2(Math.max(...live.map((r) => r.ticks.stepMs.p99))) : null,
        lateP99: live.length ? r2(Math.max(...live.map((r) => r.ticks.timerLatenessMs.p99))) : null,
        dropped: s.rooms.reduce((a, r) => a + r.ticks.dropped, 0),
        loopP99: s.process.eventLoopDelayMs.p99,
      };
    }),
  };
  return result;
}

function summarise(r: Record<string, any>): string {
  const s = r.server;
  const c = r.clients;
  const lines = [
    `== ${r.meta.label}: ${r.meta.scenario} / ${r.meta.profile} / ${r.meta.humansPerRoom} humans x ${r.meta.rooms} room(s), ${r.meta.workerProcesses} client process(es)`,
    `server cpu ${s.cpuPercentOfOneCore.mean}% mean / ${s.cpuPercentOfOneCore.p95}% p95 / ${s.cpuPercentOfOneCore.max}% max of one core; rss ${s.rssMB.mean}/${s.rssMB.max} MB; heap max ${s.heapUsedMB.max} MB`,
    `step ms mean ${s.stepMs.mean} p99(med/worst) ${s.stepMs.p99Median}/${s.stepMs.p99Worst} max ${s.stepMs.max}; lateness p99 ${s.timerLatenessMs.p99Median}/${s.timerLatenessMs.p99Worst} max ${s.timerLatenessMs.max}; ticksDropped ${s.ticksDropped}; loop p99 ${s.eventLoopDelayMs.p99Worst} ms`,
    `inputs accepted ${s.inputs.accepted} stale ${s.inputs.stale} overRate ${s.inputs.overRate}; kicks ${s.kicks}; invalid ${s.invalidMessages}`,
    `clients ${c.played}/${c.configured} played; down ${c.kbDownPerSec.mean} KB/s up ${c.kbUpPerSec.mean} KB/s each; total egress ${c.totalDownKBps} KB/s`,
    `rtt p50/p95 ${c.rttMs.p50}/${c.rttMs.p95} ms; input->visible p50/p95 ${c.inputLatencyMs.p50}/${c.inputLatencyMs.p95} ms (n=${c.inputLatencyMs.n}); tick lag p50/p95 ${c.tickLagMs.p50}/${c.tickLagMs.p95} ms; buffer p50/p95/max ${c.bufferTicks.p50}/${c.bufferTicks.p95}/${c.bufferTicks.max}`,
    `hash checks ${c.hashChecks} mismatches ${c.hashMismatches} resyncs ${c.resyncs} skippedAhead ${c.skippedAhead}`,
    `consistent: ${r.allConsistent ? 'YES' : 'NO'}; ` +
      r.consistency
        .map(
          (x: any) =>
            `[room ${x.room}: hashes ${x.finalHashesEqual}, =stateHash ${x.finalHashEqualsResultsStateHash}, results ${x.resultsIdentical}, elim ${x.eliminations.union} (miss ${x.eliminations.missedUnexplained}+gap ${x.eliminations.missedInGap}, dup ${x.eliminations.duplicated}), expl ${x.explosions.union} (miss ${x.explosions.missedUnexplained}+gap ${x.explosions.missedInGap}, dup ${x.explosions.duplicated}), kills ${x.resultsKillsSum} deaths ${x.resultsDeathsSum} credited elims ${x.eliminationEventsCredited}, sudden-death events ${x.eliminationEventsSuddenDeath} of ${x.eliminationEventsSeen}]`,
        )
        .join(' '),
    `machine CPU mean ${r.machineCpuPercentOfAllCores.mean}% (of 400), foreign (not server/clients) ~${r.foreignCpuPercent}%`,
    `worker processes: ${r.workerProcesses.map((w: any) => `${w.clients} clients cpu ${w.cpuPercent}% loop p99 ${w.loopDelayMs.p99} max ${w.loopDelayMs.max} ms`).join(' | ')}`,
  ];
  if (r.reconnects.length)
    lines.push(
      `reconnects: ${JSON.stringify(r.reconnects.map((x: any) => ({ i: x.index, ret: x.returned, call: x.reconnectCallMs, kf: x.keyframeMs, ok: x.consistentMs, hashOk: x.finalHashOk })))}`,
    );
  if (r.backgrounds.length)
    lines.push(
      `background: ${JSON.stringify(r.backgrounds.map((x: any) => ({ i: x.index, peak: x.peakBuffer, atResume: x.bufferAtResume, catchUp: x.catchUpMs, skipped: x.skippedAheadDelta, mism: x.hashMismatches, hashOk: x.finalHashOk })))}`,
    );
  if (r.neverReturning)
    lines.push(
      `never-returning seat ${r.neverReturning.seat}: watchers ${r.neverReturning.watchers}, steps seen ${r.neverReturning.watcherStepsSeenMin}..${r.neverReturning.watcherStepsSeenMax}`,
    );
  if (r.meta) lines.push(`connect ${r.meta.connectMs} ms, match wall ${r.meta.matchWallSec} s`);
  for (const w of [...r.warnings, ...r.clients.connectFailures]) lines.push(`WARNING: ${w}`);
  return lines.join('\n');
}

async function main(): Promise<void> {
  const cfg = parseArgs(process.argv.slice(2));
  mkdirSync(cfg.out, { recursive: true });
  console.log(`running ${cfg.label} ...`);
  const result = await runLoad(cfg);
  const file = path.join(cfg.out, `${cfg.label}.json`);
  writeFileSync(file, `${JSON.stringify(result, null, 1)}\n`);
  console.log(summarise(result));
  console.log(`wrote ${file}`);
  // 3 = something else used > 60 % of a core on this machine during the run (the numbers are suspect)
  process.exit(result.foreignCpuPercent > 60 ? 3 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
