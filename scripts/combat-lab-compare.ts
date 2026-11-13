/**
 * Combat Test Lab: what can the player actually FEEL between two presets? (docs/COMBAT_TEST_LAB.md, "Findings").
 * Runs the real simulation (no rendering) for Off and presets 1..4 (default 1 and 2) and prints:
 *
 *   npm run combat-lab-compare            # presets 1 and 2 against Off
 *   npm run combat-lab-compare -- 1 3     # any two levels
 *
 * 1. the real attack numbers per fighter attack (what `setCombatLabLevel` put in `config.skills.attacks`);
 * 2. a tapping player (B every 6 ticks) on a rival who stands still: hits, the real gap between two hits on the same
 *    rival, the rival's daze share, and what limits that gap (the lockout, the recovery or the rival's daze immunity);
 * 3. the same player at nobody (whiff cadence);
 * 4. the reach map: which of the 24 tiles around a fighter facing right each preset can hit;
 * 5. bot matches: how often the corner reach and the aim help are actually used in play.
 */
import { COMBAT_LAB_PRESETS, createGame, observe, setCombatLabLevel, tick } from '../src/sim';
import type { AttackKind, CombatLabLevel, GameState, Intents } from '../src/sim';
import { createBot } from '../src/ai';
import { Tile } from '../src/sim/types';

const HZ = 60;
const levelsArg = process.argv
  .slice(2)
  .map(Number)
  .filter((n) => n >= 1 && n <= 4) as CombatLabLevel[];
const LEVELS: (CombatLabLevel | 0)[] = [0, ...(levelsArg.length ? levelsArg : ([1, 2] as CombatLabLevel[]))];
const FIGHTERS: { character: 'streetBaller' | 'lekkiBoy' | 'campusQueen'; kind: AttackKind }[] = [
  { character: 'streetBaller', kind: 'push' },
  { character: 'campusQueen', kind: 'shove' },
  { character: 'lekkiBoy', kind: 'daze' },
];
const name = (l: CombatLabLevel | 0): string => (l === 0 ? 'Off' : `${l} ${COMBAT_LAB_PRESETS[l].name}`);
const f1 = (n: number): string => n.toFixed(1);

/** A cleared 15 x 7 Oshodi yard (x 4..18, y 36..42), two human seats, lab at `level`. */
function yard(level: CombatLabLevel | 0, character: string, extra = 0): GameState {
  const s = createGame({
    seed: 11,
    arenaId: 'rumbleOshodi',
    players: [
      { name: 'A', characterId: character as 'streetBaller', isBot: false },
      { name: 'B', characterId: 'streetBaller', isBot: false },
      ...Array.from({ length: extra }, (_, i) => ({
        name: `C${i}`,
        characterId: 'lekkiBoy' as const,
        isBot: false,
      })),
    ],
    settings: { game: 'survival', stageHazards: false },
  });
  for (let y = 36; y <= 42; y++)
    for (let x = 4; x <= 18; x++) {
      const i = y * s.width + x;
      s.tiles[i] = Tile.Empty;
      delete s.hidden[i];
      delete s.floorHazards[i];
    }
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  s.generators = [];
  setCombatLabLevel(s, level);
  for (const p of s.players) {
    p.protectedUntil = 0;
    p.armour = 99;
  }
  return s;
}
function put(s: GameState, id: number, x: number, y: number, facing: 'up' | 'down' | 'left' | 'right') {
  const p = s.players[id]!;
  p.x = p.stepFromX = x;
  p.y = p.stepFromY = y;
  p.stepRemaining = 0;
  p.facing = facing;
}

