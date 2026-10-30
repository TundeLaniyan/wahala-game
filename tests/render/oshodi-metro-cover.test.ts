/**
 * Oshodi Transport Metropolis board cover (presentation only): the render-only cover map lines up with the sim
 * layout, every permanent tile is drawn by exactly one cover object, nothing spills onto walkable floor, the
 * objects fade as whole groups, the rail portals sit exactly over the ends of the track lanes, the camera
 * edge stays low, and the district clutter / barrier families resolve. Built headless (no DOM: textures are
 * skipped, the bus falls back to the procedural model).
 */
import { describe, expect, it } from 'vitest';
import type { Mesh } from 'three';
import type { BufferAttribute } from 'three';
import { getArena } from '../../src/sim';
import { OSHODI_TRACK_X, OSHODI_TRACK_Y } from '../../src/sim/arenas/rumbleOshodiMetro';
import {
  OSHODI_COVER,
  OSHODI_COVER_LETTERS,
  OSHODI_COVER_REACH,
  oshodiCoverGroups,
} from '../../src/render/arenas/oshodiMetroCoverMap';
import { buildOshodiMetroCover } from '../../src/render/arenas/oshodiMetroCover';
import { NEW_ARENA_ART } from '../../src/render/arenas/newArenas';
import { obstacleStyle } from '../../src/render/assets/obstacleStyles';
import { softVariantFor } from '../../src/render/assets/props';

const a = getArena('rumbleOshodiMetro');
const W = a.layout[0]!.length;
const H = a.layout.length;

describe('Oshodi cover map', () => {
  it('has a cover letter on every concrete tile and nowhere else (cover alignment)', () => {
    expect(OSHODI_COVER).toHaveLength(H);
    for (let y = 0; y < H; y++) {
      expect(OSHODI_COVER[y]).toHaveLength(W);
      for (let x = 0; x < W; x++) {
        const hard = a.layout[y]![x] === '#';
        const c = OSHODI_COVER[y]![x]!;
        expect(hard ? c in OSHODI_COVER_LETTERS : c === '.', `${x},${y} '${c}'`).toBe(true);
      }
    }
  });

  it('draws the place as real objects: 23 families, big groups, no generic crate or pillar forest', () => {
    const groups = oshodiCoverGroups();
    const kinds = new Set(groups.map((g) => g.kind));
    // every family of the map is used, and the reach table covers each of them
    expect([...kinds].sort()).toEqual([...new Set(Object.values(OSHODI_COVER_LETTERS))].sort());
    expect(kinds.size).toBe(23);
    expect(Object.keys(OSHODI_COVER_REACH)).toHaveLength(23);
    expect([...kinds].some((k) => /crate|pillar/i.test(k))).toBe(false);
    // the mean group covers several tiles; single-tile groups are the exception (kiosks, columns, posts)
    const hard = groups.reduce((n, g) => n + g.tiles.length, 0);
    expect(hard / groups.length).toBeGreaterThan(4);
    const singles = groups.filter((g) => g.tiles.length === 1).map((g) => g.kind);
    expect(new Set(singles).size).toBeLessThanOrEqual(5);
  });

  it('is organised by district: terminal and buses in the plaza, piers in the skywalk quarter, station on the rails', () => {
    const groups = oshodiCoverGroups();
    const inDistrict = (id: string, kind: string): number =>
      groups.filter((g) => g.kind === kind && g.tiles.every(([x, y]) => districtOf(x, y) === id)).length;
    function districtOf(x: number, y: number): string {
      return a.districts!.find((d) =>
        d.rects.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1),
      )!.id;
    }
    expect(inDistrict('interchangePlaza', 'terminal')).toBeGreaterThanOrEqual(3);
    expect(inDistrict('interchangePlaza', 'bus')).toBeGreaterThanOrEqual(3);
    expect(inDistrict('interchangePlaza', 'column')).toBeGreaterThanOrEqual(3);
    expect(inDistrict('skywalkQuarter', 'skyPier')).toBe(3);
    expect(inDistrict('skywalkQuarter', 'stairTower')).toBe(1);
    expect(inDistrict('railwayEdge', 'station')).toBe(2);
    expect(inDistrict('railwayEdge', 'platformPost')).toBe(2);
    expect(inDistrict('expresswayJunction', 'island')).toBe(2);
    expect(inDistrict('expresswayJunction', 'gantry')).toBe(2);
    expect(inDistrict('cappaWorks', 'workshop')).toBeGreaterThanOrEqual(2);
    expect(inDistrict('cappaWorks', 'pavilion')).toBe(1);
    expect(inDistrict('tradingStreets', 'shop')).toBeGreaterThanOrEqual(5);
  });

  it('puts a rail-bridge portal exactly over the end of each pair of track lanes', () => {
    const portals = oshodiCoverGroups().filter((g) => g.kind === 'portal');
    expect(portals).toHaveLength(2);
    for (const p of portals) {
      expect([p.x0, p.x1]).toEqual([OSHODI_TRACK_X[0], OSHODI_TRACK_X[1]]);
      expect(p.y1 - p.y0).toBe(2); // three tiles deep: hides a railcar completely
    }
    const north = portals.find((p) => p.y1 < OSHODI_TRACK_Y[0])!;
    const south = portals.find((p) => p.y0 > OSHODI_TRACK_Y[1])!;
    expect(north.y1).toBe(OSHODI_TRACK_Y[0] - 1);
    expect(south.y0).toBe(OSHODI_TRACK_Y[1] + 1);
  });

  it('keeps the camera (south) edge low: only lock-ups on the last two rows', () => {
    for (const y of [H - 2, H - 1]) expect([...OSHODI_COVER[y]!].every((c) => c === 'E')).toBe(true);
    expect(OSHODI_COVER_REACH.lockup).toBe(1);
  });
});

