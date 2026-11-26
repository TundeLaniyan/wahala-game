/**
 * A destroyed vehicle breaks up into coloured chunks. The Okada had no colours, so destroying one threw inside the render loop
 * (found by the private multiplayer browser run, which saw "Cannot read properties of undefined (reading 'length')" in
 * `Effects.wreck`). Every vehicle kind has colours now, and an unknown kind falls back instead of throwing.
 */
import { describe, expect, it } from 'vitest';
import { WRECK_COLORS, wreckColors } from '../../src/render/wreckColors';
import { DEFAULT_CONFIG, RUMBLE_ARENA_IDS, getArena } from '../../src/sim';

const KINDS = ['danfo', 'taxi', 'keke', 'okada'] as const;

describe('wreck colours', () => {
  it('has chunk colours for every vehicle kind, three RGB triples in range', () => {
    for (const k of KINDS) {
      const c = WRECK_COLORS[k];
      expect(c, k).toHaveLength(3);
      for (const rgb of c) {
        expect(rgb).toHaveLength(3);
        for (const v of rgb) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('covers every kind any arena allows (the Okada is allowed on the Rumble stages)', () => {
    const allowed = new Set<string>(DEFAULT_CONFIG.vehicles.allowed);
    for (const id of RUMBLE_ARENA_IDS)
      for (const k of getArena(id).config?.vehicles?.allowed ?? []) allowed.add(k as string);
    expect(allowed.has('okada'), 'some Rumble stage allows the Okada').toBe(true);
    for (const k of allowed) expect(Object.keys(WRECK_COLORS), k).toContain(k);
  });

  it('an unknown kind falls back to the Danfo colours and never returns undefined', () => {
    expect(wreckColors('hovercraft')).toBe(WRECK_COLORS.danfo);
    expect(wreckColors('')).toBe(WRECK_COLORS.danfo);
  });
});
