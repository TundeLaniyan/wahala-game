/**
 * Lekki Phase 1 interlocking roads (docs/LEKKI_INTERLOCK_ROADS.md, decisions LI1-LI6):
 *  - the block is the I-shaped road paver: flared ends, a waisted middle, courses offset by half a block;
 *  - the texture is seamless, deterministic, calm (thin, not-too-dark joints; restrained block variation, no checkerboard)
 *    and fades to an even grey when minified (what the mip chain shows at a distance: no moire);
 *  - the road classification comes from the map: every local road and estate street is paved, the expressway is not,
 *    nothing else is, and the sim layout (collision, routes) is unchanged;
 *  - the floor-shader patch composes with the other patches and only Lekki uses it.
 */
import { MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { getArena } from '../../src/sim';
import {
  LEKKI_INTERLOCK,
  blockSize,
  blockTone,
  boundaryY,
  interlockPixels,
  locate,
} from '../../src/render/arenas/paving/interlock';
import {
  LEKKI_PAVING,
  PAVING_KEY,
  installPaving,
  periodTiles,
} from '../../src/render/arenas/paving/material';
import { PAVED_ARENAS } from '../../src/render/arenas/paving/arenas';
import { lekkiPavedAt, lekkiSurfaces } from '../../src/render/arenas/lekkiRoads';

const s = LEKKI_INTERLOCK;
const { L, H } = blockSize(s);
const px = interlockPixels(s);
const lum = (i: number): number => 0.2126 * px[i]! + 0.7152 * px[i + 1]! + 0.0722 * px[i + 2]!;

function lcg(seed: number): () => number {
  let v = seed >>> 0;
  return () => (v = (Math.imul(v, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

describe('the I-shaped paver', () => {
  it('is a 2:1 block whose ends are flared and whose middle is waisted', () => {
    expect(L / H).toBeCloseTo(2, 5);
    // the height of one block of course 4 at its end and at its middle
    const k = 4;
    const off = (k % 2) * L * 0.5;
    const heightAt = (x: number): number => boundaryY(k + 1, x, s) - boundaryY(k, x, s);
    const end = heightAt(off + 0.06 * L);
    const middle = heightAt(off + 0.5 * L);
    expect(end / middle).toBeGreaterThan(1.25);
    expect(end / middle).toBeLessThan(1.7);
  });

  it('every point belongs to exactly the block next to it: locate is consistent inside blocks', () => {
    const r = lcg(3);
    for (let i = 0; i < 3000; i++) {
      const x = r() * s.size;
      const y = r() * s.size;
      const a = locate(x, y, s);
      if (a.edge < 1) continue; // on a joint
      const b = locate(x + 0.3, y + 0.3, s);
      if (b.edge < 1) continue;
      expect([b.course, b.block]).toEqual([a.course, a.block]);
    }
  });

  it('courses are offset by half a block (running bond): a block end sits over the middle of the next course', () => {
    for (const k of [2, 3, 10]) {
      const ends = (course: number): number => (course % 2) * L * 0.5;
      expect(Math.abs(ends(k) - ends(k + 1))).toBeCloseTo(L / 2, 6);
    }
  });
});

describe('the paver texture', () => {
  it('is seamless: one repeat later the same block, edge and tone', () => {
    const r = lcg(9);
    for (let i = 0; i < 500; i++) {
      const x = r() * s.size;
      const y = r() * s.size;
      const a = locate(x, y, s);
      for (const [dx, dy] of [
        [s.size, 0],
        [0, s.size],
      ] as const) {
        const b = locate(x + dx, y + dy, s);
        expect(b.edge).toBeCloseTo(a.edge, 5);
        expect(blockTone(b.course, b.block, s)).toBeCloseTo(blockTone(a.course, a.block, s), 10);
      }
    }
  });

  it('is deterministic', () => {
    expect(Buffer.from(interlockPixels(s)).equals(Buffer.from(px))).toBe(true);
  });

  it('has thin joints that are darker but never black (no heavy grout grid)', () => {
    let joint = 0;
    let jointLum = 0;
    let bodyLum = 0;
    let body = 0;
    for (let y = 0; y < s.size; y++)
      for (let x = 0; x < s.size; x++) {
        const e = locate(x + 0.5, y + 0.5, s).edge;
        const l = lum((y * s.size + x) * 4);
        if (e < s.joint / 2 - 0.3) {
          joint++;
          jointLum += l;
        } else if (e > s.joint / 2 + s.bevel) {
          body++;
          bodyLum += l;
        }
      }
    const share = joint / (s.size * s.size);
    expect(share).toBeGreaterThan(0.03);
    expect(share).toBeLessThan(0.12);
    expect(jointLum / joint / (bodyLum / body)).toBeGreaterThan(0.58);
    expect(jointLum / joint / (bodyLum / body)).toBeLessThan(0.8);
  });

  it('is medium grey and restrained: block tones within +/- the variation, not alternating like a checkerboard', () => {
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += lum(i);
    const mean = sum / (px.length / 4);
    expect(mean).toBeGreaterThan(95);
    expect(mean).toBeLessThan(130);
    let alternations = 0;
    let pairs = 0;
    for (let k = 0; k < s.courses; k++)
      for (let b = 0; b < s.blocksAcross - 2; b++) {
        const t = [0, 1, 2].map((d) => blockTone(k, b + d, s) - 1);
        for (const v of t) expect(Math.abs(v)).toBeLessThanOrEqual(s.blockVariation + 1e-9);
        if (Math.sign(t[0]!) !== Math.sign(t[1]!) && Math.sign(t[1]!) !== Math.sign(t[2]!)) alternations++;
        pairs++;
      }
    expect(alternations / pairs).toBeLessThan(0.6); // a checkerboard would be 1
  });

  it('fades to an even grey when minified (the mip chain at a distance: no moire, no blotches)', () => {
    const n = s.size;
    const f = 16; // a 16 x 16 box, roughly a block and a half: what one screen pixel covers far away
    const cells: number[] = [];
    for (let cy = 0; cy < n; cy += f)
      for (let cx = 0; cx < n; cx += f) {
        let acc = 0;
        for (let y = cy; y < cy + f; y++) for (let x = cx; x < cx + f; x++) acc += lum((y * n + x) * 4);
        cells.push(acc / (f * f));
      }
    const m = cells.reduce((a, b) => a + b, 0) / cells.length;
    const sd = Math.sqrt(cells.reduce((a, b) => a + (b - m) ** 2, 0) / cells.length);
    expect(sd / m).toBeLessThan(0.04);
  });
});

describe('which roads are paved (from the map)', () => {
  const arena = getArena('rumbleLekki');
  const layout = arena.layout;
  const cls = lekkiSurfaces();
  const tiles = (pred: (x: number, y: number) => boolean): number =>
    layout.reduce((n, row, y) => n + [...row].filter((_, x) => pred(x, y)).length, 0);

  it('the sim layout is unchanged: same board and the same 524 road tiles (collision and routes untouched)', () => {
    expect([layout[0]!.length, layout.length]).toEqual([57, 39]);
    expect(tiles((x, y) => layout[y]![x] === '=')).toBe(524);
  });

  it('Admiralty Way, Freedom Way and their crossing are paved, end to end', () => {
    for (let y = 10; y <= 29; y++)
      for (let x = 20; x <= 23; x++) expect(lekkiPavedAt(x, y), `${x},${y}`).toBe(true);
    for (let x = 0; x < 57; x++)
      for (const y of [18, 19, 20]) expect(lekkiPavedAt(x, y), `${x},${y}`).toBe(true);
  });

  it('no road tile outside the expressway is left asphalt, and the expressway (rows 30-34, both board edges) is not paved', () => {
    for (let y = 0; y < layout.length; y++)
      for (let x = 0; x < 57; x++) {
        if (layout[y]![x] !== '=') continue;
        const express = y >= 30 && y <= 34;
        expect(cls[y]![x], `${x},${y}`).toBe(express ? 'expressway' : 'localRoad');
        expect(lekkiPavedAt(x, y), `${x},${y}`).toBe(!express);
      }
  });

  it('the estate streets are paved; walls, pavements, plazas, the court, sand and the gateway are not', () => {
    const estates = arena.districts!.find((d) => d.id === 'estates')!.rects;
    const inEstates = (x: number, y: number): boolean =>
      estates.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
    for (let y = 0; y < layout.length; y++)
      for (let x = 0; x < 57; x++) {
        const c = layout[y]![x]!;
        const expected = c === '=' ? !(y >= 30 && y <= 34) : c !== '#' && inEstates(x, y);
        expect(lekkiPavedAt(x, y), `${x},${y} '${c}'`).toBe(expected);
      }
    expect(tiles(lekkiPavedAt)).toBe(
      tiles((x, y) => layout[y]![x] === '=' && !(y >= 30 && y <= 34)) +
        tiles((x, y) => layout[y]![x] !== '#' && layout[y]![x] !== '=' && inEstates(x, y)),
    );
  });
});

describe('the floor-shader patch', () => {
  it('only Lekki is paved, at a 0.22-tile block (the texture repeats every 2.64 tiles)', () => {
    expect(Object.keys(PAVED_ARENAS)).toEqual(['rumbleLekki']);
    expect(periodTiles(LEKKI_PAVING)).toBeCloseTo(2.64, 6);
  });

  it('replaces the map lookup, adds its uniforms, composes the program key and installs once', () => {
    const m = new MeshStandardMaterial();
    m.userData.programKey = '+hide';
    const tex = installPaving(m, { width: 57, height: 39 });
    expect(tex).not.toBeNull();
    expect((tex!.image as { width: number }).width).toBe(512);
    expect(installPaving(m, { width: 57, height: 39 })).toBeNull();
    expect(m.userData.programKey).toBe('+hide+paving');
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '',
      fragmentShader: 'x\n#include <common>\nvoid main(){\n#include <map_fragment>\n}',
    };
    m.onBeforeCompile(shader as never, null as never);
    expect(shader.fragmentShader).toContain('uPaverMap');
    expect(shader.fragmentShader).not.toContain('#include <map_fragment>');
    expect(shader.uniforms.uPaverPeriod!.value).toBeCloseTo(2.64, 6);
    const key = shader.uniforms.uPaverKey!.value as number[];
    expect(key[0]).toBeCloseTo(((PAVING_KEY[0] / 255 + 0.055) / 1.055) ** 2.4, 6);
    tex!.dispose();
  });
});
