/** The endgame curve, read from the game clock. */
import { describe, expect, it } from 'vitest';
import {
  COMPENSATION_DB,
  MAX_TEMPO,
  matchClock,
  tempoFor,
  toneFor,
  urgencyAt,
  urgencyOf,
} from '../../src/audio/escalation';
import { playState } from './helpers';

describe('tempo curve', () => {
  it('is 1.0 until 30 s remain, then eases up to ~1.09 at 0:00 (pitch preserved)', () => {
    expect(tempoFor(urgencyAt(45), true)).toBe(1);
    expect(tempoFor(urgencyAt(30), true)).toBe(1);
    expect(tempoFor(urgencyAt(15), true)).toBeCloseTo(1.045, 6);
    expect(tempoFor(urgencyAt(0), true)).toBeCloseTo(1.09, 6);
    expect(MAX_TEMPO).toBeGreaterThanOrEqual(1.08);
    expect(MAX_TEMPO).toBeLessThanOrEqual(1.1);
  });

  it('rises monotonically and smoothly (no step at 30 s, no jump at the buzzer)', () => {
    let prev = 1;
    for (let r = 30; r >= 0; r -= 0.25) {
      const t = tempoFor(urgencyAt(r), true);
      expect(t).toBeGreaterThanOrEqual(prev);
      expect(t - prev).toBeLessThan(0.0025); // per quarter second
      prev = t;
    }
    expect(urgencyAt(29.9)).toBeLessThan(0.001);
  });

  it('never changes the rate when pitch cannot be preserved', () => {
    for (const r of [45, 30, 15, 0]) expect(tempoFor(urgencyAt(r), false)).toBe(1);
  });

  it('only the playing phase escalates; bad input is calm', () => {
    expect(urgencyOf({ phase: 'countdown', remaining: 0 })).toBe(0);
    expect(urgencyOf({ phase: 'ended', remaining: 0 })).toBe(0);
    expect(urgencyOf({ phase: 'playing', remaining: 0 })).toBe(1);
    expect(urgencyAt(Number.NaN)).toBe(0);
    expect(urgencyAt(-5)).toBe(1);
  });
});

describe('brightness / drive with gain compensation', () => {
  it('opens the shelf and punch while the trim cuts the added energy (never louder than unity)', () => {
    const calm = toneFor(0);
    expect(calm).toEqual({ shelfDb: 0, punchDb: 0, trim: 1 });
    const mid = toneFor(urgencyAt(15));
    const full = toneFor(1);
    expect(full.shelfDb).toBeGreaterThan(mid.shelfDb);
    expect(full.punchDb).toBeGreaterThan(0);
    expect(full.trim).toBeLessThan(mid.trim);
    expect(mid.trim).toBeLessThan(1);
    expect(20 * Math.log10(full.trim)).toBeCloseTo(-COMPENSATION_DB, 6);
    expect(COMPENSATION_DB).toBeGreaterThan(1); // at least 1 dB back out for a 3.5 dB shelf + 2 dB punch
  });
});

describe('clock', () => {
  it('reads (durationTicks - playTicks) / 60 from the sim state without changing it', () => {
    const s = playState(2);
    s.match.phase = 'playing';
    s.match.playTicks = s.config.match.durationTicks - 15 * 60;
    const before = JSON.stringify(s.match);
    expect(matchClock(s)).toEqual({ phase: 'playing', remaining: 15 });
    expect(JSON.stringify(s.match)).toBe(before);
    s.match.playTicks = s.config.match.durationTicks + 30;
    expect(matchClock(s).remaining).toBe(0);
  });
});
