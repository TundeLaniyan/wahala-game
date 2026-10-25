import { describe, expect, it } from 'vitest';
import { duelShare } from './helpers';

// The easy end of the seven-level ladder (decision WB4). Fixed seeds, deterministic, real match rules (crush).
describe('difficulty ladder: the easy end', () => {
  it('casual beats rookie (two levels apart)', () => {
    const r = duelShare('casual', 'rookie', 60, 1000);
    console.log('casual vs rookie', r);
    expect(r.share).toBeGreaterThan(0.55);
  }, 300_000);

  it('standard clearly beats rookie', () => {
    const r = duelShare('standard', 'rookie', 60, 1000);
    console.log('standard vs rookie', r);
    expect(r.share).toBeGreaterThan(0.8);
  }, 300_000);
});
