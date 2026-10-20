import { describe, expect, it } from 'vitest';
import { duelShare } from './helpers';

// Fixed seeds: the result is fully deterministic. 100 duels, seats alternate.
describe('difficulty ordering: hard vs medium', () => {
  it('hard beats medium with a clear margin', () => {
    const r = duelShare('hard', 'medium', 100, 1000);
    console.log('hard vs medium', r);
    expect(r.share).toBeGreaterThan(0.6);
  }, 120000);
});
