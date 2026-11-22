/**
 * Acceptance of the boss balance (decisions BB1-BB6, docs/BOSS_BALANCE.md): the REAL Oshodi boss mission, built as the
 * campaign starts it, played end to end by the scripted player held to a person's limits (`scripts/lib/bossHuman.ts`:
 * 0.3-0.4 s reactions, a few decisions a second, only what the screen shows) against the real boss and crew bots. Easy
 * is won without repeated failures, Normal is won, the end of the fight is exact, and a seed replays the same fight.
 * The numbers come from `npm run boss-measure`. Kept apart from the unit scenarios so it runs in its own worker.
 */
import { describe, expect, it } from 'vitest';
import { tuningFor } from '../src/sim';
import { BOSS_HUMAN, SLOW_BOSS_HUMAN, runBossMeasure } from '../scripts/lib/bossHuman';
import type { BossMeasureResult } from '../scripts/lib/bossHuman';

const LIMIT_SEC = tuningFor({ id: 'oshodi' }).timeLimitTicks / 60;

/** A won fight with an exact end: three hits, one defeat, one outcome, no window missed. */
function expectCleanWin(r: BossMeasureResult): void {
  const why = JSON.stringify(r);
  expect(r.result, why).toBe('won');
  expect(r.bossHits, why).toBe(3);
  expect(r.defeatedEvents, why).toBe(1);
  expect(r.outcomeEvents, why).toBe(1);
  expect(r.phasesCleared, why).toBe(3);
  expect(r.seconds, why).toBeLessThan(LIMIT_SEC);
}

describe('the real Oshodi boss mission, played by a scripted person (BB acceptance)', () => {
  it('Easy: won by a player who understands generator placement, at most one life lost', () => {
    for (const seed of [101, 118]) {
      const r = runBossMeasure({ id: 'oshodi', level: 'easy', seed, human: BOSS_HUMAN });
      expectCleanWin(r);
      expect(r.deaths, JSON.stringify(r)).toBeLessThanOrEqual(1);
      expect(r.windowsMissed).toBe(0);
    }
    // the slower player (0.4 s reactions, four decisions a second) too, without losing a life
    const slow = runBossMeasure({ id: 'oshodi', level: 'easy', seed: 101, human: SLOW_BOSS_HUMAN });
    expectCleanWin(slow);
    expect(slow.deaths).toBe(0);
  }, 240_000);

  it('Normal: won, with lives to spare', () => {
    for (const seed of [101, 118]) {
      const r = runBossMeasure({ id: 'oshodi', level: 'normal', seed, human: BOSS_HUMAN });
      expectCleanWin(r);
      expect(r.deaths, JSON.stringify(r)).toBeLessThan(3);
    }
  }, 240_000);

  it('the boss stays readable: no punch faster than the level wind-up, his booth kept', () => {
    const r = runBossMeasure({ id: 'oshodi', level: 'normal', seed: 152, human: BOSS_HUMAN });
    expectCleanWin(r);
    if (r.shortestWindup !== null) expect(r.shortestWindup).toBeGreaterThanOrEqual(29); // 30, read a tick late
    // before (b6b2367) the shielded boss spent 23-38 s of a fight more than five tiles from his post
    expect(r.bossAwaySec).toBeLessThan(5);
  }, 240_000);

  it('the same seed plays the same fight', () => {
    const a = runBossMeasure({ id: 'oshodi', level: 'normal', seed: 7, maxSec: 40 });
    const b = runBossMeasure({ id: 'oshodi', level: 'normal', seed: 7, maxSec: 40 });
    expect(a).toEqual(b);
  }, 120_000);
});
