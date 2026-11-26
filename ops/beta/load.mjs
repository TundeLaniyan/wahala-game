#!/usr/bin/env node
// Load / soak driver for the private-beta stack. SIMULATED clients (headless SDK clients that send a stick direction ~10x/s): they
// size the server, they say nothing about phones. It never "passes" anything: it prints measurements (`RESULT {json}` lines) and
// ops/beta/load.sh puts them next to CPU / memory samples of every container. Run it through ops/beta/load.sh, not by hand.
//
//   rooms     K rooms x H humans (+ server bots up to 32 fighters), a real match of --seconds each, all at once
//   churn     repeated join / leave of one room, and repeated create / leave of private rooms
//   reconnect a human drops mid-match: one comes back inside the window, one never returns (a bot must take the seat)
//   api       platform database load: N accounts, W concurrent workers on authenticated reads for --seconds
//   probe     how the capacity guard answers when more rooms start than the server allows
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import { Client, parseArgs, sleep } from '../scripts/lib.mjs';

const scenario = process.argv[2];
const o = parseArgs(process.argv.slice(3), {
  url: 'http://rumble:2567', // the match server on the private network (the edge's per-IP limiters would measure the limiter, not the server)
  'platform-url': 'http://platform:4567',
  invite: '', rooms: 1, humans: 2, seconds: 180, workers: 20, accounts: 12, cycles: 100, conc: 4,
});
const num = (k) => Number(o[k]);
// the server only accepts the two real match lengths (180 s and 300 s) in production: a load test plays real matches
const SECS = [180, 300];
if (['rooms', 'reconnect', 'probe'].includes(scenario) && !SECS.includes(num('seconds'))) { console.error('--seconds must be 180 or 300 (the match lengths the production server allows)'); process.exit(2); }
const result = (name, data) => console.log(`RESULT ${JSON.stringify({ scenario, name, ...data })}`);
const DIRS = ['up', 'down', 'left', 'right'];
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))]) : null; };

/** A tiny TCP relay in front of the match server, so a test can cut a client's connection the way a dying network does (the server sees close 1006,
 *  not the polite close a leaving client sends). */
function relay(target) {
  const { hostname, port } = new URL(target);
  const socks = new Set();
  const server = net.createServer((c) => {
    const up = net.connect(Number(port), hostname);
    socks.add(c); socks.add(up);
    c.pipe(up); up.pipe(c);
    const end = () => { c.destroy(); up.destroy(); socks.delete(c); socks.delete(up); };
    c.on('error', end); up.on('error', end); c.on('close', end); up.on('close', end);
  });
  return new Promise((res) => server.listen(0, '127.0.0.1', () => res({ url: `http://127.0.0.1:${server.address().port}`, killAll: () => { for (const x of socks) x.destroy(); }, close: () => server.close() })));
}