console.log('# Combat lab: what the player can feel\n');
console.log('## 1. Real attack numbers (ticks, 60 = 1 s)\n');
console.log(
  '| fighter attack | level | startup | whiff recovery | hit recovery | same-target lockout | daze | daze immunity |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const f of FIGHTERS)
  for (const l of LEVELS) {
    const s = yard(l, f.character);
    const a = s.config.skills.attacks[f.kind];
    console.log(
      `| ${f.kind} | ${name(l)} | ${a.startupTicks} | ${a.whiffRecoveryTicks} | ${a.hitRecoveryTicks} | ${a.targetLockoutTicks} | ${a.dazeTicks} | ${a.dazeImmunityTicks} |`,
    );
  }

console.log('\n## 2. A tapping player (B every 6 ticks, 30 s) on a rival who stands still beside them\n');
console.log(
  '| fighter attack | level | hits | mean gap between hits (s) | what sets the gap | rival dazed / displaced (% of time) | air swings | presses kept | presses dropped |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const f of FIGHTERS)
  for (const l of LEVELS) {
    const s = yard(l, f.character);
    put(s, 0, 10, 39, 'right');
    put(s, 1, 11, 39, 'left');
    const hitTicks: number[] = [];
    let control = 0;
    for (let t = 0; t < 30 * HZ; t++) {
      const events = tick(s, t % 6 === 0 ? { 0: { special: true } } : {});
      for (const e of events)
        if (e.type === 'attackResolved' && e.playerId === 0 && e.hit) hitTicks.push(s.tick);
      const v = s.players[1]!;
      if (s.tick < v.dazedUntil || v.stepRemaining > 0) control++;
      put(s, 1, 11, 39, 'left'); // the rival is a dummy: stays on the tile (a Shove would otherwise end the test)
    }
    const gaps = hitTicks.slice(1).map((t, i) => t - hitTicks[i]!);
    const mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
    const a = s.config.skills.attacks[f.kind];
    const immuneGap = a.dazeTicks > 0 ? a.dazeTicks + a.dazeImmunityTicks : 0; // a daze-only hit needs the rival un-immune
    const cands: [string, number][] = [
      ['lockout', a.targetLockoutTicks],
      ['recovery', a.startupTicks + a.hitRecoveryTicks],
      ['daze immunity', f.kind === 'daze' ? immuneGap : 0],
    ];
    const limit = cands.sort((x, y) => y[1] - x[1])[0]!;
    const st = s.combatLab?.stats[0];
    console.log(
      `| ${f.kind} | ${name(l)} | ${hitTicks.length} | ${f1(mean / HZ)} | ${limit[0]} (${limit[1]} t) | ${f1((control / (30 * HZ)) * 100)} | ${st?.airSwings ?? 0} | ${st?.kept ?? 0} | ${st?.dropped ?? 0} |`,
    );
  }

console.log('\n## 3. The same tapping at nobody (10 s): swing cadence\n');
console.log('| fighter attack | level | swings in 10 s | seconds between swings |');
console.log('| --- | --- | --- | --- |');
for (const f of FIGHTERS)
  for (const l of LEVELS) {
    const s = yard(l, f.character);
    put(s, 0, 6, 39, 'right');
    put(s, 1, 17, 41, 'left');
    let swings = 0;
    for (let t = 0; t < 10 * HZ; t++)
      for (const e of tick(s, t % 6 === 0 ? { 0: { special: true } } : {}))
        if (e.type === 'attackStarted' && e.playerId === 0) swings++;
    console.log(`| ${f.kind} | ${name(l)} | ${swings} | ${swings ? f1(10 / swings) : '-'} |`);
  }

console.log('\n## 4. Reach map: fighter at the centre facing right (X = a punch there lands, . = no)\n');
for (const l of LEVELS) {
  const rows: string[] = [];
  for (let dy = -2; dy <= 2; dy++) {
    let row = '';
    for (let dx = -2; dx <= 3; dx++) {
      if (dx === 0 && dy === 0) {
        row += ' @';
        continue;
      }
      const s = yard(l, 'streetBaller');
      put(s, 0, 10, 39, 'right');
      put(s, 1, 10 + dx, 39 + dy, 'left');
      let hit = false;
      for (let t = 0; t < 30; t++)
        for (const e of tick(s, t === 0 ? { 0: { special: true } } : {}))
          if (e.type === 'attackResolved' && e.playerId === 0 && e.hit) hit = true;
      row += hit ? ' X' : ' .';
    }
    rows.push(row);
  }
  console.log(`${name(l)}:\n\`\`\`\n${rows.join('\n')}\n\`\`\``);
}

console.log(
  '\n## 5. Bot matches: where do punches actually come from? (4 bots, 8 seeds x 60 s, open yard)\n',
);
console.log(
  '| level | punches started | hits | misses | straight ahead | side / behind (turn) | forward corner | farther | air swings | hit % |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const l of LEVELS) {
  const t = { started: 0, hits: 0, miss: 0, front: 0, side: 0, corner: 0, far: 0, air: 0 };
  for (let seed = 1; seed <= 8; seed++) {
    const s = yard(l, 'streetBaller', 2);
    put(s, 0, 6, 38, 'right');
    put(s, 1, 16, 40, 'left');
    put(s, 2, 11, 36, 'down');
    put(s, 3, 9, 42, 'up');
    const bots = s.players.map((p) =>
      createBot({ difficulty: 'standard', seed: seed * 10 + p.id, playerId: p.id }),
    );
    for (let n = 0; n < 60 * HZ; n++) {
      const faced = s.players.map((p) => p.facing);
      const intents: Intents = {};
      for (const p of s.players) if (p.alive) intents[p.id] = bots[p.id]!.decide(observe(s, p.id));
      const before = s.players.map((p) => ({ x: p.x, y: p.y }));
      for (const e of tick(s, intents)) {
        if (e.type === 'attackStarted') {
          t.started++;
          if (e.targetId < 0) {
            t.air++;
            continue;
          }
          const me = before[e.playerId]!;
          const o = s.players[e.targetId]!;
          const dx = o.x - me.x;
          const dy = o.y - me.y;
          const f = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[faced[e.playerId]!]!;
          const adj = Math.abs(dx) + Math.abs(dy) === 1;
          if (adj && dx === f[0] && dy === f[1]) t.front++;
          else if (adj) t.side++;
          else if (Math.abs(dx) === 1 && Math.abs(dy) === 1) t.corner++;
          else t.far++;
        }
        if (e.type === 'attackResolved' && e.targetId !== null) {
          if (e.hit) t.hits++;
          else t.miss++;
        }
        if (e.type === 'attackResolved' && e.targetId === null) t.miss++;
      }
    }
  }
  const pct = (n: number): string => `${n} (${t.started ? Math.round((n / t.started) * 100) : 0}%)`;
  console.log(
    `| ${name(l)} | ${t.started} | ${t.hits} | ${t.miss} | ${pct(t.front)} | ${pct(t.side)} | ${pct(t.corner)} | ${pct(t.far)} | ${t.air} | ${t.hits + t.miss ? Math.round((t.hits / (t.hits + t.miss)) * 100) : 0} |`,
  );
}
