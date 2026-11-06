// Tile statistics of the Ebute-Metta board before and after Ebute Metta West (docs/EBUTE_METTA_WEST.md): non-wall tiles overall and
// per district, the Team Rumble halves, the emptiest plain-floor square. The "before" board is the pinned original
// (tests/ebuteEastOriginal.ts); the "after" board is the live arena.
//   npx tsx scripts/ebute-stats.ts [--json | --md | --ascii]
import { getArena } from '../src/sim';
import { EBUTE_WEST_DX } from '../src/sim/arenas/ebuteWest';
import { EBUTE_EAST_ORIGINAL } from '../tests/ebuteEastOriginal';

type Rect = [number, number, number, number];
interface Board {
  rows: readonly string[];
  districts: { id: string; name: string; rects: Rect[] }[];
}

const before: Board = {
  rows: EBUTE_EAST_ORIGINAL,
  districts: [
    { id: 'heritage', name: 'Railway Heritage', rects: [[2, 2, 21, 15]] },
    { id: 'station', name: 'Station Boulevard', rects: [[22, 2, 33, 19]] },
    { id: 'oyingbo', name: 'Oyingbo Trade Quarter', rects: [[34, 2, 52, 15]] },
    { id: 'residential', name: 'Residential Mainland', rects: [[2, 20, 21, 36]] },
    { id: 'railYard', name: 'Working Rail Yard', rects: [[22, 20, 33, 36]] },
    { id: 'foreshore', name: 'Oko-Baba Foreshore', rects: [[34, 20, 52, 36]] },
  ],
};
const arena = getArena('rumbleEbuteMetta');
const after: Board = {
  rows: arena.layout,
  districts: (arena.districts ?? []).map((d) => ({ id: d.id, name: d.name, rects: d.rects as Rect[] })),
};

function measure(b: Board): {
  w: number;
  h: number;
  open: number;
  pct: number;
  road: number;
  perDistrict: Record<string, number>;
  unassigned: number;
  west: number;
  east: number;
  square: number;
} {
  const h = b.rows.length;
  const w = b.rows[0]!.length;
  const open = (x: number, y: number): boolean => (b.rows[y]?.[x] ?? '#') !== '#';
  let n = 0;
  let road = 0;
  const owner = new Map<string, number>();
  const perDistrict: Record<string, number> = {};
  for (const d of b.districts) perDistrict[d.id] = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!open(x, y)) continue;
      n++;
      if (b.rows[y]![x] === '=') road++;
      const d = b.districts.find((z) =>
        z.rects.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1),
      );
      if (d) perDistrict[d.id]!++;
      else owner.set(`${x},${y}`, 1);
    }
  const half = (west: boolean): number => {
    let c = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) if ((west ? x < (w - 1) / 2 : x > (w - 1) / 2) && open(x, y)) c++;
    return c;
  };
  let square = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let m = square + 1; ; m++) {
        let ok = y + m <= h && x + m <= w;
        for (let j = 0; ok && j < m; j++)
          for (let i = 0; ok && i < m; i++) if (!'.$x'.includes(b.rows[y + j]![x + i]!)) ok = false;
        if (!ok) break;
        square = m;
      }
  return {
    w,
    h,
    open: n,
    pct: Math.round((1000 * n) / (w * h)) / 10,
    road,
    perDistrict,
    unassigned: owner.size,
    west: half(true),
    east: half(false),
    square,
  };
}

const a = measure(before);
const b = measure(after);
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ before: a, after: b }));
} else if (process.argv.includes('--ascii')) {
  const ruler = (w: number): string =>
    '    ' + Array.from({ length: w }, (_, x) => (x % 10 === 0 ? String((x / 10) % 10) : ' ')).join('');
  const show = (name: string, rows: readonly string[]): void => {
    console.log(`${name} (${rows[0]!.length} x ${rows.length})`);
    console.log(ruler(rows[0]!.length));
    rows.forEach((r, y) => console.log(String(y).padStart(3) + ' ' + r));
  };
  show('BEFORE', before.rows);
  console.log('');
  show('AFTER', after.rows);
} else {
  const pct = (x: number, y: number): string => `+${((100 * (y - x)) / x).toFixed(1)} %`;
  console.log('| Measure | Before | After | Change |');
  console.log('|---|---|---|---|');
  console.log(
    `| Board (tiles) | ${a.w} x ${a.h} = ${a.w * a.h} | ${b.w} x ${b.h} = ${b.w * b.h} | +${EBUTE_WEST_DX} columns |`,
  );
  console.log(
    `| Non-wall (open) tiles | ${a.open} | ${b.open} | +${b.open - a.open} (${pct(a.open, b.open)}) |`,
  );
  console.log(`| Open share of the board | ${a.pct} % | ${b.pct} % | |`);
  console.log(`| Road and track tiles | ${a.road} | ${b.road} | +${b.road - a.road} |`);
  console.log(`| Open tiles, west team half (x < centre) | ${a.west} | ${b.west} | ${pct(a.west, b.west)} |`);
  console.log(`| Open tiles, east team half (x > centre) | ${a.east} | ${b.east} | ${pct(a.east, b.east)} |`);
  console.log(`| Largest plain-floor square | ${a.square} x ${a.square} | ${b.square} x ${b.square} | |`);
  console.log('');
  console.log('| District | Before (open tiles) | After (open tiles) | Change |');
  console.log('|---|---|---|---|');
  for (const d of after.districts) {
    const was = a.perDistrict[d.id];
    console.log(
      `| ${d.name} (\`${d.id}\`) | ${was ?? 'new'} | ${b.perDistrict[d.id]} | ${was === undefined ? 'new district' : 'unchanged'} |`,
    );
  }
  console.log(
    `| Road and lane tiles outside any district | ${a.unassigned} | ${b.unassigned} | ${b.unassigned - a.unassigned} (Murtala Muhammed Way outside the station; the road's old west end now belongs to Apapa Road) |`,
  );
  console.log(`| **Total** | **${a.open}** | **${b.open}** | **+${b.open - a.open}** |`);
}
