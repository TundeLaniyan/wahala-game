/**
 * Radial City Rumble with full bot fields (decisions RE-AI1..): 32-bot Survival on the V2 stages reaches a
 * result, bots do not blow themselves up more under the radial blast than under the Classic cross on the same
 * stages and seeds, and they keep fighting (engagement proxy: an opponent within ENGAGE_NEAR tiles) instead of
 * camping. Matches use a shortened clock like tests/rumble-ai.test.ts; the full schedule is measured by
 * `npm run simulate -- --game survival --arena <stage> --players 32 --verbose` (docs/RUMBLE_EVOLUTION.md, AI).
 */
import { describe, expect, it } from 'vitest';
import { runMatch } from '../../src/ai/headless';
import type { MatchOutcome, MatchSpec } from '../../src/ai/headless';
import type { Difficulty } from '../../src/sim';

const SHORT: MatchSpec['config'] = {
  match: { durationTicks: 75 * 60 },
  crush: { startRemainingTicks: 55 * 60 },
};
/** Every level takes part (the menu's whole ladder), rotated per seed like `npm run simulate`. */
const LADDER: Difficulty[] = ['rookie', 'beginner', 'casual', 'standard', 'skilled', 'expert', 'nightmare'];
const field = (n: number, seed: number): Difficulty[] =>
  Array.from({ length: n }, (_, k) => LADDER[(2 * k + seed) % 7]!);

function survival(arenaId: string, seed: number, blastMode: 'radial' | 'plus', short = true): MatchOutcome {
  return runMatch({
    seed,
    arenaId,
    difficulties: field(32, seed),
    settings: { game: 'survival' },
    config: { ...(short ? SHORT : {}), generator: { blastMode } },
  });
}

const own = (o: MatchOutcome): number => o.seats.filter((s) => s.suicide).length;
const SEEDS = [1, 2];

describe('32-bot radial Survival', () => {
  for (const [arenaId, seed] of [
    ['rumbleOshodi', 3],
    ['rumbleApapa', 4],
  ] as const) {
    it(`${arenaId} seed ${seed}: the match ends with a result and the bots keep fighting`, () => {
      const radial = survival(arenaId, seed, 'radial');
      expect(radial.winner !== null || radial.draw).toBe(true);
      if (!radial.timeout) expect(radial.seats.filter((s) => s.alive).length).toBeLessThanOrEqual(1);
      else expect(radial.seats.filter((s) => s.alive).length).toBeLessThanOrEqual(3);
      // engagement: most of the time an opponent is within reach of a fight, and the last few close in on
      // each other rather than hide (the late samples are taken with ENGAGE_LATE or fewer fighters left)
      const samples = radial.seats.reduce((a, s) => a + s.engageSamples, 0);
      const near = radial.seats.reduce((a, s) => a + s.engageNear, 0);
      expect(near / samples).toBeGreaterThan(0.6);
      const late = radial.seats.reduce((a, s) => a + s.lateSamples, 0);
      const lateNear = radial.seats.reduce((a, s) => a + s.lateNear, 0);
      if (late > 50) expect(lateNear / late).toBeGreaterThan(0.25);
    }, 180_000);
  }

  it('bots do not die by their own blast more often under the radial blast than under the cross', () => {
    // the real schedule, three stages, the same seeds and line-ups with either blast shape
    let radial = 0;
    let plus = 0;
    for (const arenaId of ['rumbleOshodi', 'rumbleApapa', 'cityRumble']) {
      for (const seed of SEEDS) {
        radial += own(survival(arenaId, seed, 'radial', false));
        plus += own(survival(arenaId, seed, 'plus', false));
      }
    }
    expect(radial).toBeLessThanOrEqual(plus);
  }, 600_000);
});
