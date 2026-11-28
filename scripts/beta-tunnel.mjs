#!/usr/bin/env node
/**
 * `npm run beta:tunnel`: the founder-laptop PRIVATE MULTIPLAYER TEST (docs/ops/BETA_TUNNEL_TESTING.md).
 *
 * Runs the whole beta backend (PostgreSQL, the player platform, the match server, one edge) in Docker on THIS computer and opens ONE free
 * Cloudflare Quick Tunnel to the edge, so invited testers elsewhere can play at a temporary https address. No paid server, no domain, no router
 * settings, no account. Nothing is public until every protection below has been checked; Ctrl-C (or `npm run beta:tunnel:stop`) removes it all.
 *
 *   npm run beta:tunnel                      start (first time: add a tester first, see below)
 *   npm run beta:tunnel:stop                 stop everything (also from a second terminal)
 *   npm run beta:tunnel:status               who is connected, rooms, refusals, health
 *   npm run beta:tunnel:testers -- add ada@example.com bayo@example.com | list | links | remove ada@example.com
 *   npm run beta:tunnel:invite -- new | list | revoke CODE
 *   npm run beta:tunnel:logs -- [edge|platform|rumble|db]
 *
 * Three locks, in this order: (1) the Host check and per-tester ACCESS LINK at the edge (a stranger gets a plain 403 and reaches neither the
 * page, the API nor the sockets), (2) the WAHALA! INVITE CODE (the platform makes no account without one), (3) the match server's TICKET
 * requirement (only an account gets a ticket; raw matchmaking is refused). Secrets, tokens and tester emails live in ops/beta/tunnel-state/
 * (git-ignored, 0700); nothing private is ever written to a tracked file.
 *
 * Flags (start): --port N (local edge port, default 18080), --rebuild (rebuild images and the page), --testers a@x,b@y (adds them first),
 * --tunnel-protocol quic|http2 (cloudflared's transport; http2 if QUIC/UDP is blocked), --cloudflared-arg ARG (extra argument, repeatable),
 * --keep-awake=false (macOS: do not hold the laptop awake). Test-only: --simulate-tunnel HOST (a local TLS stand-in for Cloudflare).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractTunnelUrl,
  helpMentionsAllowedMail,
  isInviteCode,
  newInviteCode,
  newToken,
  parseEmails,
  parseVersion,
  renderGateConf,
  renderHostConf,
  renderTunnelEnv,
  summariseEdge,
  testerLink,
  versionAtLeast,
} from './beta-tunnel/lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE = resolve(process.env.BETA_TUNNEL_STATE ?? join(ROOT, 'ops/beta/tunnel-state'));
// a separate project name keeps a test run's containers and database apart from the founder's own (tests set BETA_TUNNEL_PROJECT)
const PROJECT = process.env.BETA_TUNNEL_PROJECT ?? 'wahala-tunnel';
const DIST = join(ROOT, 'dist-tunnel');
const ENV_FILE = join(STATE, 'tunnel.env');
const RUN_FILE = join(STATE, 'run.json');
const TESTERS_FILE = join(STATE, 'testers.json');
const SECRETS = join(STATE, 'secrets');
const GATE_DIR = join(STATE, 'tunnel');
const COMPOSE = [
  'compose',
  '-p',
  PROJECT,
  '-f',
  join(ROOT, 'ops/beta/compose.yml'),
  '-f',
  join(ROOT, 'ops/beta/compose.tunnel.yml'),
];

const out = (s = '') => console.log(s);
const bold = (s) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s);
const fail = (msg) => {
  console.error(`\nSTOPPED: ${msg}\n`);
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', env: process.env, ...opts });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error };
}

function parseArgs(argv) {
  const o = { _: [], cloudflaredArgs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') o.port = Number(argv[++i]);
    else if (a === '--rebuild') o.rebuild = true;
    else if (a === '--reset-data') o.resetData = true;
    else if (a === '--testers') o.testers = argv[++i];
    else if (a === '--tunnel-protocol') o.protocol = argv[++i];
    else if (a === '--cloudflared-arg') o.cloudflaredArgs.push(argv[++i]);
    else if (a === '--simulate-tunnel') o.simulate = argv[++i];
    else if (a === '--keep-awake=false') o.keepAwake = false;
    else if (a.startsWith('--')) fail(`unknown option ${a}`);
    else o._.push(a);
  }
  return o;
}

// ------------------------------------------------------------------------------------------------------------- state on disk
function writePrivate(file, text, mode = 0o644) {
  writeFileSync(file, text, { mode });
  chmodSync(file, mode);
}

/** Creates the state folder and every secret that is missing. Existing ones are never replaced (a restart keeps the database working). */
function ensureState() {
  mkdirSync(STATE, { recursive: true, mode: 0o700 });
  chmodSync(STATE, 0o700);
  for (const d of [SECRETS, GATE_DIR, join(STATE, 'backups'), join(STATE, 'logs')])
    mkdirSync(d, { recursive: true });
  chmodSync(SECRETS, 0o700);
  const secret = (name, make) => {
    const f = join(SECRETS, name);
    if (!existsSync(f)) writePrivate(f, make());
  };
  const hex = (n) => randomBytes(n).toString('hex');
  let dbpw;
  if (existsSync(join(SECRETS, 'db_password')))
    dbpw = readFileSync(join(SECRETS, 'db_password'), 'utf8').trim();
  else {
    dbpw = hex(24);
    writePrivate(join(SECRETS, 'db_password'), dbpw);
    // new secrets: a database left over from an earlier run was created with the OLD password and can never be opened again
    const volume = `${PROJECT}_wahala-db`;
    if (sh('docker', ['volume', 'inspect', volume]).status === 0) {
      out('  (the earlier test data is removed: its password is gone with the old settings folder)');
      sh('docker', ['compose', '-p', PROJECT, 'down', '--remove-orphans', '-v']);
      sh('docker', ['volume', 'rm', '-f', volume]);
    }
  }
  secret('database_url', () => `postgres://wahala:${dbpw}@db:5432/wahala`);
  secret('match_server_secret', () => hex(32));
  secret('admin_token', () => hex(32));
  secret('platform_metrics_token', () => hex(32));
  secret('rumble_metrics_token', () => hex(32));
  secret('handoff_private_key', () =>
    generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  );
  secret('invite_codes', () => `${newInviteCode()}\n`);
  if (!existsSync(TESTERS_FILE)) writePrivate(TESTERS_FILE, '{}\n', 0o600);
}

