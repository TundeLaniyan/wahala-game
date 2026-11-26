#!/usr/bin/env node
/**
 * `npm run dev:online`: the whole local online setup on one laptop, reachable from phones on the same Wi-Fi.
 * No cloud, no cost, nothing leaves this machine. docs/CITY_RUMBLE_ONLINE_LOCAL.md.
 *
 *  - the Node multiplayer server   (`server` -> `npm start`, 0.0.0.0:2567)
 *  - the game's Vite dev server    (`npm run dev`, 0.0.0.0:5173) with the build-time online switch on:
 *        WAHALA_ONLINE_ENABLED=true  WAHALA_ONLINE_URL=ws://{host}:2567
 *    `{host}` is a template: the page replaces it with its own hostname at run time, so the same build works from
 *    `localhost` and from `192.168.x.y` without any address written into the code.
 *  - the server's origin list (RUMBLE_ALLOWED_ORIGINS) is computed here from this machine's LAN addresses, so the
 *    phones' page origin (http://<lan-ip>:5173) is accepted. It is an exact list, never a wildcard.
 *
 * `--platform` (`npm run dev:private`) also starts the PLAYER PLATFORM (`player-platform`, port 4567: guest identity, friends,
 * parties, safety) and wires the three together for a private, invite-only test (docs/PLATFORM_LOCAL_TEST.md): the match server
 * verifies the platform's signed match tickets and reports results to it, and the game is built with `WAHALA_PLATFORM_URL`.
 * The platform's database is a throw-away in-memory Postgres engine unless `DATABASE_URL` names a real PostgreSQL. Its secrets
 * (match-server secret, ticket signing key) are made once into the git-ignored `.local/private-dev/`.
 *
 * Ctrl-C stops everything. Options: `--server-port N`, `--web-port N` (or env DEV_ONLINE_SERVER_PORT / DEV_ONLINE_WEB_PORT),
 * `--platform`, `--platform-port N` (default 4567), `--no-lan` (listen on this machine only), `--help`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname, networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_SERVER_PORT = 2567;
export const DEFAULT_WEB_PORT = 5173;
export const DEFAULT_PLATFORM_PORT = 4567;
/** The dev server's base path (vite.config.ts: `/` for `vite`, `/wahala-game/` only for build / preview). */
export const DEV_BASE = '/';

/** Private (RFC 1918) addresses first: the ones a home or office Wi-Fi hands out. */
const rank = (ip) => {
  if (/^192\.168\./.test(ip)) return 0;
  if (/^10\./.test(ip)) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
  return 3;
};

/** Non-loopback IPv4 addresses (not link-local 169.254.x.x), best first. Takes `os.networkInterfaces()`. */
export function lanAddresses(interfaces) {
  const found = [];
  for (const infos of Object.values(interfaces)) {
    for (const i of infos ?? []) {
      const v4 = i.family === 'IPv4' || i.family === 4;
      if (!v4 || i.internal || i.address.startsWith('169.254.')) continue;
      if (!found.includes(i.address)) found.push(i.address);
    }
  }
  return found.sort((a, b) => rank(a) - rank(b));
}

const HOST_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;

/**
 * The exact browser origins the server must accept: the dev page opened on this machine (localhost) and on each LAN
 * address (and the machine's own name / `.local` name, which some phones resolve), plus anything already configured.
 */
export function allowedOriginsFor({ addresses, host, webPort, extra = '' }) {
  const names = ['localhost', '127.0.0.1', ...addresses];
  if (host && HOST_LABEL.test(host)) names.push(host, `${host}.local`);
  const origins = names.map((n) => `http://${n}:${webPort}`);
  for (const e of extra.split(',')) if (e.trim()) origins.push(e.trim());
  return [...new Set(origins)].join(',');
}

/** The URLs to hand out: this machine, then each LAN address. */
export function pageUrls({ addresses, webPort, base = DEV_BASE }) {
  return [
    { label: 'this laptop', url: `http://localhost:${webPort}${base}?online` },
    ...addresses.map((a) => ({
      label: 'phones on the same Wi-Fi',
      url: `http://${a}:${webPort}${base}?online`,
    })),
  ];
}

