#!/usr/bin/env node
/**
 * `npm run test:online-e2e`: builds the SERVER build of the game (`build:online`, endpoint template ws://{host}:2567),
 * starts the real Node multiplayer server and `vite preview` of that build, runs e2e/rumble-online.spec.ts against them in
 * Chromium and stops everything. Local / development only (docs/CITY_RUMBLE_ONLINE_LOCAL.md); CI never runs it.
 * Env: WAHALA_CHROMIUM (browser), ONLINE_E2E_SKIP_BUILD=1 (reuse dist-online), ONLINE_E2E_ARGS (extra Playwright args).
 *
 * Evidence (decision FU2S-C5): while the browsers run, this script samples the SERVER's own /metrics once a second
 * (event-loop delay, cpu, dropped ticks, timer lateness) and the machine load average into
 * `ONLINE_E2E_DIAG_DIR` (default `online-e2e-diag/`: `server-timeline.jsonl`, `server.log`, the pages' own
 * `pages.json`) and prints a verdict: was the server starved, or only the browsers? It never retries and never
 * hides a failure. ONLINE_E2E_ASSERT_SERVER=1 also fails the run when the server itself stalled (the CI job sets it:
 * a stalled server makes the browser result meaningless). ONLINE_E2E_PIN=1 pins the server to CPU 0 and the browsers
 * to the other CPUs (taskset) and gives the server the better priority, so the two never fight for one core.
 */
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';

const WEB = 4830;
const SERVER = 2567;
const origin = `http://127.0.0.1:${WEB}`;
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
const DIAG_DIR = process.env.ONLINE_E2E_DIAG_DIR ?? 'online-e2e-diag';
rmSync(DIAG_DIR, { recursive: true, force: true });
mkdirSync(DIAG_DIR, { recursive: true });
const pinned =
  process.env.ONLINE_E2E_PIN === '1' &&
  cpus().length >= 3 &&
  !run('which', ['taskset'], { stdio: 'ignore' }).status;
/** `taskset` / `nice` wrappers: the server on CPU 0 at normal priority, everything the browsers spawn on the rest, nicer. */
const withCpus = (set, nice, cmd, args) =>
  pinned ? ['taskset', ['-c', set, 'nice', '-n', String(nice), cmd, ...args]] : [cmd, args];

