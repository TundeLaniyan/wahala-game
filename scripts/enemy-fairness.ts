/**
 * Campaign enemy FAIRNESS measurement (docs/ENEMY_COMBAT_FAIRNESS.md, decisions EF1-EF8):
 *
 *   npm run enemy-fairness                        # the Normal baseline level, 8 seeds
 *   npm run enemy-fairness -- --seeds 12 --level standard
 *   npm run enemy-fairness -- --only grid|raid|duel
 *
 * A scripted human with ordinary intents (scripts/lib/fairHuman.ts) against ACTIVE enemy bots:
 *   (a) each kind alone and a mixed group on an empty classic 15 x 11 pillar grid (90 s, stops at his first defeat);
 *   (b) the Dispatch Depot raid with its waves, lives and clock;
 * and reports kill rate, seconds per kill, damage and interruptions per minute, chained interruptions, deaths, and how
 * often an enemy caught in a fresh cross walked out of it.
 */
import type { Difficulty, EnemyKind } from '../src/sim';
import { playGridFight, playRaidFight } from './lib/fairHuman';
import type { FightStats } from './lib/fairHuman';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const SEEDS = Number(arg('seeds', '8'));
const LEVEL = arg('level', 'casual') as Difficulty;
const ONLY = arg('only', 'all');

function table(rows: [string, FightStats[]][]): void {
  console.log(
    '| fight | won | kills / enemies | s per kill | blast / punch kills | dmg taken / min | interruptions / min | chained | longest chain | deaths | laid on enemy | escapes from a fresh cross |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const [name, runs] of rows) {
    const sum = (f: (r: FightStats) => number): number => runs.reduce((a, r) => a + f(r), 0);
    const minutes = sum((r) => r.seconds) / 60;
    const kills = sum((r) => r.kills);
    const killSecs = runs.flatMap((r) => r.killTimes);
    const lastKill = runs.reduce((a, r) => a + (r.killTimes.length ? r.killTimes[r.killTimes.length - 1]! : 0), 0);
    const onEnemy = sum((r) => r.laidOnEnemy);
    console.log(
      `| ${name} | ${sum((r) => (r.won ? 1 : 0))}/${runs.length} | ${kills}/${sum((r) => r.enemies)} | ${killSecs.length ? (lastKill / kills).toFixed(1) : '-'} | ${sum((r) => r.killsByBlast)} / ${sum((r) => r.killsByPunch)} | ${(sum((r) => r.damageFromEnemies) / minutes).toFixed(2)} | ${(sum((r) => r.interruptions) / minutes).toFixed(1)} | ${sum((r) => r.chained)} | ${Math.max(...runs.map((r) => r.longestChain))} | ${sum((r) => r.deaths)} | ${onEnemy} | ${sum((r) => r.escapes)}/${sum((r) => r.inCross)} (${sum((r) => r.inCross) ? ((100 * sum((r) => r.escapes)) / sum((r) => r.inCross)).toFixed(0) : '-'}%) |`,
    );
  }
}

const seeds = Array.from({ length: SEEDS }, (_, i) => i + 1);

if (ONLY === 'all' || ONLY === 'grid') {
  console.log(`# (a) classic 15 x 11 grid, enemy bots at ${LEVEL}, ${SEEDS} seeds, 90 s\n`);
  const fights: [string, EnemyKind[]][] = [
    ['agbero', ['agbero']],
    ['guard', ['guard']],
    ['thrower', ['thrower']],
    ['heavy', ['heavy']],
    ['lieutenant', ['lieutenant']],
    ['2 guards', ['guard', 'guard']],
    ['mixed 3 (agbero, guard, thrower)', ['agbero', 'guard', 'thrower']],
    ['mixed 3 (guard, thrower, heavy)', ['guard', 'thrower', 'heavy']],
  ];
  table(fights.map(([name, enemies]) => [name, seeds.map((seed) => playGridFight({ enemies, seed, difficulty: LEVEL }))]));
}

if (ONLY === 'all' || ONLY === 'raid') {
  console.log(`\n# (b) Dispatch Depot raid, active waves, enemy bots at ${LEVEL}, ${SEEDS} seeds\n`);
  const runs = seeds.map((seed) => playRaidFight({ seed, difficulty: LEVEL }));
  table([['depot raid', runs]]);
  console.log(`\noutcomes: ${runs.map((r) => `${r.outcome}@${r.seconds.toFixed(0)}s`).join(', ')}`);
}
