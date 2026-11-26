#!/usr/bin/env node
/**
 * `npm run test:private-e2e`: the PRIVATE MULTIPLAYER acceptance run on one machine (docs/PLATFORM_LOCAL_TEST.md).
 * Builds the server build of the game with the platform URL, starts a REAL PostgreSQL (scripts/mp/pg-local.sh, or the one named
 * by DATABASE_URL), the real player platform, the real match server (platform-linked) and `vite preview`, then runs
 * e2e/private-multiplayer.spec.ts in TWO real Chromium contexts and stops everything. Local / development only: CI never runs it.
 * Env: WAHALA_CHROMIUM, PRIVATE_E2E_SKIP_BUILD=1 (reuse dist-private), PRIVATE_E2E_ARGS (extra Playwright args),
 *      PRIVATE_E2E_KEEP=1 (leave the stack running afterwards for manual poking).
 * Prints the stack's URLs and writes the server / platform logs to `private-e2e-diag/`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const WEB = 4831;
const SERVER = 2568;
const PLATFORM = 4568;
const origin = `http://127.0.0.1:${WEB}`;
const DIAG = 'private-e2e-diag';
rmSync(DIAG, { recursive: true, force: true });
mkdirSync(DIAG, { recursive: true });
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });

if (!existsSync('player-platform/node_modules')) {
  console.error('run `npm ci` in player-platform first');
  process.exit(2);
}
let databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  const pg = spawnSync('scripts/mp/pg-local.sh', ['start'], { encoding: 'utf8' });
  if (pg.status !== 0) {
    console.error(`no DATABASE_URL and scripts/mp/pg-local.sh could not start PostgreSQL:\n${pg.stderr}`);
    process.exit(2);
  }
  databaseUrl = pg.stdout.trim().split('\n').pop();
  // a clean database for each run
  run('psql', [databaseUrl, '-q', '-c', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;']);
}
console.log(`[private-e2e] PostgreSQL: ${databaseUrl.replace(/:[^:@/]*@/, ':***@')}`);

if (process.env.PRIVATE_E2E_SKIP_BUILD !== '1' || !existsSync('dist-private')) {
  const built = run('npx', ['vite', 'build', '--outDir', 'dist-private', '--emptyOutDir'], {
    env: {
      ...process.env,
      WAHALA_ONLINE_ENABLED: 'true',
      WAHALA_ONLINE_URL: 'ws://{host}:' + SERVER,
      WAHALA_PLATFORM_URL: 'http://{host}:' + PLATFORM,
      WAHALA_NO_GLB_OPT: process.env.WAHALA_NO_GLB_OPT ?? '1',
    },
  });
  if (built.status !== 0) process.exit(built.status ?? 1);
}

const secret = randomBytes(32).toString('hex');
const keyPem = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const children = [];
const stop = () =>
  children.forEach((c) => {
    try {
      process.kill(-c.pid, 'SIGTERM');
    } catch {
      /* gone */
    }
  });
if (process.env.PRIVATE_E2E_KEEP !== '1') process.on('exit', stop);
process.on('SIGINT', () => process.exit(130));
const start = (name, cmd, args, opts) => {
  const c = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true, ...opts });
  const tee = (d) => appendFileSync(`${DIAG}/${name}.log`, d);
  c.stdout.on('data', tee);
  c.stderr.on('data', tee);
  children.push(c);
  return c;
};
for (const port of [WEB, SERVER, PLATFORM]) {
  try {
    await fetch(`http://127.0.0.1:${port}/`);
    console.error(`port ${port} is already in use: stop the other process first`);
    process.exit(2);
  } catch {
    /* free */
  }
}
const platformEnv = {
  ...process.env,
  PORT: String(PLATFORM),
  PLATFORM_HOST: '127.0.0.1',
  PLATFORM_ENV: 'development',
  DATABASE_URL: databaseUrl,
  PLATFORM_ALLOWED_ORIGINS: origin,
  PLATFORM_PUBLIC_WEB_URL: origin,
  PLATFORM_MATCH_SERVER_SECRET: secret,
  PLATFORM_HANDOFF_PRIVATE_KEY: keyPem,
  PLATFORM_HANDOFF_AUDIENCE: 'wahala-rumble',
};
start('platform', 'npx', ['tsx', 'src/main.ts'], { cwd: 'player-platform', env: platformEnv });
start('server', 'npx', ['tsx', 'src/main.ts'], {
  cwd: 'server',
  env: {
    ...process.env,
    PORT: String(SERVER),
    RUMBLE_ALLOWED_ORIGINS: origin,
    RUMBLE_GRACE_SECONDS: '3',
    RUMBLE_RECONNECT_SECONDS: '30',
    PLATFORM_JWKS_URL: `http://127.0.0.1:${PLATFORM}/.well-known/jwks.json`,
    PLATFORM_INTERNAL_URL: `http://127.0.0.1:${PLATFORM}`,
    PLATFORM_MATCH_SERVER_SECRET: secret,
    PLATFORM_HANDOFF_AUDIENCE: 'wahala-rumble',
  },
});
start('web', 'npx', [
  'vite',
  'preview',
  '--outDir',
  'dist-private',
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
await wait(`http://127.0.0.1:${PLATFORM}/health`);
await wait(`http://127.0.0.1:${SERVER}/health`);
await wait(`${origin}/wahala-game/`);
console.log(
  `[private-e2e] stack up: web ${origin}/wahala-game/  match server :${SERVER}  platform :${PLATFORM}`,
);

const result = spawnSync(
  'npx',
  [
    'playwright',
    'test',
    'e2e/private-multiplayer.spec.ts',
    '--project=desktop',
    '--workers=1',
    '--trace',
    'off',
    '--timeout=900000',
    '--retries=0',
    '--reporter=line',
    ...(process.env.PRIVATE_E2E_ARGS?.split(' ') ?? []),
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      WAHALA_PRIVATE_E2E_URL: `${origin}/wahala-game/`,
      WAHALA_PRIVATE_E2E_PLATFORM: `http://127.0.0.1:${PLATFORM}`,
      WAHALA_PRIVATE_E2E_SERVER: `http://127.0.0.1:${SERVER}`,
      WAHALA_E2E_PREBUILT: '1',
      WAHALA_E2E_PORT: String(WEB),
      WAHALA_MULTIPROCESS: '1',
      PRIVATE_E2E_DIAG: DIAG,
    },
  },
);
if (process.env.PRIVATE_E2E_KEEP === '1')
  console.log('[private-e2e] PRIVATE_E2E_KEEP=1: the stack keeps running (Ctrl-C)');
else stop();
process.exit(result.status ?? 1);
