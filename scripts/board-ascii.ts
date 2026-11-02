// Prints a researched Rumble board (layout + object letters) and its connectivity facts.
//   npx tsx scripts/board-ascii.ts <arenaId> [cover]
import { getArena } from '../src/sim';
import { flood } from '../src/sim/arenas/community/painter';

const id = process.argv[2] ?? 'rumbleMushin';
const a = getArena(id);
const rows = a.layout;
const W = rows[0]!.length;
const H = rows.length;
const kindAt = new Map<number, string>();
for (const r of a.cover ?? [])
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) kindAt.set(y * W + x, r.kind);
const KEY: Record<string, string> = {};
const out: string[] = [];
const head = Array.from({ length: W }, (_, x) => (x % 10 === 0 ? String((x / 10) % 10) : ' ')).join('');
out.push('    ' + head);
rows.forEach((row, y) => {
  let line = '';
  [...row].forEach((c, x) => {
    if (c !== '#') return void (line += c);
    const k = kindAt.get(y * W + x) ?? '?';
    const ch =
      process.argv[3] === 'cover' ? (KEY[k] ??= String.fromCharCode(65 + Object.keys(KEY).length)) : '#';
    line += ch;
  });
  out.push(String(y).padStart(3) + ' ' + line);
});
console.log(out.join('\n'));
if (process.argv[3] === 'cover')
  console.log(
    Object.entries(KEY)
      .map(([k, v]) => `${v}=${k}`)
      .join(' '),
  );
const open = rows.join('').replace(/#/g, '').length;
console.log(`${id} ${W}x${H} open ${((100 * open) / (W * H)).toFixed(1)}%`);
const start = a.spawns[0]!;
const reach = flood(rows, [start.x, start.y]);
const all: number[] = [];
rows.forEach((r, y) => [...r].forEach((c, x) => c !== '#' && all.push(y * W + x)));
console.log(`reachable ${reach.size} / ${all.length} open (crates walkable)`);
const reach2 = flood(rows, [start.x, start.y], true);
console.log(`reachable without blasting any crate: ${reach2.size}`);
const dist = a.districts;
if (dist) console.log(dist.map((d) => `${d.id}:${d.name}`).join(' | '));
