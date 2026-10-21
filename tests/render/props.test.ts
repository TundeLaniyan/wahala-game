import { describe, expect, it } from 'vitest';
import { softVariantFor } from '../../src/render/assets/props';

const ALL = [
  'prop_soft_barrier',
  'prop_soft_cartons',
  'prop_soft_crate',
  'prop_soft_crate_b',
  'prop_soft_crates',
  'prop_soft_kegs',
  'prop_soft_sacks',
  'prop_soft_tyres',
];

describe('destructible prop variety', () => {
  it('is deterministic per tile and weighted towards wooden crates', () => {
    const counts = new Map<string, number>();
    for (let y = 0; y < 11; y++)
      for (let x = 0; x < 15; x++) {
        const v = softVariantFor(x, y, ALL);
        expect(softVariantFor(x, y, ALL)).toBe(v);
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
    const crates = ['prop_soft_crate', 'prop_soft_crate_b', 'prop_soft_crates'].reduce(
      (n, k) => n + (counts.get(k) ?? 0),
      0,
    );
    expect(crates / 165).toBeGreaterThan(0.35);
    for (const v of ALL) expect(counts.get(v) ?? 0).toBeGreaterThan(0); // every model still appears
  });

  it('falls back gracefully to any variant list (procedural props)', () => {
    const list = ['crate', 'tyres', 'sacks'];
    expect(list).toContain(softVariantFor(3, 4, list));
  });
});
