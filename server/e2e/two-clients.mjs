/**
 * Two real browsers, one City Rumble room (docs/CITY_RUMBLE_ONLINE.md section 6).
 *
 * Starts the game server (RUMBLE_TEST_FAST=1) and the dev client, opens two independent Chromium contexts, creates a
 * private room in one, joins by invite link in the other, plays a short match with scripted keyboard input, drops the
 * second player's network for ~9 s mid-match, and checks that both ended on the same authoritative hash.
 *
 *   cd server && npm run demo:two          (env: E2E_SERVER_PORT, E2E_CLIENT_PORT, E2E_DURATION, WAHALA_CHROMIUM)
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(here, '..');
const shots = resolve(serverDir, '../docs/screenshots/rumble-online');
const SERVER_PORT = Number(process.env.E2E_SERVER_PORT ?? 2599);
const CLIENT_PORT = Number(process.env.E2E_CLIENT_PORT ?? 5199);
const DURATION = Number(process.env.E2E_DURATION ?? 90);
const WS = `ws://127.0.0.1:${SERVER_PORT}`;
const OUTAGE_MS = Number(process.env.E2E_OUTAGE_MS ?? 9000);
const FPS = Number(process.env.E2E_FPS ?? 2);
const PAGE = `http://127.0.0.1:${CLIENT_PORT}/?dev&fps=${FPS}&server=${encodeURIComponent(WS)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let A;
let B;
const children = [];
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};

function start(cmd, args, env) {
  const child = spawn(cmd, args, {
    cwd: serverDir,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => process.env.E2E_VERBOSE && process.stdout.write(`[${args[0]}] ${d}`));
  child.stderr.on('data', (d) => process.env.E2E_VERBOSE && process.stderr.write(`[${args[0]}] ${d}`));
  children.push(child);
  return child;
}

async function waitHttp(url, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      await fetch(url);
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`timed out waiting for ${url}`);
}

function findChromium() {
  if (process.env.WAHALA_CHROMIUM) return process.env.WAHALA_CHROMIUM;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  try {
    for (const d of readdirSync(base).filter((n) => /^chromium-\d+$/.test(n))) {
      const p = join(base, d, 'chrome-linux64', 'chrome');
      if (existsSync(p)) return p;
    }
  } catch {
    /* use playwright's own */
  }
  return undefined;
}

async function launch() {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  try {
    return await chromium.launch({ args });
  } catch {
    return chromium.launch({ args, executablePath: findChromium() });
  }
}

/** Playwright calls on one page run one at a time: on software WebGL every input waits for a frame (~1 s). */
const queues = new WeakMap();
const exclusive = (page, fn) => {
  const run = (queues.get(page) ?? Promise.resolve()).then(fn, fn);
  queues.set(
    page,
    run.catch(() => undefined),
  );
  return run;
};
const net = (page, expr) => exclusive(page, () => page.evaluate(`window.__NET__.${expr}`));

/** Software WebGL: screenshot only while NEITHER page is drawing (a frame takes ~1 s and the GPU is shared). */
async function shotBoth(pathA, pathB) {
  console.log(`screenshots ${pathA.split('/').pop()} + ${pathB.split('/').pop()}`);
  await Promise.all([net(A, 'freeze(true)'), net(B, 'freeze(true)')]);
  await sleep(3000);
  await exclusive(A, () => A.screenshot({ path: pathA, timeout: 180_000 }));
  await exclusive(B, () => B.screenshot({ path: pathB, timeout: 180_000 }));
  await Promise.all([net(A, 'freeze(false)'), net(B, 'freeze(false)')]);
  console.log('  done');
}

/** Scripted player: long holds (software WebGL renders ~1 frame/s), a generator now and then, B sometimes. */
function autoplay(page, pattern, stop) {
  const dirs = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
  return (async () => {
    let i = pattern;
    while (!stop.done) {
      const key = dirs[i++ % 4];
      try {
        await exclusive(page, () => page.keyboard.down(key));
        await sleep(2500);
        await exclusive(page, () => page.keyboard.press(i % 3 === 0 ? 'KeyK' : 'Space'));
        await exclusive(page, () => page.keyboard.up(key));
      } catch {
        await sleep(500);
      }
    }
  })();
}

