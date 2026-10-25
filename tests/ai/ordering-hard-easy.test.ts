import { describe, expect, it } from 'vitest';
import { duelShare } from './helpers';

// Fixed seeds: the result is fully deterministic. 80 duels, seats alternate, real match rules (crush).
describe('difficulty ordering: expert vs beginner', () => {
  it('expert beats beginner with a clear margin', () => {
    const r = duelShare('expert', 'beginner', 80, 1000);
    console.log('expert vs beginner', r);
    expect(r.share).toBeGreaterThan(0.7);
  }, 300_000);
});
