#!/usr/bin/env node
/**
 * `npm run test:online-e2e`: builds the SERVER build of the game (`build:online`, endpoint template ws://{host}:2567),
 * starts the real Node multiplayer server and `vite preview` of that build, runs e2e/rumble-online.spec.ts against them in
 * Chromium and stops everything. Local / development only (docs/CITY_RUMBLE_ONLINE_LOCAL.md); CI never runs it.
 * Env: WAHALA_CHROMIUM (browser), ONLINE_E2E_SKIP_BUILD=1 (reuse dist-online), ONLINE_E2E_ARGS (extra Playwright args).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const WEB = 4830;
const SERVER = 2567;
const origin = `http://127.0.0.1:${WEB}`;
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });

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
  c.stdout.on('data', (d) => process.stdout.write(`[${name}] ${d}`));
  c.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`));
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
start('server', 'npx', ['tsx', 'src/main.ts'], {
  cwd: 'server',
  env: {
    ...process.env,
    PORT: String(SERVER),
    RUMBLE_ALLOWED_ORIGINS: origin,
    RUMBLE_GRACE_SECONDS: '3',
    RUMBLE_RECONNECT_SECONDS: '25',
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
const result = run('npx', args, {
  env: {
    ...process.env,
    WAHALA_ONLINE_E2E_URL: `${origin}/wahala-game/`,
    WAHALA_E2E_PREBUILT: '1',
    WAHALA_E2E_PORT: String(WEB),
    WAHALA_MULTIPROCESS: '1',
  },
});
stop();
process.exit(result.status ?? 1);
