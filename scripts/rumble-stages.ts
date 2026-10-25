/**
 * City Rumble V2 stages: layout statistics and headless bot batches (the numbers in
 * docs/RUMBLE_STAGES_V2.md come from this script).
 *
 *   npx tsx scripts/rumble-stages.ts [--stats] [--bots] [--matches 3] [--players 16,32] [--game survival]
 *
 * --stats prints open-tile %, road %, the average / longest straight corridor and the chokepoints (open
 * tiles whose removal disconnects the board, ignoring crates) per stage. --bots runs headless matches
 * with the real clock (Standard and Beginner bots mixed) and prints how each ended.
 */
import { ARENAS, RUMBLE_ARENA_IDS } from '../src/sim';
import type { Difficulty, GameKind } from '../src/sim';
import { runMatch } from '../src/ai/headless';
import { layoutStats } from '../tests/rumbleStageStats';

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(`--${name}`);
const opt = (name: string, dflt: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : dflt;
};
const ids = opt('arenas', RUMBLE_ARENA_IDS.join(',')).split(',');

if (flag('stats') || !flag('bots')) {
  console.log('stage | size | open % | road % | avg corridor | longest | chokepoints | spawn gap 8/16/32');
  for (const id of ids) {
    const a = ARENAS[id]!;
    const s = layoutStats(a.layout);
    const gap = (n: number): number => {
      const sp = a.spawns.slice(0, n);
      let m = Infinity;
      for (let i = 0; i < sp.length; i++)
        for (let j = i + 1; j < sp.length; j++)
          m = Math.min(m, Math.abs(sp[i]!.x - sp[j]!.x) + Math.abs(sp[i]!.y - sp[j]!.y));
      return m;
    };
    console.log(
      `${id} | ${a.layout[0]!.length}x${a.layout.length} | ${s.openPct.toFixed(1)} | ${s.roadPct.toFixed(1)} | ${s.avgCorridor.toFixed(1)} | ${s.longestCorridor} | ${s.chokepoints} | ${gap(8)}/${gap(16)}/${gap(32)}`,
    );
  }
}

if (flag('bots')) {
  const matches = Number(opt('matches', '3'));
  const players = opt('players', '16,32').split(',').map(Number);
  const game = opt('game', 'survival') as GameKind;
  const minutes = Number(opt('minutes', '5'));
  console.log('\nstage | game | bots | seed | result | play seconds | crushed | hazard deaths | ms/tick');
  for (const id of ids) {
    for (const n of players) {
      for (let m = 0; m < matches; m++) {
        const difficulties = Array.from({ length: n }, (_, k): Difficulty => (k % 3 === 2 ? 'beginner' : 'standard'));
        const seed = 100 + m * 17 + n;
        const t0 = performance.now();
        const out = runMatch({
          seed,
          arenaId: id,
          difficulties,
          settings: { game, durationSec: game === 'survival' ? null : minutes * 60 },
        });
        const ms = (performance.now() - t0) / Math.max(1, out.ticks);
        const result = out.timeout ? 'time' : out.draw ? 'draw' : `winner ${out.winner}`;
        const crushed = out.seats.filter((s) => s.cause?.kind === 'crush').length;
        const hazard = out.seats.filter((s) => s.cause?.kind === 'hazard').length;
        console.log(
          `${id} | ${game} | ${n} | ${seed} | ${result} | ${(out.ticks / 60).toFixed(0)} | ${crushed} | ${hazard} | ${ms.toFixed(2)}`,
        );
      }
    }
  }
}
