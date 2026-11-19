// Prints a field mission's district board with its authored tiles and its sector (or a trial one), and lists where the
// play area would leak past the rect edges (the openings that still need a barricade). Authoring aid for
// src/sim/mission/sectors.ts (docs/CAMPAIGN_SECTOR_AI.md).
//   npx tsx scripts/sector-ascii.ts <fieldId> ['[[x0,y0,x1,y1],...]']
// Legend: S start, R return, 1-9 markers, X exit, D door, E enemy post, B barricade, G gate, '+' rect edge leak.
// Tiles outside the sector are printed lower-contrast: '#' as ':' and floor as ' '.
import { FIELD_MISSION_DEFS, fieldArenaId, getArena } from '../src/sim';
import { fieldEnemiesOf } from '../src/sim/mission/combatPilot';
import { MISSION_SECTORS } from '../src/sim/mission/sectors';
import type { MissionSectorDef, SectorRect } from '../src/sim/mission/sectors';
import { rectsContain, sectorLeaks } from '../src/sim/mission/sector';

const id = process.argv[2] ?? 'oshodi.approach';
const def = FIELD_MISSION_DEFS[id]!;
const arena = getArena(fieldArenaId(def));
const trial = process.argv[3] ? (JSON.parse(process.argv[3]) as SectorRect[]) : null;
const own = def.sectorId ? MISSION_SECTORS[def.sectorId] : undefined;
const sector: MissionSectorDef | null = trial
  ? {
      id: 'trial',
      districtId: def.districtId,
      name: 'trial',
      area: '',
      rects: trial,
      barricades: [],
      viewMargin: 3,
      hazards: 'inside',
    }
  : (own ?? null);
const rows = arena.layout.map((r) => [...r]);
if (sector) {
  rows.forEach((r, y) =>
    r.forEach((c, x) => {
      if (!rectsContain(sector.rects, x, y)) r[x] = c === '#' ? ':' : ' ';
    }),
  );
  for (const b of sector.barricades) for (const [x, y] of b.tiles) rows[y]![x] = 'B';
  for (const g of sector.gates ?? []) for (const [x, y] of g.tiles) rows[y]![x] = 'G';
}
const put = (x: number, y: number, c: string): void => {
  if (rows[y]?.[x] !== undefined) rows[y]![x] = c;
};
for (const leg of def.legs) {
  if (leg.kind === 'reachMarkers') leg.markers.forEach((m, i) => put(m.x, m.y, String(i + 1)));
  if (leg.kind === 'escapeRoute') put(leg.exit.x, leg.exit.y, 'X');
}
for (const d of def.doors) put(d.x, d.y, 'D');
for (const e of fieldEnemiesOf(def)) put(e.post[0], e.post[1], 'E');
put(def.returnMarker.x, def.returnMarker.y, 'R');
put(def.start[0], def.start[1], 'S');
const leaks = sector ? sectorLeaks(arena.layout, sector) : [];
for (const [x, y] of leaks) put(x, y, '+');
const W = rows[0]!.length;
console.log(
  '    ' + Array.from({ length: W }, (_, x) => (x % 10 === 0 ? String((x / 10) % 10) : ' ')).join(''),
);
rows.forEach((r, y) => console.log(String(y).padStart(3) + ' ' + r.join('')));
if (sector) {
  let tiles = 0;
  for (let y = 0; y < arena.layout.length; y++)
    for (let x = 0; x < W; x++) if (rectsContain(sector.rects, x, y) && arena.layout[y]![x] !== '#') tiles++;
  console.log(`${sector.id}: ${tiles} walkable tiles in the rects; ${leaks.length} leak tiles`);
  // group the leaks into runs along a row or a column (one barricade each)
  const key = new Set(leaks.map(([x, y]) => `${x},${y}`));
  const done = new Set<string>();
  for (const [x, y] of leaks.sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    if (done.has(`${x},${y}`)) continue;
    const run: [number, number][] = [];
    let cx = x;
    while (key.has(`${cx},${y}`) && !done.has(`${cx},${y}`)) run.push([cx++, y]);
    if (run.length === 1) {
      let cy = y + 1;
      while (key.has(`${x},${cy}`) && !done.has(`${x},${cy}`)) run.push([x, cy++]);
    }
    for (const [a, b] of run) done.add(`${a},${b}`);
    console.log(`  run ${JSON.stringify(run)}`);
  }
}
