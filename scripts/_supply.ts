import { getArena } from '../src/sim';
const id = process.argv[2]!;
const spec = JSON.parse(process.argv[3]!) as Record<string, [number, number, number, number][]>; // district -> rects
const a = getArena(id);
const rows = a.layout;
const open = (x: number, y: number) => (rows[y]?.[x] ?? '#') === '.' ;
const picks: string[] = [];
for (const [name, rects] of Object.entries(spec)) {
  let best: [number, number] | null = null; let bs = -1;
  for (const [x0, y0, x1, y1] of rects) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!open(x, y)) continue;
      let n = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (open(x + dx, y + dy)) n++;
      const score = n * 10 - Math.hypot(x - cx, y - cy);
      if (score > bs) { bs = score; best = [x, y]; }
    }
  }
  picks.push(`${name}: [${best}]`);
}
console.log(picks.join('\n'));
