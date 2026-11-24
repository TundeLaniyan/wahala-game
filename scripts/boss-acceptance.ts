/**
 * BOSS ACCEPTANCE TABLE (task FU2-B3, docs/BOSS_ACCEPTANCE_FU2.md): every campaign boss mission (the six district bosses
 * and the Ojuelegba finale) at Easy / Normal / Hard, played start to finish with the REAL crew bots by the scripted fair
 * and slow players of docs/BOSS_BALANCE.md (scripts/lib/bossHuman.ts), many seeds per cell. Prints, per cell: wins, mean fight
 * time of the wins, lives lost, windows missed and boss hits, and flags cells that are trivially easy or hardly winnable.
 *
 *   npx tsx scripts/boss-acceptance.ts [--seeds 16] [--ids oshodi,mushin] [--levels easy,normal,hard] [--players fair,slow]
 *                                      [--agent]   (also the generator-strategy agent of scripts/lib/bossFight.ts)
 */
import { CAMPAIGN_MISSION_IDS } from '../src/sim';
import type { CampaignLevel, MissionId } from '../src/sim';
import { runBossFight } from './lib/bossFight';
import { BOSS_HUMAN, SLOW_BOSS_HUMAN, runBossMeasure } from './lib/bossHuman';
import type { BossMeasureResult } from './lib/bossHuman';

const arg = (name: string, d: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const seedsN = Number(arg('seeds', '16'));
const ids = arg('ids', '') ? (arg('ids', '').split(',') as MissionId[]) : [...CAMPAIGN_MISSION_IDS];
const levels = arg('levels', 'easy,normal,hard').split(',') as CampaignLevel[];
const players = arg('players', 'fair,slow')
  .split(',')
  .filter((p) => p !== 'none');
const agent = process.argv.includes('--agent');
const maxSec = Number(arg('max', '0'));

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f1 = (n: number): string => (Number.isNaN(n) ? '-' : n.toFixed(1));

console.log(`boss acceptance: ${seedsN} seeds per cell (101 + 17 k)`);
console.log(
  'boss | level | player | wins | mean s (wins) | min-max s | lives lost | windows missed | boss hits | flag',
);
for (const id of ids)
  for (const level of levels)
    for (const player of players) {
      const rs: BossMeasureResult[] = [];
      for (let k = 0; k < seedsN; k++)
        rs.push(
          runBossMeasure({
            id,
            level,
            seed: 101 + k * 17,
            human: player === 'slow' ? SLOW_BOSS_HUMAN : BOSS_HUMAN,
            ...(maxSec > 0 ? { maxSec } : {}),
          }),
        );
      const wins = rs.filter((r) => r.result === 'won');
      const t = wins.map((r) => r.seconds);
      const rate = wins.length / rs.length;
      const lives = mean(rs.map((r) => r.deaths));
      const flags: string[] = [];
      if (rate < 0.5) flags.push('HARD-TO-WIN');
      if (rate === 1 && lives < 0.1) flags.push('NO-RISK');
      if (wins.length > 0 && mean(t) < 45) flags.push('SHORT');
      console.log(
        [
          id,
          level,
          player,
          `${wins.length}/${rs.length}`,
          f1(mean(t)),
          t.length ? `${Math.min(...t).toFixed(0)}-${Math.max(...t).toFixed(0)}` : '-',
          f1(lives),
          f1(mean(rs.map((r) => r.windowsMissed))),
          f1(mean(rs.map((r) => r.bossHits))),
          flags.join(' ') || 'ok',
        ].join(' | '),
      );
    }
if (agent) {
  console.log(
    '\nagent (generator strategy, scripts/lib/bossFight.ts)\nboss | level | wins | median s | lives used',
  );
  for (const id of ids)
    for (const level of levels) {
      const rs = Array.from({ length: seedsN }, (_, k) =>
        runBossFight({
          id,
          level,
          strategy: 'generator',
          seed: 101 + k * 17,
          ...(maxSec > 0 ? { maxSec } : {}),
        }),
      );
      const w = rs.filter((r) => r.result === 'won');
      const s = w.map((r) => r.seconds).sort((a, b) => a - b);
      console.log(
        `${id} | ${level} | ${w.length}/${rs.length} | ${s.length ? s[Math.floor(s.length / 2)] : '-'} | ${f1(mean(rs.map((r) => r.livesUsed)))}`,
      );
    }
}
