#!/usr/bin/env node
/**
 * One command for same-Wi-Fi phone testing: builds the SINGLE-FILE server bundle, runs THAT bundle with plain `node`
 * (the same artifact the Docker image runs), serves the dev client to the network, and prints the URLs to open on phones.
 *
 *   node ops/local/lan.mjs                     # auto-detect the laptop's Wi-Fi address
 *   node ops/local/lan.mjs --ip 192.168.1.23   # choose it yourself (several adapters, VPN ...)
 *   node ops/local/lan.mjs --selftest          # start, probe over the LAN address, stop (exit code = result)
 *   node ops/local/lan.mjs --install           # run `npm ci` / `npm install` first when dependencies are missing
 *
 * LOCAL ONLY. Plain http / ws on a private address: fine for a home or office network, never for the internet.
 * Nothing here buys, creates or exposes a public service. Full guide: docs/ops/02-LOCAL-LAN.md.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const serverDir = path.join(repo, 'server');
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]] : null))
    .filter(Boolean),
);
const serverPort = Number(args.port ?? 2567);
const clientPort = Number(args['client-port'] ?? 5180);
const log = (m) => console.log(m);
const die = (m) => {
  console.error(`\nERROR: ${m}`);
  process.exit(1);
};

// ---------------------------------------------------------------- prerequisites
const major = Number(process.versions.node.split('.')[0]);
if (major < 22) die(`Node 22 or newer is required (this is ${process.version}). The server bundle targets node22.`);

const needsInstall = !existsSync(path.join(repo, 'node_modules/.bin/esbuild')) || !existsSync(path.join(serverDir, 'node_modules/@colyseus'));
if (needsInstall) {
  if (!args.install) die('Dependencies are missing. Run:\n  npm ci\n  cd server && npm install\nor re-run this command with --install.');
  for (const [cwd, cmd] of [[repo, ['ci', '--ignore-scripts']], [serverDir, ['install']]]) {
    log(`> npm ${cmd.join(' ')}  (${path.relative(repo, cwd) || '.'})`);
    if (spawnSync('npm', cmd, { cwd, stdio: 'inherit', shell: process.platform === 'win32' }).status !== 0) die('npm failed');
  }
}

// ---------------------------------------------------------------- the laptop's LAN address
const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const VIRTUAL = /^(docker|br-|veth|virbr|vboxnet|vmnet|utun|tun|tap|tailscale|zt|lo)/i;
function lanCandidates() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && PRIVATE.test(a.address)) out.push({ name, address: a.address, virtual: VIRTUAL.test(name) });
    }
  }
  return out.sort((a, b) => Number(a.virtual) - Number(b.virtual));
}
const candidates = lanCandidates();
const ip = typeof args.ip === 'string' ? args.ip : candidates[0]?.address;
if (!ip) die('No private LAN address found (are you on Wi-Fi?). Pass one explicitly: --ip 192.168.x.x');
if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) die(`--ip must be an IPv4 address, got "${ip}"`);

// ---------------------------------------------------------------- build the bundle
log('> building the server bundle (npm run bundle)');
if (spawnSync('npm', ['run', 'bundle', '--silent'], { cwd: serverDir, stdio: 'inherit', shell: process.platform === 'win32' }).status !== 0) die('bundle failed');
const bundle = path.join(serverDir, 'dist/rumble-server.mjs');
if (!existsSync(bundle)) die(`bundle missing: ${bundle}`);

// ---------------------------------------------------------------- run
const metricsToken = randomBytes(16).toString('hex');
const origins = [`http://${ip}:${clientPort}`, `http://localhost:${clientPort}`, `http://127.0.0.1:${clientPort}`].join(',');
const children = [];
const run = (label, cmd, cmdArgs, opts) => {
  const child = spawn(cmd, cmdArgs, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  child.stdout.on('data', (d) => process.stdout.write(`[${label}] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[${label}] ${d}`));
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`\n[${label}] exited unexpectedly (code ${code}); stopping.`);
      stop(1);
    }
  });
  children.push(child);
  return child;
};
let stopping = false;
function stop(code = 0) {
  stopping = true;
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 400);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

run('server', process.execPath, [bundle], {
  cwd: path.dirname(bundle),
  env: {
    ...process.env,
    NODE_ENV: 'production', // production origin policy: ONLY the list below, no development wildcard
    PORT: String(serverPort),
    RUMBLE_ALLOWED_ORIGINS: origins,
    RUMBLE_METRICS_TOKEN: metricsToken,
  },
});
if (!args['no-client']) {
  run('client', path.join(repo, 'node_modules/.bin/vite'), ['--config', 'vite.client.config.ts', '--host', '0.0.0.0', '--port', String(clientPort), '--strictPort'], { cwd: serverDir });
}

async function waitFor(url, what, ms = 60_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  die(`${what} did not come up within ${ms / 1000} s`);
}
await waitFor(`http://127.0.0.1:${serverPort}/health`, 'the server');
if (!args['no-client']) await waitFor(`http://127.0.0.1:${clientPort}/`, 'the client page');

const pageUrl = `http://${ip}:${clientPort}/`;
log(`
================================================================================
 WAHALA! City Rumble - same-Wi-Fi test is up
================================================================================
 Phones (same Wi-Fi, NOT mobile data):   ${pageUrl}
 Laptop browser:                         http://localhost:${clientPort}/
 Game server (ws):                       ws://${ip}:${serverPort}      health: http://${ip}:${serverPort}/health
 Allowed browser origins:                ${origins}
 Metrics token (this run only):          ${metricsToken}
   curl -H "Authorization: Bearer ${metricsToken}" http://127.0.0.1:${serverPort}/metrics

 Several adapters? Using ${ip}${candidates.length > 1 ? ` (others: ${candidates.slice(1).map((c) => c.address).join(', ')})` : ''}
 Probe it:  node ops/probes/probe.mjs --http http://${ip}:${serverPort} --origin http://${ip}:${clientPort} --metrics-token ${metricsToken}
 Stop:      Ctrl+C
 If a phone cannot connect, read docs/ops/02-LOCAL-LAN.md "Troubleshooting" (firewall, AP/client isolation).
================================================================================`);

if (args.selftest) {
  const probe = spawnSync(process.execPath, [path.join(repo, 'ops/probes/probe.mjs'), '--http', `http://${ip}:${serverPort}`, '--origin', `http://${ip}:${clientPort}`, '--metrics-token', metricsToken, '--only', 'health,metrics,origin,names,abuse'], { stdio: 'inherit' });
  // the page the phone would load, fetched through the LAN address (this is also what an insecure-context phone sees)
  let pageOk = false;
  if (!args['no-client']) {
    const res = await fetch(pageUrl).catch(() => null);
    pageOk = !!res?.ok && /City Rumble/.test(await res.text());
    log(`${pageOk ? 'PASS' : 'FAIL'}  client page served on the LAN address ${pageUrl}`);
  }
  stop(probe.status === 0 && (pageOk || args['no-client']) ? 0 : 1);
}
