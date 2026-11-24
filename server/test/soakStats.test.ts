/** The statistics behind the memory soak verdict (bench/soakStats.ts): pure, so the verdict rules are tested. */
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../bench/soak';
import { adjustedTrend, percentile, trend, verdictOf } from '../bench/soakStats';

/** A deterministic wobble in [-1, 1]. */
const wobble = (i: number): number => Math.sin(i * 12.9898) * Math.cos(i * 4.1414);

const series = (n: number, everySec: number, f: (i: number) => number) =>
  Array.from({ length: n }, (_, i) => ({ t: 60 + i * everySec, heapMB: f(i) }));

describe('soak verdict', () => {
  it('a flat heap with noise is stable', () => {
    const v = verdictOf(series(16, 15, (i) => 50 + 1.5 * wobble(i)));
    expect(v.verdict).toBe('stable');
    expect(Math.abs(v.trend.slopeMBPerMin)).toBeLessThan(0.3);
  });

  it('a heap that climbs steadily is growing, and the projection says how fast', () => {
    // 1 MB per 15 s = 4 MB/min = 240 MB/h, plus noise
    const v = verdictOf(series(16, 15, (i) => 50 + i + 0.8 * wobble(i)));
    expect(v.verdict).toBe('growing');
    expect(v.trend.slopeMBPerMin).toBeCloseTo(4, 0);
    expect(v.trend.projectedMBPerHour).toBeGreaterThan(200);
    expect(v.lastThirdMB).toBeGreaterThan(v.firstThirdMB + 8);
  });

  it('a sawtooth (grow, collect, grow, collect) around a constant level is stable', () => {
    const v = verdictOf(series(20, 15, (i) => 50 + (i % 5) * 3));
    expect(v.verdict).toBe('stable');
  });

  it('a tiny drift below the practical threshold is not called a leak', () => {
    // 0.05 MB/min = 3 MB/h
    const v = verdictOf(series(20, 15, (i) => 50 + i * 0.0125 + 0.02 * wobble(i)));
    expect(v.verdict).toBe('stable');
  });

  it('too few points or too short a window gives no verdict at all', () => {
    expect(verdictOf(series(4, 15, (i) => 50 + i)).verdict).toBe('insufficient-data');
    expect(verdictOf(series(8, 5, (i) => 50 + i)).verdict).toBe('insufficient-data'); // 35 s
  });

  it('trend and percentile basics', () => {
    expect(trend([{ t: 0, heapMB: 1 }]).n).toBe(1);
    const t = trend([0, 60, 120].map((s, i) => ({ t: s, heapMB: 10 + 2 * i })));
    expect(t.slopeMBPerMin).toBeCloseTo(2, 6);
    expect(t.r2).toBeCloseTo(1, 6);
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(percentile([], 0.5)).toBeNaN();
  });
});

describe('soak verdict with rooms coming and going (the confounder that hid the first leak)', () => {
  /** Rooms alternate 1..3 (a cycle ends, the next one starts) and every live room holds 6 MB. */
  const withRooms = (n: number, growthMBPerMin: number) =>
    Array.from({ length: n }, (_, i) => {
      const rooms = 1 + ((i * 7) % 3);
      const t = 60 + i * 15;
      return { t, rooms, heapMB: 30 + 6 * rooms + (growthMBPerMin * (t - 60)) / 60 + 0.4 * wobble(i) };
    });

  it('a real 10 MB/min growth is found even though the room count swamps the plain trend', () => {
    const points = withRooms(18, 10);
    expect(verdictOf(points).verdict).toBe('growing');
    const adj = adjustedTrend(points)!;
    expect(adj.slopeMBPerMin).toBeCloseTo(10, 0);
    expect(adj.perRoomMB).toBeCloseTo(6, 0);
  });

  it("no growth with the same swinging room count is stable, and the rooms' own weight is not mistaken for a leak", () => {
    const points = withRooms(18, 0);
    const v = verdictOf(points);
    expect(v.verdict).toBe('stable');
    expect(v.adjusted).toBe(true);
    expect(Math.abs(v.trend.slopeMBPerMin)).toBeLessThan(0.3);
  });

  it('falls back to the plain trend when the room count never changes (or is not recorded)', () => {
    expect(adjustedTrend(series(10, 15, (i) => 50 + i).map((p) => ({ ...p, rooms: 2 })))).toBeNull();
    expect(adjustedTrend(series(10, 15, (i) => 50 + i))).toBeNull();
    expect(verdictOf(series(16, 15, (i) => 50 + i)).adjusted).toBe(false);
  });
});

describe('soak arguments', () => {
  it('the default run is about five minutes, 3 rooms, one long match, 1-2 humans + bots', () => {
    const cfg = parseArgs([]);
    expect(cfg).toMatchObject({
      durationSec: 300,
      rooms: 3,
      longSlot: true,
      humans: 2,
      botsLevel: 'standard',
    });
  });
  it('flags override and bad numbers are refused', () => {
    expect(parseArgs(['--duration', '30', '--rooms', '2', '--long', '0']).longSlot).toBe(false);
    expect(() => parseArgs(['--duration', '-1'])).toThrow();
  });
});
