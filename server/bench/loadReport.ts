/* eslint-disable @typescript-eslint/no-explicit-any -- the run JSONs are untyped records by design */
/**
 * Turns the run JSONs in docs/measurements/rumble-online/ into the markdown tables of LOAD_RESULTS.md.
 * Usage: npm run load:report [-- --dir docs/measurements/rumble-online]   (prints to stdout)
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const dirArg = process.argv.indexOf('--dir');
const DIR = path.resolve(
  dirArg > 0 ? process.argv[dirArg + 1]! : path.join(HERE, '../../docs/measurements/rumble-online'),
);

const runs: any[] = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(path.join(DIR, f), 'utf8')))
  .sort((a, b) => a.meta.label.localeCompare(b.meta.label));

const table = (head: string[], rows: (string | number)[][]): string =>
  [
    `| ${head.join(' | ')} |`,
    `|${head.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');

const yn = (b: boolean): string => (b ? 'yes' : '**NO**');
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

function elimCell(r: any): string {
  const c = r.consistency;
  const m = sum(c.map((x: any) => x.eliminations.missedUnexplained));
  const g = sum(c.map((x: any) => x.eliminations.missedInGap));
  const d = sum(c.map((x: any) => x.eliminations.duplicated));
  const e = sum(c.map((x: any) => x.explosions.missedUnexplained));
  const eg = sum(c.map((x: any) => x.explosions.missedInGap));
  const ed = sum(c.map((x: any) => x.explosions.duplicated));
  const u = sum(c.map((x: any) => x.eliminations.union));
  const ue = sum(c.map((x: any) => x.explosions.union));
  return `${m}${g ? `+${g}gap` : ''} / ${d} of ${u}; expl ${e}${eg ? `+${eg}gap` : ''} / ${ed} of ${ue}`;
}

function resultsCell(r: any): string {
  const c = r.consistency;
  const ok = r.allConsistent;
  const kills = sum(c.map((x: any) => x.resultsKillsSum ?? 0));
  const credited = sum(c.map((x: any) => x.eliminationEventsCredited));
  return `${yn(ok)} (kills ${kills}/${credited})`;
}

const out: string[] = [];
const section = (
  title: string,
  filter: (r: any) => boolean,
  rows: (r: any) => (string | number)[],
  head: string[],
): void => {
  const sel = runs.filter(filter);
  if (!sel.length) return;
  out.push(`\n### ${title}\n`, table(head, sel.map(rows)));
};

const playerHead = [
  'run',
  'clients',
  'server CPU % mean / p95 / max',
  'RSS MB mean / max',
  'step ms mean / p99 / p99 worst / max',
  'lateness ms p99 / worst / max',
  'ticks dropped',
  'KB/s down, up per client (proxy)',
  'frames KB/s per client (server count)',
  'egress KB/s',
];
const playerRow = (r: any): (string | number)[] => [
  r.meta.label,
  `${r.clients.played}/${r.clients.configured}`,
  `${r.server.cpuPercentOfOneCore.mean} / ${r.server.cpuPercentOfOneCore.p95} / ${r.server.cpuPercentOfOneCore.max}`,
  `${r.server.rssMB.mean} / ${r.server.rssMB.max}`,
  `${r.server.stepMs.mean} / ${r.server.stepMs.p99Median} / ${r.server.stepMs.p99Worst} / ${r.server.stepMs.max}`,
  `${r.server.timerLatenessMs.p99Median} / ${r.server.timerLatenessMs.p99Worst} / ${r.server.timerLatenessMs.max}`,
  r.server.ticksDropped,
  `${r.clients.kbDownPerSec.mean}, ${r.clients.kbUpPerSec.mean}`,
  (
    r.server.rooms.reduce((a: number, x: any) => a + x.framesBytesPerClient / 1024 / (x.ticksRun / 60), 0) /
    r.server.rooms.length
  ).toFixed(2),
  r.clients.totalDownKBps,
];
const expHead = [
  'run',
  'RTT ms p50 / p95',
  'input to visible ms p50 / p95 (n)',
  'tick lag ms p50 / p95',
  'buffer ticks p50 / p95 / max',
  'hash checks / mismatches',
  'resyncs',
  'skippedAhead',
  'missed / dup eliminations; explosions',
  'consistent (results kills / credited elims)',
  'client procs CPU % / loop max ms',
];
const expRow = (r: any): (string | number)[] => [
  r.meta.label,
  `${r.clients.rttMs.p50} / ${r.clients.rttMs.p95}`,
  `${r.clients.inputLatencyMs.p50} / ${r.clients.inputLatencyMs.p95} (${r.clients.inputLatencyMs.n})`,
  `${r.clients.tickLagMs.p50} / ${r.clients.tickLagMs.p95}`,
  `${r.clients.bufferTicks.p50} / ${r.clients.bufferTicks.p95} / ${r.clients.bufferTicks.max}`,
  `${r.clients.hashChecks} / ${r.clients.hashMismatches}`,
  r.clients.resyncs,
  r.clients.skippedAhead,
  elimCell(r),
  resultsCell(r),
  r.workerProcesses.map((w: any) => `${w.cpuPercent} / ${w.loopDelayMs.max}`).join('; '),
];

const basic = (r: any): boolean => r.meta.scenario === 'basic' && r.meta.rooms === 1;
section(
  'Server and bandwidth: one room, clean network and impairment profiles',
  basic,
  playerRow,
  playerHead,
);
section('Client experience and consistency: one room', basic, expRow, expHead);

const activeCpu = (r: any): string => {
  // seconds in which the server was clearly working: median / p95 / max of the per-second CPU % (idle seconds left out)
  const v: number[] = r.timeline
    .map((t: any) => t.cpu)
    .filter((c: number) => c > 8)
    .sort((a: number, b: number) => a - b);
  const q = (p: number): number => v[Math.min(v.length - 1, Math.floor(v.length * p))] ?? NaN;
  return `${q(0.5)} / ${q(0.95)} / ${v[v.length - 1]}`;
};
const capHead = [
  'run',
  'rooms x humans',
  'server CPU % (busy seconds) median / p95 / max',
  'RSS MB max',
  'step ms mean / p99 / worst / max',
  'lateness ms p99 / worst / max',
  'ticks dropped',
  'loop delay p99 worst ms',
  'client p95: RTT / input / lag ms',
  'rooms finished',
  'consistent',
  'foreign CPU %',
];
const capRow = (r: any): (string | number)[] => [
  r.meta.label,
  `${r.meta.rooms} x ${r.meta.humansPerRoom}`,
  activeCpu(r),
  r.server.rssMB.max,
  `${r.server.stepMs.mean} / ${r.server.stepMs.p99Median} / ${r.server.stepMs.p99Worst} / ${r.server.stepMs.max}`,
  `${r.server.timerLatenessMs.p99Median} / ${r.server.timerLatenessMs.p99Worst} / ${r.server.timerLatenessMs.max}`,
  r.server.ticksDropped,
  r.server.eventLoopDelayMs.p99Worst,
  `${r.clients.rttMs.p95} / ${r.clients.inputLatencyMs.p95} / ${r.clients.tickLagMs.p95}`,
  `${r.consistency.filter((c: any) => c.clientsCompared > 0).length}/${r.meta.rooms}`,
  yn(r.allConsistent),
  r.foreignCpuPercent ?? 'n/a',
];
section(
  'Capacity: K rooms of 2 humans + 30 bots (K=1 is the 2-client run above)',
  (r) => r.meta.scenario === 'basic' && r.meta.rooms > 1 && r.meta.humansPerRoom === 2,
  capRow,
  capHead,
);
section(
  'Capacity: K rooms of 32 humans (no bots)',
  (r) => r.meta.scenario === 'basic' && r.meta.rooms > 1 && r.meta.humansPerRoom === 32,
  (r) => [
    ...capRow(r),
    r.workerProcesses.map((w: any) => `${w.cpuPercent}/${w.loopDelayMs.max}`).join('; '),
    r.clients.kbDownPerSec.mean,
  ],
  [...capHead, 'client procs CPU % / loop max ms', 'KB/s down each'],
);
section(
  'Reconnection',
  (r) => r.meta.scenario === 'reconnect',
  (r) => [
    r.meta.label,
    JSON.stringify(
      r.reconnects.map((x: any) => [
        x.index,
        x.returned,
        x.reconnectCallMs,
        x.keyframeMs,
        x.consistentMs,
        x.finalHashOk,
      ]),
    ),
  ],
  ['run', '[client, returned, reconnect() ms, keyframe ms, first hash-checked ms, final hash ok]'],
);
section(
  'App switching',
  (r) => r.meta.scenario === 'background',
  (r) => [
    r.meta.label,
    JSON.stringify(
      r.backgrounds.map((x: any) => [
        x.index,
        x.peakBuffer,
        x.bufferAtResume,
        x.catchUpMs,
        x.skippedAheadDelta,
        x.hashMismatchesDelta,
        x.finalHashOk,
      ]),
    ),
  ],
  [
    'run',
    '[client, peak buffer, buffer at resume, catch-up ms, skippedAhead, hash mismatches, final hash ok]',
  ],
);
console.log(out.join('\n'));
