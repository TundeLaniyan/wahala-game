import { getArena } from '../src/sim';
for (const id of ['rumbleMushin','rumbleFadeyi','rumbleLagosIsland','rumbleLekki','rumbleEbuteMetta','rumbleOjuelegba','rumbleOshodi']) {
  const a = getArena(id);
  const gap = (n: number) => { const s = a.spawns.slice(0, n); let m = 99; for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) m = Math.min(m, Math.abs(s[i]!.x - s[j]!.x) + Math.abs(s[i]!.y - s[j]!.y)); return m; };
  const open = a.layout.join('').replace(/#/g, '').length;
  console.log(id.padEnd(18), 'spawns', a.spawns.length, 'gaps 8/16/32:', gap(8), gap(16), gap(32), 'open', open);
}
