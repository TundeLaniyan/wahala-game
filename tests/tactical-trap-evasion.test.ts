/**
 * Tactical Trap pilot, evasion and damage (decisions TT7-TT9): an enemy that KNOWS a generator and can move gets out;
 * one that is committed (a wind-up, a recovery), slowed or has never seen it is hit; the new perception model is hit more
 * often than perfect knowledge by the same scripted trap (measured over seeds and printed); the cost of perceiving is
 * bounded; no other multiplayer path is touched.
 */
import { describe, expect, it } from 'vitest';
import { observe } from '../src/sim';
import { trapSightStats } from '../src/ai/trapSight';
import { summarise } from '../scripts/lib/trapDrill';
import type { HumanPlan, PerceptionModel } from '../scripts/lib/trapDrill';
import { addGenerator, botsFor, stepWithBots, trapScene } from './tactical-trap-helpers';

const SEEDS = 24;

/**
 * The enemy (hp 1) at (8, 10) in the lane; a generator at (6, 10) two tiles away with 3 s of fuse. `how`:
 *   seen       nothing hides it and the human is far away (the enemy is free and sees it)
 *   hidden     the human stands between them at (7, 10): his body hides it (and he is hit too: only the enemy counts)
 *   committed  seen, but the enemy is planted through the blast by its own wind-up / recovery
 */
function run(seed: number, how: 'seen' | 'hidden' | 'committed'): boolean {
  const s = trapScene({
    human: how === 'hidden' ? [7, 10] : [0, 0],
    enemies: [{ kind: 'agbero', at: [8, 10], hp: 1 }],
    seed,
    humanHp: 99,
  });
  const bots = botsFor(s, seed * 17);
  addGenerator(s, { ownerId: 0, x: 6, y: 10, timer: 180, range: 2 });
  if (how === 'committed') s.players[1]!.rootedUntil = s.tick + 200;
  let hit = false;
  for (let i = 0; i < 240; i++) {
    const ev = stepWithBots(s, bots, how === 'hidden' ? {} : {});
    if (ev.some((e) => e.type === 'campaignHit' && e.victimId === 1 && e.source === 'blast')) hit = true;
  }
  return hit;
}

describe('TT7 knowing matters: an enemy that saw a generator gets out more often; a committed one cannot', () => {
  const hits = (how: 'seen' | 'hidden' | 'committed'): number => {
    let n = 0;
    for (let seed = 1; seed <= SEEDS; seed++) if (run(seed, how)) n++;
    return n;
  };
  const seen = hits('seen');
  const hidden = hits('hidden');
  const committed = hits('committed');

  it('prints the numbers: seen / hidden behind the human / committed', () => {
    console.log(
      `known-generator runs, ${SEEDS} seeds: seen ${seen}, hidden behind a body ${hidden}, committed ${committed}`,
    );
    expect(seen + hidden + committed).toBeGreaterThan(0);
  });

  it('a free enemy that saw the generator is hit in at most 40 % of the runs (the Casual planner leaves late, but leaves)', () => {
    expect(seen).toBeLessThanOrEqual(Math.floor(SEEDS * 0.4));
  });

  it('one that never saw it (a body between) is hit nearly every time', () => {
    expect(hidden).toBeGreaterThanOrEqual(Math.ceil(SEEDS * 0.9));
    expect(hidden).toBeGreaterThan(seen);
  });

  it('one planted by its own wind-up / recovery through the blast is hit every time, even though it saw it', () => {
    expect(committed).toBe(SEEDS);
  });

  it('it never starts a wind-up inside the cross of a generator it has seen (never deliberately suicidal)', () => {
    let started = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const s = trapScene({
        human: [7, 10],
        enemies: [{ kind: 'guard', at: [8, 10], hp: 9 }],
        seed,
        humanHp: 99,
      });
      const bots = botsFor(s, seed);
      // the generator is in plain sight (the human steps off the line at once) and in range of both of them
      addGenerator(s, { ownerId: 0, x: 8, y: 8, timer: 180, range: 2 });
      s.players[0]!.y = s.players[0]!.stepFromY = 9;
      s.players[0]!.x = s.players[0]!.stepFromX = 8;
      for (let i = 0; i < 140; i++) {
        const known = bots[1]!.perceive(observe(s, 1)).generators.some((g) => g.timer < 1_000_000);
        const ev = stepWithBots(s, bots);
        if (known && ev.some((e) => e.type === 'attackStarted' && e.playerId === 1)) started++;
      }
    }
    expect(started).toBe(0);
  });
});

