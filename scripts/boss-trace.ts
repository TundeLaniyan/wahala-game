/**
 * A whole-fight TRACE DIGEST of the Oshodi boss mission (task PI-1D, docs/BOSS_JAMMER_PROTECTION.md): the real mission
 * played end to end by the scripted player of docs/BOSS_BALANCE.md; every tick folds every seat's tile, health, state, the
 * relays' state and the mission phase into one hash. Run it on two commits (production and a branch) and compare per
 * seed: identical lines = the fight is bit-identical in behaviour at that level.
 *
 *   npx tsx scripts/boss-trace.ts [--seeds 8] [--level easy] [--player fair|slow] [--id oshodi]
 */
import { MISSION_IDS } from '../src/sim';
import type { CampaignLevel, MissionId } from '../src/sim';
import { BOSS_HUMAN, SLOW_BOSS_HUMAN, runBossMeasure } from './lib/bossHuman';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

function fold(h: number, n: number): number {
  return (Math.imul(h ^ (n & 0xffff), 0x01000193) ^ (n >>> 16)) >>> 0;
}

/** One whole fight folded into a hash (the same fold on every commit). */
export function traceFight(id: MissionId, level: CampaignLevel, seed: number, human = BOSS_HUMAN) {
  let h = 0x811c9dc5;
  let ticks = 0;
  const r = runBossMeasure({
    id,
    level,
    seed,
    human,
    onTick: (s) => {
      ticks++;
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
  return { hash: h.toString(16), ticks, result: r.result, seconds: r.seconds, deaths: r.deaths };
}

if (process.argv[1]?.endsWith('boss-trace.ts')) {
  const seeds = Number(arg('seeds') ?? 8);
  const id = (arg('id') ?? 'oshodi') as MissionId;
  if (!(MISSION_IDS as readonly string[]).includes(id)) throw new Error(`unknown mission ${id}`);
  const levels: CampaignLevel[] = arg('level') ? [arg('level') as CampaignLevel] : ['easy', 'normal', 'hard'];
  const players = arg('player') ? [arg('player')!] : ['fair', 'slow'];
  for (const player of players)
    for (const level of levels)
      for (let k = 0; k < seeds; k++) {
        const seed = 101 + k * 17;
        const r = traceFight(id, level, seed, player === 'slow' ? SLOW_BOSS_HUMAN : BOSS_HUMAN);
        console.log(
          `${player} ${level} seed ${seed}: ${r.hash} ticks ${r.ticks} ${r.result} ${r.seconds}s deaths ${r.deaths}`,
        );
      }
}
