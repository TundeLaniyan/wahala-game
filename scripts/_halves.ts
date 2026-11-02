import { getArena } from '../src/sim';
for (const id of ['rumbleMushin','rumbleFadeyi','rumbleLagosIsland','rumbleLekki','rumbleEbuteMetta']) {
  const a = getArena(id); const W = a.layout[0]!.length; const H = a.layout.length;
  const cnt = (west: boolean, f: (c: string) => boolean) => { let n = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((west ? x < (W - 1) / 2 : x > (W - 1) / 2) && f(a.layout[y]![x]!)) n++; return n; };
  const o1 = cnt(true, (c) => c !== '#'), o2 = cnt(false, (c) => c !== '#');
  const w1 = cnt(true, (c) => c === '#'), w2 = cnt(false, (c) => c === '#');
  const s1 = cnt(true, (c) => c === '$'), s2 = cnt(false, (c) => c === '$');
  const gap = (n: number) => { const s = a.spawns.slice(0, n); let m = 99; for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) m = Math.min(m, Math.abs(s[i]!.x - s[j]!.x) + Math.abs(s[i]!.y - s[j]!.y)); return m; };
  console.log(id.padEnd(18), 'open', o1, o2, ((Math.abs(o1 - o2) / Math.max(o1, o2)) * 100).toFixed(1) + '%', 'wall', w1, w2, ((Math.abs(w1 - w2) / Math.max(w1, w2)) * 100).toFixed(0) + '%', 'supply', s1, s2, 'gaps', gap(8), gap(16), gap(32));
}
