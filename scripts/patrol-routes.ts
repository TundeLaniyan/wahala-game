/**
 * Patrol routes of every campaign field mission (docs/CAMPAIGN_COMBAT_RELIABILITY.md, decision RC2): per enemy its variant,
 * group, role (roamer / equipment guard / wave / pursuer / post holder), waypoints and the walking length of one circuit.
 * `npx tsx scripts/patrol-routes.ts [fieldId ...]`; the data rules are asserted by tests/campaign-reliability-data.test.ts
 * (which shares `describeRoutes`).
 */
import { FIELD_MISSION_IDS } from '../src/sim';
import { describeRoutes } from './lib/patrolRoutes';

const ids = process.argv.length > 2 ? process.argv.slice(2) : [...FIELD_MISSION_IDS];
for (const id of ids) {
  const rows = describeRoutes(id);
  const roamers = rows.filter((r) => r.role === 'roamer');
  const covered = roamers.filter((r) => r.waypoints.length >= 2 && r.circuit >= 12);
  console.log(
    `\n${id}: ${rows.length} enemies, ordinary roamers ${covered.length}/${roamers.length} on a real route (${roamers.length ? Math.round((100 * covered.length) / roamers.length) : 100}%)`,
  );
  for (const r of rows) {
    const route = r.waypoints.length ? r.waypoints.map(([x, y]) => `${x},${y}`).join(' > ') : 'post';
    console.log(
      `  ${r.name.padEnd(16)} ${r.variant.padEnd(14)} ${(r.role + (r.wave ? '+wave' : '')).padEnd(12)} ${r.waypoints.length >= 3 ? 'loop   ' : r.waypoints.length === 2 ? 'shuttle' : 'post   '} circuit ${String(r.circuit).padStart(3)}  ${route}`,
    );
  }
}