const readTesters = () => (existsSync(TESTERS_FILE) ? JSON.parse(readFileSync(TESTERS_FILE, 'utf8')) : {});
const writeTesters = (t) => writePrivate(TESTERS_FILE, `${JSON.stringify(t, null, 2)}\n`, 0o600);
const readInvites = () =>
  existsSync(join(SECRETS, 'invite_codes'))
    ? readFileSync(join(SECRETS, 'invite_codes'), 'utf8')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
const readRun = () => (existsSync(RUN_FILE) ? JSON.parse(readFileSync(RUN_FILE, 'utf8')) : null);

function addTesters(list) {
  const t = readTesters();
  const added = [];
  for (const e of list) {
    if (!t[e]) {
      t[e] = { token: newToken(), added: new Date().toISOString() };
      added.push(e);
    }
  }
  writeTesters(t);
  return added;
}

// -------------------------------------------------------------------------------------------------------------- prerequisites
function checkPrerequisites({ needCloudflared }) {
  const rows = [];
  const add = (name, ok, detail, fix) => rows.push({ name, ok, detail, fix });
  const nodeV = parseVersion(process.versions.node);
  add(
    'Node.js 22 or newer',
    versionAtLeast(nodeV, [22, 0, 0]),
    `found ${process.versions.node}`,
    'install Node 22 from https://nodejs.org',
  );
  const d = sh('docker', ['info', '--format', '{{.ServerVersion}}']);
  add(
    'Docker is installed and running',
    d.status === 0,
    d.status === 0 ? `engine ${d.stdout.trim()}` : 'not reachable',
    'install Docker Desktop, open it, wait until it says "running"',
  );
  const c = sh('docker', ['compose', 'version']);
  add(
    'Docker Compose 2.24 or newer',
    c.status === 0 && versionAtLeast(parseVersion(c.stdout), [2, 24, 0]),
    c.status === 0 ? c.stdout.trim() : 'not found',
    'update Docker Desktop',
  );
  if (needCloudflared) {
    const cf = sh('cloudflared', ['--version']);
    add(
      'cloudflared (the free Cloudflare tunnel program)',
      cf.status === 0,
      cf.status === 0 ? cf.stdout.trim().split('\n')[0] : 'not installed',
      'in Terminal: brew install cloudflared',
    );
  }
  add(
    'Dependencies installed (npm ci)',
    existsSync(join(ROOT, 'node_modules/vite')),
    existsSync(join(ROOT, 'node_modules/vite')) ? 'ok' : 'missing',
    'in the project folder: npm ci',
  );
  return rows;
}

function printPrerequisites(rows) {
  for (const r of rows)
    out(
      `  ${r.ok ? 'OK    ' : 'MISSING'} ${r.name}${r.ok ? ` (${r.detail})` : `: ${r.detail}. Fix: ${r.fix}`}`,
    );
  return rows.every((r) => r.ok);
}

// ----------------------------------------------------------------------------------------------------------- images and the page
/**
 * What the built images and the game page were made from: the commit plus a fingerprint of any uncommitted change, so editing a file and
 * starting again rebuilds, and starting again without edits does not.
 */
function gitSha() {
  const head = sh('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']).stdout.trim() || 'unknown';
  const dirty = sh('git', [
    '-C',
    ROOT,
    'status',
    '--porcelain',
    '--',
    'src',
    'server',
    'player-platform',
    'ops/docker',
    'vite.config.ts',
    'package.json',
  ]).stdout;
  if (!dirty.trim()) return head;
  const diff = sh(
    'git',
    [
      '-C',
      ROOT,
      'diff',
      'HEAD',
      '--',
      'src',
      'server',
      'player-platform',
      'ops/docker',
      'vite.config.ts',
      'package.json',
    ],
    { maxBuffer: 1 << 28 },
  ).stdout;
  return `${head}+${createHash('sha1').update(dirty).update(diff).digest('hex').slice(0, 8)}`;
}

function imageRevision(image) {
  const r = sh('docker', [
    'image',
    'inspect',
    '--format',
    '{{index .Config.Labels "org.opencontainers.image.revision"}}',
    image,
  ]);
  return r.status === 0 ? r.stdout.trim() : null;
}

