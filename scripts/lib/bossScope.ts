/**
 * A whole-fight digest of ANY campaign boss mission at a level (task FU2-B2, docs/BOSS_RELAY_SCOPE.md): the real mission
 * as the campaign starts it, the real crew bots and the scripted player of docs/BOSS_BALANCE.md for `maxSec` seconds,
 * every tick folding every seat's tile, health and step plus the objective's progress into one hash. Run on two commits and
 * compare per boss and level: equal = the fight is bit-identical there. The same file works on any commit that has
 * `scripts/lib/bossHuman.ts`, which is how the "before decision PI8" pins in tests/boss-relay-scope.test.ts were recorded
 * (production 9491d92).
 *
 *   npx tsx scripts/lib/bossScope.ts [--level normal] [--seed 101] [--sec 45]
 */
import { CAMPAIGN_MISSION_IDS } from '../../src/sim';
import type { CampaignLevel, MissionId } from '../../src/sim';
import { BOSS_HUMAN, runBossMeasure } from './bossHuman';

function fold(h: number, n: number): number {
  return (Math.imul(h ^ (n & 0xffff), 0x01000193) ^ (n >>> 16)) >>> 0;
}

export function scopeDigest(id: MissionId, level: CampaignLevel, seed = 101, maxSec = 45): string {
  let h = 0x811c9dc5;
  runBossMeasure({
    id,
    level,
    seed,
    human: BOSS_HUMAN,
    maxSec,
    onTick: (s) => {
      for (const p of s.players) {
        h = fold(h, p.x + 64 * p.y);
        h = fold(h, (p.vitals?.hp ?? 0) + (p.alive ? 1000 : 0));
        h = fold(h, p.stepRemaining);
      }
      const m = s.mission!;
      h = fold(h, m.phase * 7 + m.nodes.filter((n) => n.done).length);
      h = fold(h, m.phaseState === 'exposed' ? 1 : m.phaseState === 'active' ? 2 : 3);
      h = fold(h, s.generators.length);
    },
  });
  return h.toString(16);
}

if (process.argv[1]?.endsWith('bossScope.ts')) {
  const arg = (name: string, d: string): string => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1]! : d;
  };
  const levels = (arg('level', 'normal,hard').split(',') as CampaignLevel[]).filter(Boolean);
  for (const id of CAMPAIGN_MISSION_IDS)
    for (const level of levels)
      console.log(
        `${id} ${level}: ${scopeDigest(id, level, Number(arg('seed', '101')), Number(arg('sec', '45')))}`,
      );
}
