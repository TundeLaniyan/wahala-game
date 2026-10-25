import { describe, expect, it } from 'vitest';
import { duelShare } from './helpers';

// Fixed seeds: the result is fully deterministic. 100 duels, seats alternate, real match rules (crush).
describe('difficulty ordering: expert vs standard (two levels apart)', () => {
  it('expert beats standard with a clear margin', () => {
    const r = duelShare('expert', 'standard', 100, 1000);
    console.log('expert vs standard', r);
    expect(r.share).toBeGreaterThan(0.6);
  }, 300_000);
});
