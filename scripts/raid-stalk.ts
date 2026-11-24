/**
 * The rear-approach harness over the REAL raids (task PI-1C, docs/CLASSIC_RAID_REAR.md): for every first-wave enemy
 * of every raid, at each campaign level, a scripted human walks up behind it and lays a generator (scripts/lib/
 * rearStalk.ts), many seeds and start moments. Prints, per level, how many attempts planted, how many were detected
 * before / after the plant, by whom and by which rule.
 *
 *   npx tsx scripts/raid-stalk.ts [--seeds 4] [--raids a,b] [--levels easy,normal,hard] [--watch all|target|none]
 *                                 [--wait 0] [--verbose]
 */
import type { CampaignLevel, RaidId } from '../src/sim';
import { RAIDS, raidWithBots } from './lib/raidAi';
import { stalk } from './lib/rearStalk';
import type { StalkResult, Watch } from './lib/rearStalk';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};

export interface Row {
  attempts: number;
  reachable: number;
  planted: number;
  killed: number;
  timedOut: number;
  detectedBefore: number;
  detectedAfter: number;
  /** by cause, first detection only */
  causes: Record<string, number>;
  /** first detection by the stalked enemy / by another */
  byTarget: number;
  byOther: number;
  exposure: number;
  hpLost: number;
}

export const emptyRow = (): Row => ({
  attempts: 0,
  reachable: 0,
  planted: 0,
  killed: 0,
  timedOut: 0,
  detectedBefore: 0,
  detectedAfter: 0,
  causes: {},
  byTarget: 0,
  byOther: 0,
  exposure: 0,
  hpLost: 0,
});

export function addTo(row: Row, r: StalkResult): void {
  row.attempts++;
  if (r.reachable) row.reachable++;
  if (r.planted) row.planted++;
  if (r.targetKilled) row.killed++;
  if (r.timedOut) row.timedOut++;
  row.exposure += r.exposureTicks;
  row.hpLost += r.humanHpLost;
  const f = r.first;
  if (f) {
    if (f.phase === 'approach') row.detectedBefore++;
    else row.detectedAfter++;
    const k = `${f.cause}/${f.phase}`;
    row.causes[k] = (row.causes[k] ?? 0) + 1;
    if (f.isTarget) row.byTarget++;
    else row.byOther++;
  }
}

/** The first-wave enemy seats of a raid (seat ids). */
export function firstWaveSeats(raidId: RaidId): { id: number; kind: string }[] {
  const { s } = raidWithBots(raidId, 'normal', 1);
  return s.raid!.seats.filter((q) => q.wave === 0).map((q) => ({ id: q.playerId, kind: q.kind }));
}

export function fmt(row: Row): string {
  const c = Object.entries(row.causes)
    .sort()
    .map(([k, v]) => `${k}:${v}`)
    .join(' ');
  return `${row.attempts} att | planted ${row.planted} | killed ${row.killed} | timeout ${row.timedOut} | detected before plant ${row.detectedBefore} | after ${row.detectedAfter} | target/other ${row.byTarget}/${row.byOther} | ${c}`;
}

if (process.argv[1]?.endsWith('raid-stalk.ts')) {
  const SEEDS = Array.from({ length: Number(arg('seeds', '4')) }, (_, i) => i + 1);
  const raids = (arg('raids', RAIDS.join(',')).split(',') as RaidId[]).filter(Boolean);
  const levels = arg('levels', 'easy,normal,hard').split(',') as CampaignLevel[];
  const watch = arg('watch', 'all') as Watch;
  const waitTicks = Number(arg('wait', '0'));
  const verbose = process.argv.includes('--verbose');
  const settle = Number(arg('settle', '0'));
  for (const level of levels) {
    const total = emptyRow();
    for (const raidId of raids) {
      const row = emptyRow();
      for (const seat of firstWaveSeats(raidId))
        for (const seed of SEEDS)
          for (const warmup of [0, 150, 400]) {
            const r = stalk({
              raidId,
              level,
              seed,
              target: seat.id,
              watch,
              waitTicks,
              warmup,
              settleTicks: settle,
            });
            addTo(row, r);
            addTo(total, r);
            if (verbose && r.first)
              console.log(
                `  ${raidId} ${level} seed ${seed} warm ${warmup} target ${seat.id} ${seat.kind}: ${JSON.stringify(r.first)}`,
              );
          }
      console.log(`${level} ${raidId}: ${fmt(row)}`);
    }
    console.log(`== ${level} ALL (${watch}, wait ${waitTicks}): ${fmt(total)}\n`);
  }
}