describe('Oshodi board cover', () => {
  const cover = buildOshodiMetroCover({ width: W, height: H })!;
  const meshes: Mesh[] = [];
  cover.object.traverse((o) => {
    if ((o as Mesh).isMesh) meshes.push(o as Mesh);
  });

  it('is registered as the stage cover and claims exactly the concrete tiles', () => {
    expect(NEW_ARENA_ART().rumbleOshodiMetro!.cover).toBeDefined();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) expect(cover.covers(y * W + x), `${x},${y}`).toBe(a.layout[y]![x] === '#');
    expect(cover.maxReach).toBeGreaterThanOrEqual(2);
    expect(NEW_ARENA_ART().rumbleOshodiMetro!.cover!({ width: 41, height: 31 })).toBeNull();
  });

  it('is cheap: a few merged meshes and a bounded triangle count (environment and draw-call budget)', () => {
    expect(meshes.length).toBeLessThanOrEqual(90);
    let tris = 0;
    for (const m of meshes) tris += m.geometry.attributes.position!.count / 3;
    expect(tris).toBeLessThan(450_000);
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
        // the far perimeter frontage (to 8 m, with rooftop billboards to 9.5), the skywalk landings (6 m) and the signal
        // masts are the tallest cover
        expect(pos.getY(i)).toBeLessThan(9.6);
      }
    }
  });

  it("keeps the camera edge under a fighter's eye line: nothing taller than 1.6 m in the last two rows", () => {
    for (const m of meshes) {
      const pos = m.geometry.attributes.position as BufferAttribute;
      for (let i = 0; i < pos.count; i++)
        if (pos.getZ(i) + H / 2 > H - 2 + 0.6) expect(pos.getY(i), `z ${pos.getZ(i)}`).toBeLessThan(1.6);
    }
  });

  it('fades a whole group when anything stands behind one of its tiles, and comes back', () => {
    const terminal = oshodiCoverGroups().find((g) => g.kind === 'terminal' && g.tiles.length > 8)!;
    const [tx, ty] = terminal.tiles[0]!;
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
    cover.commit();
    for (const m of meshes) {
      const hide = m.geometry.attributes.aHide as BufferAttribute;
      for (let i = 0; i < hide.count; i++) expect(hide.getX(i)).toBe(0);
    }
  });
});

describe('Oshodi crates', () => {
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
  it('authored barriers are barricades and tyre stacks; each district has its own clutter; five families in all', () => {
    expect(obstacleStyle('rumbleOshodiMetro').softFor).toBeDefined();
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
    expect(family(0, 0, 44, 32).size).toBeLessThanOrEqual(5);
    const works = family(23, 26, 30, 30);
    expect(works.has('prop_soft_drums') || works.has('prop_soft_tyres')).toBe(true);
    expect(family(2, 2, 8, 30).has('prop_soft_drums')).toBe(false);
  });
});
