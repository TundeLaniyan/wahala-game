/** Human-like Oshodi flow: `npx tsx scripts/oshodi-flow.ts [level] [seeds]` (docs/CAMPAIGN_COMBAT_RELIABILITY.md, V5). */
import { playOshodiFlow } from './lib/oshodiFlow';
import type { CampaignLevel } from '../src/sim';

const level = (process.argv[2] ?? 'normal') as CampaignLevel;
const n = Number(process.argv[3] ?? 8);
let won = 0;
let killed = 0;
for (let seed = 1; seed <= n; seed++) {
  const r = playOshodiFlow(level, seed);
  if (r.won) won++;
  if (r.agberoBlastKills > 0) killed++;
  console.log(seed, JSON.stringify(r));
}
console.log(`${level}: finished ${won}/${n}, a warden defeated by his own blast ${killed}/${n}`);
