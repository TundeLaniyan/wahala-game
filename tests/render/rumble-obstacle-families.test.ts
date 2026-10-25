import { describe, expect, it } from 'vitest';
import { obstacleStyle, pillarIndexFor, resolvePillars } from '../../src/render/assets/obstacleStyles';

/** V2 stage obstacle families (presentation only): zoned styles mix their models and respect their zones. */
describe('V2 obstacle families', () => {
  it('a container block of the Apapa yard draws both container models; the corner sheds draw precast panels', () => {
    const apapa = obstacleStyle('rumbleApapa');
    const ids = resolvePillars(apapa, [
      'prop_pillar_container_a',
      'prop_pillar_container_b',
      'prop_pillar_a',
      'prop_pillar_b',
    ]);
    const seen = new Set<string>();
    for (let x = 15; x <= 18; x++)
      for (let y = 3; y <= 4; y++) seen.add(ids[pillarIndexFor(apapa, ids, x, y)]!);
    expect(seen).toEqual(new Set(['prop_pillar_container_a', 'prop_pillar_container_b']));
    for (let x = 1; x <= 9; x++) expect(ids[pillarIndexFor(apapa, ids, x, 3)]).toMatch(/^prop_pillar_[ab]$/);
  });

  it('Ojuelegba draws flyover piers under the bridge only', () => {
    const oju = obstacleStyle('rumbleOjuelegba');
    const ids = resolvePillars(oju, [
      'prop_pillar_pier',
      'prop_pillar_wallstub',
      'prop_pillar_c',
      'prop_pillar_a',
    ]);
    for (const y of [1, 3, 5, 9]) expect(ids[pillarIndexFor(oju, ids, 15, y)]).toBe('prop_pillar_pier');
    for (const x of [1, 2, 3, 5, 6, 7])
      expect(ids[pillarIndexFor(oju, ids, x, 1)]).not.toBe('prop_pillar_pier');
  });

  it('a style without zones keeps the original placement hash (the approved standard arenas never reshuffle)', () => {
    const market = obstacleStyle('cityRumble');
    const ids = resolvePillars(market, [...market.pillars]);
    for (let x = 0; x < 15; x++)
      for (let y = 0; y < 11; y++)
        expect(pillarIndexFor(market, ids, x, y)).toBe((x * 5 + y * 3 + ((x ^ y) & 3)) % ids.length);
  });
});
