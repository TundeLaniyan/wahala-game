// Re-measures the reliability targets of a campaign area's mission (docs/CAMPAIGN_WORLD.md "Measurements"): the human-like
// bait on the default target (first try / within two, Normal), the plain-sight fairness probe and, for Terminal Approach, the
// human-like Oshodi flow. The same harnesses and seeds as tests/campaign-reliability-*.test.ts, printed as numbers.
//   npx tsx scripts/campaign-area-check.ts [fieldIds comma-separated] [seeds]
import { runTrap } from './lib/humanTrap';
import { playOshodiFlow } from './lib/oshodiFlow';
import type { CampaignLevel } from '../src/sim';

const [idArg = 'oshodi.approach,oshodi.railEdge', seedArg = '8', what = 'bait,plain,flow'] =
  process.argv.slice(2);
const seeds = Array.from({ length: Number(seedArg) }, (_, i) => i + 1);
const parts = what.split(',');
for (const fieldId of idArg.split(',')) {
  if (parts.includes('bait')) {
    const rs = seeds.map((seed) =>
      runTrap({ fieldId, level: 'normal', seed, strategy: 'bait', model: { attempts: 2 } }),
    );
    console.log(
      `${fieldId} bait normal: first ${rs.filter((r) => r.first).length}/${rs.length}, within two ${rs.filter((r) => r.within).length}/${rs.length} (target ${rs[0]?.target})`,
    );
  }
  if (parts.includes('plain')) {
    const rs = seeds
      .slice(0, 4)
      .map((seed) => runTrap({ fieldId, level: 'normal', seed, strategy: 'plain', model: { attempts: 1 } }));
    console.log(
      `${fieldId} plain sight: ${rs.filter((r) => r.first).length}/${rs.length} caught (fairness: <= 1)`,
    );
  }
}
if (parts.includes('flow')) {
  for (const [level, n] of [
    ['easy', 8],
    ['normal', 8],
    ['hard', 20],
  ] as [CampaignLevel, number][]) {
    const rs = Array.from({ length: n }, (_, i) => playOshodiFlow(level, i + 1));
    console.log(
      `oshodi flow ${level}: won ${rs.filter((r) => r.won).length}/${n}, warden trapped ${rs.filter((r) => r.agberoBlastKills > 0).length}/${n}, mean ${(rs.reduce((a, r) => a + r.seconds, 0) / n).toFixed(0)} s`,
    );
  }
}