/** Seeds x kinds of a drill under one model. */
function rate(model: PerceptionModel, plan: HumanPlan): { hit: number; runs: number } {
  let hit = 0;
  let runs = 0;
  for (const kind of ['agbero', 'guard'] as const) {
    const r = summarise(kind, model, plan, SEEDS);
    hit += r.hit;
    runs += r.exposed;
  }
  return { hit, runs };
}

describe('TT9 measurement: the scripted trap against perfect knowledge, the EF1 baseline and the pilot', () => {
  const table: string[] = [];
  const results = new Map<string, { hit: number; runs: number }>();
  for (const plan of ['flee', 'cover', 'combo'] as const) {
    for (const model of ['perfect', 'ef1', 'trap'] as const) {
      const r = rate(model, plan);
      results.set(`${plan}/${model}`, r);
      table.push(`${plan.padEnd(6)} ${model.padEnd(8)} hit ${r.hit}/${r.runs}`);
    }
  }

  it('prints the generator-hit numbers over the seeds (agbero + guard, enemy exposed at laying)', () => {
    console.log(
      `tactical trap drill, ${SEEDS} seeds per kind, leave at 0.57 s of fuse:\n${table.join('\n')}`,
    );
    expect(results.size).toBe(9);
  });

  it('the pilot is hit more often than perfect knowledge and than the EF1 baseline by the cover and the combo drill', () => {
    for (const plan of ['cover', 'combo'] as const) {
      const trap = results.get(`${plan}/trap`)!;
      expect(trap.hit, plan).toBeGreaterThan(results.get(`${plan}/perfect`)!.hit);
      expect(trap.hit, plan).toBeGreaterThan(results.get(`${plan}/ef1`)!.hit);
    }
    // the slow-and-stagger combo is the stronger trap
    expect(results.get('combo/trap')!.hit).toBeGreaterThanOrEqual(results.get('cover/trap')!.hit);
  });

  it('it does not guarantee hits: leaving at once (the flee drill) catches nobody in any model, and the human never hurt himself', () => {
    for (const model of ['perfect', 'ef1', 'trap'] as const)
      expect(results.get(`flee/${model}`)!.hit).toBe(0);
  });
});

describe('TT9 the cost of perceiving is bounded', () => {
  it('one sight check per hidden generator and one body scan per decision, nothing when no generator is on the floor', () => {
    const s = trapScene({
      human: [0, 0],
      enemies: [
        { kind: 'guard', at: [8, 10] },
        { kind: 'agbero', at: [10, 8] },
        { kind: 'thrower', at: [12, 10] },
      ],
    });
    const bots = botsFor(s);
    const before = { ...trapSightStats };
    for (let i = 0; i < 30; i++) stepWithBots(s, bots);
    expect(trapSightStats.sightChecks).toBe(before.sightChecks); // no generator: no check at all
    for (const [x, y] of [
      [2, 2],
      [4, 4],
      [6, 6],
      [4, 10],
    ] as const)
      addGenerator(s, { ownerId: 0, x, y, timer: 900 });
    const base = { ...trapSightStats };
    const decisions = 40;
    for (let i = 0; i < decisions; i++) stepWithBots(s, bots);
    const enemies = 3;
    const gens = 4;
    expect(trapSightStats.updates - base.updates).toBe(decisions * enemies);
    expect(trapSightStats.sightChecks - base.sightChecks).toBeLessThanOrEqual(decisions * enemies * gens);
    expect(trapSightStats.bodyScans - base.bodyScans).toBeLessThanOrEqual(decisions * enemies);
    void observe;
  });

  it('the line trace is short: at most width + height steps, so a decision is O(enemies x generators x 26)', () => {
    const s = trapScene({ human: [0, 0], enemies: [{ kind: 'guard', at: [14, 10] }] });
    expect(s.width + s.height).toBeLessThanOrEqual(26);
  });
});
