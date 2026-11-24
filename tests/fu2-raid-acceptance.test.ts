/**
 * FOUNDER ACCEPTANCE ITEM 3, AUTOMATED (task FU2-B5, docs/FOUNDER_ACCEPTANCE_FU2.md): the Normal raid rear approach in the REAL
 * Dispatch Depot with the guards' actual patrol about-face, and a complete Normal raid played with rear approaches scripted.
 * A scripted player stands in for the founder's phone: it proves the rule on the real board, not that the turn is readable.
 *
 *   1  the about-face: at many moments of the real raid (all of wave 1 on its rounds) a player who stands on the tile behind an
 *      unseen guard that then turns to face him: with the shipped grace no guard notices him within its first 40 ticks (0.67 s)
 *      of facing him, and a player who steps out after 0.3 s is never caught by it; production (grace 0) catches him on the very
 *      tick of the turn in the same windows
 *   2  a complete Normal raid whose player takes the rear approach on every calm guard in reach (scripts/lib/nightExploit.ts
 *      `careful`): every seed completes the raid, with lives to spare, and the approach really lays and kills
 */
import { describe, expect, it } from 'vitest';
import { campaignEnemyLevel } from '../src/sim';
import { FAIR_HUMAN, playRaidFight } from '../scripts/lib/fairHuman';
import { makeExploit } from '../scripts/lib/nightExploit';
import { nightWindow } from '../scripts/lib/nightProbe';
import { overrideGrace } from '../scripts/lib/rearStalk';
import { raidWithBots } from '../scripts/lib/raidAi';

const DEPOT = 'warehouseDispatchDepot' as const;

function windows(grace: number | undefined, reactTicks?: number) {
  const out: ReturnType<typeof nightWindow>[] = [];
  const { s } = raidWithBots(DEPOT, 'normal', 1);
  const seats = s.raid!.seats.filter((q) => q.wave === 0).map((q) => q.playerId);
  for (const target of seats)
    for (const seed of [1, 2, 3])
      for (let t0 = 0; t0 <= 1200; t0 += 40) {
        const w = nightWindow({
          raidId: DEPOT,
          level: 'normal',
          seed,
          target,
          t0,
          dwell: 90,
          ...(grace !== undefined ? { grace } : {}),
          ...(reactTicks !== undefined ? { reactTicks } : {}),
        });
        if (w.eligible) out.push(w);
      }
  return out;
}

describe('item 3: the about-face in the real Normal depot', () => {
  it('the shipped grace: nobody notices him at once when a guard turns to face him; production does', () => {
    const before = windows(0).filter((w) => w.revealed);
    const after = windows(undefined).filter((w) => w.revealed);
    expect(before.length, 'windows where a turn revealed him (production)').toBeGreaterThanOrEqual(10);
    expect(after.length, 'windows where a turn revealed him (shipped)').toBeGreaterThanOrEqual(10);
    // an engagement of the guard that turned, within 3 ticks of the turn that revealed him = the instant about-face notice
    const within = (l: typeof before, ticks: number): number =>
      l.filter((w) => w.first && w.first.isTarget && w.first.tick - w.revealTick <= ticks).length;
    expect(within(before, 3), 'production: the turn itself catches him').toBeGreaterThan(0);
    expect(within(after, 3), 'shipped: it never does').toBe(0);
    // nor within 40 ticks (0.67 s) of facing him: the grace is 54
    expect(within(after, 40), 'shipped: nobody within 40 ticks').toBe(0);
  }, 120_000);

  it('a player who steps out after 0.3 s of being watched is caught less often than in production (which catches him on the turn)', () => {
    const shipped = windows(undefined, 18).filter((w) => w.revealed);
    const before = windows(0, 18).filter((w) => w.revealed);
    const rate = (l: typeof shipped): number => l.filter((w) => w.first).length / Math.max(1, l.length);
    expect(shipped.length).toBeGreaterThanOrEqual(10);
    expect(rate(shipped), 'engaged, shipped').toBeLessThan(rate(before));
  }, 120_000);
});

describe('item 3: a complete Normal raid with the rear approach scripted', () => {
  it('every seed completes the depot with lives to spare, and the approach lays generators that kill', () => {
    let planted = 0;
    let kills = 0;
    for (const seed of [1, 2, 3, 4]) {
      const ex = makeExploit({ policy: 'careful' });
      const r = playRaidFight({
        raidId: DEPOT,
        seed,
        difficulty: campaignEnemyLevel('normal'),
        level: 'normal',
        human: FAIR_HUMAN,
        override: ex.override,
        onTick: (s) => {
          if (s.tick === 1) overrideGrace(s);
        },
      });
      expect(r.won, `seed ${seed}: ${r.outcome}`).toBe(true);
      expect(r.deaths, `seed ${seed}`).toBeLessThanOrEqual(1);
      planted += ex.counters.planted;
      kills += r.killsByBlast;
    }
    expect(planted, 'rear approaches laid').toBeGreaterThan(0);
    expect(kills, 'guards defeated by a blast').toBeGreaterThan(0);
  }, 180_000);
});
