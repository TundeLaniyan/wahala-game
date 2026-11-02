import { getArena } from '../src/sim';
const a = getArena(process.argv[2]!);
const rows = a.layout.map((r) => r.split(''));
a.spawns.forEach((s, i) => { rows[s.y]![s.x] = i < 10 ? String(i) : String.fromCharCode(87 + i); });
console.log(rows.map((r, y) => String(y).padStart(2) + ' ' + r.join('')).join('\n'));
