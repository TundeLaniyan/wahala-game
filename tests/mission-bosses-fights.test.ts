/**
 * The boss fights played whole against the REAL boss and crew bots (decisions BX1-BX8; the numbers of
 * docs/CAMPAIGN_SECTOR_AI.md "Bosses" come from `npm run boss-audit`, the same harness): a generator-first player
 * wins every boss on Normal in time; a pure punch player breaks no objective and never hits a boss; Easy costs fewer
 * lives than Hard; a fight is deterministic. Kept apart from the unit scenarios so it runs in its own worker.
 */
import { describe, expect, it } from 'vitest';
import { MISSION_IDS, tuningFor } from '../src/sim';
import type { MissionId } from '../src/sim';
import { runBossFight } from '../scripts/lib/bossFight';

// ------------------------------------------------------------------ real fights (the boss and crew bots)

/** Seeds whose Normal generator-first run wins (measured with `npm run boss-audit`; a regression shows up here). */
const WIN_SEED: Readonly<Record<MissionId, number>> = {
  oshodi: 101,
  mushin: 118,
  fadeyiSomolu: 101,
  ebuteMetta: 135,
  lagosIsland: 118,
  lekki: 101,
};

describe('scripted fights against the real boss and crew bots (Normal)', () => {
  it.each(MISSION_IDS)(
    '%s: the generator-first plan wins in time; pure punching breaks nothing and never hits him',
    (id) => {
      const gen = runBossFight({ id, level: 'normal', strategy: 'generator', seed: WIN_SEED[id] });
      expect(gen.result, JSON.stringify(gen)).toBe('won');
      expect(gen.bossHits).toBe(3);
      expect(gen.seconds).toBeLessThan(tuningFor({ id }).timeLimitTicks / 60);
      const punch = runBossFight({ id, level: 'normal', strategy: 'punch', seed: WIN_SEED[id], maxSec: 90 });
      expect(punch.phasesCleared, JSON.stringify(punch)).toBe(0);
      expect(punch.exposures).toBe(0);
      expect(punch.bossHits).toBe(0);
      expect(punch.result).not.toBe('won');
    },
    180_000,
  );

  it('the same seed plays the same fight', () => {
    const a = runBossFight({
      id: 'fadeyiSomolu',
      level: 'normal',
      strategy: 'generator',
      seed: 7,
      maxSec: 60,
    });
    const b = runBossFight({
      id: 'fadeyiSomolu',
      level: 'normal',
      strategy: 'generator',
      seed: 7,
      maxSec: 60,
    });
    expect(a).toEqual(b);
  }, 60_000);
});

describe('Easy is approachable, Hard costs more (measured, Ebute-Metta)', () => {
  it('the same plan and seeds: Easy wins without a life lost, Hard loses lives', () => {
    const lives = (level: 'easy' | 'hard'): { lives: number; won: number } =>
      [101, 118]
        .map((seed) => runBossFight({ id: 'ebuteMetta', level, strategy: 'generator', seed }))
        .reduce((a, r) => ({ lives: a.lives + r.livesUsed, won: a.won + (r.result === 'won' ? 1 : 0) }), {
          lives: 0,
          won: 0,
        });
    const easy = lives('easy');
    const hard = lives('hard');
    expect(easy).toEqual({ lives: 0, won: 2 });
    expect(hard.lives).toBeGreaterThanOrEqual(easy.lives + 2);
  }, 180_000);
});
