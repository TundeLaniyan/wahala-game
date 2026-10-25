import { describe, expect, it } from 'vitest';
import { duelShare } from './helpers';

// Fixed seeds: the result is fully deterministic. 80 duels, seats alternate.
describe('difficulty ordering: hard vs easy', () => {
  it('hard beats easy with a clear margin', () => {
    const r = duelShare('expert', 'beginner', 80, 1000);
    console.log('hard vs easy', r);
    expect(r.share).toBeGreaterThan(0.6);
  }, 120000);
});
