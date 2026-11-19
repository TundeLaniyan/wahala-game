/**
 * MEASURED generator-trap opportunities under the campaign tactics layer (docs/CAMPAIGN_SECTOR_AI.md "Measurements",
 * decisions SA4-SA9). A scripted human with ordinary intents against the REAL enemy bots (scripts/lib/sectorDrill.ts):
 *
 *   ambush   lay just round the corner of an unaware patroller's route: a reasonable strategy that wins on Normal
 *   bait     make a brawler swing at the air, lay under your feet in its recovery, punch once, leave late
 *   counter  jab the wind-up (a reeling enemy notices nothing), lay at once, leave late: the answer to placement-watchers
 *   seen     a badly placed generator in plain view: the enemy that SAW it gets away
 *
 * and the difficulty contrast (Easy approachable, Hard harder) and the decision cost per think.
 */
import { describe, expect, it } from 'vitest';
import { trapSightStats } from '../src/ai/trapSight';
import { ambushDrill, baitDrill, counterDrill, seenDrill, tally } from '../scripts/lib/sectorDrill';
import type { DrillTally } from '../scripts/lib/sectorDrill';
import type { CampaignLevel, EnemyVariantId } from '../src/sim';

const SEEDS = 12;
const ORDINARY: EnemyVariantId[] = ['agbero', 'marketEnforcer', 'ringSecurity'];
const LEVELS: CampaignLevel[] = ['easy', 'normal', 'hard'];
const DRILLS = { ambush: ambushDrill, bait: baitDrill, counter: counterDrill, seen: seenDrill };

const table = new Map<string, DrillTally>();
const measure = (drill: keyof typeof DRILLS, level: CampaignLevel, variant: EnemyVariantId): DrillTally => {
  const key = `${drill}/${level}/${variant}`;
  let t = table.get(key);
  if (!t) {
    t = tally(DRILLS[drill], level, variant, SEEDS);
    table.set(key, t);
  }
  return t;
};

describe('a reasonable generator strategy defeats ordinary enemies on Normal (SA4-SA8)', () => {
  it('the patrol ambush (round a corner of an unaware patroller) wins in a majority of seeds', () => {
    for (const v of ['agbero', 'marketEnforcer'] as const) {
      const t = measure('ambush', 'normal', v);
      expect(t.laid, v).toBe(SEEDS);
      expect(t.defeated, v).toBeGreaterThan(SEEDS / 2);
      expect(t.selfHit, v).toBe(0);
    }
  });

  it('baiting a wind-up then laying under your feet wins in a majority of seeds (brawlers that stand their ground)', () => {
    for (const v of ['agbero', 'areaBoy'] as const) {
      const t = measure('bait', 'normal', v);
      expect(t.defeated, v).toBeGreaterThan(SEEDS / 2);
    }
  });

  it('a market enforcer ducks out of sight after its swing (decision SA6): the ambush, not the bait, is the answer', () => {
    // RC4: longer enemy recoveries made the bait a sure thing against brawlers; a cover user still walks out of the blast
    expect(measure('ambush', 'normal', 'marketEnforcer').defeated).toBeGreaterThan(SEEDS / 2);
    expect(measure('bait', 'normal', 'marketEnforcer').defeated).toBeLessThanOrEqual(SEEDS / 2);
  });
});

describe('an enemy that SAW a badly placed generator escapes it (SA4)', () => {
  it('in a majority of seeds, for every ordinary variant at every level', () => {
    for (const level of LEVELS)
      for (const v of [...ORDINARY, 'areaBoy'] as const) {
        const t = measure('seen', level, v);
        expect(t.laid, `${level} ${v}`).toBe(SEEDS);
        expect(SEEDS - t.hit, `${level} ${v} escapes`).toBeGreaterThan(SEEDS / 2);
      }
  });
});

describe('difficulty: Easy is approachable, Hard is harder - by strategy, not health (SA9)', () => {
  const total = (level: CampaignLevel): number =>
    ORDINARY.reduce(
      (n, v) =>
        n +
        measure('ambush', level, v).defeated +
        measure('bait', level, v).defeated +
        measure('counter', level, v).defeated,
      0,
    );

  it('the same human strategies trap clearly fewer enemies on Hard than on Easy', () => {
    const easy = total('easy');
    const hard = total('hard');
    // (RC4: the longer enemy recoveries and the patrol pace moved the margin from 2 to 1.5 traps per seed)
    expect(easy - hard).toBeGreaterThanOrEqual(SEEDS * 1.5);
    // print the measured table for docs/CAMPAIGN_SECTOR_AI.md (npm run sector-ai prints the same, with more seeds)
    const rows = LEVELS.flatMap((l) =>
      ORDINARY.map((v) =>
        [
          l.padEnd(7),
          v.padEnd(15),
          ...(['ambush', 'bait', 'counter', 'seen'] as const).map((d) => {
            const t = measure(d, l, v);
            return `${d} ${d === 'seen' ? `${SEEDS - t.hit} escaped` : `${t.defeated} trapped`}/${t.laid}`;
          }),
        ].join('  '),
      ),
    );
    console.log(`campaign tactics drills (${SEEDS} seeds)\n${rows.join('\n')}`);
  });

  it('Hard enemies watch placements: the under-the-feet bait stops working, the counter-jab still does', () => {
    for (const v of ['agbero', 'marketEnforcer'] as const) {
      expect(measure('bait', 'easy', v).defeated, v).toBeGreaterThan(SEEDS / 2);
      expect(measure('bait', 'hard', v).defeated, v).toBeLessThan(SEEDS / 4);
      expect(measure('counter', 'hard', v).defeated, v).toBeGreaterThan(0);
    }
    // a keen Ring guard watches placements on Normal already; a reckless area boy never does
    expect(measure('bait', 'normal', 'ringSecurity').defeated).toBeLessThan(SEEDS / 4);
    expect(measure('bait', 'hard', 'areaBoy').defeated).toBeGreaterThan(SEEDS / 2);
  });
});

describe('decision cost is bounded per think (SA4)', () => {
  it('one sight check per generator and at most one body scan per decision, plus one per placement it watches', () => {
    trapSightStats.updates = 0;
    trapSightStats.sightChecks = 0;
    trapSightStats.bodyScans = 0;
    tally(baitDrill, 'hard', 'ringSecurity', 2);
    tally(ambushDrill, 'normal', 'agbero', 2);
    expect(trapSightStats.updates).toBeGreaterThan(500);
    // at most one generator of the human at a time in these drills, so: <= 1 check + 1 watched placement per decision
    expect(trapSightStats.sightChecks).toBeLessThanOrEqual(trapSightStats.updates * 2);
    expect(trapSightStats.bodyScans).toBeLessThanOrEqual(trapSightStats.updates * 2);
  });
});
