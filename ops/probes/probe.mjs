#!/usr/bin/env node
/**
 * Black-box ops / security probe for a running City Rumble server (docs/ops/08-SECURITY.md).
 *
 *   node ops/probes/probe.mjs --http http://127.0.0.1:2567 [--origin <allowed origin>] [--metrics-token T]
 *                             [--only health,metrics,origin,names,abuse,roomflood,reconnect,botstorm]
 *                             [--reconnect-window 30] [--rooms 40] [--json out.json] [--strict]
 *
 * It only speaks HTTP / WebSocket, so it works against the local bundle, the Docker image, the LAN setup and (later)
 * a real host behind TLS. Point it ONLY at a server you own: `roomflood` and `botstorm` load the target on purpose.
 *
 * Statuses: PASS | FAIL (exit 1) | GAP (a known, documented weakness; exit 1 only with --strict) | INFO | SKIP.
 * `botstorm` and `reconnect` are off by default (load / ~40 s); name them with --only.
 */
import { writeFileSync } from 'node:fs';
import {
  Client,
  Results,
  guest,
  killableProxy,
  leftPromise,
  parseArgs,
  sleep,
  toWs,
  upgradeStatus,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const http = String(args.http ?? 'http://127.0.0.1:2567').replace(/\/$/, '');
const ws = toWs(http);
const gameSocketUrl = `${ws}/probe0000/probe0000`;
const allowedOrigin = typeof args.origin === 'string' ? args.origin : 'http://localhost:5180';
const evilOrigin = 'https://evil.example';
const token = typeof args['metrics-token'] === 'string' ? args['metrics-token'] : null;
const windowSec = Number(args['reconnect-window'] ?? 30);
const roomsToFlood = Number(args.rooms ?? 40);
const DEFAULT_GROUPS = ['health', 'metrics', 'origin', 'names', 'abuse', 'roomflood'];
const groups = typeof args.only === 'string' ? args.only.split(',') : DEFAULT_GROUPS;
const R = new Results();
const noop = () => {};
const MSG_TYPES = ['welcome', 'lobby', 'kf', 'fr', 'pong', 'results', 'notice'];

/** Registers no-op handlers so the SDK does not warn about the server's message types. */
function quiet(room) {
  for (const t of MSG_TYPES) room.onMessage(t, noop);
  return room;
}

async function metrics() {
  if (!token) return null;
  const r = await fetch(`${http}/metrics`, { headers: { Authorization: `Bearer ${token}` } });
  return r.ok ? r.json() : null;
}

const leave = async (rooms) => {
  for (const r of rooms) {
    try {
      await r.leave(true);
    } catch {
      /* already gone */
    }
  }
};

// ------------------------------------------------------------------------------------------------------ health
async function health() {
  const r = await fetch(`${http}/health`);
  const body = await r.json().catch(() => null);
  R.check('health', 'GET /health -> 200 {"ok":true}', r.status === 200 && body?.ok === true, `HTTP ${r.status}`);
  R.check('health', 'no X-Powered-By header', !r.headers.has('x-powered-by'));
  const root = await fetch(`${http}/`);
  const text = await root.text();
  if (/colyseus\s+\d/i.test(text)) {
    R.gap('health', 'GET / discloses the framework version', `"${text.slice(0, 40)}": block at the reverse proxy`);
  } else R.pass('health', 'GET / does not disclose a version');
  for (const p of ['/monitor', '/playground', '/__colyseus', '/matchmake/rumble']) {
    const x = await fetch(`${http}${p}`);
    R.check('health', `${p} is not exposed`, x.status === 404, `HTTP ${x.status}`);
  }
}

// ----------------------------------------------------------------------------------------------------- metrics
async function metricsAuth() {
  const open = await fetch(`${http}/metrics`);
  if (!token) {
    if (open.status === 200)
      R.gap('metrics', 'GET /metrics is open (no --metrics-token given)', 'production MUST set RUMBLE_METRICS_TOKEN');
    else R.pass('metrics', '/metrics requires authorisation', `HTTP ${open.status}`);
    return;
  }
  R.check('metrics', 'no token -> 401', open.status === 401, `HTTP ${open.status}`);
  const wrong = await fetch(`${http}/metrics`, { headers: { Authorization: 'Bearer wrong-token' } });
  R.check('metrics', 'wrong token -> 401', wrong.status === 401, `HTTP ${wrong.status}`);
  const ok = await fetch(`${http}/metrics`, { headers: { Authorization: `Bearer ${token}` } });
  R.check('metrics', 'right token -> 200 JSON with process + rooms', ok.status === 200 && (await ok.json()).rooms !== undefined);
  // a private room's code must never appear in /metrics
  const client = new Client(http);
  const room = quiet(await client.create('rumble', { name: guest('Meter'), private: true }));
  const text = JSON.stringify(await metrics());
  R.check('metrics', "a private room's code is not in /metrics", !text.includes(room.roomId));
  await leave([room]);
}

// ------------------------------------------------------------------------------------------------------ origin
async function origin() {
  const evil = await upgradeStatus(gameSocketUrl, evilOrigin);
  R.check('origin', `WebSocket upgrade from ${evilOrigin} -> 403`, evil === 403, String(evil));
  const good = await upgradeStatus(gameSocketUrl, allowedOrigin);
  R.check('origin', `WebSocket upgrade from ${allowedOrigin} is not refused`, good !== 403, String(good));
  const none = await upgradeStatus(gameSocketUrl, null);
  R.info('origin', 'upgrade with NO Origin header', `${none}: non-browser clients are allowed by design, so Origin is browser hygiene, not authentication`);

  const preflight = (o) =>
    fetch(`${http}/matchmake/joinOrCreate/rumble`, {
      method: 'OPTIONS',
      headers: { Origin: o, 'Access-Control-Request-Method': 'POST' },
    });
  const pe = await preflight(evilOrigin);
  R.check('origin', 'CORS preflight from an unlisted origin gets no Allow-Origin', !pe.headers.has('access-control-allow-origin'));
  const pg = await preflight(allowedOrigin);
  R.check('origin', 'CORS preflight from the allowed origin echoes it', pg.headers.get('access-control-allow-origin') === allowedOrigin);
  R.check('origin', 'CORS never allows credentials', !pg.headers.has('access-control-allow-credentials'));
}

// ------------------------------------------------------------------------------------------------------- names
const BAD_NAMES = [
  ['empty', ''],
  ['one character', 'A'],
  ['25 characters', 'x'.repeat(25)],
  ['HTML', '<script>alert(1)</script>'],
  ['right-to-left override (U+202E)', 'Bob‮evil'],
  ['zero-width space', 'a​b'],
  ['newline', 'line\nbreak'],
  ['emoji only', '😀😀'],
  ['punctuation only', '___'],
  ['stacked combining marks', 'á́́́́'],
  ['number instead of string', 12345],
  ['object instead of string', { $gt: '' }],
  ['__proto__ object', JSON.parse('{"__proto__":{"x":1}}')],
];
const GOOD_NAMES = ['Ada', 'Ọlá-Adé', 'Chidi_99', 'Ngozi O.', "D'Tunde"];
/** Accepted today, and arguably should not be: documented gaps, not failures. */
const GAP_NAMES = [
  ['impersonates a labelled server bot', 'BOT Chidi'],
  ['reserved staff-sounding name', 'Admin'],
  ['reserved staff-sounding name', 'Moderator'],
  ['Cyrillic look-alike of "Admin"', 'Аdmin'],
];

async function tryName(name) {
  const client = new Client(http);
  try {
    const room = quiet(await client.create('rumble', { name, private: true }));
    await leave([room]);
    return true;
  } catch {
    return false;
  }
}

async function names() {
  for (const [label, name] of BAD_NAMES) {
    R.check('names', `rejects: ${label}`, !(await tryName(name)));
  }
  for (const name of GOOD_NAMES) R.check('names', `accepts: ${name}`, await tryName(name));
  for (const [label, name] of GAP_NAMES) {
    if (await tryName(name)) R.gap('names', `accepts "${name}" (${label})`, 'needs a reserved-name rule');
    else R.pass('names', `rejects "${name}" (${label})`);
  }
  // two humans with the same name in one room
  const client = new Client(http);
  const host = quiet(await client.create('rumble', { name: 'Twin', private: true }));
  try {
    const second = quiet(await client.joinById(host.roomId, { name: 'Twin' }));
    R.gap('names', 'two humans may share one name in a room', 'duplicate names allow impersonation inside a lobby');
    await leave([second]);
  } catch {
    R.pass('names', 'duplicate names in one room are refused');
  }
  await leave([host]);
  R.info('names', 'no profanity / insult filter exists', 'validatePlayerName checks character classes and length only');
}

// ------------------------------------------------------------------------------------------------------ abuse
async function abuse() {
  const client = new Client(http);

  // invalid messages: more than 20 within 10 s -> disconnected with 4400, and may not reconnect
  const a = quiet(await client.create('rumble', { name: guest('Junk'), private: true }));
  const aLeft = leftPromise(a);
  const aToken = a.reconnectionToken;
  a.reconnection.enabled = false;
  const t0 = Date.now();
  for (let i = 0; i < 40; i++) a.send('definitely-not-a-message', { n: i });
  const aEnd = await Promise.race([aLeft, sleep(5000).then(() => null)]);
  R.check('abuse', '40 junk messages get the client disconnected (4400)', aEnd?.code === 4400, `${aEnd ? `code ${aEnd.code} after ${Date.now() - t0} ms` : 'not disconnected'}`);
  let reconnected = false;
  try {
    await quiet(await client.reconnect(aToken)).leave(true);
    reconnected = true;
  } catch {
    /* expected */
  }
  R.check('abuse', 'a kicked client cannot use its reconnection token', !reconnected);

  // sustained flood of VALID messages (600 per 5 s limit)
  const b = quiet(await client.create('rumble', { name: guest('Flood'), private: true }));
  b.reconnection.enabled = false;
  const bLeft = leftPromise(b);
  for (let i = 0; i < 900; i++) b.send('ping', { c: i });
  const bEnd = await Promise.race([bLeft, sleep(5000).then(() => null)]);
  R.check('abuse', '900 valid pings in one burst get the client disconnected', bEnd !== null, bEnd ? `code ${bEnd.code}` : 'still connected');

  // oversized frame (the transport's maxPayload is 4 KiB)
  const c = quiet(await client.create('rumble', { name: guest('Big'), private: true }));
  c.reconnection.enabled = false;
  const cLeft = leftPromise(c);
  c.send('in', { s: 'x'.repeat(16_000) });
  const cEnd = await Promise.race([cLeft, sleep(4000).then(() => null)]);
  R.check('abuse', 'a 16 KB message closes the socket (maxPayload)', cEnd !== null, cEnd ? `code ${cEnd.code}` : 'still connected');

  // malformed join / create options
  const odd = [
    ['create with options as a string', 'hello'],
    ['create with unknown arena', { name: guest(), private: true, arenaId: '../../etc/passwd' }],
    ['create with huge autoStartSec', { name: guest(), private: true, autoStartSec: 1e9 }],
    ['create with duration 1', { name: guest(), private: true, durationSec: 1 }],
    ['create with private as a string', { name: guest(), private: 'yes' }],
  ];
  for (const [label, options] of odd) {
    let accepted = false;
    try {
      await leave([quiet(await client.create('rumble', options))]);
      accepted = true;
    } catch {
      /* expected */
    }
    R.check('abuse', `rejects: ${label}`, !accepted);
  }
  try {
    await client.joinById('ZZZZZZ', { name: guest() });
    R.fail('abuse', 'joining a nonexistent room code fails');
  } catch (e) {
    R.pass('abuse', 'joining a nonexistent room code fails', String(e.message).slice(0, 60));
  }
}

// -------------------------------------------------------------------------------------------------- room flood
async function roomflood() {
  const client = new Client(http);
  const rooms = [];
  let refused = 0;
  const started = Date.now();
  for (let i = 0; i < roomsToFlood; i++) {
    try {
      rooms.push(quiet(await client.create('rumble', { name: guest('Flood'), private: true })));
    } catch {
      refused++;
    }
  }
  const ms = Date.now() - started;
  const m = await metrics();
  R.info('roomflood', `${rooms.length}/${roomsToFlood} private rooms created from one client in ${ms} ms`, m ? `server reports ${m.rooms.length} room(s)` : 'pass --metrics-token to read the server count');
  if (refused === 0) {
    R.gap('roomflood', 'no per-IP or global limit on room creation', 'enforce at the reverse proxy (ops/proxy) and, later, in the server (docs/ops/08-SECURITY.md)');
  } else R.pass('roomflood', 'room creation is limited', `${refused} of ${roomsToFlood} refused`);
  await leave(rooms);
  await sleep(300);
}

// ------------------------------------------------------------------------------------------------- reconnection
/**
 * Real-time check of the 30 s reconnection requirement, token handling and impersonation, against the live server.
 * Three humans in a private room: A and B lose their connection together, C is the attacker.
 */
async function reconnect() {
  const g = 'reconnect';
  const target = new URL(http);
  const tls = target.protocol === 'https:';
  const proxyOpts = { scheme: tls ? 'https' : 'http', publicHost: target.hostname };
  const targetPort = Number(target.port || (tls ? 443 : 80));
  const pxA = await killableProxy(target.hostname, targetPort, proxyOpts);
  const pxB = await killableProxy(target.hostname, targetPort, proxyOpts);
  const clientA = new Client(pxA.url);
  const clientB = new Client(pxB.url);
  const clientC = new Client(http);
  const welcomeOf = new Map();
  const track = (name, room) => {
    for (const t of MSG_TYPES) room.onMessage(t, noop);
    room.onMessage('welcome', (m) => welcomeOf.set(name, m));
    return room;
  };
  try {
    const a = track('A', await clientA.create('rumble', { name: guest('Ada'), private: true }));
    const code = a.roomId;
    const b = track('B', await clientB.joinById(code, { name: guest('Bayo') }));
    const c = track('C', await clientC.joinById(code, { name: guest('Mallory') }));
    for (const r of [a, b]) r.reconnection.enabled = false; // reconnect by hand, on our schedule
    await sleep(300);
    a.send('start', {});
    const deadline = Date.now() + 15_000;
    while (!['A', 'B', 'C'].every((n) => welcomeOf.get(n)?.descriptor) && Date.now() < deadline) await sleep(100);
    if (!['A', 'B', 'C'].every((n) => welcomeOf.get(n)?.descriptor)) {
      R.fail(g, 'a 3-human private match starts', 'no seat/descriptor within 15 s');
      return;
    }
    R.pass(g, 'a 3-human private match starts', `room ${code.slice(0, 2)}****`);
    const seatA = welcomeOf.get('A').seat;
    const seatB = welcomeOf.get('B').seat;
    const tokA = a.reconnectionToken;
    const tokB = b.reconnectionToken;
    let bSeen = true;
    c.onMessage('lobby', (l) => {
      bSeen = l.members?.some((x) => x.seat === seatB && x.connected === false) ?? bSeen;
    });

    // both lose their network at the same moment
    const t0 = Date.now();
    pxA.killAll();
    pxB.killAll();
    await sleep(1000);

    // the attacker cannot take a dropped player's seat: wrong secret, right room
    let hijack = false;
    for (const guess of [`${code}:AAAAAAAAA`, `${code}:${tokA.split(':')[1]?.split('').reverse().join('')}`, `${code}:`]) {
      try {
        await quiet(await clientC.reconnect(guess)).leave(true);
        hijack = true;
      } catch {
        /* expected */
      }
    }
    R.check(g, 'reconnecting with a guessed token for a dropped seat is refused', !hijack);

    // inside the window: A returns on its own token and gets the same seat back
    await sleep(Math.max(0, (windowSec - 4) * 1000 - (Date.now() - t0)));
    const tA = Date.now() - t0;
    let a2 = null;
    try {
      a2 = track('A2', await clientA.reconnect(tokA));
      await sleep(1500);
      const w = welcomeOf.get('A2');
      R.check(g, `A reconnects at ${(tA / 1000).toFixed(1)} s (window ${windowSec} s) and gets the same seat`, w?.seat === seatA && !!w.descriptor, `seat ${w?.seat} vs ${seatA}`);
    } catch (e) {
      R.fail(g, `A reconnects at ${(tA / 1000).toFixed(1)} s (window ${windowSec} s)`, String(e.message));
    }
    let reuse = false;
    try {
      await quiet(await clientA.reconnect(tokA)).leave(true);
      reuse = true;
    } catch {
      /* expected: single use */
    }
    R.check(g, "A's old token is single-use (refused after a successful reconnect)", !reuse);

    // outside the window: B is too late, the seat belongs to a bot
    await sleep(Math.max(0, (windowSec + 3) * 1000 - (Date.now() - t0)));
    const tB = Date.now() - t0;
    let late = false;
    try {
      await quiet(await clientB.reconnect(tokB)).leave(true);
      late = true;
    } catch {
      /* expected */
    }
    R.check(g, `B reconnecting at ${(tB / 1000).toFixed(1)} s (after the ${windowSec} s window) is refused`, !late);
    R.info(g, 'lobby view still lists B as disconnected-with-seat after expiry', String(bSeen));

    // a player who left on purpose cannot come back with the token they held
    if (a2) {
      const tokA2 = a2.reconnectionToken;
      await a2.leave(true);
      await sleep(500);
      let back = false;
      try {
        await quiet(await clientA.reconnect(tokA2)).leave(true);
        back = true;
      } catch {
        /* expected */
      }
      R.check(g, 'a consented leave cannot be reconnected', !back);
    }
    await leave([c]);
  } finally {
    pxA.close();
    pxB.close();
  }
}

// ------------------------------------------------------------------------------------------------------ botstorm
/**
 * Measures what ONE client can do to the server's tick budget by opening public rooms with `autoStartSec: 0`: each
 * becomes a 32-fighter match with 31 server bots. Needs --metrics-token. LOADS THE TARGET.
 */
async function botstorm() {
  const g = 'botstorm';
  if (!token) return R.skip(g, 'needs --metrics-token to read server load');
  const n = Number(args.storm ?? 4);
  const before = await metrics();
  const client = new Client(http);
  const rooms = [];
  for (let i = 0; i < n; i++) {
    try {
      rooms.push(quiet(await client.create('rumble', { name: guest('Storm'), private: false, autoStartSec: 0 })));
    } catch (e) {
      R.info(g, `room ${i + 1} refused`, String(e.message));
    }
  }
  await sleep(6000); // countdown + settle
  await metrics(); // reset the "since last read" windows
  await sleep(10_000);
  const after = await metrics();
  const playing = after.rooms.filter((r) => r.phase === 'playing');
  const dropped = after.rooms.reduce((s, r) => s + r.ticks.dropped, 0);
  const worst = Math.max(0, ...after.rooms.map((r) => r.ticks.stepMs.p99));
  R.info(g, `${rooms.length} public rooms opened by one client; ${playing.length} are in a running match (32 fighters each)`, `server CPU ${after.process.cpuPercentSinceLastRead}% of one core, event-loop p99 ${after.process.eventLoopDelayMs.p99} ms, step p99 ${worst} ms, dropped ticks ${dropped}, rooms before ${before?.rooms.length ?? '?'}`);
  if (playing.length >= 1) {
    R.gap(g, 'one client can start a bot-filled match instantly with autoStartSec=0', 'cost is paid by every room on the process: cap rooms per IP and globally, ignore a client autoStartSec in production');
  }
  await leave(rooms);
}

// ---------------------------------------------------------------------------------------------------------- run
const table = { health, metrics: metricsAuth, origin, names, abuse, roomflood, reconnect, botstorm };
console.log(`probe target ${http}  groups: ${groups.join(', ')}\n`);
for (const name of groups) {
  const fn = table[name];
  if (!fn) {
    R.fail('probe', `unknown group "${name}"`);
    continue;
  }
  try {
    await fn();
  } catch (e) {
    R.fail(name, 'group crashed', e instanceof Error ? e.stack?.split('\n').slice(0, 3).join(' | ') : String(e));
  }
}
console.log(`\n${R.summary()}`);
if (typeof args.json === 'string') writeFileSync(args.json, JSON.stringify({ target: http, at: new Date().toISOString(), rows: R.rows }, null, 2));
process.exit(R.count('FAIL') > 0 || (args.strict && R.count('GAP') > 0) ? 1 : 0);
