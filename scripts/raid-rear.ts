/**
 * The rear approach in the REAL Dispatch Depot (all of wave 1 on its rounds), many attempts: the player waits at (9,7)
 * out of sight; once he has seen post guard C at (11,9) turn to face the wall (after `react` ticks) and guard B walking
 * away up the column, he walks (10,7) (11,7) (11,8), lays a generator behind C and walks back. Attempts differ by seed,
 * reaction and how many of C's turns he lets pass first. Prints, per level: attempts with a window, C killed unseen,
 * C noticed him first, and how (decision CV8, docs/CLASSIC_RAID_COMBAT.md).
 *
 *   npx tsx scripts/raid-rear.ts [--seeds 6]
 */
import type { CampaignLevel, Intents } from '../src/sim';
import { put } from '../tests/raid-helpers';
import { raidWithBots, step } from './lib/raidAi';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const SEEDS = Array.from({ length: Number(arg('seeds', '6')) }, (_, i) => i + 1);

export function rearAttempt(level: CampaignLevel, seed: number, react: number, skipTurns: number) {
  const { s, bots } = raidWithBots('warehouseDispatchDepot', level, seed);
  for (let t = 0; t < 600; t++) step(s, bots);
  put(s, 0, 9, 7);
  const C = s.players[3]!;
  const B = s.players[2]!;
  const h = s.players[0]!;
  const hp0 = h.vitals!.hp;
  const toward = (x: number, y: number): Intents[number] =>
    h.x === x && h.y === y
      ? {}
      : { move: x !== h.x ? (x > h.x ? 'right' : 'left') : y > h.y ? 'down' : 'up' };
  const route = [
    [10, 7],
    [11, 7],
    [11, 8],
  ] as const;
  const back = [
    [11, 7],
    [10, 7],
    [9, 7],
  ] as const;
  let downSince = -1;
  let turnsSeen = 0;
  let phase: 'wait' | 'go' | 'back' = 'wait';
  let i = 0;
  let j = 0;
  let planted = false;
  let noticed: string | null = null;
  for (let t = 0; t < 3600; t++) {
    if (C.facing === 'down') {
      if (downSince < 0) {
        downSince = s.tick;
        turnsSeen++;
      }
    } else downSince = -1;
    let intent: Intents[number] = {};
    if (
      phase === 'wait' &&
      turnsSeen > skipTurns &&
      downSince >= 0 &&
      s.tick - downSince >= react &&
      s.tick - downSince < react + 90 &&
      B.facing === 'up' &&
      B.y <= 6
    )
      phase = 'go';
    if (phase === 'go') {
      if (h.stepRemaining === 0 && h.x === route[i]![0] && h.y === route[i]![1]) i++;
      if (i >= route.length) {
        intent = { place: true };
        planted = true;
        phase = 'back';
      } else intent = toward(route[i]![0], route[i]![1]);
    } else if (phase === 'back') {
      if (h.stepRemaining === 0 && h.x === back[j]![0] && h.y === back[j]![1])
        j = Math.min(j + 1, back.length - 1);
      intent = toward(back[j]![0], back[j]![1]);
    }
    step(s, bots, intent);
    const blown = planted && s.generators.length === 0;
    if (phase !== 'wait' && !blown && noticed === null) {
      for (const id of [1, 2, 3]) {
        const st = s.territory!.minds[id]?.state;
        if (s.players[id]!.alive && (st === 'alert' || st === 'pursue'))
          noticed = id === 3 ? 'C' : id === 2 ? 'B' : 'A';
      }
      if (noticed === null && h.vitals!.hp < hp0) noticed = 'hit';
    }
    if (blown && s.flames.length === 0) break;
  }
  return { window: phase !== 'wait', killed: !C.alive, noticed };
}

if (process.argv[1]?.endsWith('raid-rear.ts')) {
  console.log(
    '| level | attempts with a window | C killed | killed unseen | noticed first by C / B / A / punched |',
  );
  console.log('| --- | --- | --- | --- | --- |');
  for (const level of ['easy', 'normal', 'hard'] as CampaignLevel[]) {
    let tried = 0;
    let killed = 0;
    let clean = 0;
    const by: Record<string, number> = { C: 0, B: 0, A: 0, hit: 0 };
    for (const seed of SEEDS)
      for (const react of [15, 30, 45])
        for (const skip of [0, 1, 2]) {
          const r = rearAttempt(level, seed, react, skip);
          if (!r.window) continue;
          tried++;
          if (r.killed) killed++;
          if (r.killed && r.noticed === null) clean++;
          if (r.noticed) by[r.noticed]!++;
        }
    console.log(`| ${level} | ${tried} | ${killed} | ${clean} | ${by.C} / ${by.B} / ${by.A} / ${by.hit} |`);
  }
}
