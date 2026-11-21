/**
 * Classic raid enemy AI measurements (docs/CLASSIC_RAID_AI.md, decisions RA1-RA9):
 *
 *   npx tsx scripts/raid-ai.ts                 # every raid, Easy / Normal / Hard, 4 seeds
 *   npx tsx scripts/raid-ai.ts --seeds 8 --only patrol|drill|play --raids partsStoreroom,recordsVault [--nonight]
 *
 * patrol: reversals per calm enemy-minute with the human idle at the entrance (60 s), and the share of calm steps that
 *         repeat the way taken last time from the same approach; drill: ambush (unseen generator on its coming path,
 *         trapped) and seen (generator next to it, trapped = it did NOT escape); play: the fair-fight scripted human plays the raid (completed, health lost,
 *         lives, escapes from a fresh cross, reversals per calm minute).
 */
import type { CampaignLevel, RaidId } from '../src/sim';
import { LEVELS, RAIDS, ambushDrill, cornerDrill, fullRaid, idlePatrol, seenDrill } from './lib/raidAi';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const SEEDS = Array.from({ length: Number(arg('seeds', '4')) }, (_, i) => i + 1);
const ONLY = arg('only', 'all');
const raids = (arg('raids', '') ? arg('raids', '').split(',') : RAIDS) as RaidId[];
const levels = (arg('levels', '') ? arg('levels', '').split(',') : LEVELS) as CampaignLevel[];
/** `--nonight` plays a night raid without its light-based detection (decision NL13). */
const NIGHT = !process.argv.includes('--nonight');
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const pct = (a: number, b: number): string => (b ? `${a}/${b} (${Math.round((100 * a) / b)}%)` : '-');

if (ONLY === 'all' || ONLY === 'patrol') {
  console.log('# Patrol (human idle at the entrance, 60 s)\n');
  console.log(
    '| level | calm reversals / enemy-min | of which not at a route end (churn) | calm steps / enemy-min | predictable calm steps (same way as last time from the same approach) |',
  );
  console.log('| --- | --- | --- | --- | --- |');
  for (const level of levels) {
    let rev = 0;
    let churn = 0;
    let steps = 0;
    let ticks = 0;
    let seen = 0;
    let same = 0;
    for (const raidId of raids)
      for (const seed of SEEDS) {
        const t = idlePatrol(raidId, level, seed);
        rev += t.calmReversals;
        churn += t.calmChurn;
        steps += t.calmSteps;
        ticks += t.calmTicks;
        seen += t.repeatSeen;
        same += t.repeatSame;
      }
    const min = ticks / 3600;
    console.log(
      `| ${level} | ${(rev / min).toFixed(2)} | ${(churn / min).toFixed(2)} | ${(steps / min).toFixed(1)} | ${pct(same, seen)} |`,
    );
  }
}

if (ONLY === 'all' || ONLY === 'drill') {
  console.log('\n# Drills (first wave, calm, not armoured)\n');
  console.log(
    '| level | corner ambush on its route: trapped | ambush: trapped by an unseen generator on its path | path: trapped by one on its path (seen or not) | seen: caught by one laid next to it |',
  );
  console.log('| --- | --- | --- | --- | --- |');
  for (const level of levels) {
    let as = 0;
    let at = 0;
    let ps = 0;
    let pt = 0;
    let cs = 0;
    let ct = 0;
    let ss = 0;
    let st = 0;
    for (const raidId of raids)
      for (const seed of SEEDS) {
        const a = ambushDrill(raidId, level, seed);
        as += a.staged;
        at += a.trapped;
        const c = cornerDrill(raidId, level, seed);
        cs += c.staged;
        ct += c.trapped;
        const q = ambushDrill(raidId, level, seed, false);
        ps += q.staged;
        pt += q.trapped;
        const v = seenDrill(raidId, level, seed);
        ss += v.staged;
        st += v.trapped;
      }
    console.log(`| ${level} | ${pct(ct, cs)} | ${pct(at, as)} | ${pct(pt, ps)} | ${pct(st, ss)} |`);
  }
}

if (ONLY === 'all' || ONLY === 'play') {
  console.log('\n# Scripted play (fair-fight human, scripts/lib/fairHuman.ts)\n');
  console.log(
    '| raid | level | completed | mean s (completed) | health lost / run | lives lost / run | escapes from a fresh cross | calm reversals / enemy-min | detections / run |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const raidId of raids)
    for (const level of levels) {
      const rs = SEEDS.map((seed) => fullRaid(raidId, level, seed, { night: NIGHT }));
      const done = rs.filter((r) => r.outcome === 'completed');
      const calmTicks = sum(rs.map((r) => r.tracker.calmTicks));
      const calmRev = sum(rs.map((r) => r.tracker.calmReversals));
      console.log(
        `| ${raidId} | ${level} | ${done.length}/${rs.length} | ${done.length ? (sum(done.map((r) => r.seconds)) / done.length).toFixed(0) : '-'} | ${(sum(rs.map((r) => r.damageFromEnemies + r.damageFromSelf)) / rs.length).toFixed(2)} | ${(sum(rs.map((r) => r.deaths)) / rs.length).toFixed(2)} | ${pct(sum(rs.map((r) => r.escapes)), sum(rs.map((r) => r.inCross)))} | ${calmTicks ? (calmRev / (calmTicks / 3600)).toFixed(2) : '-'} | ${(sum(rs.map((r) => r.detections)) / rs.length).toFixed(1)} |`,
      );
      if (process.env.VERBOSE)
        console.log(rs.map((r) => `${r.outcome}/${r.failedBy}@${r.seconds.toFixed(0)}`).join(' '));
    }
}
