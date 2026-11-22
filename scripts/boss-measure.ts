/**
 * Boss balance measurement (docs/BOSS_BALANCE.md, decisions BB1-BB6):
 *
 *   npm run boss-measure                                   # Oshodi, 6 seeds, Easy / Normal / Hard, both players
 *   npm run boss-measure -- --seeds 10 --level normal --player slow --id oshodi
 *
 * A scripted player held to a person's limits (scripts/lib/bossHuman.ts: 0.3-0.4 s reactions, a few decisions a second,
 * only what the screen shows) plays the REAL boss mission as the campaign starts it (`buildMissionGame`, the real boss
 * and crew bots, convoys, stage hazards, three lives). Prints, per level: wins, mean time, deaths, health lost (and by
 * cause), blasts landed on the boss, windows opened / missed, seconds the boss was exposed and restoring.
 */
import { MISSION_IDS } from '../src/sim';
import type { CampaignLevel, MissionId } from '../src/sim';
import { BOSS_HUMAN, SLOW_BOSS_HUMAN, runBossMeasure } from './lib/bossHuman';
import type { BossMeasureResult } from './lib/bossHuman';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const seeds = Number(arg('seeds') ?? 6);
const id = (arg('id') ?? 'oshodi') as MissionId;
if (!(MISSION_IDS as readonly string[]).includes(id)) throw new Error(`unknown mission ${id}`);
const levels: CampaignLevel[] = arg('level') ? [arg('level') as CampaignLevel] : ['easy', 'normal', 'hard'];
const players = arg('player') ? [arg('player')!] : ['fair', 'slow'];

const mean = (rs: BossMeasureResult[], f: (r: BossMeasureResult) => number): string =>
  (rs.reduce((a, r) => a + f(r), 0) / Math.max(1, rs.length)).toFixed(1);

console.log(`boss measure: ${id}, ${seeds} seeds per cell`);
const rows: string[] = [];
const audit: string[] = [];
for (const player of players) {
  const human = player === 'slow' ? SLOW_BOSS_HUMAN : BOSS_HUMAN;
  for (const level of levels) {
    const rs: BossMeasureResult[] = [];
    for (let k = 0; k < seeds; k++) rs.push(runBossMeasure({ id, level, seed: 101 + k * 17, human }));
    const by = (key: keyof BossMeasureResult['damageBy']): string => mean(rs, (r) => r.damageBy[key]);
    rows.push(
      [
        player,
        level,
        `${rs.filter((r) => r.result === 'won').length}/${rs.length}`,
        mean(rs, (r) => r.seconds),
        mean(rs, (r) => r.deaths),
        mean(rs, (r) => r.damage),
        ['bossGenerator', 'crewGenerator', 'convoy', 'stage', 'melee', 'own']
          .map((k) => by(k as never))
          .join(' / '),
        mean(rs, (r) => r.bossHits),
        `${mean(rs, (r) => r.exposures)} / ${mean(rs, (r) => r.windowsMissed)}`,
        `${mean(rs, (r) => r.exposedSec)} / ${mean(rs, (r) => r.restoringSec)}`,
        rs.map((r) => `${r.result[0]}${r.seconds}/d${r.deaths}`).join(' '),
      ].join(' | '),
    );
    const windups = rs.map((r) => r.shortestWindup).filter((w): w is number => w !== null);
    audit.push(
      [
        player,
        level,
        mean(rs, (r) => r.bossAwaySec),
        `${mean(rs, (r) => r.bossGensNearPlayer)} / ${mean(rs, (r) => r.bossGens)}`,
        mean(rs, (r) => r.meleeOnPlayer),
        windups.length > 0 ? String(Math.min(...windups)) : '-',
        `${mean(rs, (r) => r.aimedLanded)} / ${mean(rs, (r) => r.aimedAtBoss)}`,
        rs.map((r) => r.phaseSec.join(',')).join(' ; '),
      ].join(' | '),
    );
  }
}
console.log(
  '\nplayer | level | wins | mean s | deaths | health lost | lost to boss gen / crew gen / convoy / stage / melee / own | boss hits | windows / missed | exposed / restoring s | runs',
);
console.log('--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---');
for (const r of rows) console.log(r);
console.log(
  '\nplayer | level | shielded boss >5 tiles from post (s) | boss generators within 3 of player / all | punches landed on player | shortest wind-up on player (ticks) | aimed generators that landed / aimed | phase seconds per run',
);
console.log('--- | --- | --- | --- | --- | --- | --- | ---');
for (const r of audit) console.log(r);
