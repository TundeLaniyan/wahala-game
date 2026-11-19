/** Human-like trap harness runner: `npx tsx scripts/trap-reliability.ts <fieldId> <level> <strategy> [seeds] [target]` (TRACE=1 traces every seed, ONLY=n runs only seed n, TOL=ticks sets the timing tolerance). */
import { runTrap } from './lib/humanTrap';
import type { Strategy } from './lib/humanTrap';
import type { CampaignLevel } from '../src/sim';

const [fieldId, level, strategy, seeds = '8', target] = process.argv.slice(2);
let first = 0;
let within = 0;
const n = Number(seeds);
for (let seed = 1; seed <= n; seed++) {
  if (process.env.ONLY && Number(process.env.ONLY) !== seed) continue;
  const r = runTrap({
    fieldId: fieldId!,
    level: level as CampaignLevel,
    seed,
    strategy: strategy as Strategy,
    ...(target ? { target: Number(target) } : {}),
    ...(process.env.TOL ? { model: { timingTol: Number(process.env.TOL) } } : {}),
    trace: process.env.TRACE === '1',
  });
  if (r.first) first++;
  if (r.within) within++;
  console.log(
    seed,
    r.target,
    r.attempts
      .map((a) => `${a.why}${a.selfHit ? '+self' : ''}${process.env.DIAG && a.diag ? ` [${a.diag}]` : ''}`)
      .join(' > '),
    `${r.seconds}s`,
  );
}
console.log(`${fieldId} ${level} ${strategy}: first ${first}/${n}, within two ${within}/${n}`);
