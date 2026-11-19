/**
 * Campaign combat reliability, part 4: the human-like trap harness (docs/CAMPAIGN_COMBAT_RELIABILITY.md, V2). The harness is
 * itself tested: the input latency model, the route a human learns by watching, and a few real end-to-end runs on real field
 * missions (real board, patrols, enemy bots). The full success tables are `npx tsx scripts/trap-reliability.ts` (20 seeds per
 * cell, three levels, four strategies); here a handful of seeds pin the findings that must not regress:
 *   - a generator laid in plain sight, in the lane, 6 tiles from an enemy that faces it, almost never catches it (fairness);
 *   - the bait works on an ordinary patroller most of the time on Normal and not by luck.
 */
import { describe, expect, it } from 'vitest';
import { HUMAN_MODEL, Lap, Pilot, RouteModel, runTrap, seeded } from '../scripts/lib/humanTrap';

describe('the human model', () => {
  it('is deterministic (a seeded generator, no clock, no Math.random)', () => {
    const a = seeded(7);
    const b = seeded(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(seeded(8)()).not.toBe(seeded(7)());
  });

  it('every decision reaches the game 6-24 ticks late; a held move stays until the next decision arrives', () => {
    const pilot = new Pilot(seeded(3), HUMAN_MODEL);
    const lats = Array.from({ length: 200 }, () => pilot.latency());
    expect(Math.min(...lats)).toBeGreaterThanOrEqual(6);
    expect(Math.max(...lats)).toBeLessThanOrEqual(24);
    expect(new Set(lats).size).toBeGreaterThan(8);
    const p = new Pilot(seeded(11), HUMAN_MODEL);
    const out: (string | null | undefined)[] = [];
    for (let t = 0; t < 60; t++) out.push(p.drive(t < 30 ? { move: 'right' } : {}, t).move);
    const first = out.findIndex((m) => m === 'right');
    expect(first).toBeGreaterThanOrEqual(6); // not before the latency
    expect(first).toBeLessThanOrEqual(24);
    const stop = out.findIndex((m, i) => i > first && m === undefined);
    expect(stop).toBeGreaterThanOrEqual(30 + 6); // he lets go at 30, the game hears it 6-24 ticks later
    expect(stop).toBeLessThanOrEqual(30 + 24);
  });

  it('A and B are single presses, never repeated, and a press can be cancelled before it lands', () => {
    const p = new Pilot(seeded(5), HUMAN_MODEL);
    let presses = 0;
    for (let t = 0; t < 80; t++) if (p.drive({ place: true }, t).place) presses++;
    expect(presses).toBe(1);
    const q = new Pilot(seeded(5), HUMAN_MODEL);
    q.drive({ place: true }, 0);
    q.cancelPresses();
    let landed = 0;
    for (let t = 1; t < 80; t++) if (q.drive({}, t).place) landed++;
    expect(landed).toBe(0);
  });
});

describe('learning a route by watching', () => {
  /** A loop of four corners, 14 ticks a tile, a 42-tick pause at each corner. */
  function loop(laps: number): RouteModel {
    const m = new RouteModel();
    const corners: [number, number][] = [
      [0, 0],
      [6, 0],
      [6, 3],
      [0, 3],
    ];
    let t = 0;
    for (let lap = 0; lap < laps; lap++) {
      for (let c = 0; c < 4; c++) {
        const [ax, ay] = corners[c]!;
        const [bx, by] = corners[(c + 1) % 4]!;
        for (let k = 0; k < 42; k++) m.record(t++, { x: ax, y: ay, facing: 'right' });
        const n = Math.abs(bx - ax) + Math.abs(by - ay);
        for (let i = 1; i <= n; i++) {
          const x = ax + Math.sign(bx - ax) * Math.min(i, Math.abs(bx - ax));
          const y = ay + Math.sign(by - ay) * Math.max(0, i - Math.abs(bx - ax));
          for (let k = 0; k < 14; k++) m.record(t++, { x, y, facing: 'right' });
        }
      }
    }
    return m;
  }

  it('finds the lap time after a lap and a bit, and not before', () => {
    expect(loop(1).period()).toBeNull();
    const m = loop(2);
    const lapTicks = 4 * 42 + 18 * 14;
    expect(m.period()).toBeGreaterThanOrEqual(lapTicks - 14);
    expect(m.period()).toBeLessThanOrEqual(lapTicks + 14);
  });

  it('replays the lap from where the enemy is NOW (closed loop): the phase of a recent stretch is found', () => {
    const m = loop(3);
    const lap = m.lap()!;
    expect(lap).toBeInstanceOf(Lap);
    const recent = Array.from({ length: 90 }, (_, i) => lap.at(200 - 89 + i));
    expect(Math.abs(lap.phaseOf(recent, 190) - 200)).toBeLessThanOrEqual(2);
  });
});

describe('real runs on real field missions (seeded, human model on)', () => {
  it('plain sight, plain lane, 6 tiles: the enemy walks out of a generator it saw (fairness)', () => {
    let killed = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const r = runTrap({
        fieldId: 'oshodi.railEdge',
        level: 'normal',
        seed,
        strategy: 'plain',
        model: { attempts: 1 },
      });
      if (r.first) killed++;
    }
    expect(killed, 'at most one of four').toBeLessThanOrEqual(1);
  }, 120_000);

  it('the bait catches an ordinary patroller in the Mushin market most of the time on Normal', () => {
    let killed = 0;
    const seeds = [1, 2, 3, 4, 5, 6];
    for (const seed of seeds) {
      if (
        runTrap({ fieldId: 'mushin.market', level: 'normal', seed, strategy: 'bait', model: { attempts: 2 } })
          .within
      )
        killed++;
    }
    expect(killed, `${killed} of ${seeds.length} within two attempts`).toBeGreaterThanOrEqual(4);
  }, 240_000);
});