function parseArgs(argv, env) {
  const out = {
    serverPort: Number(env.DEV_ONLINE_SERVER_PORT ?? DEFAULT_SERVER_PORT),
    webPort: Number(env.DEV_ONLINE_WEB_PORT ?? DEFAULT_WEB_PORT),
    platformPort: Number(env.DEV_PLATFORM_PORT ?? DEFAULT_PLATFORM_PORT),
    platform: false,
    lan: true,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--no-lan') out.lan = false;
    else if (a === '--platform') out.platform = true;
    else if (a === '--platform-port') out.platformPort = Number(argv[++i]);
    else if (a === '--server-port') out.serverPort = Number(argv[++i]);
    else if (a === '--web-port') out.webPort = Number(argv[++i]);
    else throw new Error(`unknown option ${a} (try --help)`);
  }
  for (const [name, v] of [
    ['server port', out.serverPort],
    ['web port', out.webPort],
    ['platform port', out.platformPort],
  ]) {
    if (!Number.isInteger(v) || v < 1 || v > 65535) throw new Error(`invalid ${name}: ${v}`);
  }
  return out;
}

const HELP = `npm run dev:online [-- --server-port 2567 --web-port 5173 --no-lan]
Starts the City Rumble server and the game's dev server for local / same-Wi-Fi testing (docs/CITY_RUMBLE_ONLINE_LOCAL.md).
npm run dev:private   the same plus the player platform (guest identity, friends, parties; docs/PLATFORM_LOCAL_TEST.md).`;

/**
 * The private-test secrets, made once and kept in git-ignored \`.local/private-dev/secrets.json\` so a restart keeps the same
 * ticket signing key (a new key would invalidate the match server's cached public key) and the same shared secret.
 * Development values for a laptop: never reuse them anywhere else.
 */
export function privateDevSecrets(root) {
  const dir = resolve(root, '.local/private-dev');
  const file = resolve(dir, 'secrets.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  mkdirSync(dir, { recursive: true });
  const { privateKey } = generateKeyPairSync('ed25519');
  const secrets = {
    matchServerSecret: randomBytes(32).toString('hex'),
    adminToken: randomBytes(32).toString('hex'),
    handoffPrivateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
  writeFileSync(file, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  return secrets;
}

// ---------------------------------------------------------------- running it

const isWindows = process.platform === 'win32';
const COLOURS = { server: '36', web: '35', dev: '33' };
const tag = (name) => (process.stdout.isTTY ? `\x1b[${COLOURS[name] ?? '0'}m[${name}]\x1b[0m` : `[${name}]`);

function say(name, text) {
  for (const line of String(text).split(/\r?\n/)) if (line.length > 0) console.log(`${tag(name)} ${line}`);
}

function start(name, command, args, cwd, env) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWindows, // npm is npm.cmd on Windows
    detached: !isWindows, // its own process group on POSIX, so one signal stops npm and everything below it
  });
  const pipe = (stream) => {
    let rest = '';
    stream.on('data', (chunk) => {
      rest += chunk;
      const lines = rest.split(/\r?\n/);
      rest = lines.pop() ?? '';
      for (const line of lines) say(name, line);
    });
    stream.on('end', () => rest && say(name, rest));
  };
  pipe(child.stdout);
  pipe(child.stderr);
  return child;
}