function ensureImages(rebuild) {
  const sha = gitSha();
  const need = [
    ['wahala-rumble-server:local', 'ops/docker/Dockerfile', 'the match server'],
    ['wahala-player-platform:local', 'player-platform/Dockerfile', 'the player platform'],
  ];
  for (const [image, file, what] of need) {
    const have = imageRevision(image);
    if (!rebuild && have !== null && have === sha) continue;
    out(
      `  building ${what} (${have === null ? 'first time' : 'code changed'}; 5-10 minutes the first time, then cached)...`,
    );
    const args = ['build', '--build-arg', `GIT_SHA=${sha}`, '-f', join(ROOT, file), '-t', image, ROOT];
    if (process.env.EXTRA_CA_DIR)
      args.splice(1, 0, '--build-context', `extra-ca=${process.env.EXTRA_CA_DIR}`);
    const r = spawnSync('docker', args, { stdio: 'inherit' });
    if (r.status !== 0) fail(`building ${what} failed (the messages above say why)`);
  }
}

function ensureFrontend(rebuild) {
  const sha = gitSha();
  const stamp = join(DIST, '.built-for');
  if (!rebuild && existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === sha) return;
  out('  building the game page for the tunnel (1-3 minutes)...');
  const r = spawnSync('npx', ['vite', 'build', '--outDir', DIST, '--emptyOutDir'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      // resolved IN THE BROWSER from the address the page was opened at, so one build serves whatever address this run gets
      WAHALA_ONLINE_ENABLED: 'true',
      WAHALA_ONLINE_URL: 'wss://{host}',
      WAHALA_PLATFORM_URL: 'https://{host}',
      WAHALA_PRIVATE_BETA: '1',
    },
  });
  if (r.status !== 0) fail('building the game page failed (the messages above say why)');
  const js = sh('sh', ['-c', `cat "${join(DIST, 'assets')}"/*.js`], { maxBuffer: 1 << 29 }).stdout;
  const problems = [];
  if (!js.includes('wss://{host}')) problems.push('the secure WebSocket template is not in the page');
  if (!js.includes('https://{host}')) problems.push('the platform template is not in the page');
  if (!js.includes('pf-invite-code')) problems.push('the invite form is not in the page');
  if (/\bwss?:\/\/\{host\}:\d+/.test(js)) problems.push('a LAN-style endpoint with a port is in the page');
  if (problems.length) fail(`the page failed its own check: ${problems.join('; ')}`);
  writeFileSync(stamp, `${sha}\n`);
}

// ------------------------------------------------------------------------------------------------------------------ compose
function compose(args, opts = {}) {
  return sh('docker', [...COMPOSE, '--env-file', ENV_FILE, ...args], {
    env: { ...process.env, BETA_STATE: STATE },
    ...opts,
  });
}

function serviceStates() {
  const r = compose(['ps', '--all', '--format', 'json']);
  if (r.status !== 0) return null;
  const rows = [];
  for (const line of r.stdout.split('\n')) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      rows.push({ service: j.Service, state: j.State, health: j.Health ?? '', exit: j.ExitCode });
    } catch {
      /* not a json line */
    }
  }
  return rows;
}

async function waitHealthy(seconds = 150) {
  const stop = Date.now() + seconds * 1000;
  let last = [];
  while (Date.now() < stop) {
    const rows = serviceStates();
    if (rows && rows.length) {
      last = rows;
      const bad = rows.filter((r) =>
        r.service === 'migrate'
          ? !(r.state === 'exited' && r.exit === 0)
          : r.state !== 'running' || (r.health && r.health !== 'healthy'),
      );
      if (bad.length === 0) return { ok: true, rows };
    }
    await sleep(2000);
  }
  return { ok: false, rows: last };
}

