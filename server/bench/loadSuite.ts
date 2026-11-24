/**
 * Runs the whole load-test matrix of docs/measurements/rumble-online/LOAD_RESULTS.md one run after another (each run
 * is its own `bench/load.ts` process with its own fresh server, so runs cannot influence each other).
 *
 * Usage: npm run load:suite [-- --only a,b,c]     groups: clean, profiles, reconnect, background, capacity, humans (K rooms of 32 humans)
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tsx = path.resolve(HERE, '../../node_modules/.bin/tsx');

const GROUPS: Record<string, string[][]> = {
  clean: [2, 4, 8, 16, 32].map((n) => ['--clients', String(n), '--profile', 'clean']),
  profiles: ['europe', 'mobile', 'bad-mobile'].map((p) => ['--clients', '32', '--profile', p]),
  reconnect: [['--clients', '32', '--profile', 'mobile', '--scenario', 'reconnect']],
  background: [
    ['--clients', '32', '--profile', 'mobile', '--scenario', 'background'],
    ['--clients', '4', '--profile', 'clean', '--scenario', 'background'],
  ],
  capacity: [1, 2, 3, 4, 6, 8].map((k) => ['--clients', '2', '--rooms', String(k), '--profile', 'clean']),
  humans: [2, 3, 4].map((k) => ['--clients', '32', '--rooms', String(k), '--profile', 'clean']),
};

function busy(): { b: number; t: number } {
  const f = readFileSync('/proc/stat', 'utf8').split('\n')[0]!.split(/\s+/).slice(1).map(Number);
  const t = f.reduce((a, b) => a + b, 0);
  return { b: t - f[3]! - (f[4] ?? 0), t };
}

/** Waits (up to 10 minutes) until nothing else is using the machine: other work would distort every number. */
async function waitQuiet(): Promise<void> {
  const deadline = Date.now() + 600_000;
  for (;;) {
    const a = busy();
    await new Promise((r) => setTimeout(r, 3000));
    const b = busy();
    const pct = ((b.b - a.b) / (b.t - a.t)) * 400;
    if (pct < 40 || Date.now() > deadline) {
      console.log(
        `machine busy ${pct.toFixed(0)}% of 400 before the run${pct >= 40 ? ' (gave up waiting)' : ''}`,
      );
      return;
    }
  }
}

const only = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1]!.split(',')
  : Object.keys(GROUPS);
for (const g of only) {
  for (const args of GROUPS[g] ?? []) {
    console.log(`\n##### ${g}: ${args.join(' ')}`);
    for (let attempt = 1; attempt <= 4; attempt++) {
      await waitQuiet();
      const r = spawnSync(tsx, [path.join(HERE, 'load.ts'), ...args], { stdio: 'inherit' });
      if (r.status === 0) break;
      console.log(
        `##### attempt ${attempt} ${r.status === 3 ? 'was disturbed by other work on the machine' : `FAILED (exit ${r.status})`}${attempt < 4 ? ', retrying' : ', giving up (last result kept)'}`,
      );
    }
  }
}
