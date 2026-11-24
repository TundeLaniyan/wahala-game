/**
 * The REAL complete missions before / after the reveal grace (decision PI7, docs/CLASSIC_RAID_REAR.md): every Classic
 * raid at each level is played start to finish by (a) the fair-fight scripted human and (b) the ambusher
 * (scripts/lib/ambusher.ts), with the real enemy bots. Prints, per level: raids completed, alerts ("!") per run, health
 * lost per run, lives lost, seconds, and for the ambusher the ambushes that killed their guard. `PI_GRACE=0` replays the
 * production rule (no grace), unset = the shipped numbers.
 *
 *   npx tsx scripts/raid-rear-full.ts [--seeds 3] [--raids a,b] [--levels easy,normal,hard]
 */
import type { CampaignLevel, RaidId } from '../src/sim';
import { playRaidAmbush } from './lib/ambusher';
import { LEVELS, RAIDS, fullRaid } from './lib/raidAi';
import { overrideGrace } from './lib/rearStalk';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const SEEDS = Array.from({ length: Number(arg('seeds', '3')) }, (_, i) => i + 1);
const raids = (arg('raids', '') ? arg('raids', '').split(',') : RAIDS) as RaidId[];
const levels = (arg('levels', '') ? arg('levels', '').split(',') : LEVELS) as CampaignLevel[];

console.log(
  `PI_GRACE=${process.env.PI_GRACE ?? '(shipped)'}  | level | fair-fight completed | alerts / run | health lost / run | lives lost / run | seconds | ambusher completed | ambushes (killed their guard) | ambusher alerts-free share |`,
);
for (const level of levels) {
  let n = 0;
  let won = 0;
  let alerts = 0;
  let dmg = 0;
  let deaths = 0;
  let secs = 0;
  let aWon = 0;
  let amb = 0;
  let ambKill = 0;
  let free = 0;
  let ally = 0;
  let farHit = 0;
  for (const raidId of raids)
    for (const seed of SEEDS) {
      const hp = new Map<number, number>();
      const r = fullRaid(raidId, level, seed, {
        prepare: overrideGrace,
        onEvents: (s, evs) => {
          for (const e of evs) {
            if (e.type !== 'enemyCue' || e.cue !== 'alert') continue;
            if (e.byId !== null) ally++;
            else {
              // alerted by taking damage while the human stood far away (a hazard, not the human): not a sight at all
              const g = s.players[e.playerId]!;
              const h = s.players[0]!;
              if (
                (g.vitals?.hp ?? 0) < (hp.get(e.playerId) ?? 0) &&
                Math.abs(g.x - h.x) + Math.abs(g.y - h.y) > 5
              )
                farHit++;
            }
          }
          for (const g of s.players) if (g.enemyKind !== undefined) hp.set(g.id, g.vitals?.hp ?? 0);
        },
      });
      n++;
      if (r.won) won++;
      alerts += r.detections;
      dmg += r.damageFromEnemies;
      deaths += r.deaths;
      secs += r.seconds;
      let first = true;
      const a = playRaidAmbush({
        raidId,
        seed,
        level,
        onTick: (s) => {
          if (first) {
            first = false;
            overrideGrace(s);
          }
        },
      });
      if (a.won) aWon++;
      amb += a.ambushes;
      ambKill += a.ambushKills;
      free += a.freeShare;
    }
  console.log(
    `| ${level} | ${won}/${n} | ${(alerts / n).toFixed(2)} (${(ally / n).toFixed(2)} by an ally's call, ${(farHit / n).toFixed(2)} by a hit from something else while he was 6+ tiles away) | ${(dmg / n).toFixed(2)} | ${(deaths / n).toFixed(2)} | ${(secs / n).toFixed(0)} | ${aWon}/${n} | ${amb} (${ambKill}) | ${Math.round((100 * free) / n)} % |`,
  );
}
