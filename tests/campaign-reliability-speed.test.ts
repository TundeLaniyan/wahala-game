/**
 * Campaign combat reliability, part 1: the player outpaces every ordinary enemy (decision RC1) and a calm walk is a walk
 * (decision RC2). The numbers are asserted in the SIM (`playerStepTicks`) and in the bot's planner (`stepTicksOf`), so the
 * planner plans the pace the enemy really walks; nothing changes outside the campaign tactics layer.
 * docs/CAMPAIGN_COMBAT_RELIABILITY.md.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  ENEMY_KIND_IDS,
  ENEMY_KINDS,
  campaignTacticsFor,
  isCalmMind,
  observe,
  playerStepTicks,
  tacticsEnemyStepTicks,
} from '../src/sim';
import type { CampaignLevel, EnemyKind } from '../src/sim';
import { stepTicksOf } from '../src/ai/world';
import { tacticsScene } from '../scripts/lib/sectorDrill';
import { enemyScene } from '../scripts/lib/enemyScene';

const LEVELS: readonly CampaignLevel[] = ['easy', 'normal', 'hard'];
const ORDINARY: readonly EnemyKind[] = ['agbero', 'guard', 'thrower', 'heavy', 'lieutenant'];
/** The human's walk: 10 ticks a tile at speed level 0, and 9 / 8 / 7 with Roller Skates. */
const HUMAN = DEFAULT_CONFIG.movement.stepTicksBySpeedLevel;

describe('every ordinary enemy is slower than the human, on every level (RC1)', () => {
  it('the configured step times: Easy >= Normal >= Hard, and none reaches the human', () => {
    for (const kind of ORDINARY) {
      const [e, n, h] = LEVELS.map((l) => campaignTacticsFor(l).enemyStepTicks[kind]);
      expect(e, kind).toBeGreaterThanOrEqual(n!);
      expect(n, kind).toBeGreaterThanOrEqual(h!);
      for (const l of LEVELS) {
        expect(campaignTacticsFor(l).enemyStepTicks[kind], `${l} ${kind}`).toBeGreaterThan(HUMAN[0]!);
      }
    }
  });

  it('Normal table: agbero 12, guard 12, thrower 13, heavy 14, lieutenant 11 ticks a tile', () => {
    const t = campaignTacticsFor('normal').enemyStepTicks;
    expect([t.agbero, t.guard, t.thrower, t.heavy, t.lieutenant]).toEqual([12, 12, 13, 14, 11]);
  });

  it('the human keeps at least a 9 % lead on Hard, and Roller Skates widen it', () => {
    for (const kind of ORDINARY) {
      const hard = campaignTacticsFor('hard').enemyStepTicks[kind];
      expect(HUMAN[0]! / hard, kind).toBeLessThanOrEqual(1 / 1.09 + 1e-9);
      expect(HUMAN[1]!).toBeLessThan(hard);
      expect(HUMAN[3]!).toBeLessThan(hard);
    }
  });

  it('a variant may be a faster runner but never reaches the human (the area boy)', () => {
    for (const l of LEVELS) {
      const t = campaignTacticsFor(l);
      const area = tacticsEnemyStepTicks(t, { enemyKind: 'agbero', enemyVariant: 'areaBoy' });
      const plain = tacticsEnemyStepTicks(t, { enemyKind: 'agbero', enemyVariant: 'agbero' });
      expect(area, l).toBeLessThanOrEqual(plain);
      expect(area, l).toBeGreaterThan(HUMAN[0]!);
    }
  });

  it('the SIM gives every enemy seat that step time while it pursues (the real `playerStepTicks`)', () => {
    for (const level of LEVELS) {
      for (const kind of ORDINARY) {
        const variant =
          kind === 'agbero'
            ? 'agbero'
            : kind === 'guard'
              ? 'marketEnforcer'
              : kind === 'thrower'
                ? 'bottleThrower'
                : kind === 'heavy'
                  ? 'heavyEnforcer'
                  : 'lieutenant';
        const { s } = tacticsScene({ level, seed: 1, human: [2, 2], enemies: [{ variant, at: [10, 6] }] });
        const p = s.players[1]!;
        s.territory!.minds[1]!.state = 'pursue';
        expect(playerStepTicks(s, p), `${level} ${kind}`).toBe(
          campaignTacticsFor(level).enemyStepTicks[kind],
        );
        expect(playerStepTicks(s, p), `${level} ${kind}`).toBeGreaterThan(playerStepTicks(s, s.players[0]!));
      }
    }
  });

  it('the bot planner uses the same step time as the sim (it plans the pace it walks)', () => {
    for (const level of LEVELS) {
      const { s } = tacticsScene({
        level,
        seed: 1,
        human: [2, 2],
        enemies: [{ variant: 'agbero', at: [10, 6] }],
      });
      s.territory!.minds[1]!.state = 'pursue';
      const o = observe(s, 1);
      expect(stepTicksOf(o, o.players[1]!), level).toBe(playerStepTicks(s, s.players[1]!));
    }
  });

  it('the speed rule is absent outside the layer: the kind penalty is what it was', () => {
    for (const kinds of [ENEMY_KIND_IDS.slice(0, 3), ENEMY_KIND_IDS.slice(3)]) {
      const s = enemyScene({
        human: { x: 2, y: 2, hp: 4 },
        enemies: kinds.map((kind, i) => ({ kind, x: 6 + i, y: 6 })),
        seed: 1,
        arenaId: 'danfoBusPark',
      });
      expect(s.config.campaignTactics).toBeUndefined();
      kinds.forEach((kind, i) => {
        expect(playerStepTicks(s, s.players[1 + i]!), kind).toBe(
          HUMAN[0]! + ENEMY_KINDS[kind].stepPenaltyTicks,
        );
      });
    }
  });
});

