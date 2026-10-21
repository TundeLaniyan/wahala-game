import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARENAS } from '../../src/sim';
import { THEMES, themeFor } from '../../src/render/themes';

const model = (id: string): boolean => existsSync(`src/assets/models/${id}.glb`);
const texture = (name: string): boolean => existsSync(`src/assets/textures/${name}.jpg`);

describe('arena themes', () => {
  it('gives every playable arena its own theme', () => {
    for (const id of Object.keys(ARENAS)) {
      expect(THEMES[id]).toBeDefined();
      expect(themeFor(id).id).toBe(id);
    }
  });

  it.each(Object.values(THEMES).map((t) => [t.id, t] as const))(
    '%s only references bundled assets',
    (_, t) => {
      for (const id of [...t.hardIsolated, ...(t.hardJoined ? [t.hardJoined] : []), ...Object.keys(t.soft)])
        expect(model(id), id).toBe(true);
      for (const id of [...t.walls, t.wallCorner, ...(t.platform ? [t.platform] : [])])
        expect(model(id), id).toBe(true);
      for (const part of ['albedo', 'normal', 'orm']) expect(texture(`${t.floor}_${part}`)).toBe(true);
    },
  );

  it('draws the arenas with different floors, obstacles, walls and props (not a palette swap)', () => {
    const [a, b] = [themeFor('danfoBusPark'), themeFor('balogunMarket')];
    expect(a.floor).not.toBe(b.floor);
    expect(a.sky).not.toBe(b.sky);
    const overlap = (x: string[], y: string[]): string[] => x.filter((id) => y.includes(id));
    expect(overlap(a.hardIsolated, b.hardIsolated)).toEqual([]);
    expect(overlap(a.walls, b.walls)).toEqual([]);
    expect(a.wallCorner).not.toBe(b.wallCorner);
    // a couple of generic goods (sacks, cartons) may appear in both, but most of the weight differs
    const shared = overlap(Object.keys(a.soft), Object.keys(b.soft));
    const weight = (t: typeof a, ids: string[]): number => ids.reduce((n, id) => n + (t.soft[id] ?? 0), 0);
    expect(weight(b, shared) / weight(b, Object.keys(b.soft))).toBeLessThan(0.25);
    expect(a.sign.text).not.toBe(b.sign.text);
  });

  it('maps market goods to their own debris colours', () => {
    const t = themeFor('balogunMarket');
    expect(t.debris('mkt_soft_fabric')).toBe('fabric');
    expect(t.debris('mkt_soft_produce')).toBe('produce');
    expect(themeFor('danfoBusPark').debris('prop_soft_tyres')).toBe('tyres');
  });
});
