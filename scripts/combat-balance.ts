/**
 * Close-attack balance measurement (decisions CB1-CB4, FC1-FC4). Plays the whole attack catalogue through the real
 * simulation (no rendering) and prints what each attack costs and gives:
 *
 *   npm run combat-balance
 *
 * 1. the spec table (range, speed, control, displacement, daze, recovery, cooldown, vulnerability);
 * 2. each attack alone against a rival who stands still and who keeps running (60 s);
 * 3. the duel matrices: every attack against every other, both walk up and press B at every chance, from an adjacent
 *    start and from four tiles apart, seated on both sides - over the first 5 s (an ENGAGEMENT: startup, reach,
 *    interrupts) and over 60 s (SUSTAINED); the share of all control that the ROW attack inflicted, > 50 % = the row
 *    attack wins;
 * 4. positional use: a flame lane the rival cannot leave in time.
 * tests/attack-catalogue.test.ts asserts the matrix properties (no attack dominates, each beats one and loses to one).
 */
import { ATTACK_KINDS, DEFAULT_CONFIG, controlValueSeconds, tick } from '../src/sim';
import type { AttackKind, Intents } from '../src/sim';
import { ENGAGEMENT_SECONDS, duelState, matchup, playDuel } from './lib/duel';

const A = DEFAULT_CONFIG.skills.attacks;
const f1 = (n: number): string => n.toFixed(1);

console.log('# Close attacks: the spec (ticks at 60 per second; all non-lethal)\n');
console.log(
  '| attack | reach | startup | whiff rec. | hit rec. | cooldown | lockout | daze | displace | slow | counter | planted | whiff root | hit root | control value (s) |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const k of ATTACK_KINDS) {
  const a = A[k];
  console.log(
    `| ${k} | ${a.reach} | ${a.startupTicks} | ${a.whiffRecoveryTicks} | ${a.hitRecoveryTicks} | ${a.cooldownTicks} | ${a.targetLockoutTicks} | ${a.dazeTicks} | ${a.displacementTiles} | ${a.slowTicks ? `${a.slowTicks} (+${a.slowExtraStepTicks}/tile)` : 0} | ${a.counterDazeTicks} | ${a.plantedStartup ? 'yes' : 'no'} | ${a.whiffRootTicks} | ${a.hitRootTicks} | ${f1(controlValueSeconds(a, DEFAULT_CONFIG))} |`,
  );
}

console.log('\n## Alone: one attacker against a rival who stands still / keeps running (60 s)\n');
console.log(
  '| attack | still: hits/min | still: victim control s/min | running: hits/min | running: whiffs/min |',
);
console.log('| --- | --- | --- | --- | --- |');
for (const k of ATTACK_KINDS) {
  const still = playDuel(k, k, 1, 60, 'still');
  const flee = playDuel(k, k, 1, 60, 'flee')[0];
  console.log(`| ${k} | ${still[0].hits} | ${f1(still[1].controlSeconds)} | ${flee.hits} | ${flee.whiffs} |`);
}

for (const [title, seconds] of [
  ['Engagement matrix (the first 5 s of a fight)', ENGAGEMENT_SECONDS],
  ['Sustained matrix (60 s)', 60],
] as const) {
  console.log(
    `\n## ${title}: share of all control the ROW attack inflicted (50 % = even; both fighters use that one attack)\n`,
  );
  console.log(`| row \\ column | ${ATTACK_KINDS.join(' | ')} | wins | losses |`);
  console.log(`| --- | ${ATTACK_KINDS.map(() => '---').join(' | ')} | --- | --- |`);
  for (const a of ATTACK_KINDS) {
    let wins = 0;
    let losses = 0;
    const cells = ATTACK_KINDS.map((b) => {
      if (a === b) return '50';
      const share = matchup(a, b, seconds).share;
      if (share > 0.505) wins++;
      if (share < 0.495) losses++;
      return String(Math.round(share * 100));
    });
    console.log(`| ${a} | ${cells.join(' | ')} | ${wins} | ${losses} |`);
  }
}

/** One attack at tick 0 on a rival two tiles (or one) away while a flame burns `where`. Did they die? */
function laneKill(k: AttackKind, where: 'under' | 'beyond', from: number): boolean {
  const gap = A[k].reach === 2 ? 2 : 1;
  const s = duelState(k, k, gap);
  s.players[1]!.armour = 0;
  const x = s.players[1]!.x + (where === 'under' ? 0 : 2); // under the rival, or two tiles beyond them
  s.flames.push({
    x,
    y: 4,
    eventId: 900,
    genId: 0,
    ownerId: 0,
    dir: 'right',
    tip: false,
    startTick: from,
    endTick: from + 40,
  });
  let hit = false;
  for (let t = 0; t < 140; t++) {
    const intents: Intents = t === 0 ? { 0: { special: true } } : {};
    // the rival stands still until the hit lands, then runs (up, off the row) the moment they can act again
    const v = s.players[1]!;
    if (hit && s.tick >= v.dazedUntil && v.stepRemaining <= 1) intents[1] = { move: 'up' };
    for (const e of tick(s, intents)) if (e.type === 'attackResolved' && e.hit) hit = true;
  }
  return !s.players[1]!.alive;
}
console.log('\n## Positional use: a flame lane the rival cannot leave in time (1 = the hit kills)\n');
console.log('| attack | flame under the rival at tick 45 | flame two tiles beyond at tick 25 |');
console.log('| --- | --- | --- |');
for (const k of ATTACK_KINDS)
  console.log(`| ${k} | ${laneKill(k, 'under', 45) ? 1 : 0} | ${laneKill(k, 'beyond', 25) ? 1 : 0} |`);
