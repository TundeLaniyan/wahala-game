#!/usr/bin/env node
// Load / abuse probe against a server or edge YOU OWN. It refuses non-local targets unless --i-own-this-server is given.
// It measures; it never "passes" a deployment on its own (simulated clients are not phones: docs/ops/VALIDATION_STATUS.md).
//   node ops/scripts/abuse-probe.mjs create-flood --url http://localhost:2599 --n 2000 --conc 50
//   node ops/scripts/abuse-probe.mjs conn-flood   --url https://localhost:8443 --n 400
//   node ops/scripts/abuse-probe.mjs start-flood  --url http://localhost:2599 --rooms 3 --seconds 20 [--metrics-url U --metrics-token T]
// start-flood = what one hostile guest per room costs: each started room is 32 fighters, 31 of them server bots.
import { Client, parseArgs, wsUrl, getJson, upgrade, sleep, isLocalTarget } from './lib.mjs';

const [scenario, ...rest] = process.argv.slice(2);
const o = parseArgs(rest, {
  url: 'http://localhost:2567',
  n: 500,
  conc: 25,
  rooms: 3,
  seconds: 20,
  'metrics-url': '',
  'metrics-token': '',
  'i-own-this-server': false,
});
if (!isLocalTarget(o.url) && !o['i-own-this-server']) {
  console.error(
    `refusing ${o.url}: not a local/private address. Use --i-own-this-server only for a server you operate.`,
  );
  process.exit(2);
}
const metricsUrl = o['metrics-url'] || o.url;
const mHeaders = o['metrics-token'] ? { authorization: `Bearer ${o['metrics-token']}` } : {};
const snap = async () => (await getJson(`${metricsUrl}/metrics`, mHeaders)).body;
const pct = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null;
};

async function createFlood() {
  const codes = new Map();
  let i = 0;
  const lat = [];
  const t0 = performance.now();
  const worker = async () => {
    while (i < o.n) {
      i++;
      const t = performance.now();
      try {
        const r = await fetch(`${o.url}/matchmake/create/rumble`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ private: true, name: `Flood${i}` }),
          signal: AbortSignal.timeout(15000),
        });
        lat.push(performance.now() - t);
        codes.set(r.status, (codes.get(r.status) ?? 0) + 1);
        await r.arrayBuffer();
      } catch (e) {
        codes.set(e.cause?.code ?? 'error', (codes.get(e.cause?.code ?? 'error') ?? 0) + 1);
      }
    }
  };
  await Promise.all(Array.from({ length: o.conc }, worker));
  const s = (performance.now() - t0) / 1000;
  console.log(
    JSON.stringify({
      scenario: 'create-flood',
      requests: o.n,
      seconds: +s.toFixed(2),
      perSecond: Math.round(o.n / s),
      statuses: Object.fromEntries(codes),
      latencyMsP50: Math.round(pct(lat, 0.5)),
      latencyMsP99: Math.round(pct(lat, 0.99)),
    }),
  );
  const m = await snap().catch(() => null);
  if (m)
    console.log(
      JSON.stringify({
        afterFlood: {
          rooms: m.rooms.length,
          rssMB: Math.round(m.process.memoryUsage.rss / 1e6),
          eventLoopP99Ms: m.process.eventLoopDelayMs.p99,
        },
      }),
    );
}

async function connFlood() {
  // N concurrent upgrade attempts to made-up room paths, from one source, held briefly
  const res = new Map();
  let i = 0;
  const worker = async () => {
    while (i < o.n) {
      i++;
      const r = await upgrade(`${wsUrl(o.url)}/p${i}/r${i}`, {}, 200);
      const k = r.status ?? (r.open ? 'open' : (r.error ?? `closed:${r.closed}`));
      res.set(k, (res.get(k) ?? 0) + 1);
    }
  };
  await Promise.all(Array.from({ length: o.conc }, worker));
  console.log(JSON.stringify({ scenario: 'conn-flood', attempts: o.n, outcomes: Object.fromEntries(res) }));
}

async function startFlood() {
  const live = [];
  for (let i = 0; i < o.rooms; i++) {
    const r = await new Client(o.url).create('rumble', {
      private: true,
      name: `Probe${i}`,
      durationSec: 300,
    });
    r.onMessage('*', () => {});
    r.send('start');
    live.push(r);
  }
  console.log(
    `started ${live.length} rooms (1 human + 31 bots each); sampling /metrics for ${o.seconds}s ...`,
  );
  await snap(); // resets the since-last-read CPU window
  const cpu = [],
    loop = [];
  for (let t = 0; t < o.seconds; t += 2) {
    await sleep(2000);
    const m = await snap();
    if (!m) continue;
    cpu.push(m.process.cpuPercentSinceLastRead);
    loop.push(m.process.eventLoopDelayMs.p99);
  }
  const m = await snap();
  const playing = m.rooms.filter((r) => r.phase === 'playing');
  console.log(
    JSON.stringify({
      scenario: 'start-flood',
      roomsRequested: o.rooms,
      roomsPlaying: playing.length,
      cpuPercentOfOneCore: { p50: pct(cpu, 0.5), max: Math.max(...cpu) },
      eventLoopDelayP99Ms: { p50: pct(loop, 0.5), max: Math.max(...loop) },
      droppedTicksTotal: playing.reduce((a, r) => a + r.ticks.dropped, 0),
      stepMsP99: Math.max(...playing.map((r) => r.ticks.stepMs.p99)),
      timerLatenessMsP99: Math.max(...playing.map((r) => r.ticks.timerLatenessMs.p99)),
      rssMB: Math.round(m.process.memoryUsage.rss / 1e6),
    }),
  );
  for (const r of live) {
    try {
      await r.leave();
    } catch {
      /* gone */
    }
  }
}

const run = { 'create-flood': createFlood, 'conn-flood': connFlood, 'start-flood': startFlood }[scenario];
if (!run) {
  console.error('scenario: create-flood | conn-flood | start-flood');
  process.exit(2);
}
await run();
process.exit(0);
