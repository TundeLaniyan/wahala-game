// Tile statistics of the Ebute-Metta board (docs/EBUTE_METTA_WEST.md): open tiles overall and per district, road /
// plaza / supply counts and the two Team Rumble halves.
//   npx tsx scripts/ebute-stats.ts [--json]
import { getArena } from '../src/sim';

const a = getArena('rumbleEbuteMetta');
const W = a.layout[0]!.length;
const H = a.layout.length;
const open = (x: number, y: number): boolean => (a.layout[y]?.[x] ?? '#') !== '#';
let total = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (open(x, y)) total++;
const perDistrict: Record<string, number> = {};
for (const d of a.districts ?? []) {
  const seen = new Set<string>();
  for (const [x0, y0, x1, y1] of d.rects)
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (open(x, y)) seen.add(`${x},${y}`);
  perDistrict[d.id] = seen.size;
}
const half = (west: boolean): number => {
  let n = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if ((west ? x < (W - 1) / 2 : x > (W - 1) / 2) && open(x, y)) n++;
  return n;
};
/** Largest square of plain open floor ('.', crates ignored): the emptiest combat space (plazas and roads excluded). */
const bigSquare = (x0: number, x1: number): { size: number; at: string } => {
  let best = { size: 0, at: '' };
  for (let y = 0; y < H; y++)
    for (let x = x0; x <= x1; x++) {
      let n = 0;
      for (;;) {
        const m = n + 1;
        let ok = y + m <= H && x + m - 1 <= x1;
        for (let j = 0; ok && j < m; j++)
          for (let i = 0; ok && i < m; i++) if (!'.$x'.includes(a.layout[y + j]![x + i]!)) ok = false;
        if (!ok) break;
        n = m;
      }
      if (n > best.size) best = { size: n, at: `${x},${y}` };
    }
  return best;
};
const out = {
  emptiestSquare: { whole: bigSquare(0, W - 1), west: bigSquare(0, 21) },
  width: W,
  height: H,
  openTiles: total,
  openPct: Math.round((1000 * total) / (W * H)) / 10,
  perDistrict,
  westHalf: half(true),
  eastHalf: half(false),
};
console.log(process.argv.includes('--json') ? JSON.stringify(out) : JSON.stringify(out, null, 2));
