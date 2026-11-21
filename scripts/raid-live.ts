/**
 * Live Classic-raid combat measurements (docs/CLASSIC_RAID_COMBAT.md): the real raids, their waves and real enemy bots,
 * with the fair-fight scripted human (`scripts/lib/fairHuman.ts`, a player who fights what is near and works the
 * objective). Per level: completion, damage, deaths; how many enemies chase at once (alert / pursue); the share of enemy
 * time spent calm (patrol / watch / return) vs engaged; every enemy punch wind-up on the human (start -> impact), its
 * outcome and whether a player reacting after `REACT` ticks could still have left the threatened area.
 *
 *   npx tsx scripts/raid-live.ts [--seeds 3] [--raids a,b] [--levels easy,normal]
 */
import type { CampaignLevel, RaidId } from '../src/sim';
import { campaignEnemyLevel } from '../src/sim';
import { playRaidFight } from './lib/fairHuman';
import { LEVELS, RAIDS } from './lib/raidAi';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const SEEDS = Array.from({ length: Number(arg('seeds', '3')) }, (_, i) => i + 1);
const raids = (arg('raids', '') ? arg('raids', '').split(',') : RAIDS) as RaidId[];
const levels = (arg('levels', '') ? arg('levels', '').split(',') : LEVELS) as CampaignLevel[];
/** A phone player's reaction to a visible cue, input included (0.25 s). */
const REACT = 15;
const ENGAGED = new Set(['alert', 'pursue', 'investigate']);
const CHASING = new Set(['alert', 'pursue']);
const ORDINARY = new Set(['agbero', 'guard', 'thrower', 'heavy']);

console.log(
  '| level | enemy states | completed | damage / run | deaths / run | max ordinary chasers | time with >= 3 ordinary chasing | enemy time calm | punches on the human | wind-up (min / mean ticks) | punches landed | dodgeable after a 0.25 s reaction |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const level of levels) {
  let runs = 0,
    won = 0,
    damage = 0,
    deaths = 0,
    maxChasers = 0,
    ticks = 0,
    ticks3 = 0,
    calm = 0,
    enemyTicks = 0;
  const windups: number[] = [];
  const states = new Map<string, number>();
  let landed = 0,
    dodgeable = 0;
  for (const raidId of raids)
    for (const seed of SEEDS) {
      const open = new Map<number, { start: number; resolve: number }>();
      const r = playRaidFight({
        raidId,
        seed,
        level,
        difficulty: campaignEnemyLevel(level),
        onEvents: (s, events) => {
          let chasing = 0;
          for (const [id, m] of Object.entries(s.territory?.minds ?? {})) {
            const q = s.players[Number(id)];
            if (!q?.alive) continue;
            enemyTicks++;
            states.set(m.state, (states.get(m.state) ?? 0) + 1);
            if (!ENGAGED.has(m.state)) calm++;
            // the chaser cap counts ordinary kinds (decision CR2): lieutenants and bosses apart
            if (CHASING.has(m.state) && ORDINARY.has(q.enemyKind ?? '')) chasing++;
          }
          ticks++;
          if (chasing >= 3) ticks3++;
          maxChasers = Math.max(maxChasers, chasing);
          for (const e of events) {
            if (
              e.type === 'attackStarted' &&
              e.targetId === 0 &&
              s.players[e.playerId]?.enemyKind !== undefined
            ) {
              open.set(e.playerId, { start: s.tick, resolve: e.resolveTick });
              windups.push(e.resolveTick - s.tick);
              // a step off the threatened area: the human must be past half its step (step grace) before impact
              const half = Math.ceil(s.config.movement.stepTicksBySpeedLevel[0]! / 2) + 1;
              if (e.resolveTick - s.tick >= REACT + half) dodgeable++;
            }
            if (e.type === 'attackResolved' && e.targetId === 0 && open.has(e.playerId)) {
              if (e.hit) landed++;
              open.delete(e.playerId);
            }
          }
        },
      });
      runs++;
      if (r.won) won++;
      damage += r.damageFromEnemies;
      deaths += r.deaths;
    }
  const mean = windups.length ? Math.round(windups.reduce((a, b) => a + b, 0) / windups.length) : 0;
  console.log(
    `| ${level} | ${[...states].map(([k, v]) => `${k} ${Math.round((100 * v) / enemyTicks)}%`).join(', ')} | ${won}/${runs} | ${(damage / runs).toFixed(2)} | ${(deaths / runs).toFixed(2)} | ${maxChasers} | ${((100 * ticks3) / ticks).toFixed(1)} % | ${((100 * calm) / enemyTicks).toFixed(0)} % | ${windups.length} | ${windups.length ? Math.min(...windups) : '-'} / ${mean} | ${landed}/${windups.length} | ${dodgeable}/${windups.length} |`,
  );
}