describe('a calm walk is slower than a chase (RC2)', () => {
  it('patrolling, watching and walking back add `patrolStepExtraTicks`; pursuing, alert and investigating do not', () => {
    for (const level of LEVELS) {
      const t = campaignTacticsFor(level);
      const { s } = tacticsScene({
        level,
        seed: 1,
        human: [2, 2],
        enemies: [
          {
            variant: 'agbero',
            at: [10, 6],
            territory: {
              patrol: [
                [10, 6],
                [16, 6],
              ],
            },
          },
        ],
      });
      const p = s.players[1]!;
      const m = s.territory!.minds[1]!;
      const chase = t.enemyStepTicks.agbero;
      for (const [state, calm] of [
        ['patrol', true],
        ['watch', true],
        ['pursue', false],
        ['alert', false],
        ['investigate', false],
      ] as const) {
        m.state = state;
        expect(isCalmMind(m, s.tick), `${level} ${state}`).toBe(calm);
        expect(playerStepTicks(s, p), `${level} ${state}`).toBe(
          chase + (calm ? t.territory.patrolStepExtraTicks : 0),
        );
      }
      // walking back: calm once its watch is over, not while it still watches the human leave
      m.state = 'return';
      m.watchUntil = s.tick + 30;
      expect(playerStepTicks(s, p)).toBe(chase);
      m.watchUntil = s.tick - 1;
      expect(playerStepTicks(s, p)).toBe(chase + t.territory.patrolStepExtraTicks);
    }
  });

  it('the planner sees the calm pace through the directive (and only for its own seat)', () => {
    const { s } = tacticsScene({
      level: 'normal',
      seed: 1,
      human: [2, 2],
      enemies: [
        {
          variant: 'agbero',
          at: [10, 6],
          territory: {
            patrol: [
              [10, 6],
              [16, 6],
            ],
          },
        },
      ],
    });
    s.territory!.minds[1]!.state = 'patrol';
    s.territory!.minds[1]!.pauseUntil = -1;
    const o = observe(s, 1);
    expect(o.directive?.calm).toBe(true);
    expect(stepTicksOf(o, o.players[1]!)).toBe(playerStepTicks(s, s.players[1]!));
    // the human's own step time is untouched by any of it
    expect(stepTicksOf(o, o.players[0]!)).toBe(HUMAN[0]);
  });

  it('Easy walks slower than Normal, Normal slower than Hard (calm pace per tile)', () => {
    const calm = (l: CampaignLevel): number => {
      const t = campaignTacticsFor(l);
      return t.enemyStepTicks.agbero + t.territory.patrolStepExtraTicks;
    };
    expect(calm('easy')).toBeGreaterThan(calm('normal'));
    expect(calm('normal')).toBeGreaterThan(calm('hard'));
  });
});
