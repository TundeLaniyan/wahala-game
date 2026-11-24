/**
 * Black-box abuse probe (decision FU2S-C3 / C4): starts the REAL server process of a given checkout (`--tree`) on a free
 * port, once per scenario, and attacks it over HTTP and WebSocket the way a hostile client could. The same script runs
 * against the pre-change commit and the current one, so before / after are measured, not claimed.
 *
 *   tsx bench/abuse-probe.ts --tree /path/to/checkout --label after --out result.json [--rooms 6] [--seconds 20]
 *
 * Scenarios: create-flood (300 room creations, a fresh guest id each), xff-spoof (100 creations, forged X-Forwarded-For),
 * start-flood (N private rooms started at once: 1 human + 31 bots each, sampled on /metrics), code-guess (200 wrong room
 * codes, and whether an existing locked room answers differently), metrics-production (NODE_ENV=production without a
 * token), fast-in-production (RUMBLE_TEST_FAST under NODE_ENV=production), names (reserved / impersonating nicknames).
 * It only ever talks to a server it started itself, on 127.0.0.1.
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { Client } from '@colyseus/sdk';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const TREE = path.resolve(arg('tree', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')));
const LABEL = arg('label', 'run');
const OUT = arg('out', '');
const ROOMS = Number(arg('rooms', '6'));
const SECONDS = Number(arg('seconds', '20'));
const ONLY = arg('only', '');

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
  });

interface Running {
  port: number;
  url: string;
  child: ChildProcess;
  log: string[];
  exited: Promise<number | null>;
  stop(): Promise<void>;
}

async function boot(env: Record<string, string>): Promise<Running> {
  const port = await freePort();
  const child = spawn(path.join(TREE, 'node_modules/.bin/tsx'), ['src/main.ts'], {
    cwd: path.join(TREE, 'server'),
    env: { ...process.env, PORT: String(port), RUMBLE_ALLOWED_ORIGINS: 'http://127.0.0.1:1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log: string[] = [];
  child.stdout!.on('data', (d) => log.push(String(d)));
  child.stderr!.on('data', (d) => log.push(String(d)));
  const exited = new Promise<number | null>((r) => child.on('exit', (c) => r(c)));
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) break;
    try {
      if ((await fetch(`${url}/health`)).ok) break;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  return {
    port,
    url,
    child,
    log,
    exited,
    async stop() {
      if (child.exitCode === null) child.kill('SIGTERM');
      await Promise.race([exited, sleep(5000)]);
      if (child.exitCode === null) child.kill('SIGKILL');
    },
  };
}

const guest = (n: number): string => `probe${String(n).padStart(17, '0')}`;
const post = async (url: string, p: string, body: unknown, headers: Record<string, string> = {}) => {
  try {
    const r = await fetch(`${url}${p}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    return { status: r.status, text: await r.text() };
  } catch (e) {
    return { status: 0, text: String(e) };
  }
};
const tally = (xs: number[]): Record<string, number> => {
  const o: Record<string, number> = {};
  for (const x of xs) o[String(x)] = (o[String(x)] ?? 0) + 1;
  return o;
};
const metrics = async (url: string): Promise<any> => {
  try {
    return await (await fetch(`${url}/metrics`, { signal: AbortSignal.timeout(5000) })).json();
  } catch {
    return null;
  }
};

async function pool<T>(n: number, conc: number, fn: (i: number) => Promise<T>): Promise<T[]> {
  const out: T[] = new Array(n);
  let next = 0;
  await Promise.all(
    Array.from({ length: conc }, async () => {
      for (let i = next++; i < n; i = next++) out[i] = await fn(i);
    }),
  );
  return out;
}

const scenarios: Record<string, () => Promise<unknown>> = {
  async 'create-flood'() {
    const s = await boot({});
    try {
      const t0 = performance.now();
      const res = await pool(300, 30, (i) => post(s.url, '/matchmake/create/rumble', { name: `Flood ${i}`, private: true, gid: guest(i) }));
      const secs = (performance.now() - t0) / 1000;
      const m = await metrics(s.url);
      return {
        requests: 300,
        seconds: Math.round(secs * 100) / 100,
        statuses: tally(res.map((r) => r.status)),
        roomsCreated: res.filter((r) => r.status === 200).length,
        roomsOnServerRightAfter: m?.rooms?.length ?? null,
      };
    } finally {
      await s.stop();
    }
  },

  async 'xff-spoof'() {
    const s = await boot({});
    try {
      const res = await pool(100, 10, (i) =>
        post(s.url, '/matchmake/create/rumble', { name: `Spoof ${i}`, private: true, gid: guest(5000) }, { 'x-forwarded-for': `10.1.${i % 250}.${i % 200}`, 'x-real-ip': `10.2.${i % 250}.1` }),
      );
      return { requests: 100, statuses: tally(res.map((r) => r.status)), roomsCreated: res.filter((r) => r.status === 200).length };
    } finally {
      await s.stop();
    }
  },

  async 'start-flood'() {
    const s = await boot({});
    const clients: any[] = [];
    try {
      const results: { created: boolean; error?: string }[] = [];
      for (let i = 0; i < ROOMS; i++) {
        try {
          const room = await new Client(s.url).create('rumble', { name: `Probe ${i}`, private: true, durationSec: 300, gid: guest(900 + i) });
          room.onMessage('*', () => undefined);
          room.send('start');
          clients.push(room);
          results.push({ created: true });
        } catch (e) {
          results.push({ created: false, error: String((e as Error).message).slice(0, 80) });
        }
      }
      await metrics(s.url); // resets the since-last-read windows
      const cpu: number[] = [];
      const loopP99: number[] = [];
      const loopMax: number[] = [];
      let last: any = null;
      for (let t = 0; t < SECONDS; t += 2) {
        await sleep(2000);
        const m = await metrics(s.url);
        if (!m) continue;
        last = m;
        cpu.push(m.process.cpuPercentSinceLastRead);
        loopP99.push(m.process.eventLoopDelayMs.p99);
        loopMax.push(m.process.eventLoopDelayMs.max);
      }
      const phases: Record<string, number> = {};
      for (const r of last?.rooms ?? []) phases[r.phase] = (phases[r.phase] ?? 0) + 1;
      const playing = (last?.rooms ?? []).filter((r: any) => r.phase === 'playing');
      const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
      const med = (a: number[]) => (a.length ? sorted(a)[Math.floor(a.length / 2)]! : null);
      return {
        roomsRequested: ROOMS,
        roomsCreated: results.filter((r) => r.created).length,
        createErrors: results.filter((r) => !r.created).map((r) => r.error),
        phasesAfter: phases,
        roomsPlaying: playing.length,
        cpuPercentOfOneCore: { median: med(cpu), max: Math.max(...cpu) },
        eventLoopP99Ms: { median: med(loopP99), max: Math.max(...loopP99) },
        eventLoopMaxMs: Math.max(...loopMax),
        droppedTicks: playing.reduce((a: number, r: any) => a + r.ticks.dropped, 0),
        stepMsP99: Math.max(0, ...playing.map((r: any) => r.ticks.stepMs.p99)),
        limits: last?.limits ?? null,
      };
    } finally {
      for (const c of clients) c.leave().catch(() => undefined);
      await s.stop();
    }
  },

  async 'code-guess'() {
    const s = await boot({});
    try {
      const host = await new Client(s.url).create('rumble', { name: 'Host Ada', private: true, durationSec: 300, gid: guest(1) });
      host.onMessage('*', () => undefined);
      host.send('start'); // the room is now started: locked
      await sleep(5000);
      const msgs = new Set<string>();
      const statuses: number[] = [];
      const real = host.roomId;
      for (const code of [real, 'ZZZZZZ']) {
        const r = await post(s.url, `/matchmake/joinById/${code}`, { name: 'Guesser', gid: guest(2) });
        statuses.push(r.status);
        msgs.add(r.text.replace(/ZZZZZZ|[A-Z2-9]{6}/g, '<code>'));
      }
      const t0 = performance.now();
      const res = await pool(200, 1, (i) => post(s.url, `/matchmake/joinById/${'ABCDEF'.slice(0, 5)}${'GHJKMN'[i % 6]}`, { name: 'Guesser', gid: guest(2) }));
      const blocked = res.filter((r) => /rate_limited|429/.test(r.text) || r.status === 429).length;
      host.leave().catch(() => undefined);
      return {
        lockedRoomAndMissingRoomAnswerDiffer: msgs.size > 1,
        distinctAnswerShapesForLockedVsMissing: msgs.size,
        guesses: 200,
        guessesAnsweredNotFound: res.length - blocked,
        guessesRateLimited: blocked,
        seconds: Math.round(((performance.now() - t0) / 1000) * 100) / 100,
      };
    } finally {
      await s.stop();
    }
  },

  async 'metrics-production'() {
    const s = await boot({ NODE_ENV: 'production' });
    try {
      const r = await fetch(`${s.url}/metrics`).then((x) => x.status).catch(() => 0);
      return { statusWithoutToken: r, openToAnyone: r === 200 };
    } finally {
      await s.stop();
    }
  },

  async 'fast-in-production'() {
    const s = await boot({ NODE_ENV: 'production', RUMBLE_TEST_FAST: '1' });
    try {
      await Promise.race([s.exited, sleep(1500)]);
      const exited = s.child.exitCode !== null;
      return { serverStarted: !exited, exitCode: s.child.exitCode, message: s.log.join('').split('\n').find((l) => /test-only|refus/i.test(l)) ?? null };
    } finally {
      await s.stop();
    }
  },

  async names() {
    const s = await boot({});
    const accepted: string[] = [];
    const refused: string[] = [];
    try {
      const names = ['Admin', 'Adm1n', 'Moderator', 'Wahala Staff', 'Wahala Team', 'System', 'Server', 'Support', 'BOT Emeka', 'Official Wahala', 'Modupe', 'Ada Obi'];
      for (const [i, name] of names.entries()) {
        const r = await post(s.url, '/matchmake/create/rumble', { name, private: true, gid: guest(300 + i) });
        (r.status === 200 ? accepted : refused).push(name);
      }
      return { accepted, refused };
    } finally {
      await s.stop();
    }
  },
};

const result: Record<string, unknown> = { label: LABEL, tree: TREE, at: new Date().toISOString() };
for (const [name, run] of Object.entries(scenarios)) {
  if (ONLY && !ONLY.split(',').includes(name)) continue;
  process.stdout.write(`[probe ${LABEL}] ${name} ... `);
  try {
    result[name] = await run();
    console.log('done');
  } catch (e) {
    result[name] = { error: String((e as Error).message) };
    console.log('error');
  }
}
const json = JSON.stringify(result, null, 2);
if (OUT) writeFileSync(OUT, json);
console.log(json);
process.exit(0);
