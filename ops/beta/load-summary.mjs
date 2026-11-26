// Summarises one load run: node load-summary.mjs <run folder> (reads samples.jsonl). Used by load.sh.
import fs from 'node:fs'; const dir = process.argv[2];
const rows = fs.readFileSync(dir + '/samples.jsonl', 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const mb = (s) => { const m = /([\d.]+)\s*(MiB|GiB|KiB|B)/.exec(s); if (!m) return null; return Number(m[1]) * ({ GiB: 1024, MiB: 1, KiB: 1 / 1024, B: 1 / 1048576 })[m[2]]; };
const per = {};
for (const r of rows) for (const part of String(r.stats).split(';').filter(Boolean)) {
  const [name, cpu, mem] = part.split(' '); const svc = name.replace(/^.*-(rumble|platform|db|edge)-1$/, '$1');
  (per[svc] ??= []).push({ t: r.t, cpu: parseFloat(cpu), mem: mb(mem) });
}
const max = (a) => Math.max(...a), avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`samples: ${rows.length} over ${rows.length ? rows.at(-1).t - rows[0].t : 0} s   (CPU % are per container; 100 % = one core)`);
for (const [svc, a] of Object.entries(per)) {
  const cpu = a.map((x) => x.cpu).filter(Number.isFinite), mem = a.map((x) => x.mem).filter(Number.isFinite);
  console.log(`${svc.padEnd(9)} cpu avg ${avg(cpu).toFixed(0)}% max ${max(cpu).toFixed(0)}%   mem first ${mem[0]?.toFixed(0)} MB, max ${max(mem).toFixed(0)} MB, last ${mem.at(-1)?.toFixed(0)} MB`);
}
const rm = rows.map((r) => r.rumble).filter((m) => m && m.limits);
if (rm.length) {
  const mx = (f) => max(rm.map(f).filter(Number.isFinite));
  const rooms = rm.flatMap((m) => m.rooms ?? []);
  console.log(`match server: playing rooms max ${mx((m) => m.limits.playingRooms)}, connections max ${mx((m) => m.limits.connections)}, capacity cost in use max ${mx((m) => m.limits.costInUse)} of CPU budget ${rm[0].limits.cpuBudget}`);
  console.log(`  process: RSS max ${(mx((m) => m.process.memoryUsage.rss) / 1048576).toFixed(0)} MB, event-loop delay p99 max ${mx((m) => m.process.eventLoopDelayMs.p99)} ms, cpu (server's own reading) max ${mx((m) => m.process.cpuPercentSinceLastRead)} %`);
  if (rooms.length) {
    const rx = (f) => max(rooms.map(f).filter(Number.isFinite));
    console.log(`  rooms: tick step p99 max ${rx((r) => r.ticks.stepMs.p99)} ms, timer lateness p99 max ${rx((r) => r.ticks.timerLatenessMs.p99)} ms (a tick is 16.7 ms), DROPPED TICKS ${rx((r) => r.ticks.dropped)}, bot takeovers ${rx((r) => r.net.botTakeovers)}, reconnections ${rx((r) => r.net.reconnections)}, drops ${rx((r) => r.net.drops)}, kicks ${rx((r) => r.net.kicks)}, invalid messages ${rx((r) => r.net.invalidMessages)}`);
  }
  const ref = {}; for (const m of rm) for (const [k, v] of Object.entries(m.limits.refused ?? {})) ref[k] = Math.max(ref[k] ?? 0, v);
  console.log(`  refused by the capacity guard: ${JSON.stringify(ref)}`);
}
const dbc = rows.map((r) => Number(r.dbConnections)).filter(Number.isFinite);
if (dbc.length) console.log(`PostgreSQL connections (limit 40 in compose): max ${max(dbc)}, last ${dbc.at(-1)}`);
