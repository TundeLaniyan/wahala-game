/**
 * Measures how long each sound takes to render and, more importantly, the longest uninterrupted
 * step between two `yield`s (the bank scheduler can only pause at yields, so this is the worst
 * main-thread block per sound).
 *
 *   npx tsx tools/audio/profile.ts [--top 15]
 */
import { performance } from 'node:perf_hooks';
import { hashSeed } from '../../src/audio/dsp/core';
import { SOUND_DEFS, SOUND_IDS } from '../../src/audio/recipes';
import { finalize } from '../../src/audio/recipes/types';
import { createRand } from '../../src/audio/rng';

const rows: { id: string; total: number; maxStep: number; steps: number }[] = [];
for (const id of SOUND_IDS) {
  const def = SOUND_DEFS[id];
  const gen = def.render({ rate: def.rate, rng: createRand(hashSeed(id)) });
  let maxStep = 0;
  let steps = 0;
  const t0 = performance.now();
  for (;;) {
    const s0 = performance.now();
    const r = gen.next();
    const d = performance.now() - s0;
    steps++;
    if (r.done) {
      const f0 = performance.now();
      finalize(def, r.value);
      maxStep = Math.max(maxStep, d + performance.now() - f0);
      break;
    }
    maxStep = Math.max(maxStep, d);
  }
  rows.push({ id, total: performance.now() - t0, maxStep, steps });
}
const top = Number(process.argv[process.argv.indexOf('--top') + 1] || 15);
rows.sort((a, b) => b.maxStep - a.maxStep);
console.log('id\ttotal ms\tlongest step ms\tsteps');
for (const r of rows.slice(0, top))
  console.log(`${r.id}\t${r.total.toFixed(0)}\t${r.maxStep.toFixed(0)}\t${r.steps}`);
console.log(`sum of all renders: ${rows.reduce((s, r) => s + r.total, 0).toFixed(0)} ms`);
