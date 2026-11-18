// Measurements of the district encounter pass A (docs/CAMPAIGN_SECTOR_AI.md "Districts: Oshodi ...", decisions DA1-DA11):
// scripted generator-first playthroughs of the field missions against the real enemy bots, per level, plus the scripted
// raid times of their door raids and the "seen generator" escapes on the mission boards.
//   npx tsx scripts/district-play.ts [play|raids|seen] [ids comma-separated] [levels comma-separated] [seeds]
//   npx tsx scripts/district-play.ts play oshodi.railEdge normal 8
//   TRACE=1 npx tsx scripts/district-play.ts play mushin.market hard 1   (one line per second of play)
import { enemyDef } from '../src/sim';
import type { CampaignLevel, RaidId } from '../src/sim';
import { missionMatch, playMission, seenOnMission } from './lib/districtPlay';
import { playRaidFight } from './lib/fairHuman';

const ALL = [
  'oshodi.approach',
  'oshodi.railEdge',
  'mushin.approach',
  'mushin.market',
  'fadeyiSomolu.approach',
  'fadeyiSomolu.junctions',
];
const [mode = 'play', idArg = '', levelArg = '', seedArg = '6'] = process.argv.slice(2);
const ids = idArg ? idArg.split(',') : ALL;
const levels = (levelArg ? levelArg.split(',') : ['easy', 'normal', 'hard']) as CampaignLevel[];
const seeds = Array.from({ length: Number(seedArg) }, (_, i) => i + 1);
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

if (mode === 'play') {
  for (const id of ids)
    for (const level of levels) {
      const rs = seeds.map((seed) => playMission(id, level, seed, { trace: process.env.TRACE === '1' }));
      const won = rs.filter((r) => r.result === 'won');
      const line = rs.map((r) => (r.result === 'won' ? `${r.fieldSec}/${r.livesUsed}` : r.result)).join(' ');
      console.log(
        `${id} ${level}: ${won.length}/${rs.length} won, field ${mean(won.map((r) => r.fieldSec)).toFixed(1)} s, ` +
          `lives ${mean(rs.map((r) => r.livesUsed)).toFixed(2)}, raid par ${mean(won.map((r) => r.raidSec)).toFixed(0)} s, ` +
          `blast kills ${rs.reduce((a, r) => a + r.killsByBlast, 0)}/${rs.reduce((a, r) => a + r.kills, 0)} | ${line}`,
      );
    }
} else if (mode === 'raids') {
  // the door raids of these missions, played by the fair-fight scripted human (scripts/lib/fairHuman.ts) at Normal
  for (const raidId of ['warehouseDispatchDepot', 'partsStoreroom', 'junctionToolShed'] as RaidId[]) {
    const rs = seeds.map((seed) => playRaidFight({ raidId, seed, difficulty: 'casual' }));
    const done = rs.filter((r) => r.outcome === 'completed');
    console.log(
      `${raidId}: ${done.length}/${rs.length} completed, mean ${mean(done.map((r) => r.seconds)).toFixed(1)} s | ` +
        rs.map((r) => `${r.outcome}:${r.seconds.toFixed(0)}`).join(' '),
    );
  }
} else if (mode === 'seen') {
  for (const id of ids)
    for (const level of levels) {
      const { s } = missionMatch(id, level, 1);
      const row: string[] = [];
      for (const p of s.players.slice(1)) {
        if (enemyDef(p.enemyKind!).steadfast) continue;
        let staged = 0;
        let hit = 0;
        for (const seed of seeds) {
          const r = seenOnMission(id, level, seed, p.id);
          if (r) {
            staged++;
            if (r.hit) hit++;
          }
        }
        row.push(`${p.id}:${p.enemyVariant} ${staged - hit}/${staged}`);
      }
      console.log(`${id} ${level} escaped: ${row.join(' | ')}`);
    }
}
