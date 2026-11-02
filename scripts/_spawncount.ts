import { getArena } from '../src/sim';
const a = getArena(process.argv[2]!);
console.log(a.id, 'spawns', a.spawns.length, 'cover rects', a.cover?.length);
