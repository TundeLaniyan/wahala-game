/**
 * Renders the listening set (listening_set.json) to 16-bit WAV through the game's own recipes, at the level the engine
 * plays them (peak x the recipe's default gain). Loops are repeated to about 5 s so they can be heard as loops.
 *   npx tsx tools/audio/production/render_set.ts <outDir>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSound } from '../../../src/audio/bank';
import { defOf } from '../../../src/audio/recipes';
import type { SoundId } from '../../../src/audio/recipes';
import { wavBytes } from '../analysis';

const out = process.argv[2]!;
mkdirSync(out, { recursive: true });
const set = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'listening_set.json'), 'utf8'),
) as {
  categories: { items: { id: string; replaces?: string; loop?: boolean }[] }[];
};
const ids = new Set<string>();
for (const c of set.categories)
  for (const i of c.items) {
    ids.add(i.id);
    if (i.replaces) ids.add(i.replaces);
  }
const meta: Record<string, { seconds: number; peak: number; rate: number; loop: boolean }> = {};
for (const id of ids) {
  const def = defOf(id as SoundId);
  const r = renderSound(id as SoundId, 1, false);
  let l = r.l;
  let rr = r.r;
  if (def.kind === 'loop') {
    const reps = Math.max(1, Math.round((5 * r.rate) / l.length));
    const L = new Float32Array(l.length * reps);
    const R = new Float32Array(l.length * reps);
    for (let k = 0; k < reps; k++) {
      L.set(l, k * l.length);
      R.set(rr, k * l.length);
    }
    l = L;
    rr = R;
  }
  const g = Math.min(def.gain, 1.4);
  let m = 0;
  for (let i = 0; i < l.length; i++) m = Math.max(m, Math.abs(l[i]!), Math.abs(rr[i]!));
  const pk = m * g;
  const scale = pk > 0.98 ? 0.98 / pk : 1;
  const L2 = l.map((v) => v * g * scale);
  const R2 = rr.map((v) => v * g * scale);
  writeFileSync(join(out, `${id}.wav`), wavBytes(L2, R2, r.rate));
  meta[id] = {
    seconds: l.length / r.rate,
    peak: Math.min(pk, 0.98),
    rate: r.rate,
    loop: def.kind === 'loop',
  };
}
writeFileSync(join(out, 'meta.json'), JSON.stringify(meta, null, 1));
console.log(`rendered ${ids.size} sounds to ${out}`);
