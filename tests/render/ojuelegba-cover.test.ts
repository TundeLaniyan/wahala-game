/**
 * Ojuelegba Underbridge board cover (presentation only): the render-only cover map lines up with the sim
 * layout, every permanent tile is drawn by exactly one cover object, nothing spills onto walkable floor,
 * the objects fade as whole groups, and the district clutter / barrier families resolve. Built headless
 * (no DOM: textures are skipped, the Danfo falls back to the procedural model).
 */
import { describe, expect, it } from 'vitest';
import type { Mesh } from 'three';
import type { BufferAttribute } from 'three';
import { getArena } from '../../src/sim';
import { COVER_LETTERS, OJUELEGBA_COVER, coverGroups } from '../../src/render/arenas/ojuelegbaCoverMap';
import { buildOjuelegbaCover } from '../../src/render/arenas/ojuelegbaCover';
import { NEW_ARENA_ART } from '../../src/render/arenas/newArenas';
import { obstacleStyle } from '../../src/render/assets/obstacleStyles';
import { softVariantFor } from '../../src/render/assets/props';

const a = getArena('rumbleOjuelegba');
const W = a.layout[0]!.length;
const H = a.layout.length;

describe('Ojuelegba cover map', () => {
  it('has a cover letter on every concrete tile and nowhere else', () => {
    expect(OJUELEGBA_COVER).toHaveLength(H);
    for (let y = 0; y < H; y++) {
      expect(OJUELEGBA_COVER[y]).toHaveLength(W);
      for (let x = 0; x < W; x++) {
        const hard = a.layout[y]![x] === '#';
        const c = OJUELEGBA_COVER[y]![x]!;
        expect(hard ? c in COVER_LETTERS : c === '.', `${x},${y} '${c}'`).toBe(true);
      }
    }
  });

  it('groups are real objects: 2 x 2 piers, two-tile buses side by side, multi-tile buildings', () => {
    const groups = coverGroups();
    const of = (k: string) => groups.filter((g) => g.kind === k);
    expect(of('pier')).toHaveLength(8);
    for (const g of of('pier')) expect([g.x1 - g.x0, g.y1 - g.y0, g.tiles.length]).toEqual([1, 1, 4]);
    // every Danfo row is one bus two tiles long; groups hold two or three buses
    const buses = of('danfo');
    expect(buses.reduce((n, g) => n + g.y1 - g.y0 + 1, 0)).toBe(17);
    for (const g of buses) {
      expect(g.x1 - g.x0).toBe(1);
      expect(g.y1 - g.y0 + 1).toBeGreaterThanOrEqual(2);
    }
    for (const g of of('shop')) expect(g.tiles.length).toBeGreaterThanOrEqual(8);
    // most permanent cover is big: the mean group covers several tiles (not a pillar forest)
    const hard = groups.reduce((n, g) => n + g.tiles.length, 0);
    expect(hard / groups.length).toBeGreaterThan(3.5);
    expect(groups.filter((g) => g.tiles.length === 1).length).toBeLessThanOrEqual(4);
  });
});

describe('Ojuelegba board cover', () => {
  const cover = buildOjuelegbaCover({ width: W, height: H })!;
  const meshes: Mesh[] = [];
  cover.object.traverse((o) => {
    if ((o as Mesh).isMesh) meshes.push(o as Mesh);
  });

  it('is registered as the stage cover and claims exactly the concrete tiles', () => {
    expect(NEW_ARENA_ART().rumbleOjuelegba!.cover).toBeDefined();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) expect(cover.covers(y * W + x), `${x},${y}`).toBe(a.layout[y]![x] === '#');
    expect(cover.maxReach).toBeGreaterThanOrEqual(2);
  });

  it('is cheap: a few merged meshes and a bounded triangle count', () => {
    expect(meshes.length).toBeLessThanOrEqual(90);
    let tris = 0;
    for (const m of meshes) tris += m.geometry.attributes.position!.count / 3;
    expect(tris).toBeLessThan(400_000);
  });

  it('never spills onto walkable floor (beyond a shallow awning or kerb overhang)', () => {
    const covered = (x: number, z: number): boolean => {
      const tx = Math.floor(x + W / 2);
      const ty = Math.floor(z + H / 2);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const cx = tx + dx;
          const cy = ty + dy;
          if (a.layout[cy]?.[cx] !== '#') continue;
          // distance from the point to that tile's square
          const ox = Math.max(0, Math.abs(x - (cx - W / 2 + 0.5)) - 0.5);
          const oz = Math.max(0, Math.abs(z - (cy - H / 2 + 0.5)) - 0.5);
          if (Math.hypot(ox, oz) <= 0.42) return true;
        }
      return false;
    };
    for (const m of meshes) {
      const pos = m.geometry.attributes.position as BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        expect(covered(x, z), `vertex ${x.toFixed(2)},${pos.getY(i).toFixed(2)},${z.toFixed(2)}`).toBe(true);
        expect(pos.getY(i)).toBeLessThan(3.2); // a shop roof tank is the tallest thing
      }
    }
  });

  it('fades a whole group when anything stands behind one of its tiles, and comes back', () => {
    const groups = coverGroups();
    const shop = groups.find((g) => g.kind === 'shop')!;
    const [tx, ty] = shop.tiles[0]!;
    cover.setHide(ty * W + tx, 0.5);
    cover.commit();
    let faded = 0;
    let solid = 0;
    for (const m of meshes) {
      const hide = m.geometry.attributes.aHide as BufferAttribute;
      for (let i = 0; i < hide.count; i++) {
        if (hide.getX(i) === 0.5) faded++;
        else if (hide.getX(i) === 0) solid++;
      }
    }
    expect(faded).toBeGreaterThan(100);
    expect(solid).toBeGreaterThan(faded);
    // the far end of the same building fades too
    const [ex, ey] = shop.tiles[shop.tiles.length - 1]!;
    expect(cover.covers(ey * W + ex)).toBe(true);
    cover.commit();
    for (const m of meshes) {
      const hide = m.geometry.attributes.aHide as BufferAttribute;
      for (let i = 0; i < hide.count; i++) expect(hide.getX(i)).toBe(0);
    }
  });
});

describe('Ojuelegba crates', () => {
  const variants = [
    'prop_soft_barrier',
    'prop_soft_cabledrum',
    'prop_soft_cartons',
    'prop_soft_crate',
    'prop_soft_crate_b',
    'prop_soft_crates',
    'prop_soft_drums',
    'prop_soft_kegs',
    'prop_soft_sacks',
    'prop_soft_tyres',
  ];
  it('authored barriers are tyre stacks and road barricades; each district has its own clutter', () => {
    expect(obstacleStyle('rumbleOjuelegba').softFor).toBeDefined();
    a.layout.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c === 'x')
          expect(['prop_soft_tyres', 'prop_soft_barrier']).toContain(softVariantFor(x, y, variants, a.id));
      }),
    );
    const family = (x0: number, y0: number, x1: number, y1: number): Set<string> => {
      const out = new Set<string>();
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++)
          if (a.layout[y]![x] === '.') out.add(softVariantFor(x, y, variants, a.id));
      return out;
    };
    const yard = family(27, 23, 41, 29);
    expect(yard.has('prop_soft_drums')).toBe(true);
    expect(yard.has('prop_soft_sacks')).toBe(false);
    const lane = family(0, 24, 24, 32);
    expect(lane.has('prop_soft_sacks')).toBe(true);
    expect(lane.has('prop_soft_drums')).toBe(false);
  });
});
