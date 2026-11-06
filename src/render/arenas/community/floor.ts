/**
 * The painted floor of a researched community (presentation only), drawn from the arena's own layout and
 * districts: ground noise, a tint per district, foot-polished aisles and gutters beside every object, road
 * surfaces with kerbs, edge lines and dashed lane dividers, paver plazas, litter and cracks. An arena adds what is
 * its own (zebra crossings, rail ballast, market words) through `extra`.
 */
import { getArena } from '../../../sim';
import type { DistrictDef } from '../../../sim';
import { artRng } from '../../textures';
import { T, crack, noiseFill, stain } from '../floorKit';
import type { Ctx, FloorDrawer } from '../floorKit';
import { dash, litter, paintKerbs, paintRoads } from '../rumbleV2Kit';

export interface FloorOpts {
  seed: number;
  base: [number, number, number];
  /** dust / stain colour, e.g. 'rgba(150,74,40,' (alpha is appended) */
  dust: string;
  road: [number, number, number];
  kerb?: [string, string];
  /** an rgba overlay per district id */
  tint: Readonly<Record<string, string>>;
  /** colour of the plaza pavers ('_' tiles) */
  pavers: [number, number, number];
  lane?: string;
  /** painted right after the asphalt (before kerbs and lane lines): a road surface that is not asphalt */
  paved?: (g: Ctx, rg: Ctx, layout: readonly string[], r: () => number) => void;
  /** more painting on top: (g, rg, layout, r) */
  extra?: (g: Ctx, rg: Ctx, layout: readonly string[], r: () => number) => void;
}

/** Bands of road rows (and columns) of at least two tiles: where lane lines run. */
function roadBands(layout: readonly string[]): {
  horizontal: [number, number][];
  vertical: [number, number][];
} {
  const H = layout.length;
  const W = layout[0]!.length;
  const rowRoad = (y: number): boolean => [...layout[y]!].filter((c) => c === '=').length >= W * 0.6;
  const colRoad = (x: number): boolean => layout.filter((r) => r[x] === '=').length >= H * 0.6;
  const bands = (n: number, f: (i: number) => boolean): [number, number][] => {
    const out: [number, number][] = [];
    let s = -1;
    for (let i = 0; i <= n; i++) {
      const on = i < n && f(i);
      if (on && s < 0) s = i;
      if (!on && s >= 0) {
        if (i - s >= 2) out.push([s, i - 1]);
        s = -1;
      }
    }
    return out;
  };
  return { horizontal: bands(H, rowRoad), vertical: bands(W, colRoad) };
}

export function communityFloor(arenaId: string, o: FloorOpts): FloorDrawer {
  return (g, rg, cols, rows) => {
    const arena = getArena(arenaId);
    const layout = arena.layout;
    const r = artRng(o.seed);
    const w = cols * T;
    const h = rows * T;
    const at = (x: number, y: number): string => layout[y]?.[x] ?? '#';
    noiseFill(g, g.canvas.width, g.canvas.height, o.base, 20, o.seed);
    noiseFill(rg, rg.canvas.width, rg.canvas.height, [214, 214, 214], 20, o.seed + 1);
    for (let i = 0; i < cols * rows * 0.25; i++)
      stain(g, r() * w, r() * h, 50 + r() * 110, `${o.dust}${0.05 + r() * 0.08})`);
    // district tints
    const tint = (d: DistrictDef): void => {
      const c = o.tint[d.id];
      if (!c) return;
      g.fillStyle = c;
      for (const [x0, y0, x1, y1] of d.rects)
        g.fillRect(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T);
    };
    for (const d of arena.districts ?? []) tint(d);
    // foot-polished aisles between objects, and a gutter along every object's south foot
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const c = at(x, y);
        if (c === '.' && (at(x, y - 1) === '#' || at(x, y + 1) === '#')) {
          g.fillStyle = `rgba(50,36,28,${0.05 + r() * 0.05})`;
          g.fillRect(x * T, y * T, T, T);
        }
        if (c === '#' && at(x, y + 1) === '.') {
          g.fillStyle = 'rgba(30,26,22,0.6)';
          g.fillRect(x * T, (y + 1) * T, T, 8);
        }
      }
    // plazas: interlocking pavers
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        if (at(x, y) !== '_') continue;
        g.fillStyle = `rgba(${o.pavers[0]},${o.pavers[1]},${o.pavers[2]},0.9)`;
        g.fillRect(x * T, y * T, T, T);
        for (let py = 0; py < T; py += 24)
          for (let px = (py / 24) % 2 ? -24 : 0; px < T; px += 48) {
            const v = (r() - 0.5) * 26;
            g.fillStyle = `rgba(${o.pavers[0] + v},${o.pavers[1] + v - 4},${o.pavers[2] + v - 8},0.55)`;
            g.fillRect(x * T + px + 2, y * T + py + 2, 44, 20);
          }
      }
    // roads
    paintRoads(g, rg, layout, r, o.road);
    o.paved?.(g, rg, layout, r);
    paintKerbs(g, layout, o.kerb?.[0] ?? 'rgba(206,196,170,0.85)', o.kerb?.[1] ?? 'rgba(40,36,30,0.85)');
    const lane = o.lane ?? 'rgba(232,224,196,0.7)';
    const bands = roadBands(layout);
    for (const [y0, y1] of bands.horizontal) {
      dash(g, 0, y0 + 0.06, cols, y0 + 0.06, 'rgba(232,224,196,0.55)', 5, 1, 0);
      dash(g, 0, y1 + 0.94, cols, y1 + 0.94, 'rgba(232,224,196,0.55)', 5, 1, 0);
      for (let y = y0 + 1; y <= y1; y++) dash(g, 0, y, cols, y, lane, 5, 0.9, 0.9);
    }
    for (const [x0, x1] of bands.vertical) {
      dash(g, x0 + 0.06, 0, x0 + 0.06, rows, 'rgba(232,224,196,0.55)', 5, 1, 0);
      dash(g, x1 + 0.94, 0, x1 + 0.94, rows, 'rgba(232,224,196,0.55)', 5, 1, 0);
      for (let x = x0 + 1; x <= x1; x++) dash(g, x, 0, x, rows, lane, 5, 0.9, 0.9);
    }
    // oil, wear and cracks
    for (let i = 0; i < cols * rows * 0.2; i++)
      crack(g, r, r() * w, r() * h, 3 + Math.floor(r() * 5), 'rgba(30,22,16,0.5)', 2);
    o.extra?.(g, rg, layout, r);
    litter(g, r, cols, rows, 0.8);
  };
}
