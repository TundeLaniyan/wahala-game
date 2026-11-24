/* eslint-disable @typescript-eslint/no-explicit-any -- IPC messages and Node internals are untyped records by design */
/**
 * The SERVER half of the memory soak (`npm run soak`, bench/soak.ts is the orchestrator and the clients).
 *
 * It runs the real server code (`startRumbleServer`: the real room, lobby, match, tick loop, replication codec, bots)
 * in its own process, started with `--expose-gc`, in the test-fast mode (short countdown and reconnection window; the
 * simulation, the bots and the networking are untouched) and answers the orchestrator over IPC:
 *   { type: 'sample', id, gc }  -> process memory (rss / heap / external / arrayBuffers), V8 heap statistics, event-loop
 *                                  delay, CPU, active handles by kind, live rooms / clients, and the room-retention
 *                                  ledger; with `gc` the process first runs a FULL collection (twice, with a macrotask
 *                                  in between so WeakRefs held for the current job are released).
 *   { type: 'forceEnd', code }  -> marks that room's running match as ended (the room then runs its real finish path:
 *                                  last frames, results, lobby phase, linger timer). It only shortens the wait for a
 *                                  natural end (a tie at time-up goes to a 64 s Sudden Death); every other line of the
 *                                  room's code runs as in production.
 *   { type: 'dropSocket', code, sessionId } -> terminates that client's socket (an abrupt network loss, close code 1006)
 *   { type: 'snapshot', file }  -> writes a V8 heap snapshot (diagnosis only).
 *   { type: 'shutdown' }        -> graceful close, exit.
 *
 * Retained room objects: every room the matchmaker creates is held ONLY by a WeakRef (plus a FinalizationRegistry token).
 * After a room is disposed and a full GC has run, a WeakRef that still resolves is a retained room: a leak.
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';
import v8 from 'node:v8';
import { matchMaker } from '@colyseus/core';
import { startRumbleServer } from '../src/app';
import { DEFAULT_LIMITS, UNLIMITED_LIMITS } from '../src/core/limits';
import { DEFAULT_RUNTIME } from '../src/core/options';

const gc = (globalThis as any).gc as (() => void) | undefined;
if (!gc) throw new Error('soakServer must run with node --expose-gc');
const send = (m: unknown): void => void process.send?.(m);
const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface Tracked {
  ref: WeakRef<object>;
  code: string;
  createdAt: number;
  disposedAt: number | null;
  finalized: boolean;
}

const tracked: Tracked[] = [];
let finalizedCount = 0;
const registry = new FinalizationRegistry<Tracked>((t) => {
  t.finalized = true;
  finalizedCount++;
});

const num = (name: string, fallback: number): number => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

const server = await startRumbleServer({
  port: 0,
  host: '127.0.0.1',
  development: true,
  runtime: {
    ...DEFAULT_RUNTIME,
    fast: true,
    countdownMs: num('SOAK_COUNTDOWN_MS', 150),
    reconnectSeconds: num('SOAK_RECONNECT_SECONDS', 3),
    graceSeconds: num('SOAK_GRACE_SECONDS', 0.5),
    // the soak drives rooms from one address on purpose: no admission limits unless SOAK_LIMITS=default
    limits: process.env.SOAK_LIMITS === 'default' ? DEFAULT_LIMITS : UNLIMITED_LIMITS,
  },
});

const handler = (matchMaker as any).getAllHandlers().rumble;
handler.on('create', (room: any) => {
  const t: Tracked = {
    ref: new WeakRef(room),
    code: String(room.roomId),
    createdAt: Date.now(),
    disposedAt: null,
    finalized: false,
  };
  tracked.push(t);
  registry.register(room, t);
});
// tick books of rooms that are gone: a room's own counters die with it, the whole-run totals must not
let retiredDropped = 0;
let retiredRun = 0;
handler.on('dispose', (room: any) => {
  retiredDropped += room.loop?.ticksDropped ?? 0;
  retiredRun += room.loop?.ticksRun ?? 0;
  const t = tracked.find((x) => x.code === String(room.roomId) && x.disposedAt === null);
  if (t) t.disposedAt = Date.now();
});

const loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();
let lastCpu = process.cpuUsage();
let lastAt = process.hrtime.bigint();
const MB = 1024 * 1024;
const mb = (n: number): number => Math.round((n / MB) * 100) / 100;

function localRooms(): any[] {
  // every live room of this process, as the matchmaker holds them
  const rooms: any[] = [];
  for (const t of tracked) {
    if (t.disposedAt !== null) continue;
    const r = (matchMaker as any).getLocalRoomById(t.code);
    if (r) rooms.push(r);
  }
  return rooms;
}

async function sample(withGc: boolean): Promise<Record<string, unknown>> {
  if (withGc) {
    gc!();
    await tick(25); // release WeakRef targets that were pinned for the current job
    gc!();
  }
  const cpu = process.cpuUsage();
  const nowNs = process.hrtime.bigint();
  const wallUs = Number(nowNs - lastAt) / 1000;
  const cpuPct = wallUs > 0 ? ((cpu.user - lastCpu.user + (cpu.system - lastCpu.system)) / wallUs) * 100 : 0;
  lastCpu = cpu;
  lastAt = nowNs;
  const d = (ns: number): number => Math.max(0, Math.round((ns / 1e6 - 10) * 1000) / 1000); // minus the 10 ms resolution
  const loopStats = {
    p50: d(loop.percentile(50)),
    p99: d(loop.percentile(99)),
    max: d(loop.max),
    mean: d(loop.mean),
  };
  loop.reset();
  const mem = process.memoryUsage();
  const hs = v8.getHeapStatistics();
  const spaces = Object.fromEntries(
    v8.getHeapSpaceStatistics().map((s) => [s.space_name, mb(s.space_used_size)]),
  );
  const kinds: Record<string, number> = {};
  for (const k of (process as any).getActiveResourcesInfo() as string[]) kinds[k] = (kinds[k] ?? 0) + 1;
  const rooms = localRooms();
  const clients = rooms.reduce((n, r) => n + (r.clients?.length ?? 0), 0);
  const now = Date.now();
  const disposed = tracked.filter((t) => t.disposedAt !== null);
  // a disposed room that is still reachable more than 3 s after its disposal and after a full GC is retained
  const retained = withGc
    ? disposed.filter((t) => now - t.disposedAt! > 3000 && t.ref.deref() !== undefined).length
    : null;
  const snaps = server.metrics.roomSnapshots();
  return {
    memory: {
      rssMB: mb(mem.rss),
      heapUsedMB: mb(mem.heapUsed),
      heapTotalMB: mb(mem.heapTotal),
      externalMB: mb(mem.external),
      arrayBuffersMB: mb(mem.arrayBuffers),
      mallocedMB: mb(hs.malloced_memory),
      detachedContexts: hs.number_of_detached_contexts,
      oldSpaceMB: spaces.old_space,
      largeObjectMB: spaces.large_object_space,
      newSpaceMB: spaces.new_space,
    },
    gc: withGc,
    eventLoopDelayMs: loopStats,
    cpuPercent: Math.round(cpuPct * 10) / 10,
    activeResources: kinds,
    /** Event listeners that could pile up: on the process, and on the room type's own emitter. */
    listeners: {
      process: process.eventNames().reduce((n, e) => n + process.listenerCount(e), 0),
      roomType: handler.eventNames().reduce((n: number, e: string) => n + handler.listenerCount(e), 0),
    },
    rooms: {
      created: tracked.length,
      disposed: disposed.length,
      finalized: finalizedCount,
      live: rooms.length,
      registered: server.metrics.roomCount,
      clients,
      retainedAfterGc: retained,
      ticksDropped: snaps.reduce((n, r) => n + r.ticks.dropped, 0),
      /** Whole run, rooms that are gone included. */
      ticksDroppedTotal: retiredDropped + snaps.reduce((n, r) => n + r.ticks.dropped, 0),
      ticksRunTotal: retiredRun + snaps.reduce((n, r) => n + r.ticks.run, 0),
      stepP99Ms: snaps.reduce((m, r) => Math.max(m, r.ticks.stepMs.p99), 0),
    },
  };
}