// ------------------------------------------------------------------------------------------------------------------ requests
const jsonOf = (t) => {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

/** One local request to the edge with a chosen Host header and cookie (node's own http: it lets us name the Host). */
function localRequest(port, path, { host, cookie, method = 'GET', body } = {}) {
  return new Promise((resolveReq) => {
    const headers = { host: host ?? '127.0.0.1' };
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(body);
    }
    const req = http.request({ host: '127.0.0.1', port, path, method, headers, timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolveReq({ status: res.statusCode ?? 0, headers: res.headers, body: data }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolveReq({ status: 0, headers: {}, body: String(e.message) }));
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/**
 * The self-test that runs BEFORE any link is shown: every lock is checked against the real running edge, locally. Returns a list of results;
 * the launcher refuses to publish if any failed.
 */
async function selfTest({ port, host, token }) {
  const results = [];
  const check = (name, ok, detail = '') => results.push({ name, ok, detail });
  const cookie = `wahala_gate=${token}`;
  const get = (p, o = {}) => localRequest(port, p, { host, ...o });

  const h = await localRequest(port, '/health');
  check(
    'the edge answers on this computer',
    h.status === 200 && /"ok":true/.test(h.body),
    `HTTP ${h.status}`,
  );
  const h2 = await get('/health');
  check('the edge health page is not served at the public address', h2.status === 404, `HTTP ${h2.status}`);
  const noCookie = await get('/');
  check(
    'a visitor without a private link is refused (403)',
    noCookie.status === 403 && /private test/.test(noCookie.body),
    `HTTP ${noCookie.status}`,
  );
  const noCookieApi = await get('/v1/auth/providers');
  check(
    'the API is refused without a private link',
    noCookieApi.status === 403,
    `HTTP ${noCookieApi.status}`,
  );
  const noCookieMm = await get('/matchmake/create/rumble', {
    method: 'POST',
    body: '{"name":"x","private":true}',
  });
  check(
    'raw matchmaking is refused without a private link',
    noCookieMm.status === 403,
    `HTTP ${noCookieMm.status}`,
  );
  const wrongHost = await localRequest(port, '/', { host: 'somewhere-else.example.com', cookie });
  check(
    'another host name pointed at the tunnel is refused (421)',
    wrongHost.status === 421,
    `HTTP ${wrongHost.status}`,
  );
  const badToken = await get(`/__enter?k=${'0'.repeat(32)}`);
  check('a wrong private link is refused', badToken.status === 403, `HTTP ${badToken.status}`);
  const enter = await get(`/__enter?k=${token}`);
  const setCookie = String(enter.headers['set-cookie'] ?? '');
  check(
    'a right private link sets the secure access cookie and opens the game',
    enter.status === 302 &&
      /wahala_gate=/.test(setCookie) &&
      /Secure/.test(setCookie) &&
      /HttpOnly/.test(setCookie),
    `HTTP ${enter.status}`,
  );
  const page = await get('/', { cookie });
  check(
    'with the cookie the game page loads',
    page.status === 200 && /<title>/.test(page.body),
    `HTTP ${page.status}`,
  );
  const plat = await get('/platform-health', { cookie });
  check(
    'the player platform is healthy',
    plat.status === 200 && /"ok":true/.test(plat.body),
    `HTTP ${plat.status}`,
  );
  const jwks = await get('/.well-known/jwks.json', { cookie });
  check(
    'the ticket keys are published',
    jwks.status === 200 && /"keys"/.test(jwks.body),
    `HTTP ${jwks.status}`,
  );
  for (const p of ['/admin/v1/reports', '/internal/v1/matches/started', '/metrics', '/ready', '/debug/x']) {
    const r = await get(p, { cookie });
    check(`${p} is never public (404 even with access)`, r.status === 404, `HTTP ${r.status}`);
  }
  const mm = await get('/matchmake/create/rumble', {
    cookie,
    method: 'POST',
    body: '{"name":"Probe","private":true}',
  });
  check(
    'the match server refuses a room without a platform ticket',
    mm.status >= 400 && mm.status < 500 && !/sessionId|reservation/i.test(mm.body),
    `HTTP ${mm.status}`,
  );
  const mmq = await get('/matchmake/joinOrCreate/rumble', {
    cookie,
    method: 'POST',
    body: '{"name":"Probe","mode":"ffa"}',
  });
  check('quick play is closed in this test', mmq.status >= 400 && mmq.status < 500, `HTTP ${mmq.status}`);
  const noInvite = await get('/v1/auth/guest', { cookie, method: 'POST', body: '{"platform":"web"}' });
  check(
    'an account cannot be made without an invite code',
    noInvite.status >= 400 && noInvite.status < 500 && /invite/i.test(noInvite.body),
    `HTTP ${noInvite.status}`,
  );
  const wrongInvite = await get('/v1/auth/guest', {
    cookie,
    method: 'POST',
    body: '{"platform":"web","inviteCode":"wb-0000000000000000"}',
  });
  check(
    'a wrong invite code is refused',
    wrongInvite.status >= 400 && wrongInvite.status < 500,
    `HTTP ${wrongInvite.status}`,
  );
  const providers = await get('/v1/auth/providers', { cookie });
  check(
    'no sign-in provider is offered (guests with an invite code only)',
    providers.status === 200 && jsonOf(providers.body)?.providers?.length === 0,
    `HTTP ${providers.status}`,
  );
  const shop = await get('/v1/shop/status', { cookie });
  const shopJson = jsonOf(shop.body);
  check(
    'payments are off: no provider, purchases disabled',
    shop.status === 200 && shopJson?.purchasesEnabled === false && shopJson?.providers?.length === 0,
    `HTTP ${shop.status}`,
  );
  const chat = await get('/v1/dev/parties/00000000-0000-4000-8000-000000000000/chat', {
    cookie,
    method: 'POST',
    body: '{"text":"x"}',
  });
  check(
    'free text chat does not exist (a development route that answers 404 in production)',
    chat.status === 404,
    `HTTP ${chat.status}`,
  );
  return results;
}

// ------------------------------------------------------------------------------------------------------------------- tunnel
function cloudflaredHelp() {
  const r = sh('cloudflared', ['tunnel', '--help']);
  return `${r.stdout}\n${r.stderr}`;
}

/** Starts `cloudflared tunnel --url`, waits for its address. Resolves { url, host, stop }. */
function startCloudflared({ port, protocol, extra }) {
  return new Promise((resolveStart, rejectStart) => {
    const args = ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`];
    if (protocol) args.push('--protocol', protocol);
    args.push(...extra);
    const child = spawn('cloudflared', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    let done = false;
    const onData = (d) => {
      log += d.toString();
      appendLog(d.toString());
      const found = extractTunnelUrl(log);
      if (found && !done) {
        done = true;
        clearTimeout(timer);
        resolveStart({ ...found, child, stop: () => child.kill('SIGTERM'), log: () => log });
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (e) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        rejectStart(new Error(`could not start cloudflared: ${e.message}`));
      }
    });
    child.on('exit', (code) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        rejectStart(
          new Error(
            `cloudflared stopped (exit ${code}) before it gave an address:\n${log.split('\n').slice(-12).join('\n')}`,
          ),
        );
      }
    });
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        child.kill('SIGTERM');
        rejectStart(
          new Error(
            `cloudflared gave no address within 60 seconds:\n${log.split('\n').slice(-12).join('\n')}`,
          ),
        );
      }
    }, 60_000);
  });
}

function appendLog(text) {
  try {
    writeFileSync(join(STATE, 'logs/cloudflared.log'), text, { flag: 'a', mode: 0o600 });
  } catch {
    /* logging is best effort */
  }
}

// ---------------------------------------------------------------------------------------------------------------- start / stop
let shuttingDown = false;
let activeTunnel = null;
let keepAwake = null;

function composeDown() {
  const r = compose(['down', '--remove-orphans']);
  return r.status === 0;
}

function shutdown(why, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  out(`\nShutting down (${why})...`);
  try {
    activeTunnel?.stop();
  } catch {
    /* already gone */
  }
  try {
    keepAwake?.kill('SIGTERM');
  } catch {
    /* none */
  }
  const ok = composeDown();
  try {
    rmSync(RUN_FILE, { force: true });
    writeFileSync(
      join(GATE_DIR, 'gate.conf'),
      'map $cookie_wahala_gate $gate_ok { default 0; }\nmap $arg_k $enter_ok { default 0; }\n',
    );
  } catch {
    /* best effort */
  }
  out(
    ok
      ? 'Everything is stopped: the tunnel is closed, the game services are removed. Your data is kept for next time.'
      : 'The tunnel is closed. Docker did not confirm the services stopped: run  npm run beta:tunnel:stop  again, or open Docker Desktop and stop "wahala-tunnel".',
  );
  process.exit(ok ? code : code || 1);
}

async function cmdStart(o) {
  out(bold('\nWAHALA! private multiplayer test from this computer\n'));
  out('1. Checking this computer');
  const simulate = o.simulate;
  const prereq = checkPrerequisites({ needCloudflared: !simulate });
  if (!printPrerequisites(prereq)) fail('install what is marked MISSING above, then run this command again.');
  const existing = readRun();
  if (existing && pidAlive(existing.pid))
    fail(`a test is already running (started ${existing.started}). Stop it first:  npm run beta:tunnel:stop`);
  if (existing) cleanStale();

  ensureState();
  if (o.resetData) {
    out(
      '   --reset-data: the saved test database (accounts, friends, results) is deleted; testers, invite codes and settings are kept.',
    );
    sh('docker', ['compose', '-p', PROJECT, 'down', '--remove-orphans', '-v']);
    sh('docker', ['volume', 'rm', '-f', `${PROJECT}_wahala-db`]);
  }
  if (o.testers) {
    const { good, bad } = parseEmails(o.testers);
    if (bad.length) fail(`these are not email addresses: ${bad.join(', ')}`);
    addTesters(good);
  }
  const testers = readTesters();
  if (Object.keys(testers).length === 0) {
    fail(
      'nobody is allowed in yet. Add the people you invite (their email addresses, kept only on this computer):\n  npm run beta:tunnel:testers -- add ada@example.com bayo@example.com\nthen run  npm run beta:tunnel  again. (Nothing was started, nothing is public.)',
    );
  }

  out('\n2. Preparing the game (first time only: this can take several minutes)');
  ensureImages(o.rebuild);
  ensureFrontend(o.rebuild);

  const port = o.port ?? 18080;
  out('\n3. Opening the tunnel');
  let tunnel;
  if (simulate) {
    const sim = await import('./beta-tunnel/simulate.mjs');
    tunnel = await sim.startSimulatedTunnel({ host: simulate, port, stateDir: STATE });
    out(`   (TEST MODE: a local stand-in for Cloudflare at ${tunnel.url}; not a real tunnel)`);
  } else {
    const help = cloudflaredHelp();
    out(
      `   cloudflared's own check for an email option (--allowed-mail): ${helpMentionsAllowedMail(help) ? 'this version lists it; it is NOT switched on automatically (see docs/ops/BETA_TUNNEL_TESTING.md)' : 'this version does not list it. That is fine: the access links below do the job and do not depend on it'}`,
    );
    const protocols = o.protocol ? [o.protocol] : [undefined, 'http2'];
    let lastError = null;
    for (const protocol of protocols) {
      try {
        out(`   asking Cloudflare for a temporary address${protocol ? ` (${protocol})` : ''}...`);
        tunnel = await startCloudflared({ port, protocol, extra: o.cloudflaredArgs });
        break;
      } catch (e) {
        lastError = e;
        out(`   that did not work: ${String(e.message).split('\n')[0]}`);
      }
    }
    if (!tunnel)
      fail(
        `the tunnel did not start. ${lastError?.message ?? ''}\nCheck your internet connection. If you use a company or school network that blocks it, try another network (a phone hotspot works).`,
      );
  }
  activeTunnel = tunnel;
  tunnel.child?.on('exit', (code) => {
    if (!shuttingDown) {
      out(
        `\nThe tunnel closed by itself (code ${code}). Testers cannot reach the game any more. A new tunnel gets a NEW address.`,
      );
      shutdown('the tunnel dropped', 1);
    }
  });
  process.on('SIGINT', () => shutdown('Ctrl-C'));
  process.on('SIGTERM', () => shutdown('stop requested'));
  process.on('SIGHUP', () => shutdown('terminal closed'));

  // the address is known now: lock the edge to it and make the servers accept exactly that origin
  const origin = tunnel.url;
  writePrivate(join(GATE_DIR, 'host.conf'), renderHostConf(tunnel.host));
  writePrivate(join(GATE_DIR, 'gate.conf'), renderGateConf(Object.values(testers).map((t) => t.token)));
  writePrivate(
    ENV_FILE,
    renderTunnelEnv({
      origin,
      port,
      stateDir: STATE,
      distDir: DIST,
      uid: process.getuid?.() ?? 1000,
      gid: process.getgid?.() ?? 1000,
    }),
    0o600,
  );
  writePrivate(
    RUN_FILE,
    JSON.stringify({
      pid: process.pid,
      tunnelPid: tunnel.child?.pid ?? null,
      url: origin,
      port,
      started: new Date().toISOString(),
    }),
    0o600,
  );

  if (process.platform === 'darwin' && o.keepAwake !== false) {
    keepAwake = spawn('caffeinate', ['-dims', '-w', String(process.pid)], { stdio: 'ignore' });
    keepAwake.on('error', () => (keepAwake = null));
  }

  out('\n4. Starting the game services (database, accounts, match server, entrance)');
  const up = compose(['up', '-d', '--remove-orphans'], { stdio: 'inherit' });
  if (up.status !== 0) {
    out('The game services did not start. What the failing services said:');
    const why = compose([
      'logs',
      '--no-color',
      '--no-log-prefix',
      '--tail',
      '15',
      'migrate',
      'platform',
      'rumble',
      'db',
    ]);
    out(
      why.stdout
        .split('\n')
        .map((l) => `   ${l}`)
        .join('\n'),
    );
    if (/password authentication failed/.test(why.stdout))
      out(
        '\nThe saved settings do not match the saved database (for example the settings folder was replaced). Start fresh with:  npm run beta:tunnel -- --reset-data   (this deletes the test accounts and results only)',
      );
    return shutdown('start failed', 1);
  }
  const ready = await waitHealthy();
  if (!ready.ok) {
    out('Some services are not healthy:');
    for (const r of ready.rows) out(`   ${r.service}: ${r.state} ${r.health}`);
    return shutdown('services not healthy', 1);
  }
  const db = compose(['exec', '-T', 'db', 'pg_isready', '-U', 'wahala', '-d', 'wahala']);
  out(`   database ready: ${db.status === 0 ? 'yes' : 'NO'}`);
  if (db.status !== 0) return shutdown('database not ready', 1);

  out('\n5. Checking every protection BEFORE you share anything');
  const firstToken = Object.values(testers)[0].token;
  const results = await selfTest({ port, host: tunnel.host, token: firstToken });
  for (const r of results) out(`   ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  (${r.detail})`}`);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    out(`\n${failed.length} protection check(s) FAILED. Nothing is being shared.`);
    return shutdown('a protection check failed', 1);
  }
  const publicOk = await checkPublic(origin, simulate);
  out(`   ${publicOk.ok ? 'PASS' : 'NOTE'}  ${publicOk.text}`);
  if (publicOk.fatal) return shutdown('the public address is not protected', 1);

  printSummary({ origin, testers, port });
  // stay in the foreground: the tunnel and the services live as long as this window does
  await new Promise(() => undefined);
}

/** From OUTSIDE the edge: the public address must answer with our own refusal page (so the tunnel works AND the gate is the first thing a stranger meets). */
async function checkPublic(origin, simulate) {
  const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (simulate) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // the stand-in uses a throw-away certificate; a real tunnel never needs this
  try {
    for (let i = 0; i < 20; i++) {
      try {
        const r = await fetch(`${origin}/`, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
        const body = await r.text();
        if (r.status === 403 && /private test/.test(body))
          return {
            ok: true,
            text: `the public address answers strangers with the access page (403): ${origin}`,
          };
        if (r.status === 200 || r.status === 302)
          return { ok: false, fatal: true, text: `the public address let a stranger in (HTTP ${r.status})` };
        if (![502, 503, 530, 404, 1033].includes(r.status))
          return {
            ok: false,
            fatal: false,
            text: `the public address answered HTTP ${r.status}: if testers cannot open their links, stop and start again`,
          };
      } catch {
        /* the new address can take a few seconds to resolve */
      }
      await sleep(3000);
    }
    return {
      ok: false,
      fatal: false,
      text: 'the public address did not answer from this computer within a minute (a new tunnel address can take a little while). Try the first link yourself on your phone.',
    };
  } finally {
    if (simulate) {
      if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
    }
  }
}

function printSummary({ origin, testers, port }) {
  const rows = serviceStates() ?? [];
  out('\n' + '='.repeat(78));
  out(bold('THE TEST IS RUNNING'));
  out('='.repeat(78));
  out(`\nWebsite (temporary, changes every time you start):\n  ${bold(origin)}`);
  out('\nSend each tester THEIR OWN link (it opens the door; do not share it):');
  for (const [email, t] of Object.entries(testers)) out(`  ${email}\n    ${testerLink(origin, t.token)}`);
  const invites = readInvites();
  out('\nAnd ONE WAHALA! invite code each (typed in the game, after opening the link):');
  for (const c of invites) out(`  ${c}`);
  out('  Make more:  npm run beta:tunnel:invite -- new     (give one code to one person)');
  out('\nHealth:');
  for (const r of rows) out(`  ${r.service.padEnd(9)} ${r.state}${r.health ? ` (${r.health})` : ''}`);
  out(`  entrance   127.0.0.1:${port} (this computer only; the tunnel is the only way in)`);
  out('  limits     at most 2 matches at once, 32 fighters per match; more are queued');
  out('\nWhile it runs:');
  out('  who is connected, rooms, refusals:   npm run beta:tunnel:status   (in a second Terminal window)');
  out('  stop everything:                     press Ctrl-C here, or  npm run beta:tunnel:stop');
  out(
    '\nKeep this window open and this computer awake and online. If it sleeps or loses internet the game stops for everyone;',
  );
  out('when it comes back, stop and start again (testers then need the NEW link).');
  out('='.repeat(78) + '\n');
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function cleanStale() {
  const run = readRun();
  if (run?.tunnelPid && pidAlive(run.tunnelPid)) {
    try {
      process.kill(run.tunnelPid, 'SIGTERM');
    } catch {
      /* gone */
    }
  }
  if (existsSync(ENV_FILE)) composeDown();
  rmSync(RUN_FILE, { force: true });
}

async function cmdStop() {
  const run = readRun();
  if (run && pidAlive(run.pid)) {
    out('Asking the running test to stop...');
    process.kill(run.pid, 'SIGTERM');
    out('(the database is given up to 30 seconds to close cleanly; this takes a little while)');
    for (let i = 0; i < 180 && pidAlive(run.pid); i++) await sleep(1000);
  }
  if (run && !pidAlive(run.pid)) cleanStale();
  else if (!run && existsSync(ENV_FILE)) composeDown();
  // verify: nothing of the test is left
  const left = existsSync(ENV_FILE) ? (serviceStates() ?? []).filter((r) => r.state === 'running') : [];
  const tunnelLeft = run?.tunnelPid ? pidAlive(run.tunnelPid) : false;
  const portOpen = run?.port ? await portListening(run.port) : false;
  if (left.length === 0 && !tunnelLeft && !portOpen && !readRun())
    out('STOPPED: the tunnel is closed, no game service is running, the entrance port is closed.');
  else
    fail(
      `something is still running (services: ${left.map((r) => r.service).join(', ') || 'none'}; tunnel: ${tunnelLeft ? 'yes' : 'no'}; port: ${portOpen ? 'open' : 'closed'}). Open Docker Desktop and stop the "wahala-tunnel" project.`,
    );
}

function portListening(port) {
  return new Promise((r) => {
    const s = http.request({ host: '127.0.0.1', port, path: '/health', timeout: 1500 }, () => r(true));
    s.on('error', () => r(false));
    s.on('timeout', () => {
      s.destroy();
      r(false);
    });
    s.end();
  });
}

// ------------------------------------------------------------------------------------------------------------------ status etc.
async function cmdStatus() {
  const run = readRun();
  if (!run || !pidAlive(run.pid)) {
    out('No test is running. Start one with:  npm run beta:tunnel');
    return;
  }
  out(bold('\nWAHALA! private test: status'));
  out(`  address   ${run.url}`);
  out(`  running since ${run.started}\n`);
  const rows = serviceStates() ?? [];
  out('Services:');
  for (const r of rows) out(`  ${r.service.padEnd(9)} ${r.state}${r.health ? ` (${r.health})` : ''}`);

  // the token is a secret FILE inside the container: read it there (it never reaches this terminal)
  const m = compose([
    'exec',
    '-T',
    'rumble',
    'sh',
    '-c',
    'node -e "fetch(\\"http://127.0.0.1:2567/metrics\\",{headers:{authorization:\\"Bearer \\"+require(\\"fs\\").readFileSync(\\"/run/secrets/rumble_metrics_token\\",\\"utf8\\").trim()}}).then(r=>r.text()).then(console.log)"',
  ]);
  out('\nMatch server:');
  try {
    const j = JSON.parse(m.stdout);
    const rooms = j.rooms ?? [];
    const playing = rooms.filter((r) => r.phase === 'playing');
    out(
      `  rooms open ${rooms.length}, matches playing ${playing.length} (limit 2), people connected ${rooms.reduce((n, r) => n + (r.connectedHumans ?? 0), 0)}`,
    );
    for (const r of rooms)
      out(
        `   - room ${r.id.slice(0, 6)} ${r.isPrivate ? 'private' : 'public'} ${r.phase}: ${r.connectedHumans}/${r.humans} people connected, ${r.matches?.finished ?? 0} matches finished, reconnections ${r.net?.reconnections ?? 0}, drops ${r.net?.drops ?? 0}, dropped ticks ${r.ticks?.dropped ?? 0}`,
      );
    if (j.limits) out(`  capacity: ${JSON.stringify(j.limits)}`);
  } catch {
    out('  (could not read the match server metrics)');
  }
  const p = compose([
    'exec',
    '-T',
    'db',
    'psql',
    '-U',
    'wahala',
    '-d',
    'wahala',
    '-Atc',
    "select (select count(*) from players)||' players, '||(select count(*) from sessions where revoked_at is null)||' active sessions, '||(select count(*) from matches where state='finished')||' finished matches recorded'",
  ]);
  out('\nAccounts and results:');
  out(`  ${p.status === 0 ? p.stdout.trim() : '(database not reachable)'}`);

  const logs = compose(['logs', '--no-color', '--no-log-prefix', '--since', '30m', 'edge']);
  const s = summariseEdge(logs.stdout.split('\n'));
  out('\nEntrance, last 30 minutes:');
  out(
    `  ${s.total} requests; ${
      Object.entries(s.byRoute)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ') || 'none'
    }`,
  );
  out(
    `  refused: ${s.refused.gate403} without an access link (403), ${s.refused.wrongHost421} wrong address (421), ${s.refused.limited429} too many requests (429), ${s.refused.notFound404} not found (404); server errors ${s.serverErrors}`,
  );
  out('\nMore detail:  npm run beta:tunnel:logs -- rumble     (also: edge, platform, db)\n');
}

function cmdTesters(rest) {
  ensureState();
  const [sub, ...args] = rest;
  const t = readTesters();
  const run = readRun();
  const reload = () => {
    if (run && pidAlive(run.pid)) {
      writePrivate(
        join(GATE_DIR, 'gate.conf'),
        renderGateConf(Object.values(readTesters()).map((x) => x.token)),
      );
      const r = compose(['exec', '-T', 'edge', 'nginx', '-s', 'reload']);
      out(
        r.status === 0
          ? '  the entrance now uses the new list (people already inside keep playing until their cookie expires or you stop the test).'
          : '  could not reload the entrance: stop and start the test.',
      );
    }
  };
  if (sub === 'add') {
    const { good, bad } = parseEmails(args.join(' '));
    if (bad.length) fail(`these are not email addresses: ${bad.join(', ')}`);
    if (good.length === 0) fail('usage: npm run beta:tunnel:testers -- add ada@example.com bayo@example.com');
    const added = addTesters(good);
    out(added.length ? `Added: ${added.join(', ')}` : 'They were all in the list already.');
    reload();
    return out(
      'Their personal links are shown by:  npm run beta:tunnel:testers -- links  (while the test runs)',
    );
  }
  if (sub === 'remove') {
    const e = (args[0] ?? '').toLowerCase();
    if (!t[e]) fail(`${e || '(nothing)'} is not in the list`);
    delete t[e];
    writeTesters(t);
    out(`Removed ${e}. Their link stops working${run ? ' now' : ' at the next start'}.`);
    return reload();
  }
  if (sub === 'links') {
    if (!run || !pidAlive(run.pid))
      fail(
        'the test is not running: links contain the temporary address. Start it first:  npm run beta:tunnel',
      );
    for (const [email, x] of Object.entries(t)) out(`${email}\n  ${testerLink(run.url, x.token)}`);
    return;
  }
  if (sub === 'list' || sub === undefined) {
    const emails = Object.keys(t);
    out(
      emails.length
        ? `Allowed testers (${emails.length}):\n${emails.map((e) => `  ${e}`).join('\n')}`
        : 'Nobody is allowed in yet. Add people:  npm run beta:tunnel:testers -- add ada@example.com',
    );
    return;
  }
  fail('usage: testers add EMAIL... | remove EMAIL | list | links');
}

function cmdInvite(rest) {
  ensureState();
  const [sub, code] = rest;
  const f = join(SECRETS, 'invite_codes');
  const run = readRun();
  const apply = () => {
    if (run && pidAlive(run.pid)) {
      const r = compose(['up', '-d', '--force-recreate', 'platform']);
      out(
        r.status === 0
          ? '  (the accounts service restarted to read the new list; players stay signed in)'
          : '  could not restart the accounts service: stop and start the test.',
      );
    }
  };
  if (sub === 'new') {
    const c = newInviteCode();
    writePrivate(f, `${readInvites().concat(c).join('\n')}\n`);
    out(`New invite code (give it to ONE person): ${c}`);
    return apply();
  }
  if (sub === 'revoke') {
    if (!isInviteCode(code) || !readInvites().includes(code)) fail('that code is not in the list');
    if (readInvites().length < 2)
      fail(
        'that is the last code: make a new one first (npm run beta:tunnel:invite -- new). An invite-only test must never be left without codes.',
      );
    writePrivate(
      f,
      `${readInvites()
        .filter((x) => x !== code)
        .join('\n')}\n`,
    );
    out('Revoked. People who already have an account keep it; only NEW accounts need a valid code.');
    return apply();
  }
  if (sub === 'list' || sub === undefined) {
    out(
      `Valid invite codes (anyone holding one can make an account):\n${readInvites()
        .map((c) => `  ${c}`)
        .join('\n')}`,
    );
    return;
  }
  fail('usage: invite new | list | revoke CODE');
}

function cmdLogs(rest) {
  const svc = rest[0] && /^(edge|platform|rumble|db|monitor|backup)$/.test(rest[0]) ? [rest[0]] : [];
  if (!existsSync(ENV_FILE)) fail('nothing has been started yet.');
  const r = spawnSync(
    'docker',
    [...COMPOSE, '--env-file', ENV_FILE, 'logs', '--no-color', '--tail', '200', ...svc],
    { stdio: 'inherit', env: { ...process.env, BETA_STATE: STATE } },
  );
  process.exit(r.status ?? 0);
}

// ------------------------------------------------------------------------------------------------------------------------ main
const argv = parseArgs(process.argv.slice(2));
const command = argv._[0] ?? 'start';
if (command === 'start') await cmdStart(argv);
else if (command === 'stop') await cmdStop();
else if (command === 'status') await cmdStatus();
else if (command === 'testers') cmdTesters(argv._.slice(1));
else if (command === 'invite') cmdInvite(argv._.slice(1));
else if (command === 'logs') cmdLogs(argv._.slice(1));
else fail(`unknown command "${command}". Commands: start (default), stop, status, testers, invite, logs`);
if (!['start'].includes(command)) process.exit(0);