if (process.env.ONLINE_E2E_SKIP_BUILD !== '1' || !existsSync('dist-online')) {
  const built = run('npm', ['run', 'build:online'], {
    env: { ...process.env, WAHALA_NO_GLB_OPT: process.env.WAHALA_NO_GLB_OPT ?? '1' },
  });
  if (built.status !== 0) process.exit(built.status ?? 1);
}
const children = [];
// each child leads its own process group: `npx` is only a wrapper, the real server / preview process is its child
const stop = () =>
  children.forEach((c) => {
    try {
      process.kill(-c.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  });
process.on('exit', stop);
process.on('SIGINT', () => process.exit(130));
const start = (name, cmd, args, opts) => {
  const c = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true, ...opts });
  const tee = (stream) => (d) => {
    stream.write(`[${name}] ${d}`);
    if (name === 'server')
      appendFileSync(`${DIAG_DIR}/server.log`, `${new Date().toISOString().slice(11, 23)} ${d}`);
  };
  c.stdout.on('data', tee(process.stdout));
  c.stderr.on('data', tee(process.stderr));
  children.push(c);
  return c;
};
for (const port of [SERVER, WEB]) {
  try {
    await fetch(`http://127.0.0.1:${port}/`);
    console.error(`port ${port} is already in use: stop the other process first`);
    process.exit(2);
  } catch {
    /* free */
  }
}
const [serverCmd, serverArgs] = withCpus('0', 0, 'npx', ['tsx', 'src/main.ts']);
start('server', serverCmd, serverArgs, {
  cwd: 'server',
  env: {
    ...process.env,
    PORT: String(SERVER),
    RUMBLE_ALLOWED_ORIGINS: origin,
    RUMBLE_GRACE_SECONDS: '3',
    RUMBLE_RECONNECT_SECONDS: '60',
    RUMBLE_PING_MAX_RETRIES: process.env.RUMBLE_PING_MAX_RETRIES ?? '6',
  },
});
start('web', 'npx', [
  'vite',
  'preview',
  '--outDir',
  'dist-online',
  '--port',
  String(WEB),
  '--strictPort',
  '--host',
  '127.0.0.1',
]);
const wait = async (url) => {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${url} did not come up`);
};
await wait(`http://127.0.0.1:${SERVER}/health`);
await wait(`${origin}/wahala-game/`);

// ---- the server's own view of the run, once a second
const samples = [];
const sampler = setInterval(async () => {
  try {
    const m = await (
      await fetch(`http://127.0.0.1:${SERVER}/metrics`, { signal: AbortSignal.timeout(900) })
    ).json();
    const row = {
      t: Date.now(),
      load1: loadavg()[0],
      cpu: m.process.cpuPercentSinceLastRead,
      rssMB: Math.round(m.process.memoryUsage.rss / 1e6),
      loopMaxMs: m.process.eventLoopDelayMs.max,
      loopP99Ms: m.process.eventLoopDelayMs.p99,
      rooms: m.rooms.map((r) => ({
        phase: r.phase,
        humans: r.connectedHumans,
        dropped: r.ticks.dropped,
        ran: r.ticks.run,
        stepP99: r.ticks.stepMs.p99,
        lateP99: r.ticks.timerLatenessMs.p99,
        lateMax: r.ticks.timerLatenessMs.max,
        drops: r.net.drops,
        reconnections: r.net.reconnections,
      })),
    };
    samples.push(row);
    appendFileSync(`${DIAG_DIR}/server-timeline.jsonl`, `${JSON.stringify(row)}\n`);
  } catch {
    // a /metrics call that does not answer within 900 ms is itself evidence of a stalled server
    const row = { t: Date.now(), load1: loadavg()[0], metricsTimeout: true };
    samples.push(row);
    appendFileSync(`${DIAG_DIR}/server-timeline.jsonl`, `${JSON.stringify(row)}\n`);
  }
}, 1000);
const args = [
  'playwright',
  'test',
  'e2e/rumble-online.spec.ts',
  '--project=desktop',
  '--workers=1',
  '--trace',
  'off',
  '--timeout=900000',
  '--retries=0',
  '--reporter=line',
  ...(process.env.ONLINE_E2E_ARGS?.split(' ') ?? []),
];
const [pwCmd, pwArgs] = withCpus(`1-${cpus().length - 1}`, 5, 'npx', args);
// async (not spawnSync): the sampler above must keep running while the browsers do
const runAsync = (cmd, args, opts) =>
  new Promise((resolve) => {
    const c = spawn(cmd, args, { stdio: 'inherit', ...opts });
    c.on('exit', (status) => resolve({ status }));
    c.on('error', () => resolve({ status: 1 }));
  });
const result = await runAsync(pwCmd, pwArgs, {
  env: {
    ...process.env,
    ONLINE_E2E_DIAG_DIR: DIAG_DIR,
    WAHALA_ONLINE_E2E_URL: `${origin}/wahala-game/`,
    WAHALA_E2E_PREBUILT: '1',
    WAHALA_E2E_PORT: String(WEB),
    WAHALA_MULTIPROCESS: '1',
  },
});
clearInterval(sampler);
const live = samples.filter((r) => !r.metricsTimeout);
// the share of a room's ticks the server lost (decision FU2-CI7): one lost tick in thousands is what a healthy server on a
// shared runner does (the 30-minute quiet soak: 0.035 %), so a single drop is not "stalled"; the first 300 ticks of a room
// (its start, when the 32-fighter state is built) are too few to be a share
const droppedPct = (x) => (x.ran >= 300 ? (100 * x.dropped) / x.ran : 0);
const worst = {
  loopMaxMs: Math.max(0, ...live.map((r) => r.loopMaxMs)),
  maxDropped: Math.max(0, ...live.flatMap((r) => r.rooms.map((x) => x.dropped))),
  maxDroppedPct: Number(Math.max(0, ...live.flatMap((r) => r.rooms.map(droppedPct))).toFixed(2)),
  lateMaxMs: Math.max(0, ...live.flatMap((r) => r.rooms.map((x) => x.lateMax))),
  cpuMax: Math.max(0, ...live.map((r) => r.cpu)),
  loadMax: Math.max(0, ...samples.map((r) => r.load1)),
  metricsTimeouts: samples.length - live.length,
};
// the server is "starved" when its own loop stalled for more than half a second, it lost more than 2 % of a room's
// simulation ticks, or its /metrics did not answer (the CI run 330 failure: 1 dropped tick, loop delay 130 ms, 5 of 5 tests
// passed: not starved)
const serverStalled = worst.loopMaxMs > 500 || worst.maxDroppedPct > 2 || worst.metricsTimeouts > 2;
const verdict = `[online-e2e server verdict] ${serverStalled ? 'SERVER STALLED' : 'server healthy'}: ${JSON.stringify(worst)} over ${samples.length} samples; cpus ${cpus().length}${pinned ? ', pinned' : ''}`;
console.log(verdict);
writeFileSync(
  `${DIAG_DIR}/verdict.json`,
  JSON.stringify({ stalled: serverStalled, ...worst, samples: samples.length }, null, 1),
);
stop();
if (result.status === 0 && serverStalled && process.env.ONLINE_E2E_ASSERT_SERVER === '1') process.exit(3);
process.exit(result.status ?? 1);