process.on('message', async (msg: any) => {
  try {
    if (msg?.type === 'sample') send({ type: 'sample', id: msg.id, data: await sample(msg.gc === true) });
    else if (msg?.type === 'forceEnd') {
      const room = (matchMaker as any).getLocalRoomById(msg.code);
      const match = room?.match;
      if (match && match.state.match.phase !== 'ended') match.state.match.phase = 'ended';
      send({ type: 'forceEnd', id: msg.id, ok: Boolean(match) });
    } else if (msg?.type === 'dropSocket') {
      // an abrupt network loss of one client: the socket is terminated, no close handshake (the client sees 1006)
      const room = (matchMaker as any).getLocalRoomById(msg.code);
      const client = room?.clients.find((c: any) => c.sessionId === msg.sessionId);
      client?.ref?.terminate?.();
      send({ type: 'dropSocket', id: msg.id, ok: Boolean(client) });
    } else if (msg?.type === 'snapshot') {
      gc!();
      await tick(25);
      gc!();
      send({ type: 'snapshot', id: msg.id, file: v8.writeHeapSnapshot(msg.file) });
    } else if (msg?.type === 'shutdown') {
      await server.close();
      process.exit(0);
    }
  } catch (e) {
    send({ type: 'error', id: msg?.id, message: String(e) });
  }
});

send({ type: 'ready', port: server.port, pid: process.pid, node: process.version });
