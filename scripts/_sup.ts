import { getArena } from '../src/sim';
const a = getArena(process.argv[2]!); const W = a.layout[0]!.length;
const t: string[] = [];
a.layout.forEach((r, y) => [...r].forEach((c, x) => c === '$' && t.push(`${x},${y}${x < (W - 1) / 2 ? 'W' : x > (W - 1) / 2 ? 'E' : 'C'}`)));
console.log(t.join(' '));