function stopTree(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  try {
    if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
}

async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2), process.env);
  if (opts.help) {
    console.log(HELP);
    return;
  }
  const root = fileURLToPath(new URL('..', import.meta.url));
  const addresses = opts.lan ? lanAddresses(networkInterfaces()) : [];
  const origins = allowedOriginsFor({
    addresses,
    host: opts.lan ? hostname() : '',
    webPort: opts.webPort,
    extra: process.env.RUMBLE_ALLOWED_ORIGINS ?? '',
  });

  say('dev', `server ws://0.0.0.0:${opts.serverPort}, game http://0.0.0.0:${opts.webPort}`);
  say('dev', `server accepts the page origins: ${origins.split(',').join('  ')}`);

  // --platform: the player platform, and the three wired together
  const secrets = opts.platform ? privateDevSecrets(root) : null;
  let platformProc = null;
  const serverEnv = {
    PORT: String(opts.serverPort),
    NODE_ENV: 'development',
    RUMBLE_ALLOWED_ORIGINS: origins,
  };
  if (secrets) {
    if (!existsSync(resolve(root, 'player-platform/node_modules')))
      throw new Error('the player platform is not installed: run `npm ci` in player-platform first');
    say(
      'dev',
      `player platform http://0.0.0.0:${opts.platformPort} (${process.env.DATABASE_URL ? 'PostgreSQL' : 'in-memory database: lost on restart'})`,
    );
    platformProc = start('platform', 'npm', ['start'], `${root}player-platform`, {
      PORT: String(opts.platformPort),
      PLATFORM_HOST: opts.lan ? '0.0.0.0' : '127.0.0.1',
      PLATFORM_ENV: 'development',
      PLATFORM_ALLOWED_ORIGINS: origins,
      PLATFORM_PUBLIC_WEB_URL: origins.split(',')[0],
      PLATFORM_MATCH_SERVER_SECRET: secrets.matchServerSecret,
      PLATFORM_ADMIN_TOKEN: secrets.adminToken,
      PLATFORM_HANDOFF_PRIVATE_KEY: secrets.handoffPrivateKeyPem,
      PLATFORM_HANDOFF_AUDIENCE: 'wahala-rumble',
      ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
    });
    Object.assign(serverEnv, {
      PLATFORM_JWKS_URL: `http://127.0.0.1:${opts.platformPort}/.well-known/jwks.json`,
      PLATFORM_INTERNAL_URL: `http://127.0.0.1:${opts.platformPort}`,
      PLATFORM_MATCH_SERVER_SECRET: secrets.matchServerSecret,
      PLATFORM_HANDOFF_AUDIENCE: 'wahala-rumble',
    });
  }
  const server = start('server', 'npm', ['start'], `${root}server`, serverEnv);
  const web = start(
    'web',
    'npm',
    [
      'run',
      'dev',
      '--',
      '--host',
      opts.lan ? '0.0.0.0' : '127.0.0.1',
      '--port',
      String(opts.webPort),
      '--strictPort',
    ],
    root,
    {
      WAHALA_ONLINE_ENABLED: 'true',
      // `{host}` is replaced by the page's own hostname at run time (src/platform/flags.ts): a template, not an address
      WAHALA_ONLINE_URL: `ws://{host}:${opts.serverPort}`,
      ...(secrets ? { WAHALA_PLATFORM_URL: `http://{host}:${opts.platformPort}` } : {}),
    },
  );

  let stopping = false;
  const children = [server, web, ...(platformProc ? [platformProc] : [])];
  const stopAll = (code) => {
    if (stopping) return;
    stopping = true;
    say('dev', 'stopping ...');
    for (const c of children) stopTree(c);
    const force = setTimeout(() => process.exit(code), 4000);
    Promise.all(
      children.map((c) => new Promise((r) => (c.exitCode !== null ? r() : c.once('exit', r)))),
    ).then(() => {
      clearTimeout(force);
      process.exit(code);
    });
  };
  process.on('SIGINT', () => stopAll(0));
  process.on('SIGTERM', () => stopAll(0));
  for (const [name, c] of [
    ['server', server],
    ['web', web],
    ...(platformProc ? [['platform', platformProc]] : []),
  ]) {
    c.once('exit', (code, signal) => {
      if (stopping) return;
      say('dev', `the ${name} process ended (${signal ?? `exit ${code}`}): stopping the other one`);
      stopAll(code || 1);
    });
  }

  const [serverUp, webUp, platformUp] = await Promise.all([
    waitFor(`http://127.0.0.1:${opts.serverPort}/health`, 90_000),
    waitFor(`http://127.0.0.1:${opts.webPort}${DEV_BASE}`, 90_000),
    platformProc ? waitFor(`http://127.0.0.1:${opts.platformPort}/health`, 90_000) : Promise.resolve(true),
  ]);
  if (stopping) return;
  if (!serverUp || !webUp || !platformUp) {
    say(
      'dev',
      `NOT READY after 90 s (server ${serverUp ? 'up' : 'down'}, game ${webUp ? 'up' : 'down'}, platform ${platformProc ? (platformUp ? 'up' : 'down') : 'not started'}): see the logs above`,
    );
    return;
  }
  const lines = ['', 'READY. Open on a phone (same Wi-Fi) or this laptop:'];
  for (const { label, url } of pageUrls({ addresses, webPort: opts.webPort }))
    lines.push(`  ${label.padEnd(26)} ${url}`);
  if (opts.lan && addresses.length === 0)
    lines.push('  (no LAN address found: connect to a network, or use this laptop only)');
  lines.push(
    `Server check from a phone: http://${addresses[0] ?? 'localhost'}:${opts.serverPort}/health   (shows {"ok":true})`,
    ...(platformProc
      ? [
          `Platform check from a phone: http://${addresses[0] ?? 'localhost'}:${opts.platformPort}/health   (shows {"ok":true,...})`,
        ]
      : []),
    'Stop both with Ctrl-C. Trouble? docs/CITY_RUMBLE_ONLINE_LOCAL.md',
    '',
  );
  say('dev', lines.join('\n'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(`[dev] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