/** One simulated human: joins (or creates) a room, ignores frames but counts them, sends a stick direction ~10 times a second. */
class Human {
  constructor(name, url = o.url) { this.name = name; this.url = url; this.gid = randomBytes(16).toString('base64url'); /* the real client sends one random guest id per page: the server's join limits are per guest id */ this.sdk = new Client(url); this.room = null; this.frames = 0; this.results = null; this.closed = null; this.notices = []; this.seq = 0; this.timer = null; }
  attach(room) {
    this.room = room;
    room.onMessage('fr', () => { this.frames++; });
    room.onMessage('kf', () => { this.frames++; });
    room.onMessage('results', (m) => { this.results = m; });
    room.onMessage('notice', (m) => { this.notices.push(m); });
    room.onMessage('*', () => {});
    room.reconnection.maxRetries = 15; room.reconnection.minUptime = 0; // as the game client: the SDK itself retries after a drop
    room.onDrop(() => { this.droppedAt = Date.now(); });
    room.onReconnect(() => { this.reconnectedAt = Date.now(); });
    room.onLeave((code) => { this.closed = code; this.stop(); });
    room.onError(() => {});
  }
  async create(opts = {}) { this.attach(await this.sdk.create('rumble', { private: true, name: this.name, characterId: 'streetBaller', gid: this.gid, ...opts })); return this.room.roomId; }
  async join(code) { this.attach(await this.sdk.joinById(code, { name: this.name, characterId: 'streetBaller', gid: this.gid })); }
  play() {
    let dir = DIRS[Math.floor(Math.random() * 4)];
    this.timer = setInterval(() => {
      if (Math.random() < 0.15) dir = DIRS[Math.floor(Math.random() * 4)];
      try { this.room.send('in', { s: ++this.seq, m: dir, h: false, b: Math.random() < 0.04 ? 1 : 0 }); } catch { /* connection gone */ }
    }, 100);
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  async leave() { this.stop(); try { await this.room?.leave(); } catch { /* already gone */ } }
}

async function startRoom(i, humans, seconds, urls = []) {
  const host = new Human(`LoadH${i}x0`, urls[0] ?? o.url);
  const code = await host.create();
  const members = [host];
  for (let h = 1; h < humans; h++) { const m = new Human(`LoadH${i}x${h}`, urls[h] ?? o.url); await m.join(code); members.push(m); }
  await sleep(300);
  host.room.send('settings', { durationSec: seconds });
  await sleep(200);
  host.room.send('start');
  members.forEach((m) => m.play());
  return { code, members };
}

async function rooms() {
  const K = num('rooms'), H = num('humans'), S = num('seconds');
  const t0 = Date.now();
  const started = [];
  const errors = [];
  for (let i = 0; i < K; i++) { try { started.push(await startRoom(i, H, S)); } catch (e) { errors.push(String(e.message ?? e).slice(0, 120)); } }
  const startupMs = Date.now() - t0;
  console.log(`rooms started: ${started.length}/${K} in ${startupMs} ms (errors: ${errors.length})`);
  const all = started.flatMap((r) => r.members);
  const deadline = Date.now() + (S + 90) * 1000;
  while (Date.now() < deadline && !all.every((m) => m.results || m.closed !== null)) await sleep(500);
  const finished = all.filter((m) => m.results).length;
  result('rooms', { rooms: K, humansPerRoom: H, matchSeconds: S, roomsStarted: started.length, startErrors: errors, startupMs, humans: all.length, humansWithResults: finished,
    humansDisconnected: all.filter((m) => !m.results && m.closed !== null).length, closeCodes: all.filter((m) => m.closed !== null).map((m) => m.closed), framesPerHuman: Math.round(all.reduce((a, m) => a + m.frames, 0) / Math.max(1, all.length)),
    notices: all.flatMap((m) => m.notices).slice(0, 5) });
  await Promise.all(all.map((m) => m.leave()));
}

async function churn() {
  const N = num('cycles'), C = num('conc');
  const host = new Human('ChurnHost');
  const code = await host.create();
  let ok = 0, fail = 0; const lat = []; const errs = new Map();
  let next = 0;
  const worker = async (w) => {
    while (next < N) {
      next++;
      const t = performance.now();
      const h = new Human(`Churn${w}_${next}`);
      try { await h.join(code); lat.push(performance.now() - t); await sleep(20 + Math.random() * 60); await h.leave(); ok++; }
      catch (e) { fail++; const k = String(e.message ?? e).slice(0, 60); errs.set(k, (errs.get(k) ?? 0) + 1); await h.leave(); }
    }
  };
  await Promise.all(Array.from({ length: C }, (_, w) => worker(w)));
  result('join-leave', { cycles: N, concurrency: C, ok, fail, joinP50Ms: pct(lat, 0.5), joinP99Ms: pct(lat, 0.99), errors: Object.fromEntries(errs) });
  await host.leave();
  // private rooms created and abandoned (the server must dispose them: no growth)
  let created = 0, cfail = 0;
  const errs2 = new Map();
  for (let i = 0; i < Math.min(N, 30); i++) {
    const h = new Human(`Make${i}`);
    try { await h.create(); created++; await h.leave(); } catch (e) { cfail++; const k = String(e.message ?? e).slice(0, 60); errs2.set(k, (errs2.get(k) ?? 0) + 1); }
    await sleep(50);
  }
  result('create-leave', { created, refused: cfail, errors: Object.fromEntries(errs2) });
}

async function reconnect() {
  const S = num('seconds');
  const proxies = [null, await relay(o.url), await relay(o.url)]; // host direct; the two others through a relay that can be cut
  const { members } = await startRoom(0, 3, S, proxies.map((p) => p?.url ?? o.url));
  await sleep(20000); // well inside the match
  const [, back, gone] = members;
  gone.stop(); gone.room.reconnection.enabled = false; // this one's network never comes back: the seat must fall to a bot, the match must go on
  const t0 = Date.now();
  proxies[1].killAll(); proxies[2].killAll(); // both connections die at once (a tunnel, a lift, a dead router); `back` retries by itself, as the game does
  let waited = 0;
  while (!back.reconnectedAt && waited < 25000) { await sleep(250); waited += 250; }
  const framesAtBack = back.frames;
  await sleep(5000);
  const deadline = Date.now() + (S + 90) * 1000;
  while (Date.now() < deadline && !members[0].results) await sleep(500);
  await sleep(1500);
  result('reconnect', { returnedWithinWindow: !!back.reconnectedAt, reconnectMs: back.reconnectedAt ? back.reconnectedAt - t0 : null, framesInFirst5sAfterReturn: back.frames - framesAtBack,
    matchFinishedForHost: !!members[0].results, returnedHumanGotResults: !!back.results, neverReturnedHumanClosedWith: gone.closed });
  await Promise.all(members.map((m) => m.leave()));
  proxies.forEach((p) => p?.close());
}

async function api() {
  const P = o['platform-url'];
  const call = async (method, path, body, token) => {
    const t = performance.now();
    try {
      const r = await fetch(P + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
      await r.arrayBuffer();
      return { status: r.status, ms: performance.now() - t };
    } catch { return { status: 0, ms: performance.now() - t }; }
  };
  const tokens = [];
  for (let i = 0; i < num('accounts'); i++) {
    const r = await fetch(`${P}/v1/auth/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ platform: 'web', ...(o.invite ? { inviteCode: o.invite } : {}) }) });
    if (r.status === 201) tokens.push((await r.json()).tokens.accessToken);
    else await sleep(1000);
  }
  console.log(`accounts for the load: ${tokens.length}`);
  const counts = new Map(); const lat = [];
  const end = Date.now() + num('seconds') * 1000;
  let n = 0;
  const worker = async () => { while (Date.now() < end) { const r = await call('GET', '/v1/auth/sessions', undefined, tokens[n++ % tokens.length]); counts.set(r.status, (counts.get(r.status) ?? 0) + 1); lat.push(r.ms); } };
  await Promise.all(Array.from({ length: num('workers') }, worker));
  const total = lat.length;
  result('platform-reads', { workers: num('workers'), seconds: num('seconds'), requests: total, perSecond: Math.round(total / num('seconds')), statuses: Object.fromEntries(counts), p50Ms: pct(lat, 0.5), p99Ms: pct(lat, 0.99), maxMs: Math.round(lat.reduce((a, b) => Math.max(a, b), 0)) });
}

async function probe() {
  // start more rooms than the capacity guard allows; the extra start must be REFUSED with a notice, not melt the server
  const K = num('rooms'), S = num('seconds');
  const started = []; const refused = [];
  for (let i = 0; i < K; i++) {
    const host = new Human(`Probe${i}`);
    try { const code = await host.create(); await sleep(200); host.room.send('settings', { durationSec: S }); host.room.send('start'); started.push({ host, code }); } catch (e) { refused.push(String(e.message ?? e).slice(0, 80)); }
    await sleep(500);
  }
  await sleep(4000);
  const notices = started.map((s) => s.host.notices.map((n) => (typeof n === 'string' ? n : JSON.stringify(n)).slice(0, 100)));
  result('capacity-guard', { roomsTried: K, createdRooms: started.length, createRefusals: refused, noticesPerHost: notices });
  await Promise.all(started.map((s) => s.host.leave()));
}

const table = { rooms, churn, reconnect, api, probe };
if (!table[scenario]) { console.error(`usage: load.mjs ${Object.keys(table).join('|')} [--rooms K --humans H --seconds S --workers W --cycles N]`); process.exit(2); }
await table[scenario]();
process.exit(0);