async function main() {
  mkdirSync(shots, { recursive: true });
  start('../node_modules/.bin/tsx', ['src/main.ts'], { RUMBLE_TEST_FAST: '1', PORT: String(SERVER_PORT) });
  start(
    '../node_modules/.bin/vite',
    ['--config', 'vite.client.config.ts', '--port', String(CLIENT_PORT)],
    {},
  );
  await waitHttp(`http://127.0.0.1:${SERVER_PORT}/health`);
  await waitHttp(`http://127.0.0.1:${CLIENT_PORT}/`);

  const browser = await launch();
  const mk = () =>
    browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 2,
      permissions: ['clipboard-read', 'clipboard-write'],
    });
  const ctxA = await mk();
  const ctxB = await mk();
  A = await ctxA.newPage();
  B = await ctxB.newPage();
  const errors = [];
  for (const [n, p] of [
    ['A', A],
    ['B', B],
  ]) {
    p.setDefaultTimeout(120_000);
    p.on('pageerror', (e) => errors.push(`${n}: ${e.message}`));
    p.on(
      'console',
      (m) =>
        process.env.E2E_VERBOSE && /Colyseus/.test(m.text()) && console.log(`  [${n} console] ${m.text()}`),
    );
  }

  // --- A creates a private room
  await A.goto(PAGE);
  await A.waitForFunction(() => window.__NET__.seen().ready, null, { polling: 500 });
  await A.fill('#name', 'Ada');
  await A.click('#btn-create');
  await A.waitForSelector('#screen-room:not([hidden])');
  const code = (await A.textContent('#room-code')).trim();
  console.log(`room code: ${code}`);
  await A.click('#btn-copy');
  const link = await A.evaluate(() => navigator.clipboard.readText());
  check(link.includes(`room=${code}`), `Copy invite link put ${link} on the clipboard`);

  // --- B opens the invite link
  await B.goto(link);
  await B.waitForFunction(() => window.__NET__.seen().ready, null, { polling: 500 });
  await B.fill('#name', 'Bayo');
  await B.click('#characters button:nth-child(2)');
  await B.click('#btn-join');
  await B.waitForSelector('#screen-room:not([hidden])');
  await A.waitForFunction(() => window.__NET__.members().length === 2);

  // --- A configures a short match; both ready
  await A.selectOption('#set-duration', String(DURATION));
  await A.click('#btn-ready');
  await B.click('#btn-ready');
  await B.waitForFunction((d) => document.querySelector('#set-duration').value === String(d), DURATION);
  await sleep(500);
  await A.screenshot({ path: join(shots, '01-lobby-host.png') });
  await B.screenshot({ path: join(shots, '02-lobby-guest.png') });

  // --- start
  await A.click('#btn-start');
  await Promise.all(
    [A, B].map((p) =>
      p.waitForFunction(() => window.__NET__.phase() === 'match' && window.__NET__.hud().tick >= 0),
    ),
  );
  console.log('match started');
  const stop = { done: false };
  const playA = autoplay(A, 0, stop);
  const playB = autoplay(B, 2, stop);

  // ping samples (one per second per player)
  const rtt = { A: [], B: [] };
  const sampler = (async () => {
    while (!stop.done) {
      for (const [n, p] of [
        ['A', A],
        ['B', B],
      ]) {
        try {
          const h = await net(p, 'hud()');
          if (h?.rttMs != null) rtt[n].push(h.rttMs);
        } catch {
          /* page busy */
        }
      }
      await sleep(1000);
    }
  })();

  // --- screenshots of both players mid-match
  await Promise.all(
    [A, B].map((p) => p.waitForFunction(() => window.__NET__.hud().tick >= 150, null, { polling: 500 })),
  );
  await shotBoth(join(shots, '03-match-host.png'), join(shots, '04-match-guest.png'));
  const seats = [await net(A, 'seat()'), await net(B, 'seat()')];
  const arenas = [(await net(A, 'descriptor()')).arenaId, (await net(B, 'descriptor()')).arenaId];

  // --- B loses the network for ~4 s
  const before = await net(B, 'seen()');
  console.log(`B goes offline for ${OUTAGE_MS / 1000} s`);
  const offlineStart = Date.now();
  // A blip shorter than the server's heartbeat (3 s x 2 misses) is absorbed by TCP and nobody notices; a longer one
  // makes the server drop the seat to autopilot while the client's socket dies, which is the case to recover from.
  await ctxB.setOffline(true);
  await sleep(OUTAGE_MS);
  const during = await net(B, 'connection()');
  await ctxB.setOffline(false);
  console.log('B is back online');
  // the SDK retries by itself (200 ms, 400 ms ... backoff); wait for a reconnect that happened AFTER we cut the network
  const recovered = (t0) =>
    window.__NET__
      .connection()
      .timeline.some((t) => t.at > t0 && t.event.startsWith('connected: reconnected')) &&
    window.__NET__.seen().keyframeAt.some((k) => k > t0);
  await B.waitForFunction(recovered, offlineStart, { timeout: 120_000, polling: 500 }).catch(() => undefined);
  const after = await net(B, 'connection()');
  const afterSeen = await net(B, 'seen()');
  const rel = (at) => `${at - offlineStart} ms`;
  const reconnectEvent = after.timeline.find(
    (t) => t.at > offlineStart && t.event.startsWith('connected: reconnected'),
  );
  console.log(
    `B connection timeline (relative to going offline): ${after.timeline
      .filter((t) => t.at >= offlineStart - 100)
      .map((t) => `${rel(t.at)} ${t.event}`)
      .join(' | ')}`,
  );
  console.log(
    `B keyframes at: ${afterSeen.keyframeAt.map(rel).join(', ')} (before: ${before.keyframes} total)`,
  );

  // --- wait for results
  await Promise.all(
    [A, B].map((p) => p.waitForFunction(() => window.__NET__.results() !== null, null, { timeout: 150_000 })),
  );
  stop.done = true;
  await Promise.all([playA, playB, sampler]);
  for (const p of [A, B]) {
    await p
      .waitForFunction(
        () => /MATCH: identical|MISMATCH/.test(document.querySelector('#results-hash').textContent),
        null,
        { timeout: 60_000 },
      )
      .catch(() => undefined);
  }
  await sleep(500);
  await shotBoth(join(shots, '05-results-host.png'), join(shots, '06-results-guest.png'));

  // --- collect + assert
  const grab = async (p) => ({
    results: await net(p, 'results()'),
    hash: await net(p, 'replicaHash()'),
    tick: await net(p, 'replicaTick()'),
    hud: await net(p, 'hud()'),
    stats: await net(p, 'replicaStats()'),
    conn: await net(p, 'connection()'),
    bots: await net(p, 'botCount()'),
    humans: await net(p, 'humanCount()'),
    hashLine: await p.textContent('#results-hash'),
  });
  const a = await grab(A);
  const b = await grab(B);
  const hex = (n) => (n >>> 0).toString(16).padStart(8, '0');
  const r = a.results;
  console.log(
    `\nresults: winnerSeat=${r.winnerSeat} draw=${r.draw} final tick=${r.tick} stateHash=${hex(r.stateHash)}`,
  );
  console.log(`A: replica hash ${hex(a.hash)} (tick ${a.tick}); ${a.hashLine}`);
  console.log(`B: replica hash ${hex(b.hash)} (tick ${b.tick}); ${b.hashLine}`);

  check(a.hash === r.stateHash && b.hash === r.stateHash, 'both replica hashes equal the results stateHash');
  check(b.results.stateHash === r.stateHash, 'both clients received the same stateHash');
  check(JSON.stringify(a.results) === JSON.stringify(b.results), 'results are identical on both clients');
  check(
    a.hud.hashMismatches === 0 && b.hud.hashMismatches === 0,
    `zero hash mismatches (A ${a.hud.hashChecks} checks, B ${b.hud.hashChecks} checks)`,
  );
  check(
    b.hud.resyncs === 0 && a.hud.resyncs === 0,
    `no resync requests (A ${a.hud.resyncs}, B ${b.hud.resyncs})`,
  );
  check(
    during.status === 'reconnecting' || during.drops >= 1,
    `B noticed the outage (status "${during.status}", drops ${during.drops})`,
  );
  check(
    reconnectEvent !== undefined,
    `B reconnected ${reconnectEvent ? rel(reconnectEvent.at) : '(never)'} after going offline`,
  );
  check(
    afterSeen.keyframeAt.some((k) => k > offlineStart),
    `B received a fresh keyframe after reconnecting (${before.keyframes} -> ${afterSeen.keyframes} keyframes)`,
  );
  console.log(
    `connection drops: A ${a.conn.drops}, B ${b.conn.drops}; reconnects: A ${a.conn.reconnects}, B ${b.conn.reconnects} (extra drops are main-thread stalls of software WebGL, recovered the same way)`,
  );
  const humans = r.players.filter((p) => !p.isBot);
  check(
    humans.length === 2 && humans.every((p) => !p.name.startsWith('BOT ')),
    `exactly two humans (${humans.map((p) => p.name).join(', ')}), none labelled BOT`,
  );
  check(
    r.players.filter((p) => p.isBot).length === 30 &&
      r.players.filter((p) => p.isBot).every((p) => p.name.startsWith('BOT ')),
    '30 seats are BOT, all named "BOT ..."',
  );
  check(a.bots === 30 && b.bots === 30 && a.humans === 2, 'both descriptors list 30 bot seats');
  check(
    seats[0] !== seats[1] && arenas[0] === arenas[1],
    `different seats (${seats.join(' / ')}), same arena (${arenas[0]})`,
  );
  check(errors.length === 0, `no uncaught page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);

  const med = (xs) => (xs.length ? [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)] : null);
  const rttLine = (n) =>
    `min ${Math.round(Math.min(...rtt[n]))} ms, median ${Math.round(med(rtt[n]))} ms (${rtt[n].length} samples)`;
  console.log(
    `\nbytes received (compressed frame + keyframe payloads): A ${a.hud.bytesIn}, B ${b.hud.bytesIn}`,
  );
  console.log(
    `ping A: ${rttLine('A')}\nping B: ${rttLine('B')}  (includes main-thread stalls of software WebGL rendering)`,
  );
  console.log(`replica stats A ${JSON.stringify(a.stats)}\nreplica stats B ${JSON.stringify(b.stats)}`);
  console.log(`screenshots in ${shots}`);
  await browser.close();
}

let code = 0;
try {
  await main();
  if (failures.length) {
    console.log(`\n${failures.length} check(s) FAILED`);
    code = 1;
  } else console.log('\nALL CHECKS PASSED');
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  for (const c of children) c.kill('SIGTERM');
}
process.exit(code);
