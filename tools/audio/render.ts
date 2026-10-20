/**
 * Renders the synthesised sound bank to WAV files in plain Node and prints numeric analysis.
 *
 *   npx tsx tools/audio/render.ts <outDir> [--rate-scale 1] [--only id1,id2] [--check]
 *
 * This is the only "listening" available without ears: peak/RMS levels, duration, DC offset,
 * spectral centroid, band energies, tonal peaks and loop seam checks. It cannot judge how a sound
 * *feels*; see the report in the commit/PR notes for what is still unverified by ear.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderSound } from '../../src/audio/bank';
import { SOUND_IDS, defOf } from '../../src/audio/recipes';
import type { SoundId } from '../../src/audio/recipes';
import { analyse, formatRow, wavBytes } from './analysis';

const args = process.argv.slice(2);
const outDir = args[0] && !args[0].startsWith('--') ? args[0] : '';
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const scale = Number(flag('--rate-scale') ?? 1);
const only = flag('--only')?.split(',') as SoundId[] | undefined;
const ids = only ?? SOUND_IDS;

if (outDir) mkdirSync(outDir, { recursive: true });
console.log(
  [
    'id',
    'dur',
    'peak',
    'rmsdB',
    'dc',
    'centroid',
    'A-wtd <150 150-500 500-4k >4k',
    'seam',
    'ms',
    'notes',
  ].join('\t'),
);
let failures = 0;
let totalMs = 0;
for (const id of ids) {
  const t0 = performance.now();
  const r = renderSound(id, scale);
  const ms = performance.now() - t0;
  totalMs += ms;
  const a = analyse(r.l, r.r, r.rate, defOf(id).kind === 'loop');
  console.log(formatRow(id, a, ms));
  if (a.problems.length) failures += a.problems.length;
  if (outDir) writeFileSync(join(outDir, `${id}.wav`), wavBytes(r.l, r.r, r.rate));
}
console.log(`total render time ${totalMs.toFixed(0)} ms for ${ids.length} sounds; problems: ${failures}`);
if (args.includes('--check') && failures > 0) process.exit(1);
