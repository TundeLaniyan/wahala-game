/**
 * Acceptance test F (docs/CLASSIC_RAID_COMBAT.md): the ambusher (`scripts/lib/ambusher.ts`) plays every Classic raid
 * at each level. Prints, per level: raids completed; ambushes planted, how many hurt / killed their guard; enemies
 * killed by blasts vs punches; damage and deaths; enemy punches started on him and landed; the most ordinary enemies
 * hunting him at once; the share of time nobody hunted him and the mean length of those spells (set-up time); hunts
 * that ended without a kill (disengagements).
 *
 *   npx tsx scripts/raid-ambush.ts [--seeds 3] [--raids a,b] [--levels easy,normal]
 */
import type { CampaignLevel, RaidId } from '../src/sim';
import { playRaidAmbush } from './lib/ambusher';
import { LEVELS, RAIDS } from './lib/raidAi';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const SEEDS = Array.from({ length: Number(arg('seeds', '3')) }, (_, i) => i + 1);
const raids = (arg('raids', '') ? arg('raids', '').split(',') : RAIDS) as RaidId[];
const levels = (arg('levels', '') ? arg('levels', '').split(',') : LEVELS) as CampaignLevel[];

console.log(
  '| level | completed | ambushes planted | hurt their guard | killed it | blast kills / punch kills | damage / run (own blasts) | deaths / run | enemy punches on him (landed) | most ordinary hunting at once | time unhunted | mean unhunted spell | disengagements / run |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const level of levels) {
  const rs = raids.flatMap((raidId) => SEEDS.map((seed) => playRaidAmbush({ raidId, seed, level })));
  const sum = (f: (r: (typeof rs)[number]) => number): number => rs.reduce((a, r) => a + f(r), 0);
  const n = rs.length;
  const pct = (a: number, b: number): string => (b ? `${a} (${Math.round((100 * a) / b)} %)` : `${a}`);
  console.log(
    `| ${level} | ${sum((r) => (r.won ? 1 : 0))}/${n} | ${sum((r) => r.ambushes)} | ${pct(
      sum((r) => r.ambushHits),
      sum((r) => r.ambushes),
    )} | ${pct(
      sum((r) => r.ambushKills),
      sum((r) => r.ambushes),
    )} | ${sum((r) => r.blastKills)} / ${sum((r) => r.punchKills)} | ${(sum((r) => r.damageTaken) / n).toFixed(2)} (${(sum((r) => r.selfDamage) / n).toFixed(2)}) | ${(sum((r) => r.deaths) / n).toFixed(2)} | ${sum((r) => r.punchesOnHim)} (${sum((r) => r.punchesLanded)}) | ${Math.max(...rs.map((r) => r.maxChasers))} | ${Math.round((100 * sum((r) => r.freeShare)) / n)} % | ${(sum((r) => r.meanFreeSpell) / n).toFixed(1)} s | ${(sum((r) => r.disengagements) / n).toFixed(1)} |`,
  );
}
