// Scripted full-mission playthroughs of campaign field missions (scripts/lib/generatorPlaythrough.ts): completion rate,
// play time, lives, generators and blast defeats per mission and level. Usage:
//   npx tsx scripts/field-play.ts [fieldId ...] [--seeds N] [--levels easy,normal,hard]
import { FIELD_MISSION_IDS } from '../src/sim';
import type { CampaignLevel } from '../src/sim';
import { playFieldMission } from './lib/generatorPlaythrough';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const seeds = Number(flag('--seeds') ?? 6);
const levels = (flag('--levels') ?? 'easy,normal,hard').split(',') as CampaignLevel[];
const ids = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const verbose = args.includes('--verbose');
for (const id of ids.length > 0 ? ids : FIELD_MISSION_IDS) {
  for (const level of levels) {
    const runs = Array.from({ length: seeds }, (_, i) => playFieldMission(id, { level, seed: i + 1 }));
    const won = runs.filter((r) => r.result === 'won');
    const mean = (f: (r: (typeof runs)[number]) => number, list = won): number =>
      list.length ? Math.round(list.reduce((a, r) => a + f(r), 0) / list.length) : 0;
    console.log(
      `${id} ${level}: won ${won.length}/${runs.length}; field ${mean((r) => r.fieldSec)} s, raid ${mean((r) => r.raidSec)} s, lives ${(won.reduce((a, r) => a + r.livesUsed, 0) / Math.max(1, won.length)).toFixed(1)}, gens ${mean((r) => r.generatorsLaid, runs)}, punches ${mean((r) => r.punches, runs)}, defeats ${mean((r) => r.enemiesDefeated, runs)} (blast ${mean((r) => r.blastDefeats, runs)}), dmg ${(runs.reduce((a, r) => a + r.damageTaken, 0) / runs.length).toFixed(1)}; results ${runs.map((r) => `${r.result[0]}${r.legsCleared}`).join(' ')}`,
    );
    const legs = won[0]?.legSec.map((_, k) => mean((r) => r.legSec[k] ?? 0)) ?? [];
    console.log(`    legs (s, mean of wins): ${legs.join(' / ')}`);
    if (verbose) for (const r of runs) console.log('   ', JSON.stringify(r));
  }
}
