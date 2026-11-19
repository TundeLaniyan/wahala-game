/**
 * The Ojuelegba finale played for real (decisions FN1-FN10): a scripted human with ordinary intents (walk, lay a
 * generator, the context punch) against the REAL enemy bots, crates and stage hazards on, the campaign's three lives.
 *   - missions 19 and 20 (scripts/lib/fieldFight.ts): the generator plan wins a majority of six seeds on Normal;
 *   - mission 21 (scripts/lib/bossFight.ts): the generator plan wins on Easy, Normal and Hard; pure punching breaks no
 *     control point and never exposes the Landlord.
 * Measured over more seeds by `npx tsx scripts/finale-audit.ts` (docs/CAMPAIGN_SECTOR_AI.md).
 */
import { describe, expect, it } from 'vitest';
import type { CampaignLevel } from '../src/sim';
import { fieldLegCount, getFieldMission } from '../src/sim';
import { runBossFight } from '../scripts/lib/bossFight';
import { runFieldFight } from '../scripts/lib/fieldFight';

describe('missions 19 and 20: the generator plan against the real enemy bots (Normal, six seeds)', () => {
  it.each(['ojuelegba.return', 'ojuelegba.junction'])(
    '%s is won in a majority of seeds, every leg played with real blasts',
    (fieldId) => {
      const runs = [1, 2, 3, 4, 5, 6].map((seed) => runFieldFight({ fieldId, level: 'normal', seed }));
      const wins = runs.filter((r) => r.result === 'won');
      expect(
        wins.length,
        JSON.stringify(runs.map((r) => [r.seed, r.result, r.seconds])),
      ).toBeGreaterThanOrEqual(4);
      for (const r of wins) {
        expect(r.legs).toBe(fieldLegCount(getFieldMission(fieldId)));
        expect(r.placed, `${fieldId} seed ${r.seed}`).toBeGreaterThan(0);
        expect(r.enemiesDown, `${fieldId} seed ${r.seed}`).toBeGreaterThanOrEqual(2);
        expect(r.seconds).toBeLessThan(getFieldMission(fieldId).timeLimitSec);
      }
    },
    180_000,
  );

  it('the junction is really held: its waves contest the bus stop before it is kept', () => {
    // seed 1 (SA13 changed the bots' escapes: over seeds 1-10 the junction is won 9/10 on Normal, seed 2 times out; the
    // win rate itself is the majority test above, this one checks that the waves really contest the stop)
    const r = runFieldFight({ fieldId: 'ojuelegba.junction', level: 'normal', seed: 1 });
    expect(r.result).toBe('won');
    expect(r.contestedSec).toBeGreaterThan(0);
  }, 60_000);
});

describe('mission 21, Break the Ring: generators decide it (BX recipe + controlPoints)', () => {
  const winSeed: Readonly<Record<CampaignLevel, number>> = { easy: 101, normal: 101, hard: 101 };

  it.each(['easy', 'normal', 'hard'] as const)(
    '%s: the generator plan shuts the control points down and blasts the Landlord three times',
    (level) => {
      const r = runBossFight({ id: 'ojuelegba', level, strategy: 'generator', seed: winSeed[level] });
      expect(r.result, JSON.stringify(r)).toBe('won');
      expect(r.phasesCleared).toBe(3);
      expect(r.bossHits).toBe(3);
      expect(r.exposures).toBeGreaterThanOrEqual(3);
      expect(r.placed).toBeGreaterThan(0);
    },
    120_000,
  );

  it('pure punching breaks no control point and never exposes him', () => {
    const r = runBossFight({ id: 'ojuelegba', level: 'normal', strategy: 'punch', seed: 101, maxSec: 240 });
    expect(r.result).not.toBe('won');
    expect(r.phasesCleared).toBe(0);
    expect(r.exposures).toBe(0);
    expect(r.punches).toBeGreaterThan(0);
  }, 120_000);
});
