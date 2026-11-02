/**
 * Close-attack balance measurement (decisions CB1-CB4). Plays the three melee attacks through the real simulation
 * (no rendering) and prints what each one costs and gives:
 *
 *   npm run combat-balance
 *
 * Per attack, against a rival who stands still, who keeps walking away, and in mirror / cross duels where both
 * fighters walk up to each other and press B at every opportunity for 60 s. The numbers it prints are the evidence
 * for "no attack is strictly superior" (tests/combat-attacks.test.ts asserts the config-level version of the same).
 */
import { DEFAULT_CONFIG, createGame, tick } from '../src/sim';
import type { CharacterId, GameState, Intents, SkillKind } from '../src/sim';
import { Tile } from '../src/sim/types';

const FIGHTER: Record<SkillKind, CharacterId> = {
  push: 'streetBaller',
  shove: 'campusQueen',
  daze: 'lekkiBoy',
};
const SKILLS: SkillKind[] = ['push', 'shove', 'daze'];
const HZ = 60;

function arena(a: SkillKind, b: SkillKind): GameState {
  const s = createGame({
    seed: 7,
    players: [FIGHTER[a], FIGHTER[b]].map((characterId, i) => ({ name: `P${i}`, characterId, isBot: false })),
    settings: { stageHazards: false },
  });
  s.tiles = s.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
  // an open 15 x 3 corridor in the middle row so a push has room and walls end it
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  s.players[0]!.x = s.players[0]!.stepFromX = 3;
  s.players[0]!.y = s.players[0]!.stepFromY = 4;
  s.players[1]!.x = s.players[1]!.stepFromX = 4;
  s.players[1]!.y = s.players[1]!.stepFromY = 4;
  s.players[0]!.facing = 'right';
  s.players[1]!.facing = 'left';
  // nothing can kill anyone here: the measurement is about control, not elimination
  s.players[0]!.armour = s.players[1]!.armour = 99;
  for (const p of s.players) p.protectedUntil = 0;
  return s;
}

const adjacent = (s: GameState): boolean =>
  Math.abs(s.players[0]!.x - s.players[1]!.x) + Math.abs(s.players[0]!.y - s.players[1]!.y) === 1;

function towards(s: GameState, from: number, to: number): Intents[number] {
  const a = s.players[from]!;
  const b = s.players[to]!;
  if (a.x !== b.x) return { move: a.x < b.x ? 'right' : 'left' };
  return { move: a.y < b.y ? 'down' : 'up' };
}

interface Result {
  hits: number;
  whiffs: number;
  controlSeconds: number; // seconds the victim could not act (daze + push step)
  pushedTiles: number;
}

/** Player 0 attacks whenever it can; player 1 stands still / walks away / fights back according to `mode`. */
function run(a: SkillKind, b: SkillKind, mode: 'still' | 'flee' | 'duel', seconds = 60): [Result, Result] {
  const s = arena(a, b);
  const r: [Result, Result] = [
    { hits: 0, whiffs: 0, controlSeconds: 0, pushedTiles: 0 },
    { hits: 0, whiffs: 0, controlSeconds: 0, pushedTiles: 0 },
  ];
  for (let t = 0; t < seconds * HZ; t++) {
    const intents: Intents = {};
    for (const me of [0, 1] as const) {
      const foe = me === 0 ? 1 : 0;
      const p = s.players[me]!;
      if (me === 1 && mode === 'still') continue;
      if (me === 1 && mode === 'flee') {
        intents[1] = { move: s.players[1]!.x < 13 ? 'right' : 'left' };
        continue;
      }
      if (!p.alive) continue;
      intents[me] = adjacent(s) ? { special: true } : towards(s, me, foe);
    }
    // measure the victim's lost time
    for (const v of [0, 1] as const) {
      const p = s.players[v]!;
      if (s.tick < p.dazedUntil || p.stepRemaining > 1) r[v].controlSeconds += 1 / HZ;
    }
    for (const e of tick(s, intents)) {
      if (e.type === 'attackResolved') {
        if (e.hit) r[e.playerId]!.hits++;
        else r[e.playerId]!.whiffs++;
      }
      if (e.type === 'playerPushed') r[e.byId]!.pushedTiles += 1;
    }
  }
  return r;
}

const f = (n: number): string => n.toFixed(1);

console.log('# Close attacks: measured through the simulation (60 s each)\n');
console.log(
  '| attack | startup | whiff rec. | hit rec. | target lockout | daze | push | alone: hits/min | alone: victim control s/min | flee: hits/min | flee: whiffs/min |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const k of SKILLS) {
  const sp = DEFAULT_CONFIG.skills.attacks[k];
  const still = run(k, k, 'still')[0];
  const alone = run(k, k, 'still');
  const flee = run(k, k, 'flee')[0];
  console.log(
    `| ${k} | ${sp.startupTicks} | ${sp.whiffRecoveryTicks} | ${sp.hitRecoveryTicks} | ${sp.targetLockoutTicks} | ${sp.dazeTicks} | ${sp.displacementTiles} | ${f(still.hits)} | ${f(alone[1].controlSeconds)} | ${f(flee.hits)} | ${f(flee.whiffs)} |`,
  );
}
console.log('\n## Duels (both walk up and press B at every chance; 60 s)\n');
console.log(
  '| row attack vs column attack | hits landed (row / col) | seconds controlled (row / col) | row control share |',
);
console.log('| --- | --- | --- | --- |');
for (const a of SKILLS)
  for (const b of SKILLS) {
    const [x, y] = run(a, b, 'duel');
    const total = x.controlSeconds + y.controlSeconds;
    // "row control share": of all the control seconds in the fight, the share the ROW fighter inflicted (= the column fighter lost)
    const share = total > 0 ? y.controlSeconds / total : 0.5;
    console.log(
      `| ${a} vs ${b} | ${x.hits} / ${y.hits} | ${f(x.controlSeconds)} / ${f(y.controlSeconds)} | ${f(share * 100)} % |`,
    );
  }

/** One attack at tick 0 on a rival standing at (4,4) while a flame burns `where`, from `from` for 40 ticks. Did they die? */
function laneKill(k: SkillKind, where: 'under' | 'beyond', from: number): boolean {
  const s = arena(k, k);
  s.players[1]!.armour = 0;
  const x = where === 'under' ? 4 : 6; // under the rival, or two tiles beyond them (the shove's landing tile)
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
  for (let t = 0; t < 120; t++) {
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
for (const k of SKILLS)
  console.log(`| ${k} | ${laneKill(k, 'under', 45) ? 1 : 0} | ${laneKill(k, 'beyond', 25) ? 1 : 0} |`);
