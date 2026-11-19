/**
 * Ojuelegba finale audit (docs/CAMPAIGN_SECTOR_AI.md "Part: Ojuelegba finale", decisions FN1-FN10):
 *
 *   npx tsx scripts/finale-audit.ts                       # 6 seeds, missions 19-21, Easy / Normal / Hard
 *   npx tsx scripts/finale-audit.ts --seeds 10 --only ojuelegba.junction --level normal
 *
 * Missions 19 and 20: the scripted generator plan of scripts/lib/fieldFight.ts against the real enemy bots (seeds 1..N).
 * Mission 21: the boss harness of scripts/lib/bossFight.ts, generator plan and pure punching (seeds 101, 118, ...).
 * Prints wins of runs, the median clear time of the wins, the mean lives used and every run's outcome.
 */
import type { CampaignLevel } from '../src/sim';
import { runBossFight } from './lib/bossFight';
import type { BossStrategy } from './lib/bossFight';
import { runFieldFight } from './lib/fieldFight';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const seeds = Number(arg('seeds') ?? 6);
const only = arg('only');
const levels: CampaignLevel[] = arg('level') ? [arg('level') as CampaignLevel] : ['easy', 'normal', 'hard'];

const median = (xs: number[]): string => {
  if (xs.length === 0) return '-';
  const s = [...xs].sort((a, b) => a - b);
  return String(s[Math.floor(s.length / 2)]!);
};

interface Run {
  result: string;
  seconds: number;
  livesUsed: number;
  legs: number;
}

const row = (mission: string, level: string, plan: string, runs: Run[]): string => {
  const wins = runs.filter((r) => r.result === 'won');
  const lives = runs.reduce((a, r) => a + r.livesUsed, 0) / runs.length;
  return [
    mission,
    level,
    plan,
    `${wins.length}/${runs.length}`,
    median(wins.map((r) => r.seconds)),
    lives.toFixed(1),
    runs.map((r) => `${r.result[0]}${r.seconds}/l${r.legs}`).join(' '),
  ].join(' | ');
};

console.log(`finale audit: ${seeds} seeds per cell`);
console.log(
  'mission | level | plan | wins | median win s | lives used | outcomes (result, seconds, legs or phases)',
);
for (const fieldId of ['ojuelegba.return', 'ojuelegba.junction']) {
  if (only && only !== fieldId) continue;
  for (const level of levels) {
    const runs: Run[] = [];
    for (let k = 1; k <= seeds; k++) runs.push(runFieldFight({ fieldId, level, seed: k }));
    console.log(row(fieldId, level, 'generator', runs));
  }
}
if (!only || only === 'ojuelegba.boss') {
  for (const level of levels) {
    for (const strategy of ['generator', 'punch'] as BossStrategy[]) {
      if (strategy === 'punch' && level !== 'normal') continue;
      const runs: Run[] = [];
      for (let k = 0; k < (strategy === 'punch' ? Math.min(3, seeds) : seeds); k++) {
        const r = runBossFight({ id: 'ojuelegba', level, strategy, seed: 101 + k * 17 });
        runs.push({ result: r.result, seconds: r.seconds, livesUsed: r.livesUsed, legs: r.phasesCleared });
      }
      console.log(row('ojuelegba.boss', level, strategy, runs));
    }
  }
}
