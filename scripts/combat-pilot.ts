/**
 * Oshodi Mission 1 COMBAT PILOT measurement (docs/OSHODI_COMBAT_PILOT.md, decisions CP1-CP12):
 *
 *   npm run combat-pilot                       # Normal, 8 seeds
 *   npm run combat-pilot -- --level hard --seeds 12
 *   npm run combat-pilot -- --only duel|press|fight
 *
 * Runs the real Terminal Approach field mission (scripts/lib/pilotFight.ts). The same script measured the code before
 * the pilot (`b55e95f`) and after it; the tables in the doc are its output.
 */
import { CHARACTER_IDS } from '../src/sim';
import type { EnemyKind } from '../src/sim';
import type { CampaignLevel } from '../src/sim/campaign/levels';
import {
  BOMBER,
  BRAWLER,
  MIXED,
  SLOW_BRAWLER,
  SLOW_MIXED,
  fieldFight,
  pressUnderFire,
  punchDuel,
} from './lib/pilotFight';
import type { FightResult, FighterStyle, SceneEnemy } from './lib/pilotFight';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const SEEDS = Number(arg('seeds', '8'));
const LEVEL = arg('level', 'normal') as CampaignLevel;
const ONLY = arg('only', 'all');
const seeds = Array.from({ length: SEEDS }, (_, i) => i + 1);

if (ONLY === 'all' || ONLY === 'duel') {
  console.log(`# 1. Punch-only duel against an idle enemy (B tapped every 12 ticks = 5 taps/s), ${LEVEL}\n`);
  console.log(
    '| fighter | enemy | defeated | seconds | B taps | punches started | landed | blocked by recovery frames |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const character of CHARACTER_IDS) {
    for (const kind of ['guard', 'thrower', 'heavy'] as EnemyKind[]) {
      const r = punchDuel({ kind, character, cadence: 12, level: LEVEL });
      console.log(
        `| ${character} | ${kind} | ${r.defeated ? 'yes' : 'NO'} | ${r.seconds.toFixed(2)} | ${r.presses} | ${r.started} | ${r.landed} | ${r.blocked} |`,
      );
    }
  }
}

if (ONLY === 'all' || ONLY === 'press') {
  console.log(
    `\n# 2. One press under fire (a guard brawling at your side), every 3rd tick of a 4 s window, ${LEVEL}\n`,
  );
  console.log('| button | scene | presses | accepted within 1/3 s | pressed while dazed |');
  console.log('| --- | --- | --- | --- | --- |');
  const scenes: [string, SceneEnemy[]][] = [
    ['guard', [{ kind: 'guard', x: 10, y: 39 }]],
    [
      'guard + guard',
      [
        { kind: 'guard', x: 10, y: 39 },
        { kind: 'guard', x: 8, y: 39 },
      ],
    ],
  ];
  for (const button of ['place', 'special'] as const)
    for (const [name, enemies] of scenes) {
      const r = pressUnderFire({ button, level: LEVEL, enemies });
      console.log(
        `| ${button === 'place' ? 'A (generator)' : 'B (punch)'} | ${name} | ${r.presses} | ${r.accepted} (${((100 * r.accepted) / r.presses).toFixed(0)} %) | ${r.whileDazed} |`,
      );
    }
}

function fightTable(rows: [string, FighterStyle, SceneEnemy[]][]): void {
  console.log(
    '| encounter | style | won | s to clear | kills punch / blast | dmg taken / min | interruptions / min | chained | deaths | B accepted / pressed | punches landed / blocked / whiffed | A accepted / pressed | escaped / caught in footprint | dazed % |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const [name, style, enemies] of rows) {
    const runs: FightResult[] = seeds.map((seed) => fieldFight({ enemies, style, seed, level: LEVEL }));
    const sum = (f: (r: FightResult) => number): number => runs.reduce((a, r) => a + f(r), 0);
    const minutes = sum((r) => r.seconds) / 60;
    const won = runs.filter((r) => r.won);
    const clear = won.length ? (won.reduce((a, r) => a + r.seconds, 0) / won.length).toFixed(1) : '-';
    const styleName =
      style === BRAWLER
        ? 'punch only'
        : style === BOMBER
          ? 'generators only'
          : style === MIXED
            ? 'mixed'
            : style === SLOW_BRAWLER
              ? 'SLOWER player, punch only'
              : 'SLOWER player, mixed';
    console.log(
      `| ${name} | ${styleName} | ${won.length}/${runs.length} | ${clear} | ${sum((r) => r.killsByPunch)} / ${sum((r) => r.killsByBlast)} | ${(sum((r) => r.damageTaken) / minutes).toFixed(2)} | ${(sum((r) => r.interruptions) / minutes).toFixed(1)} | ${sum((r) => r.chained)} | ${sum((r) => r.deaths)} | ${sum((r) => r.bAccepted)} / ${sum((r) => r.bPresses)} | ${sum((r) => r.punchesLanded)} / ${sum((r) => r.punchesBlocked)} / ${sum((r) => r.whiffs)} | ${sum((r) => r.aAccepted)} / ${sum((r) => r.aPresses)} | ${sum((r) => r.escaped)} / ${sum((r) => r.inFootprint)} | ${((100 * sum((r) => r.dazedTicks)) / (minutes * 3600)).toFixed(1)} |`,
    );
  }
}

if (ONLY === 'all' || ONLY === 'fight') {
  console.log(
    `\n# 3. Active enemy bots on the real Oshodi map (${LEVEL}), ${SEEDS} seeds, 60 s, stops at the first lost life\n`,
  );
  const guard: SceneEnemy = { kind: 'guard', x: 14, y: 39 };
  const guard2: SceneEnemy = { kind: 'guard', x: 14, y: 42 };
  const thrower: SceneEnemy = { kind: 'thrower', x: 16, y: 39 };
  const heavy: SceneEnemy = { kind: 'heavy', x: 14, y: 39 };
  fightTable([
    ['guard', BRAWLER, [guard]],
    ['thrower', BRAWLER, [thrower]],
    ['guard', BOMBER, [guard]],
    ['thrower', BOMBER, [thrower]],
    ['guard + thrower', MIXED, [guard, thrower]],
    ['2 guards', BRAWLER, [guard, guard2]],
    ['2 guards', MIXED, [guard, guard2]],
    ['heavy', BRAWLER, [heavy]],
    ['heavy', MIXED, [heavy]],
    ['guard', SLOW_BRAWLER, [guard]],
    ['2 guards', SLOW_BRAWLER, [guard, guard2]],
    ['guard + thrower', SLOW_MIXED, [guard, thrower]],
    ['heavy', SLOW_BRAWLER, [heavy]],
    ['heavy', SLOW_MIXED, [heavy]],
  ]);
}
