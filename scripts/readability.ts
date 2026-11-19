/**
 * Readability probes (docs/CAMPAIGN_COMBAT_RELIABILITY.md): `npx tsx scripts/readability.ts [level] [fieldId ...]`.
 * Per mission: how many ordinary roaming enemies walk a patrol route; over all disengage probes (the human stands 5 walking
 * tiles from an enemy until it pursues, then runs to the farthest reachable tile): pursuit speed against the human's, how
 * often the pursuer reaches an adjacent tile or hurts the human, how long the chase lasts, and how soon the enemy is back on
 * its route. `VERBOSE=1` prints every probe. `SEEDS=2` (default) probes per enemy; `RUNNER=legacy` plays the first version of the runner.
 */
import { FIELD_MISSION_IDS } from '../src/sim';
import type { CampaignLevel } from '../src/sim';
import { chaseProbe, patrolTrace, rig } from './lib/readability';

const level = (process.argv[2] ?? 'normal') as CampaignLevel;
const ids =
  process.argv.length > 3
    ? process.argv.slice(3)
    : [...FIELD_MISSION_IDS].filter((i) => !i.startsWith('ojuelegba'));
const runner = process.env.RUNNER === 'legacy' ? 'legacy' : 'committed';
const seeds = Array.from({ length: Number(process.env.SEEDS ?? 2) }, (_, i) => i + 1);
const ROAMERS = new Set(['agbero', 'areaBoy', 'marketEnforcer', 'routeMarshal', 'ringSecurity']);
const median = (a: number[]): number =>
  a.length === 0 ? 0 : [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!;
const pct = (a: number[], q: number): number =>
  a.length === 0 ? 0 : [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))]!;
let n = 0,
  chased = 0,
  hurt = 0,
  hurtByIt = 0,
  walkSum = 0,
  humanSum = 0,
  caught = 0,
  roamers = 0,
  roamersPatrolling = 0;
const chaseSecs: number[] = [];
const backSecs: number[] = [];
let neverBack = 0;
for (const fieldId of ids) {
  const r = rig(fieldId, level, 1);
  const trace = patrolTrace(fieldId, level, 1, 60);
  const enemies = r.state.players.filter((q) => q.id !== 0);
  const moving = trace.filter((t) => t.laps > 0 && t.movingShare > 0.3).length;
  let missionRoamers = 0;
  let missionPatrolling = 0;
  enemies.forEach((q, i) => {
    if (!ROAMERS.has(q.enemyVariant ?? '')) return;
    missionRoamers++;
    const t = trace[i]!;
    if (t.tiles >= 6 && t.movingShare > 0.3) missionPatrolling++;
  });
  roamers += missionRoamers;
  roamersPatrolling += missionPatrolling;
  console.log(
    `${fieldId}: ${enemies.length} enemies, ${moving} moving patrol, ${trace.filter((t) => t.tiles <= 2).length} stand; ordinary roamers ${missionPatrolling}/${missionRoamers} patrolling (${missionRoamers ? Math.round((100 * missionPatrolling) / missionRoamers) : 100}%)`,
  );
  for (const p of enemies) {
    for (const seed of seeds) {
      try {
        const c = chaseProbe(fieldId, level, seed, p.id, { startGap: 5, runner });
        n++;
        if (c.noticed) {
          chased++;
          chaseSecs.push(c.chaseSec ?? 40);
          if (c.chaseSec !== null) {
            if (c.backSec === null) neverBack++;
            else backSecs.push(c.backSec);
          }
          hurt += c.hurt > 0 ? 1 : 0;
          hurtByIt += c.hurtByIt > 0 ? 1 : 0;
          if (c.minGap <= 1) caught++;
          walkSum += c.walkTilesPerSec;
          humanSum += c.humanTilesPerSec;
        }
        if (process.env.VERBOSE) console.log('  ', fieldId, seed, JSON.stringify(c));
      } catch {
        /* no tile at that gap */
      }
    }
  }
}
const f = (x: number): string => x.toFixed(1);
console.log(
  `\n${level}: probes ${n}, pursued ${chased}, reached adjacent ${caught} (${f((100 * caught) / Math.max(1, chased))}%), human hurt by that enemy in ${hurtByIt} (${f((100 * hurtByIt) / Math.max(1, chased))}%), by anyone in ${hurt} (${f((100 * hurt) / Math.max(1, chased))}%)`,
);
console.log(
  `  pursuer walk ${f(walkSum / Math.max(1, chased))} t/s vs human ${f(humanSum / Math.max(1, chased))} t/s (ratio ${f(walkSum / Math.max(0.1, humanSum))})`,
);
console.log(
  `  chase length: mean ${f(chaseSecs.reduce((a, b) => a + b, 0) / Math.max(1, chased))} s, median ${f(median(chaseSecs))} s, p95 ${f(pct(chaseSecs, 0.95))} s, max ${f(Math.max(0, ...chaseSecs))} s (40 = still chasing at the end)`,
);
console.log(
  `  back on route after the chase: median ${f(median(backSecs))} s, p95 ${f(pct(backSecs, 0.95))} s, max ${f(Math.max(0, ...backSecs))} s, never within the run ${neverBack}`,
);
console.log(`  ordinary roamers patrolling: ${roamersPatrolling}/${roamers}`);
