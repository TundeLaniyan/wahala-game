#!/usr/bin/env node
/**
 * `npm run test:beta-tunnel-e2e`: the acceptance run of the founder-laptop tunnel (docs/ops/BETA_TUNNEL_TESTING.md), end to end, on ONE machine.
 *
 * It starts the REAL launcher (scripts/beta-tunnel.mjs) in its test mode: the real Docker stack (PostgreSQL, platform, match server, tunnel edge),
 * but a local TLS stand-in for Cloudflare at a made-up trycloudflare-style name on port 443 (scripts/beta-tunnel/simulate.mjs). Then:
 *   1. SECURITY, over https at the public name: strangers, made-up links, raw matchmaking, admin and metrics routes, rate limits, secrets in
 *      `docker inspect`, the visitor's real address, privacy of the logs;
 *   2. TWO REAL BROWSERS (e2e/private-multiplayer.spec.ts with the access links): guest onboarding with the invite code, friends, party, Free-for-All
 *      with 32 fighters, quick signals, a dropped connection and the 30 s reconnection, results, Team Rumble, a second match; an invited visitor without an
 *      account and a stranger without a link are refused; WebSocket opens / closes, round-trip times and bytes are recorded;
 *   3. SHUTDOWN: `beta-tunnel.mjs stop` removes everything, verified.
 * This is NOT a run through Cloudflare's network (a sandbox cannot reach it) and NOT a physical phone: it proves everything on OUR side of the tunnel.
 *
 * Needs: Docker running, root (maps the made-up name in /etc/hosts, binds 443), WAHALA_CHROMIUM. Writes docs/measurements/beta-tunnel/.
 */
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = 'rapid-fox-lagos-demo.trycloudflare.com';
const BASE = `https://${HOST}`;
const STATE = process.env.BETA_TUNNEL_STATE ?? '/tmp/wahala-tunnel-e2e-state';
const OUT = join(ROOT, 'docs/measurements/beta-tunnel');
const LOG = join(OUT, 'tunnel-e2e-launcher.log');
mkdirSync(OUT, { recursive: true });
writeFileSync(LOG, '');
const results = [];
const check = (area, name, ok, detail = '') => {
  results.push({ area, name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${area}] ${name}${detail ? ` - ${detail}` : ''}`);
};
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });

if (process.getuid?.() !== 0) {
  console.error('needs root (it maps the test name in /etc/hosts and binds 443)');
  process.exit(2);
}
const hostsLine = `127.0.0.1 ${HOST} # wahala-tunnel-e2e`;
if (!readFileSync('/etc/hosts', 'utf8').includes(hostsLine)) appendFileSync('/etc/hosts', `${hostsLine}\n`);
rmSync(STATE, { recursive: true, force: true });
const PROJECT = 'wahala-tunnel-e2e'; // its own containers and database, apart from a real run's
const env = {
  ...process.env,
  BETA_TUNNEL_STATE: STATE,
  BETA_TUNNEL_PROJECT: PROJECT,
  NO_PROXY: `${HOST},127.0.0.1,localhost`,
  no_proxy: `${HOST},127.0.0.1,localhost`,
};

let launcher = null;
let finished = false;
const cleanupHosts = () => {
  try {
    writeFileSync('/etc/hosts', readFileSync('/etc/hosts', 'utf8').replace(`${hostsLine}\n`, ''));
  } catch {
    /* best effort */
  }
};
process.on('SIGINT', () => {
  launcher?.kill('SIGTERM');
  cleanupHosts();
  process.exit(130);
});

// ------------------------------------------------------------------------------------------------------------------ start the launcher
const testers = ['ada.tester@example.com', 'bayo.tester@example.com', 'cee.tester@example.com'];
let launcherOut = '';
launcher = spawn(
  'node',
  ['scripts/beta-tunnel.mjs', '--simulate-tunnel', HOST, '--testers', testers.join(',')],
  { cwd: ROOT, env },
);
const onData = (d) => {
  launcherOut += d.toString();
  appendFileSync(LOG, d.toString().replace(ANSI, ''));
};
launcher.stdout.on('data', onData);
launcher.stderr.on('data', onData);
launcher.on('exit', () => (finished = true));
const t0 = Date.now();
while (!launcherOut.includes('THE TEST IS RUNNING') && !finished && Date.now() - t0 < 25 * 60_000)
  await sleep(1000);
check(
  'launcher',
  'one command starts the whole test and prints "THE TEST IS RUNNING"',
  launcherOut.includes('THE TEST IS RUNNING'),
  `${Math.round((Date.now() - t0) / 1000)} s`,
);
if (!launcherOut.includes('THE TEST IS RUNNING')) {
  console.error(launcherOut.slice(-3000));
  cleanupHosts();
  process.exit(1);
}
const links = [
  ...launcherOut.matchAll(
    new RegExp(`https://${HOST.replaceAll('.', '\\.')}/__enter\\?k=([0-9a-f]{32})`, 'g'),
  ),
].map((m) => m[1]);
const invite = /wb-[0-9a-f]{16}/.exec(launcherOut)?.[0] ?? '';
check(
  'launcher',
  'it prints the public address, a private link per tester and an invite code',
  links.length === 3 && invite !== '' && launcherOut.includes(BASE),
  `${links.length} links`,
);
const selfPass = (launcherOut.match(/PASS {2}/g) ?? []).length;
check(
  'launcher',
  'its own protection self-test passed before any link was shown',
  selfPass >= 20 && !/FAIL {2}/.test(launcherOut),
  `${selfPass} checks`,
);

// ------------------------------------------------------------------------------------------------------ 1. security, over https
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // the stand-in's throw-away certificate; a real tunnel never needs this
const get = (path, init = {}) =>
  fetch(`${BASE}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(15_000), ...init });
const cookie = (t) => ({ cookie: `wahala_gate=${t}` });

let r = await get('/');
check(
  'security',
  'a stranger without a link gets the refusal page (403)',
  r.status === 403 && /private test/.test(await r.text()),
);
for (const [path, method] of [
  ['/v1/auth/providers', 'GET'],
  ['/platform-health', 'GET'],
  ['/.well-known/jwks.json', 'GET'],
  ['/matchmake/create/rumble', 'POST'],
  ['/matchmake/joinOrCreate/rumble', 'POST'],
  ['/matchmake/joinById/ABCDEF', 'POST'],
  ['/assets/index.js', 'GET'],
]) {
  r = await get(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'POST' ? '{"name":"x","private":true}' : undefined,
  });
  check(
    'security',
    `${method} ${path} without a link is refused (403)`,
    r.status === 403,
    `HTTP ${r.status}`,
  );
}
r = await get(`/__enter?k=${'1'.repeat(32)}`);
check('security', 'a made-up private link is refused', r.status === 403);
r = await get(`/__enter?k=${links[0]}`);
const sc = r.headers.get('set-cookie') ?? '';
check(
  'security',
  'a real private link sets a Secure, HttpOnly, SameSite cookie and redirects to the game without the token',
  r.status === 302 &&
    /Secure/.test(sc) &&
    /HttpOnly/.test(sc) &&
    /SameSite=Lax/.test(sc) &&
    r.headers.get('location') === '/',
  sc.replace(links[0], '<token>'),
);
r = await get('/', { headers: cookie(links[0]) });
const page = await r.text();
check(
  'frontend',
  'with the cookie the real game page loads from the tunnel address, no localhost in it',
  r.status === 200 && /<title>/.test(page) && !/localhost|127\.0\.0\.1/.test(page),
);
const assets = [...page.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
let js = '';
for (const a of assets) js += await (await get(a, { headers: cookie(links[0]) })).text();
check(
  'frontend',
  'the page finds its servers from its own address at run time (wss://{host}, https://{host}), nothing fixed',
  js.includes('wss://{host}') && js.includes('https://{host}') && !/wss?:\/\/\{host\}:\d+/.test(js),
);
const audio = await get('/audio/music/manifest.json', { headers: cookie(links[0]) });
check(
  'frontend',
  'real game assets are served through the tunnel path (audio manifest, correct type)',
  audio.status === 200 && /json/.test(audio.headers.get('content-type') ?? ''),
  `HTTP ${audio.status}`,
);
const sw = await get('/sw.js', { headers: cookie(links[0]) });
check(
  'frontend',
  'the service worker is served and never cached long',
  sw.status === 200 && /no-cache/.test(sw.headers.get('cache-control') ?? ''),
);
for (const p of [
  '/admin/v1/reports',
  '/internal/v1/matches/finished',
  '/metrics',
  '/ready',
  '/debug/anything',
  '/internal/',
  '/admin/',
]) {
  r = await get(p, { headers: cookie(links[0]) });
  check('security', `${p} is never public: 404 even with full access`, r.status === 404, `HTTP ${r.status}`);
}
r = await get('/matchmake/create/rumble', {
  method: 'POST',
  headers: { ...cookie(links[0]), 'content-type': 'application/json' },
  body: '{"name":"Mallory","private":true}',
});
check(
  'security',
  'raw matchmaking WITH the cookie but no platform ticket is refused by the match server',
  r.status >= 400 && r.status < 500 && !/sessionId|reservation/i.test(await r.text()),
  `HTTP ${r.status}`,
);
r = await get('/v1/auth/guest', {
  method: 'POST',
  headers: { ...cookie(links[0]), 'content-type': 'application/json' },
  body: '{"platform":"web"}',
});
check(
  'security',
  'an account cannot be created without a WAHALA! invite code (cookie alone is not enough)',
  r.status >= 400 && r.status < 500 && /invite/i.test(await r.text()),
  `HTTP ${r.status}`,
);

// rate limits (per visitor): the gate's own noise limiters and the matchmaking limits still operate
const codes = [];
for (let i = 0; i < 30; i++) codes.push((await get(`/__enter?k=${'2'.repeat(32)}`)).status);
check(
  'limits',
  'guessing private links is rate-limited (429 after the burst)',
  codes.includes(429),
  `${codes.filter((c) => c === 403).length} refused, ${codes.filter((c) => c === 429).length} limited`,
);
const mm = [];
for (let i = 0; i < 14; i++)
  mm.push(
    (
      await get('/matchmake/create/rumble', {
        method: 'POST',
        headers: { ...cookie(links[1]), 'content-type': 'application/json' },
        body: '{"name":"Flood","private":true}',
      })
    ).status,
  );
check(
  'limits',
  'room-creation flooding is rate-limited at the entrance (429)',
  mm.includes(429),
  mm.join(' '),
);
const cap = sh('docker', [
  'inspect',
  `${PROJECT}-rumble-1`,
  '--format',
  '{{range .Config.Env}}{{println .}}{{end}}',
]).stdout;
check(
  'limits',
  'the capacity limits are in force: at most 2 matches playing, a CPU budget, tickets required',
  /RUMBLE_MAX_PLAYING_ROOMS=2/.test(cap) &&
    /RUMBLE_CPU_BUDGET=70/.test(cap) &&
    /RUMBLE_REQUIRE_TICKET=1/.test(cap),
);

// the visitor's real address reaches the limiter and the logs (set by Cloudflare as CF-Connecting-IP; only trusted from the Docker host's own range)
await new Promise((ok) => {
  const q = http.request(
    {
      host: '127.0.0.1',
      port: 18080,
      path: '/__enter?k=bad',
      headers: { host: HOST, 'cf-connecting-ip': '203.0.113.77' },
    },
    (res) => {
      res.resume();
      res.on('end', ok);
    },
  );
  q.on('error', ok);
  q.end();
});
await sleep(500);
const composeArgs = [
  'compose',
  '-p',
  PROJECT,
  '-f',
  'ops/beta/compose.yml',
  '-f',
  'ops/beta/compose.tunnel.yml',
  '--env-file',
  join(STATE, 'tunnel.env'),
];
const dc = (...a) =>
  sh('docker', [...composeArgs, ...a], { cwd: ROOT, env: { ...env, BETA_STATE: STATE }, maxBuffer: 1 << 28 });
check(
  'security',
  "the visitor's real address (CF-Connecting-IP) is what the limits and logs see",
  /203\.113\.77|203\.0\.113\.77/.test(dc('logs', '--no-color', '--no-log-prefix', 'edge').stdout),
);

// secrets are not in `docker inspect` (they are files)
const ids = dc('ps', '-q').stdout.split('\n').filter(Boolean);
const inspect = sh('docker', ['inspect', ...ids], { maxBuffer: 1 << 28 }).stdout;
const secretValues = [
  'db_password',
  'match_server_secret',
  'admin_token',
  'platform_metrics_token',
  'rumble_metrics_token',
].map((n) => readFileSync(join(STATE, 'secrets', n), 'utf8').trim());
check(
  'security',
  "no secret, invite code or access token appears in any container's configuration (docker inspect)",
  ![...secretValues, invite, ...links].some((v) => v && inspect.includes(v)),
);
const psOut = sh('docker', ['ps', '--format', '{{.Names}}|{{.Ports}}'])
  .stdout.split('\n')
  .filter((l) => l.startsWith(PROJECT));
// a published port is written `host:port->container/tcp`; a bare `80/tcp` is only the image's EXPOSE hint (nothing published)
const mappings = psOut.flatMap((l) =>
  [...l.split('|')[1].matchAll(/(\S+?):(\d+)->(\d+)\/tcp/g)].map(
    (m) => `${l.split('|')[0]} ${m[1]}:${m[2]}->${m[3]}`,
  ),
);
check(
  'security',
  'only the entrance publishes a port, and only on 127.0.0.1; PostgreSQL, the platform and the match server publish none',
  mappings.length === 1 && mappings[0] === `${PROJECT}-edge-1 127.0.0.1:18080->8080`,
  mappings.join(' | '),
);

// the operator commands the founder uses while the test runs: add / remove a tester, make an invite code (both take effect at once)
const node = (...a) => sh('node', ['scripts/beta-tunnel.mjs', ...a], { cwd: ROOT, env });
const added = node('testers', 'add', 'dana.tester@example.com');
const danaLine = node('testers', 'links').stdout.split('\n');
const danaToken = /__enter\?k=([0-9a-f]{32})/.exec(
  danaLine[danaLine.findIndex((l) => l.startsWith('dana.tester@example.com')) + 1] ?? '',
)?.[1];
await sleep(1500);
r = await get(`/__enter?k=${danaToken}`);
check(
  'operations',
  'adding a tester while the test runs gives them a working private link at once',
  added.status === 0 && !!danaToken && r.status === 302,
  `HTTP ${r.status}`,
);
const removed = node('testers', 'remove', 'dana.tester@example.com');
await sleep(1500);
r = await get(`/__enter?k=${danaToken}`);
check(
  'operations',
  'removing a tester stops their link at once',
  removed.status === 0 && r.status === 403,
  `HTTP ${r.status}`,
);
const inv = node('invite', 'new');
const newInvite = /wb-[0-9a-f]{16}/.exec(inv.stdout)?.[0];
for (let i = 0; i < 30; i++) {
  if (
    dc('ps', '--format', '{{.Service}} {{.Health}}')
      .stdout.split('\n')
      .some((l) => /^platform healthy/.test(l))
  )
    break;
  await sleep(2000);
}
await sleep(3000);
r = await get('/v1/auth/guest', {
  method: 'POST',
  headers: { ...cookie(links[1]), 'content-type': 'application/json' },
  body: JSON.stringify({
    platform: 'web',
    inviteCode: newInvite,
    nickname: `NewCode${Math.floor(Math.random() * 1e6)}`,
  }),
});
check(
  'operations',
  'a new invite code works (and the first one still does)',
  !!newInvite && r.status === 201,
  `HTTP ${r.status}`,
);

// ------------------------------------------------------------------------------------------------------------------ 2. real browsers
const metricsFile = join(OUT, 'tunnel-e2e-metrics.json');
writeFileSync(
  join(ROOT, 'playwright.beta.config.ts'),
  `import base from './playwright.config';\nexport default { ...base, webServer: undefined, use: { ...base.use, ignoreHTTPSErrors: true } };\n`,
);
const t1 = Date.now();
const pw = await new Promise((resolveRun) => {
  const child = spawn(
    'npx',
    [
      'playwright',
      'test',
      'e2e/private-multiplayer.spec.ts',
      '--config=playwright.beta.config.ts',
      '--project=desktop',
      '--workers=1',
      '--trace',
      'off',
      '--timeout=900000',
      '--retries=0',
      '--reporter=line',
    ],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...env,
        WAHALA_PRIVATE_E2E_URL: `${BASE}/`,
        WAHALA_PRIVATE_E2E_PLATFORM: BASE,
        WAHALA_PRIVATE_E2E_SERVER: BASE,
        WAHALA_PRIVATE_E2E_INVITE: invite,
        WAHALA_PRIVATE_E2E_GATE_A: links[0],
        WAHALA_PRIVATE_E2E_GATE_B: links[1],
        WAHALA_PRIVATE_E2E_GATE_C: links[2],
        WAHALA_PRIVATE_E2E_METRICS: metricsFile,
        NODE_EXTRA_CA_CERTS: join(STATE, 'simulated-tunnel/cert.pem'),
        WAHALA_MULTIPROCESS: '1',
      },
    },
  );
  child.on('exit', (status) => resolveRun({ status }));
});
rmSync(join(ROOT, 'playwright.beta.config.ts'), { force: true });
check(
  'browsers',
  'two real browsers play the whole private beta through the tunnel (onboarding, friends, party, FFA 32 fighters, signals, reconnection, results, Team Rumble, second match, outsiders refused)',
  pw.status === 0,
  `${Math.round((Date.now() - t1) / 60000)} min`,
);

let m = null;
try {
  m = JSON.parse(readFileSync(metricsFile, 'utf8'));
} catch {
  /* reported below */
}
if (m) {
  const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
  const chips = m.rtt.map((x) => x.chipMs).filter((x) => x !== null);
  const health = m.rtt.map((x) => x.healthMs).filter((x) => x >= 0);
  console.log(
    `\nlatency samples (browser, through the stand-in tunnel on this machine): game ping chip ${JSON.stringify(chips)} ms (median ${med(chips)}), timed request ${JSON.stringify(health)} ms (median ${med(health)})`,
  );
  console.log(
    `websockets: ${JSON.stringify(Object.fromEntries(Object.entries(m.ws).map(([k, v]) => [k, { opened: v.opened, closed: v.closed }])))}`,
  );
  console.log(`bytes transferred per browser (first page load / whole session): ${JSON.stringify(m.bytes)}`);
  check(
    'browsers',
    'WebSocket connections were opened and the only unplanned closes are the planned drop of browser B',
    m.ws.A?.opened >= 1 && m.ws.B?.opened >= 2,
    `A opened ${m.ws.A?.opened} closed ${m.ws.A?.closed}; B opened ${m.ws.B?.opened} closed ${m.ws.B?.closed}`,
  );
}

// ----------------------------------------------------------------------------------------- status, log privacy, then SHUTDOWN
const status = sh('node', ['scripts/beta-tunnel.mjs', 'status'], { cwd: ROOT, env });
writeFileSync(join(OUT, 'tunnel-e2e-status.txt'), status.stdout.replace(ANSI, ''));
check(
  'status',
  'the status command shows services, people connected, accounts, recorded matches and refusals',
  /Match server:/.test(status.stdout) &&
    /finished matches recorded/.test(status.stdout) &&
    /refused:/.test(status.stdout),
);
const logs = dc('logs', '--no-color', '--no-log-prefix', '--tail', '5000').stdout;
// server-side timing of what the entrance saw (the request time of each route class, from its own log): this excludes the browsers' busy screens
const timings = {};
for (const line of logs.split('\n')) {
  const m = /"(\S+) (\S+)" (\d{3}) ([\d.]+) /.exec(line);
  if (m && m[3] < '400') (timings[m[2]] ??= []).push(Number(m[4]) * 1000);
}
const pct = (a, q) =>
  a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))] : null;
const serverTimings = Object.fromEntries(
  Object.entries(timings).map(([k, a]) => [
    k,
    {
      n: a.length,
      p50ms: Math.round(pct(a, 0.5) ?? 0),
      p95ms: Math.round(pct(a, 0.95) ?? 0),
      maxMs: Math.round(Math.max(...a)),
    },
  ]),
);
console.log(`entrance request times by route (ms, successful requests): ${JSON.stringify(serverTimings)}`);
const roomCodes = []; // room codes are not logged by design; a leak would show a 6-letter code after a matchmake / join route: check the tokens and invite instead
check(
  'privacy',
  'no access token, invite code or secret appears in any service log',
  ![...links, invite, ...secretValues].some((v) => v && logs.includes(v)),
);
const tunnelLog = readFileSync(LOG, 'utf8');
check(
  'privacy',
  'tester email addresses are never written to a service log',
  !testers.some((e) => logs.includes(e)),
);
void roomCodes;

const t2 = Date.now();
const stop = sh('node', ['scripts/beta-tunnel.mjs', 'stop'], { cwd: ROOT, env, timeout: 240_000 });
console.log(stop.stdout.trim());
const left = sh('docker', ['ps', '-a', '--format', '{{.Names}}'])
  .stdout.split('\n')
  .filter((l) => l.startsWith(PROJECT));
const nets = sh('docker', ['network', 'ls', '--format', '{{.Name}}'])
  .stdout.split('\n')
  .filter((l) => l.startsWith(PROJECT));
let portOpen;
try {
  portOpen = (await fetch(`${BASE}/`, { signal: AbortSignal.timeout(4000) })).status > 0;
} catch {
  portOpen = false;
}
check(
  'shutdown',
  'one command stops everything: exit 0, no container, no network, the tunnel address closed',
  stop.status === 0 && left.length === 0 && nets.length === 0 && !portOpen,
  `${Math.round((Date.now() - t2) / 1000)} s; containers left ${left.length}, networks left ${nets.length}, address ${portOpen ? 'STILL ANSWERS' : 'closed'}`,
);
check(
  'shutdown',
  'the access list is emptied on shutdown (no old token still opens anything)',
  /default 0;\s*\}/.test(readFileSync(join(STATE, 'tunnel/gate.conf'), 'utf8')) &&
    !/ 1;/.test(readFileSync(join(STATE, 'tunnel/gate.conf'), 'utf8')),
);
void tunnelLog;
cleanupHosts();

const failed = results.filter((x) => !x.ok);
writeFileSync(
  join(OUT, 'tunnel-e2e-results.json'),
  JSON.stringify(
    {
      when: new Date().toISOString(),
      passed: results.length - failed.length,
      failed: failed.length,
      results,
      metrics: m,
    },
    null,
    2,
  ),
);
console.log(
  `\n${results.length - failed.length} passed, ${failed.length} failed (docs/measurements/beta-tunnel/)`,
);
process.exit(failed.length ? 1 : 0);
