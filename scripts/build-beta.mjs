#!/usr/bin/env node
/**
 * Builds the hosted PRIVATE-BETA client into dist-beta/ (git-ignored, never published by CI, never the GitHub Pages build).
 *
 *   BETA_DOMAIN=play.example.com npm run build:beta
 *   BETA_DOMAIN=192.168.1.20 npm run build:beta -- --allow-local     (a rehearsal on a LAN: http / ws)
 *
 * It refuses to build without a domain, then proves the result: the bundle carries the beta's own addresses and the invite flow, and
 * contains no LAN-style endpoint template and nothing of the public game's online-off contract being weakened. docs/ops/BETA_FRONTEND.md.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { betaBuildEnv } from './beta-build-config.mjs';

const allowLocal = process.argv.includes('--allow-local');
const r = betaBuildEnv(process.env, { allowLocal });
if (!r.ok) {
  for (const e of r.errors) console.error(`build:beta: ${e}`);
  process.exit(2);
}
console.log('Private-beta client build:');
for (const l of r.summary) console.log('  ' + l);
const built = spawnSync('npx', ['vite', 'build', '--outDir', 'dist-beta', '--emptyOutDir'], {
  stdio: 'inherit',
  env: { ...process.env, ...r.env },
});
if (built.status !== 0) process.exit(built.status ?? 1);

// proof: read every JS file of the result
const dir = 'dist-beta/assets';
if (!existsSync(dir)) {
  console.error('build:beta: dist-beta/assets is missing');
  process.exit(1);
}
const js = readdirSync(dir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n');
const problems = [];
if (!js.includes(r.env.WAHALA_ONLINE_URL)) problems.push('the match server address is not in the bundle');
if (!js.includes(r.env.WAHALA_PLATFORM_URL)) problems.push('the platform address is not in the bundle');
if (!js.includes('pf-invite-code')) problems.push('the invite-code form is not in the bundle');
// The bundle legitimately contains the code constant `{host}` and the Colyseus SDK's own unused default endpoint (`ws://127.0.0.1:2567`), so
// those are not searched for. What must NOT be there is a LAN-style endpoint TEMPLATE (`ws://{host}:2567`, the `build:online` form).
if (!allowLocal && /(wss?|https?):\/\/\{host\}/.test(js))
  problems.push('a {host} endpoint template is in the bundle (that is the LAN development build)');
if (problems.length) {
  for (const p of problems) console.error(`build:beta: PROOF FAILED: ${p}`);
  process.exit(1);
}
console.log(
  '\nbuild:beta: dist-beta/ is ready. Host it on a static site YOU control (not the public GitHub Pages), at the origin you gave',
);
console.log('`wahala-beta.sh init --origin`. Do not publish it before the beta is authorised.');
