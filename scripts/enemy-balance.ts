/**
 * Campaign enemy attack balance (decision EA5, docs/CAMPAIGN_ATTACKS.md):
 *
 *   npm run enemy-balance            # 1 human vs 4 enemies for 60 s, a scripted dodger and a human who stands still
 *   npm run enemy-balance -- --seeds 12
 *
 * 1. the spec table of every enemy attack (cue, speed, damage, daze, knockback, cooldown);
 * 2. raids: damage per minute and throw / punch counts against a scripted human who watches the cues and steps
 *    out of lines and away from wind-ups, and the earliest defeat of a human who never moves;
 * 3. duels: the player's Punch against each enemy kind with equal health.
 * tests/enemy-balance.test.ts asserts the bands.
 */
import { DEFAULT_CONFIG } from '../src/sim';
import type { EnemyKind } from '../src/sim';
import { DODGER, STILL, playDuelAgainstEnemy, playRaid } from './lib/enemyScene';

const seedsArg = process.argv.indexOf('--seeds');
const SEEDS = seedsArg >= 0 ? Number(process.argv[seedsArg + 1]) : 6;
const C = DEFAULT_CONFIG.enemyAttacks;
const s = (ticks: number): string => (ticks / 60).toFixed(2);

console.log('# Thrown objects (ticks at 60 per second)\n');
console.log(
  '| object | cue (s) | speed (ticks/tile) | range | damage | daze (s) | knockback | cooldown (s) | strong |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const [k, p] of Object.entries(C.projectiles))
  console.log(
    `| ${k} | ${s(p.warnTicks)} | ${p.stepTicks} | ${p.range} | ${p.damage} | ${s(p.dazeTicks)} | ${p.knockbackTiles} | ${s(p.cooldownTicks)} | ${p.strong ? 'yes' : 'no'} |`,
  );
console.log('\n# Punches\n');
console.log('| kind | attack | wind-up (s) | damage | daze (s) | knockback | cooldown (s) |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
for (const [k, m] of Object.entries(C.melee)) {
  if (!m) continue;
  const start = DEFAULT_CONFIG.skills.attacks[m.attack].startupTicks + m.extraStartupTicks;
  console.log(
    `| ${k} | ${m.attack} | ${s(start)} | ${m.damage} | ${s(m.dazeTicks)} | ${m.knockbackTiles} | ${s(m.cooldownTicks)} |`,
  );
}

const MIXES: EnemyKind[][] = [
  ['agbero', 'agbero', 'guard', 'guard'],
  ['guard', 'guard', 'heavy', 'heavy'],
  ['guard', 'thrower', 'thrower', 'heavy'],
  ['heavy', 'lieutenant', 'guard', 'thrower'],
  ['thrower', 'thrower', 'thrower', 'thrower'],
];
console.log(`\n# 1 human vs 4 enemies, 60 s, ${SEEDS} seeds each\n`);
console.log(
  '| enemies | dodger: health lost / min | throws | punches | hits | still human: earliest defeat (s) |',
);
console.log('| --- | --- | --- | --- | --- | --- |');
for (const mix of MIXES) {
  let dmg = 0;
  let thr = 0;
  let pun = 0;
  let hits = 0;
  let earliest = Infinity;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const r = playRaid({ enemies: mix, seed, humanHp: 99, policy: DODGER });
    dmg += r.damage;
    thr += r.throws;
    pun += r.punches;
    hits += r.hits;
    const still = playRaid({ enemies: mix, seed, humanHp: 3, policy: STILL });
    if (still.defeatedAt !== null) earliest = Math.min(earliest, still.defeatedAt / 60);
  }
  console.log(
    `| ${mix.join(', ')} | ${(dmg / SEEDS).toFixed(2)} | ${(thr / SEEDS).toFixed(0)} | ${(pun / SEEDS).toFixed(0)} | ${(hits / SEEDS).toFixed(1)} | ${Number.isFinite(earliest) ? earliest.toFixed(1) : 'never'} |`,
  );
}

console.log('\n# Duels: the player (Punch, 3 health) against one enemy (3 health)\n');
console.log('| enemy | player wins | enemy wins | average length (s) |');
console.log('| --- | --- | --- | --- |');
for (const kind of Object.keys(C.melee) as EnemyKind[]) {
  let w = 0;
  let l = 0;
  let ticks = 0;
  const n = SEEDS * 4;
  for (let i = 0; i < n; i++) {
    const r = playDuelAgainstEnemy(kind, i + 1, [1, 3, 5][i % 3]!);
    if (r.winner === 'player') w++;
    if (r.winner === 'enemy') l++;
    ticks += r.tick;
  }
  console.log(`| ${kind} | ${w}/${n} | ${l}/${n} | ${(ticks / n / 60).toFixed(1)} |`);
}
