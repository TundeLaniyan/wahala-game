/**
 * The opening raid (Dispatch Depot) played by two scripted humans with a person's limits (decisions CV1-CV7,
 * docs/CLASSIC_RAID_COMBAT.md): the fair-fight player (0.3 s reaction) and a slower one (0.5 s reaction, a wider fuse
 * margin), Easy and Normal (Hard too with --hard), several seeds each. Prints completion, time, deaths, damage taken,
 * punches landed on the player, the most ordinary enemies hunting at once, and the share of time nobody hunted him.
 * Neither agent reads anything a player cannot see (scripts/lib/fairHuman.ts).
 *
 *   npx tsx scripts/raid-first.ts [--seeds 8] [--hard]
 */
import type { CampaignLevel, RaidId } from '../src/sim';
import { campaignEnemyLevel } from '../src/sim';
import { FAIR_HUMAN, SLOW_HUMAN, playRaidFight } from './lib/fairHuman';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const SEEDS = Array.from({ length: Number(arg('seeds', '8')) }, (_, i) => i + 1);
const levels: CampaignLevel[] = process.argv.includes('--hard')
  ? ['easy', 'normal', 'hard']
  : ['easy', 'normal'];
const raidId: RaidId = 'warehouseDispatchDepot';
const HUNTING = new Set(['alert', 'pursue']);
const ORDINARY = new Set(['agbero', 'guard', 'thrower', 'heavy']);

console.log(
  '| player | level | completed | mean time (s) | deaths / run | damage / run (enemies) | punches landed / run | most hunting at once | time unhunted |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const [name, human] of [
  ['fair (0.3 s)', FAIR_HUMAN],
  ['slow (0.5 s)', SLOW_HUMAN],
] as const)
  for (const level of levels) {
    let won = 0;
    let secs = 0;
    let deaths = 0;
    let dmg = 0;
    let landed = 0;
    let most = 0;
    let free = 0;
    let ticks = 0;
    for (const seed of SEEDS) {
      const r = playRaidFight({
        raidId,
        seed,
        difficulty: campaignEnemyLevel(level),
        level,
        human,
        onTick: (s) => {
          let n = 0;
          let any = 0;
          for (const [k, m] of Object.entries(s.territory?.minds ?? {})) {
            const p = s.players[Number(k)]!;
            if (!p.alive || !HUNTING.has(m.state)) continue;
            any++;
            if (ORDINARY.has(p.enemyKind ?? '') || p.enemyKind === 'lieutenant') n++;
          }
          most = Math.max(most, n);
          if (any === 0) free++;
          ticks++;
        },
        onEvents: (s, events) => {
          for (const e of events)
            if (e.type === 'campaignHit' && e.victimId === 0 && e.byId !== null && e.byId !== 0) {
              const by = s.players[e.byId];
              if (by?.enemyKind !== undefined && e.source === 'punch') landed++;
            }
        },
      });
      if (r.won) won++;
      secs += r.seconds;
      deaths += r.deaths;
      dmg += r.damageFromEnemies;
    }
    const n = SEEDS.length;
    console.log(
      `| ${name} | ${level} | ${won}/${n} | ${(secs / n).toFixed(0)} | ${(deaths / n).toFixed(2)} | ${(dmg / n).toFixed(2)} | ${(landed / n).toFixed(2)} | ${most} | ${Math.round((100 * free) / Math.max(1, ticks))} % |`,
    );
  }
