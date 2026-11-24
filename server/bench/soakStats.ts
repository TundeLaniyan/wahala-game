/**
 * The statistics of the memory soak (pure, unit-tested in server/test/soakStats.test.ts): a least-squares trend over the
 * post-GC heap of the steady-state window, and the verdict "stable" / "growing" drawn from it. A single number such as
 * "heap went from 42 to 226 MB" proves nothing about a garbage-collected runtime: V8 grows its heap lazily and only
 * collects the old generation when it has to. What counts is the heap that SURVIVES a forced full collection.
 */

export interface Point {
  /** Seconds since the soak started. */
  t: number;
  /** Heap in use after a forced full GC, MB. */
  heapMB: number;
  /** Rooms alive at the moment of the sample (the soak's load goes up and down: see `adjustedTrend`). */
  rooms?: number;
}

export interface Trend {
  n: number;
  /** MB per minute. */
  slopeMBPerMin: number;
  /** Standard error of the slope, MB per minute (NaN with fewer than 3 points). */
  seMBPerMin: number;
  /** slope / standard error (0 when the heap is flat to the sample). */
  tStat: number;
  r2: number;
  /** MB per hour the trend projects. */
  projectedMBPerHour: number;
}

export function trend(points: readonly Point[]): Trend {
  const n = points.length;
  if (n < 2) return { n, slopeMBPerMin: NaN, seMBPerMin: NaN, tStat: 0, r2: 0, projectedMBPerHour: NaN };
  const mx = points.reduce((s, p) => s + p.t, 0) / n;
  const my = points.reduce((s, p) => s + p.heapMB, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    sxx += (p.t - mx) ** 2;
    sxy += (p.t - mx) * (p.heapMB - my);
    syy += (p.heapMB - my) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx; // MB per second
  let sse = 0;
  for (const p of points) sse += (p.heapMB - (my + slope * (p.t - mx))) ** 2;
  const se = n > 2 && sxx > 0 ? Math.sqrt(sse / (n - 2) / sxx) : NaN;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return {
    n,
    slopeMBPerMin: slope * 60,
    seMBPerMin: se * 60,
    tStat: Number.isFinite(se) && se > 0 ? slope / se : 0,
    r2,
    projectedMBPerHour: slope * 3600,
  };
}

/**
 * The trend of the post-GC heap WITH THE NUMBER OF LIVE ROOMS HELD CONSTANT: heap = a + b * minutes + c * rooms. The soak's
 * rooms come and go (a cycle ends, the next one starts), and every live room holds a few MB, so a plain trend over time is
 * dominated by which cycle happened to be running when a sample was taken: a genuine 10 MB/min growth inside one long match
 * was invisible in the mixed soak's raw trend (t = 2.2) and plain in the adjusted one. `perRoomMB` is c.
 */
export function adjustedTrend(points: readonly Point[]): (Trend & { perRoomMB: number }) | null {
  const pts = points.filter((p) => p.rooms !== undefined);
  const n = pts.length;
  if (n < 5 || new Set(pts.map((p) => p.rooms)).size < 2) return null;
  // normal equations (X'X) b = X'y for X = [1, minutes, rooms]
  const rows = pts.map((p) => [1, p.t / 60, p.rooms!] as const);
  const xtx = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const xty = [0, 0, 0];
  rows.forEach((r, k) => {
    for (let i = 0; i < 3; i++) {
      xty[i]! += r[i]! * pts[k]!.heapMB;
      for (let j = 0; j < 3; j++) xtx[i]![j]! += r[i]! * r[j]!;
    }
  });
  const inv = invert3(xtx);
  if (!inv) return null;
  const b = inv.map((row) => row.reduce((s, v, j) => s + v * xty[j]!, 0));
  let sse = 0;
  rows.forEach((r, k) => {
    const fit = b[0]! + b[1]! * r[1] + b[2]! * r[2];
    sse += (pts[k]!.heapMB - fit) ** 2;
  });
  const sigma2 = n > 3 ? sse / (n - 3) : NaN;
  const se = Math.sqrt(sigma2 * inv[1]![1]!);
  const my = pts.reduce((s, p) => s + p.heapMB, 0) / n;
  const sst = pts.reduce((s, p) => s + (p.heapMB - my) ** 2, 0);
  return {
    n,
    slopeMBPerMin: b[1]!,
    seMBPerMin: se,
    tStat: Number.isFinite(se) && se > 0 ? b[1]! / se : 0,
    r2: sst === 0 ? 0 : 1 - sse / sst,
    projectedMBPerHour: b[1]! * 60,
    perRoomMB: b[2]!,
  };
}

function invert3(m: number[][]): number[][] | null {
  const [a, b, c] = m[0]!;
  const [d, e, f] = m[1]!;
  const [g, h, i] = m[2]!;
  const det = a! * (e! * i! - f! * h!) - b! * (d! * i! - f! * g!) + c! * (d! * h! - e! * g!);
  if (Math.abs(det) < 1e-9) return null;
  return [
    [(e! * i! - f! * h!) / det, (c! * h! - b! * i!) / det, (b! * f! - c! * e!) / det],
    [(f! * g! - d! * i!) / det, (a! * i! - c! * g!) / det, (c! * d! - a! * f!) / det],
    [(d! * h! - e! * g!) / det, (b! * g! - a! * h!) / det, (a! * e! - b! * d!) / det],
  ];
}

export type Verdict = 'stable' | 'growing' | 'insufficient-data';

export interface VerdictRules {
  /** Samples needed in the steady window before any verdict is drawn. */
  minPoints: number;
  /** Seconds of steady state needed. */
  minSpanSec: number;
  /** A trend only counts as growth when its t statistic exceeds this (a noisy flat series reaches 2 by chance). */
  minTStat: number;
  /** ... and when it projects at least this many MB per hour (a few KB per minute is not a leak worth chasing). */
  minMBPerHour: number;
}

export const DEFAULT_RULES: VerdictRules = { minPoints: 6, minSpanSec: 120, minTStat: 3, minMBPerHour: 20 };

export function verdictOf(
  points: readonly Point[],
  rules: VerdictRules = DEFAULT_RULES,
): {
  verdict: Verdict;
  trend: Trend;
  raw: Trend;
  adjusted: boolean;
  firstThirdMB: number;
  lastThirdMB: number;
} {
  const raw = trend(points);
  const adj = adjustedTrend(points);
  const t: Trend = adj ?? raw;
  const third = Math.max(1, Math.floor(points.length / 3));
  const mean = (xs: readonly Point[]): number =>
    xs.length ? xs.reduce((s, p) => s + p.heapMB, 0) / xs.length : NaN;
  const firstThirdMB = mean(points.slice(0, third));
  const lastThirdMB = mean(points.slice(-third));
  const span = points.length > 1 ? points[points.length - 1]!.t - points[0]!.t : 0;
  if (points.length < rules.minPoints || span < rules.minSpanSec) {
    return { verdict: 'insufficient-data', trend: t, raw, adjusted: adj !== null, firstThirdMB, lastThirdMB };
  }
  const growing =
    t.slopeMBPerMin > 0 && t.tStat >= rules.minTStat && t.projectedMBPerHour >= rules.minMBPerHour;
  return {
    verdict: growing ? 'growing' : 'stable',
    trend: t,
    raw,
    adjusted: adj !== null,
    firstThirdMB,
    lastThirdMB,
  };
}

/** Nearest-rank percentile of a list (NaN when empty). */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(s.length * p) - 1))]!;
}
