import { describe, expect, it } from 'vitest';
import { duelShare } from './helpers';

// The hard end of the seven-level ladder (decision WB4). Fixed seeds, deterministic, real match rules (crush).
describe('difficulty ladder: the hard end', () => {
  it('skilled beats casual (two levels apart)', () => {
    const r = duelShare('skilled', 'casual', 60, 1000);
    console.log('skilled vs casual', r);
    expect(r.share).toBeGreaterThan(0.6);
  }, 300_000);

  it('nightmare beats skilled (two levels apart)', () => {
    const r = duelShare('nightmare', 'skilled', 60, 1000);
    console.log('nightmare vs skilled', r);
    expect(r.share).toBeGreaterThan(0.55);
  }, 300_000);

  it('nightmare clearly beats standard', () => {
    const r = duelShare('nightmare', 'standard', 60, 1000);
    console.log('nightmare vs standard', r);
    expect(r.share).toBeGreaterThan(0.6);
  }, 300_000);
});
