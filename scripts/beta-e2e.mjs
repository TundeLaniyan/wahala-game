#!/usr/bin/env node
/**
 * `npm run test:beta-e2e`: the HOSTED private-beta acceptance run, on one machine, in real browsers (docs/ops/BETA_FOUNDER_TESTING.md).
 *
 * It starts the REAL Docker stack of ops/beta (edge with TLS, match server REQUIRING platform tickets, invite-only platform,
 * PostgreSQL, migrations, backups, monitor) under its own state folder and project name, builds the PRIVATE-BETA client
 * (`npm run build:beta`), serves it over HTTPS on another origin than the servers, and runs e2e/private-multiplayer.spec.ts in
 * THREE real Chromium contexts (A desktop, B phone, C an uninvited outsider) with the invite code. Then it removes the stack.
 * It never touches a real beta (its own state dir, its own compose project), deploys nothing and needs no internet but the npm registry
 * for the first image build.
 *
 * Needs: Docker running, root (it adds two lines to /etc/hosts and removes them again; 443 and 8443 free), Node 22,
 * WAHALA_CHROMIUM. Env: BETA_E2E_SKIP_BUILD=1 (reuse dist-beta), BETA_E2E_KEEP=1 (leave the stack up), EXTRA_CA_DIR (a TLS-inspecting
 * proxy's CA for the image build), BETA_E2E_ARGS (extra Playwright arguments).
 */
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:https';
import { extname, join, normalize } from 'node:path';

const DOMAIN = 'play.wahala-beta.dev';
const PAGE_PORT = 8443;
const ORIGIN = `https://${DOMAIN}:${PAGE_PORT}`;
const STATE = process.env.BETA_E2E_STATE ?? '/tmp/wahala-beta-e2e-state';
const DIAG = 'beta-e2e-diag';
const env = { ...process.env, BETA_STATE: STATE, BETA_PROJECT: 'wahala-beta-e2e' };
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: 'inherit', env, ...opts });
const beta = (...args) => sh('ops/beta/wahala-beta.sh', args);

rmSync(DIAG, { recursive: true, force: true });
mkdirSync(DIAG, { recursive: true });
if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
  console.error('beta-e2e: Docker is not running');
  process.exit(2);
}
if (process.getuid?.() !== 0) {
  console.error('beta-e2e: needs root (it maps the test domain in /etc/hosts and binds 443)');
  process.exit(2);
}

// the test domain resolves to this machine (for Chromium and for Node's own WebSocket client)
const HOSTS = '/etc/hosts';
const hostsLine = `127.0.0.1 ${DOMAIN} # wahala-beta-e2e`;
if (!readFileSync(HOSTS, 'utf8').includes(hostsLine)) appendFileSync(HOSTS, `${hostsLine}\n`);
const cleanup = [];
const finish = (code) => {
  for (const f of cleanup.reverse()) {
    try {
      f();
    } catch {
      /* best effort */
    }
  }
  process.exit(code);
};
cleanup.push(() => writeFileSync(HOSTS, readFileSync(HOSTS, 'utf8').replace(`${hostsLine}\n`, '')));
process.on('SIGINT', () => finish(130));

// 1. the stack
rmSync(STATE, { recursive: true, force: true });
if (beta('init', '--origin', ORIGIN, '--domain', DOMAIN).status !== 0) finish(1);
if (beta('up').status !== 0) finish(1);
if (process.env.BETA_E2E_KEEP !== '1') cleanup.push(() => beta('destroy', '--yes'));
const invite = readFileSync(join(STATE, 'secrets/invite_codes'), 'utf8').trim().split('\n')[0];

// 2. the private-beta client, on its own origin
if (process.env.BETA_E2E_SKIP_BUILD !== '1' || !existsSync('dist-beta')) {
  const built = sh('npx', ['vite', 'build', '--outDir', 'dist-beta', '--emptyOutDir'], {
    env: {
      ...env,
      WAHALA_ONLINE_ENABLED: 'true',
      WAHALA_ONLINE_URL: `wss://${DOMAIN}`,
      WAHALA_PLATFORM_URL: `https://${DOMAIN}`,
      WAHALA_PRIVATE_BETA: '1',
      WAHALA_NO_GLB_OPT: process.env.WAHALA_NO_GLB_OPT ?? '1',
    },
  });
  if (built.status !== 0) finish(1);
}
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};
const web = createServer(
  {
    key: readFileSync(join(STATE, 'certs/privkey.pem')),
    cert: readFileSync(join(STATE, 'certs/fullchain.pem')),
  },
  (req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    let file = join('dist-beta', path);
    if (!existsSync(file) || statSync(file).isDirectory()) file = join('dist-beta', 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  },
).listen(PAGE_PORT, '127.0.0.1');
cleanup.push(() => web.close());

// 3. a Playwright config that does not start the public build's own preview server and accepts the temporary certificate
writeFileSync(
  'playwright.beta.config.ts',
  `import base from './playwright.config';\nexport default { ...base, webServer: undefined, use: { ...base.use, ignoreHTTPSErrors: true } };\n`,
);
cleanup.push(() => rmSync('playwright.beta.config.ts', { force: true }));

const result = spawnSync(
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
    ...(process.env.BETA_E2E_ARGS?.split(' ') ?? []),
  ],
  {
    stdio: 'inherit',
    env: {
      ...env,
      WAHALA_PRIVATE_E2E_URL: `${ORIGIN}/`,
      WAHALA_PRIVATE_E2E_PLATFORM: `https://${DOMAIN}`,
      WAHALA_PRIVATE_E2E_SERVER: `https://${DOMAIN}`,
      WAHALA_PRIVATE_E2E_INVITE: invite,
      NODE_EXTRA_CA_CERTS: join(STATE, 'certs/fullchain.pem'),
      WAHALA_MULTIPROCESS: '1',
      CI: process.env.CI ?? '',
    },
  },
);
for (const svc of ['rumble', 'platform']) {
  const r = spawnSync(
    'docker',
    [
      'compose',
      '-p',
      'wahala-beta-e2e',
      '-f',
      'ops/beta/compose.yml',
      '--env-file',
      join(STATE, 'beta.env'),
      'logs',
      '--no-color',
      '--no-log-prefix',
      '--tail',
      '3000',
      svc,
    ],
    { env, encoding: 'utf8' },
  );
  writeFileSync(join(DIAG, `${svc}.log`), r.stdout ?? '');
}
if (process.env.BETA_E2E_KEEP === '1')
  console.log(`[beta-e2e] BETA_E2E_KEEP=1: the stack keeps running; page ${ORIGIN}/ invite ${invite}`);
finish(result.status ?? 1);
