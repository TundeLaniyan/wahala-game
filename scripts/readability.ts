/** Readability probes (docs/CAMPAIGN_COMBAT_RELIABILITY.md): `npx tsx scripts/readability.ts [level] [fieldId ...]`. */
import { FIELD_MISSION_IDS } from '../src/sim';
import type { CampaignLevel } from '../src/sim';
import { chaseProbe, patrolTrace, rig } from './lib/readability';

const level = (process.argv[2] ?? 'normal') as CampaignLevel;
const ids =
  process.argv.length > 3
    ? process.argv.slice(3)
    : [...FIELD_MISSION_IDS].filter((i) => !i.startsWith('ojuelegba'));
let n = 0,
  chased = 0,
  sumChase = 0,
  hurt = 0,
  walkSum = 0,
  humanSum = 0,
  caught = 0;
for (const fieldId of ids) {
  const r = rig(fieldId, level, 1);
  const trace = patrolTrace(fieldId, level, 1, 60);
  const patrollers = trace.filter((t) => t.laps > 0 && t.movingShare > 0.3).length;
  console.log(
    `${fieldId}: ${r.state.players.length - 1} enemies, ${patrollers} patrol (moving), ${trace.filter((t) => t.tiles <= 2).length} stand`,
  );
  for (const p of r.state.players.filter((q) => q.id !== 0)) {
    for (const seed of [1, 2]) {
      try {
        const c = chaseProbe(fieldId, level, seed, p.id, { startGap: 5 });
        n++;
        if (c.noticed) {
          chased++;
          sumChase += c.chaseSec ?? 40;
          hurt += c.hurt > 0 ? 1 : 0;
          if (c.minGap <= 1) caught++;
          walkSum += c.walkTilesPerSec;
          humanSum += c.humanTilesPerSec;
        }
        if (process.env.VERBOSE) console.log('  ', seed, JSON.stringify(c));
      } catch {
        /* no tile at that gap */
      }
    }
  }
}
console.log(
  `\n${level}: probes ${n}, pursued ${chased}, mean chase ${(sumChase / Math.max(1, chased)).toFixed(1)} s, human hurt in ${hurt}, reached adjacent ${caught}, mean pursuer walk ${(walkSum / Math.max(1, chased)).toFixed(1)} t/s vs human ${(humanSum / Math.max(1, chased)).toFixed(1)} t/s`,
);
