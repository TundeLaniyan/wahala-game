import { describe, expect, it } from 'vitest';
import { observe } from '../src/sim';
import { sandbox } from './helpers';

describe('observe', () => {
  it('hides the RNG state and pickups concealed under soft blocks', () => {
    const s = sandbox({ keepSoft: true });
    expect(Object.keys(s.hidden).length).toBeGreaterThan(0);
    const view = observe(s, 0) as unknown as Record<string, unknown>;
    expect(view).not.toHaveProperty('hidden');
    expect(view).not.toHaveProperty('rngState');
    expect(view).not.toHaveProperty('seed');
    expect(view.tiles).toBe(s.tiles);
  });
});
