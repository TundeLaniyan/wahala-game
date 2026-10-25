import { describe, expect, it } from 'vitest';
import { duelShare } from './helpers';

// Fixed seeds: the result is fully deterministic. 80 duels, seats alternate, real match rules (crush).
describe('difficulty ordering: standard vs beginner (two levels apart)', () => {
  it('standard beats beginner with a clear margin', () => {
    const r = duelShare('standard', 'beginner', 80, 1000);
    console.log('standard vs beginner', r);
    expect(r.share).toBeGreaterThan(0.6);
  }, 300_000);
});
