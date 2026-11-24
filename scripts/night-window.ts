/**
 * NIGHT REAR WINDOWS (task FU2-B1, docs/NIGHT_RAID_REAR_REVIEW.md): the dwell probe on the real Records Vault night raid,
 * the decision PI7 grace on (shipped) or off (`--grace 0` = production before), night rules or the day-rule control
 * (`--day`). One run per window gives the engagement tick, so "within 0.5 / 0.75 / 1 / 1.5 s" is read off one pass.
 *
 *   npx tsx scripts/night-window.ts [--levels easy,normal,hard] [--seeds 6] [--step 45] [--max 1800] [--grace N] [--day]
 *                                   [--react N] [--raid recordsVault] [--verbose]
 */
import type { CampaignLevel, RaidId } from '../src/sim';
import { nightWindow } from './lib/nightProbe';
import type { NightWindow } from './lib/nightProbe';
import { firstWaveSeats } from './raid-stalk';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const DWELLS = [30, 45, 60, 90];
const raid = arg('raid', 'recordsVault') as RaidId;
const levels = arg('levels', 'easy,normal,hard').split(',') as CampaignLevel[];
const seeds = Array.from({ length: Number(arg('seeds', '6')) }, (_, i) => i + 1);
const step = Number(arg('step', '45'));
const max = Number(arg('max', '1800'));
const grace = arg('grace', '') === '' ? undefined : Number(arg('grace', '0'));
const night = !process.argv.includes('--day');
const react = Number(arg('react', '-1'));
const dwellTotal = Number(arg('dwell', '90'));
const verbose = process.argv.includes('--verbose');

const pct = (a: number, b: number): string => (b ? `${Math.round((100 * a) / b)}%` : '-');
for (const level of levels) {
  const ws: NightWindow[] = [];
  for (const seat of firstWaveSeats(raid))
    for (const seed of seeds)
      for (let t0 = 0; t0 <= max; t0 += step) {
        const w = nightWindow({
          raidId: raid,
          level,
          seed,
          target: seat.id,
          t0,
          dwell: dwellTotal,
          night,
          ...(grace !== undefined ? { grace } : {}),
          ...(react >= 0 ? { reactTicks: react } : {}),
        });
        if (!w.eligible) continue;
        ws.push(w);
        if (verbose && w.first)
          console.log(
            `  ${level} s${seed} seat ${seat.id} t0 ${t0}: ${JSON.stringify(w.first)} revealed ${w.revealed}`,
          );
      }
  const rev = ws.filter((w) => w.revealed);
  const cols = DWELLS.map((d) => {
    const within = (l: NightWindow[]): number => l.filter((w) => w.first && w.first.tick < d).length;
    return `${(d / 60).toFixed(2)}s: all ${pct(within(ws), ws.length)} revealed ${pct(within(rev), rev.length)}`;
  });
  const causes: Record<string, number> = {};
  for (const w of ws) if (w.first) causes[w.first.cause] = (causes[w.first.cause] ?? 0) + 1;
  const turnedFirst = ws.filter((w) => w.first && w.first.sinceTurn >= 0).length;
  console.log(
    `${night ? 'NIGHT' : 'DAY-RULES'} grace=${grace ?? 'shipped'} ${level}: windows ${ws.length} (revealed by a turn ${rev.length}) | ${cols.join(' | ')} | engaged at all ${ws.filter((w) => w.first).length} | engaged after a guard turn ${turnedFirst} | causes ${JSON.stringify(causes)}`,
  );
}
