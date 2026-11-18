/**
 * Boss-fight audit (docs/CAMPAIGN_SECTOR_AI.md "Bosses", decisions BX1-):
 *
 *   npm run boss-audit                         # 3 seeds, every boss, Easy / Normal / Hard, generator and punch
 *   npm run boss-audit -- --seeds 6 --only mushin --strategy generator --max 420
 *
 * A scripted human with ordinary intents (scripts/lib/bossFight.ts) plays each campaign boss mission against the real
 * boss and crew bots. Prints wins of runs, the median clear time of the wins, lives used, exposures and boss hits.
 */
import { MISSION_IDS } from '../src/sim';
import type { CampaignLevel, MissionId } from '../src/sim';
import { runBossFight } from './lib/bossFight';
import type { BossRunResult, BossStrategy } from './lib/bossFight';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const seeds = Number(arg('seeds') ?? 3);
const only = arg('only') as MissionId | undefined;
const strategies: BossStrategy[] = arg('strategy')
  ? [arg('strategy') as BossStrategy]
  : ['generator', 'punch'];
const levels: CampaignLevel[] = arg('level') ? [arg('level') as CampaignLevel] : ['easy', 'normal', 'hard'];
const maxSec = arg('max') ? Number(arg('max')) : undefined;
const legacy = process.argv.includes('--legacy');

const median = (xs: number[]): number => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

console.log(`boss audit${legacy ? ' (legacy verbs)' : ''}: ${seeds} seeds per cell`);
console.log('boss | level | strategy | wins | median win s | lives used | exposures | boss hits | outcomes');
for (const id of MISSION_IDS) {
  if (only && only !== id) continue;
  for (const level of levels) {
    for (const strategy of strategies) {
      const runs: BossRunResult[] = [];
      for (let k = 0; k < seeds; k++)
        runs.push(runBossFight({ id, level, strategy, seed: 101 + k * 17, maxSec, legacy }));
      const wins = runs.filter((r) => r.result === 'won');
      const sum = (f: (r: BossRunResult) => number): number => runs.reduce((a, r) => a + f(r), 0);
      console.log(
        [
          id,
          level,
          strategy,
          `${wins.length}/${runs.length}`,
          Number.isNaN(median(wins.map((r) => r.seconds))) ? '-' : String(median(wins.map((r) => r.seconds))),
          (sum((r) => r.livesUsed) / runs.length).toFixed(1),
          (sum((r) => r.exposures) / runs.length).toFixed(1),
          (sum((r) => r.bossHits) / runs.length).toFixed(1),
          runs.map((r) => `${r.result[0]}${r.seconds}/p${r.phasesCleared}`).join(' '),
        ].join(' | '),
      );
    }
  }
}
