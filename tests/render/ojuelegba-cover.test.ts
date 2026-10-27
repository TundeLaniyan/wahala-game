/**
 * Ojuelegba Underbridge board cover (presentation only): the render-only cover map lines up with the sim
 * layout, every permanent tile is drawn by exactly one cover object, nothing spills onto walkable floor,
 * the objects fade as whole groups, and the district clutter / barrier families resolve. Built headless
 * (no DOM: textures are skipped, the Danfo falls back to the procedural model).
 */
import { describe, expect, it } from 'vitest';
import type { Mesh } from 'three';
import type { BufferAttribute, Material } from 'three';
import { getArena } from '../../src/sim';
import { COVER_LETTERS, OJUELEGBA_COVER, coverGroups } from '../../src/render/arenas/ojuelegbaCoverMap';
import { buildOjuelegbaCover } from '../../src/render/arenas/ojuelegbaCover';
import { PIER_CUT } from '../../src/render/arenas/ojuelegbaDeck';
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

  it('groups are real objects: a few large piers in unequal bays, packed buses, long buildings', () => {
    const groups = coverGroups();
    const of = (k: string) => groups.filter((g) => g.kind === k);
    // a SMALL number of LARGE piers: two pairs round the clear bay, then an offset bent past a wider opening
    const piers = of('pier');
    expect(piers).toHaveLength(6);
    for (const g of piers) {
      expect(g.x1 - g.x0).toBe(1);
      expect(g.tiles.length).toBeGreaterThanOrEqual(4);
    }
    const xs = [...new Set(piers.map((g) => g.x0))].sort((a, b) => a - b);
    const bays = xs.slice(1).map((x, i) => x - xs[i]!);
    expect(new Set(bays).size).toBe(bays.length); // unequal bays, not a colonnade
    // eighteen Danfos: rows packed nose-to-tail (east-west) and bays of buses side by side (north-south)
    const buses =
      of('danfo').reduce((n, g) => n + ((g.x1 - g.x0 + 1) / 2) * (g.y1 - g.y0 + 1), 0) +
      of('danfoNS').reduce((n, g) => n + ((g.y1 - g.y0 + 1) / 2) * (g.x1 - g.x0 + 1), 0);
    expect(buses).toBe(18);
    for (const g of of('danfo')) expect((g.x1 - g.x0 + 1) % 2).toBe(0);
    for (const g of of('danfoNS')) expect((g.y1 - g.y0 + 1) % 2).toBe(0);
    for (const g of of('shop')) expect(g.tiles.length).toBeGreaterThanOrEqual(10);
    // most permanent cover is big: the mean group covers several tiles (not a pillar forest)
    const hard = groups.reduce((n, g) => n + g.tiles.length, 0);
    expect(hard / groups.length).toBeGreaterThan(6);
    expect(groups.filter((g) => g.tiles.length === 1).length).toBeLessThanOrEqual(3);
  });
});

describe('Ojuelegba board cover', () => {
  const cover = buildOjuelegbaCover({ width: W, height: H })!;
  const meshes: Mesh[] = [];
  const overhead: Mesh[] = [];
  cover.object.traverse((o) => {
    if ((o as Mesh).isMesh) (o.name === 'ojuelegbaDeck' ? overhead : meshes).push(o as Mesh);
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
        expect(pos.getY(i)).toBeLessThan(4.5); // the far perimeter buildings and the raised bus-stop name board (about 4.4 m) are the tallest cover
      }
    }
  });

  it('the flyover overhead keeps to the outer edges over the pier court and is cut away near the camera', () => {
    expect(overhead).toHaveLength(1);
    const deck = overhead[0]!;
    const pos = deck.geometry.attributes.position as BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      // never below the pier stubs (fighters, generators and crates stay clear), only over the deck columns
      // 15-29 and no further south than its cut end over the south bent (row 21)
      expect(pos.getY(i)).toBeGreaterThanOrEqual(PIER_CUT - 0.01);
      expect(pos.getX(i) + W / 2).toBeGreaterThan(14.5);
      expect(pos.getX(i) + W / 2).toBeLessThan(30.5);
      expect(pos.getZ(i) + H / 2).toBeLessThan(22.1);
    }
    // the central deck is cut away: nothing spans the middle of the deck between the bents (rows 14-18)
    const material = deck.material as Material;
    expect(String(material.userData.programKey)).toContain('deckcut');
    let middle = 0;
    for (let i = 0; i < pos.count; i++)
      if (Math.abs(pos.getZ(i) - 0) < 1.5 && Math.abs(pos.getX(i)) < 4) middle++;
    expect(middle).toBe(0);
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
    const yard = family(2, 2, 42, 8);
    expect(yard.has('prop_soft_drums')).toBe(true);
    expect(yard.has('prop_soft_cartons')).toBe(false);
    // five families on the whole board (each is its own instanced draw)
    expect(family(0, 0, 44, 32).size).toBeLessThanOrEqual(5);
    const lane = family(0, 24, 30, 30);
    expect(lane.has('prop_soft_cartons')).toBe(true);
    expect(lane.has('prop_soft_drums')).toBe(false);
  });
});
