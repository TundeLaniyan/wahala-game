/**
 * Amarite Way paving (docs/LEKKI_AMARITE_WAY.md): the interlocking block geometry tiles a row with no gap and no overlap,
 * alternate rows are offset, the scale is the readable one (not sub-pixel), and ONLY Amarite Way's straight road tiles
 * are paved: the map's other roads, both junctions and every non-road tile are untouched.
 */
import { describe, expect, it } from 'vitest';
import { getArena } from '../../src/sim';
import { AMARITE_PAVERS, blockOutline, periodOf, rowBlocks } from '../../src/render/arenas/community/pavers';
import { AMARITE_WAY_PAVED } from '../../src/render/arenas/lekkiAmarite';
import { T } from '../../src/render/arenas/floorKit';

type P = [number, number][];
function inside(poly: P, x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

describe('interlocking block geometry', () => {
  const s = AMARITE_PAVERS;

  it('is a stepped Z: a rectangle with two notches, inside its bounding box', () => {
    const o = blockOutline(10, 20, s);
    expect(o).toHaveLength(8);
    for (const [x, y] of o) {
      expect(x).toBeGreaterThanOrEqual(10);
      expect(x).toBeLessThanOrEqual(10 + s.length);
      expect(y).toBeGreaterThanOrEqual(20);
      expect(y).toBeLessThanOrEqual(20 + s.height);
    }
  });

  it('blocks of a row interlock with no gap and no overlap, and rows are offset by half a period', () => {
    const rand = lcg(7);
    const x0 = 300;
    const x1 = 600;
    for (const row of [0, 1, 2, 3]) {
      const y = 100 + row * s.height;
      const blocks = rowBlocks(x0, x1, y, row, s);
      for (let k = 0; k < 1500; k++) {
        const px = x0 + 40 + rand() * (x1 - x0 - 80);
        const py = y + rand() * s.height;
        const n = blocks.filter((b) => inside(b, px, py)).length;
        expect(n, `row ${row} (${px.toFixed(2)}, ${py.toFixed(2)})`).toBe(1);
      }
    }
    const a = rowBlocks(0, 400, 0, 0, s)[3]![0]![0];
    const b = rowBlocks(0, 400, 0, 1, s).map((p) => p[0]![0]);
    const rel = (a - b.find((x) => Math.abs(x - a) < periodOf(s))!) % periodOf(s);
    expect(Math.abs(rel)).toBeCloseTo(periodOf(s) / 2, 5);
  });

  it('is readable: a block is 12-24 floor-canvas texels long at the Lekki scale, never sub-pixel', () => {
    const texelsPerTile = (2560 / (57 * T)) * T; // the floor canvas is capped at 2560 px (floors.ts), 57 columns
    const texLength = (s.length / T) * texelsPerTile;
    const texWidth = (s.height / T) * texelsPerTile;
    expect(texLength).toBeGreaterThan(12);
    expect(texLength).toBeLessThan(24);
    expect(texWidth).toBeGreaterThan(6);
  });
});

describe('only Amarite Way is paved', () => {
  const layout = getArena('rumbleLekki').layout;
  const paved = new Set<string>();
  for (const r of AMARITE_WAY_PAVED)
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) paved.add(`${x},${y}`);

  it('every paved tile is a road tile of the existing map, inside the boulevard columns', () => {
    for (const k of paved) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      expect(layout[y]![x], k).toBe('=');
      expect(x).toBeGreaterThanOrEqual(20);
      expect(x).toBeLessThanOrEqual(23);
    }
    expect(paved.size).toBe(4 * (7 + 8));
  });

  it('Freedom Way, the expressway and both junctions keep their asphalt', () => {
    for (const k of paved) {
      const y = Number(k.split(',')[1]);
      expect(y >= 17 && y <= 21, `junction row ${k}`).toBe(false); // Freedom Way (18-20) and its junction
      expect(y >= 30, `expressway ${k}`).toBe(false);
    }
    let otherRoad = 0;
    layout.forEach((row, y) =>
      [...row].forEach((c, x) => c === '=' && !paved.has(`${x},${y}`) && otherRoad++),
    );
    expect(otherRoad).toBeGreaterThan(paved.size * 3); // most road tiles stay asphalt
  });

  it('the map geometry is unchanged: the paving is art only (the sim layout still has the same road tiles)', () => {
    const a = getArena('rumbleLekki');
    expect(a.layout[0]!.length).toBe(57);
    expect(a.layout.length).toBe(39);
  });
});
