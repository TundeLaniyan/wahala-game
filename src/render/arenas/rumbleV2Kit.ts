/**
 * Shared presentation helpers for the City Rumble V2 stages (`rumbleOshodi.ts` ... `rumbleLekki.ts`).
 * Presentation only: everything reads the arena layout from `src/sim/arenas` and never changes it.
 *
 * The boards are 41-45 x 31 and seen through the close follow camera, so what the player reads most is
 * the painted floor under their feet (drawn in T-pixel tile units, the canvas may be scaled down) and
 * the obstacles; the surroundings show where a player nears an edge. Helpers here paint road surfaces,
 * kerbs and lane paint from the layout, and dress the road mouths beyond the edges with queued traffic.
 */
import { getArena } from '../../sim';
import type { Placement, SetContext, VehicleKind } from './common';
import { STREET } from './common';
import { T, stain } from './floorKit';
import type { Ctx } from './floorKit';

export const layoutOf = (arenaId: string): readonly string[] => getArena(arenaId).layout;

/** World x / z of a tile centre on a cols x rows board. */
export function tileWorld(
  cols: number,
  rows: number,
): { wx: (x: number) => number; wz: (y: number) => number } {
  return { wx: (x) => x - cols / 2 + 0.5, wz: (y) => y - rows / 2 + 0.5 };
}

export type Edge = 'north' | 'south' | 'east' | 'west';

/** Road tiles on the board's edge, grouped into runs: where the streets leave the board. */
export function roadMouths(layout: readonly string[]): { edge: Edge; from: number; to: number }[] {
  const H = layout.length;
  const W = layout[0]!.length;
  const out: { edge: Edge; from: number; to: number }[] = [];
  const scan = (edge: Edge, n: number, road: (i: number) => boolean): void => {
    let start = -1;
    for (let i = 0; i <= n; i++) {
      const r = i < n && road(i);
      if (r && start < 0) start = i;
      if (!r && start >= 0) {
        out.push({ edge, from: start, to: i - 1 });
        start = -1;
      }
    }
  };
  scan('north', W, (x) => layout[0]![x] === '=');
  scan('south', W, (x) => layout[H - 1]![x] === '=');
  scan('west', H, (y) => layout[y]![0] === '=');
  scan('east', H, (y) => layout[y]![W - 1] === '=');
  return out;
}

/** Asphalt over every road tile ('='), darker and smoother than the surrounding ground. */
export function paintRoads(
  g: Ctx,
  rg: Ctx,
  layout: readonly string[],
  r: () => number,
  tone: [number, number, number] = [52, 50, 47],
  isRoad: (x: number, y: number) => boolean = (x, y) => layout[y]?.[x] === '=',
): void {
  const H = layout.length;
  const W = layout[0]!.length;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!isRoad(x, y)) continue;
      const v = (r() - 0.5) * 8;
      g.fillStyle = `rgb(${tone[0] + v},${tone[1] + v},${tone[2] + v})`;
      g.fillRect(x * T, y * T, T, T);
      rg.fillStyle = 'rgb(160,160,160)';
      rg.fillRect(x * T, y * T, T, T);
      // stone grain and oil drips
      for (let k = 0; k < 26; k++) {
        const c = r() < 0.5 ? 96 + r() * 50 : 30 + r() * 12;
        g.fillStyle = `rgba(${c},${c},${c - 2},0.5)`;
        g.fillRect(x * T + r() * T, y * T + r() * T, 2 + r() * 3, 2 + r() * 3);
      }
      if (r() < 0.12) stain(g, x * T + r() * T, y * T + r() * T, 10 + r() * 26, 'rgba(8,8,10,0.45)');
    }
}

/** Kerb blocks along every edge between a road tile and a non-road tile (alternating two colours). */
export function paintKerbs(
  g: Ctx,
  layout: readonly string[],
  a = 'rgba(206,202,190,0.9)',
  b = 'rgba(30,30,30,0.9)',
  isRoad: (x: number, y: number) => boolean = (x, y) => layout[y]?.[x] === '=',
): void {
  const H = layout.length;
  const W = layout[0]!.length;
  const k = 10;
  const seg = (px: number, py: number, horizontal: boolean): void => {
    for (let i = 0; i < T; i += 32) {
      g.fillStyle = (i / 32) % 2 ? a : b;
      if (horizontal) g.fillRect(px + i, py - k / 2, Math.min(32, T - i), k);
      else g.fillRect(px - k / 2, py + i, k, Math.min(32, T - i));
    }
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!isRoad(x, y)) continue;
      if (y > 0 && !isRoad(x, y - 1) && layout[y - 1]![x] !== '#') seg(x * T, y * T, true);
      if (y < H - 1 && !isRoad(x, y + 1) && layout[y + 1]![x] !== '#') seg(x * T, (y + 1) * T, true);
      if (x > 0 && !isRoad(x - 1, y) && layout[y]![x - 1] !== '#') seg(x * T, y * T, false);
      if (x < W - 1 && !isRoad(x + 1, y) && layout[y]![x + 1] !== '#') seg((x + 1) * T, y * T, false);
    }
}

/** A dashed line in tile units (x0,y0)-(x1,y1), e.g. a lane divider along a tile edge or centre. */
export function dash(
  g: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  width: number,
  on = 0.55,
  off = 0.45,
): void {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.setLineDash([on * T, off * T]);
  g.beginPath();
  g.moveTo(x0 * T, y0 * T);
  g.lineTo(x1 * T, y1 * T);
  g.stroke();
  g.setLineDash([]);
}

/** Zebra bars across one road tile (`alongX` = the road runs along x). */
export function zebraTile(g: Ctx, tx: number, ty: number, alongX: boolean, alpha = 0.7): void {
  g.fillStyle = `rgba(220,214,198,${alpha})`;
  for (let k = 0; k < 5; k++) {
    if (alongX) g.fillRect(tx * T + T * 0.18, ty * T + 8 + k * 24, T * 0.64, 12);
    else g.fillRect(tx * T + 8 + k * 24, ty * T + T * 0.18, 12, T * 0.64);
  }
}

/** Bold painted words on the floor (BUS ONLY, BRT ...), centred on a tile position. */
export function floorWords(
  g: Ctx,
  text: string,
  cx: number,
  cy: number,
  sizeTiles: number,
  color: string,
  rot = 0,
): void {
  g.save();
  g.translate(cx * T, cy * T);
  g.rotate(rot);
  g.fillStyle = color;
  g.font = `bold ${Math.round(sizeTiles * T)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 0, 0);
  g.restore();
}

/** Litter, sachets and bottle tops scattered over the board (density per tile). */
export function litter(g: Ctx, r: () => number, cols: number, rows: number, perTile = 0.6): void {
  for (let i = 0; i < cols * rows * perTile; i++) {
    g.fillStyle =
      r() < 0.6
        ? `rgba(206,206,196,${0.25 + r() * 0.35})`
        : `rgba(${120 + r() * 80},${50 + r() * 40},34,${0.2 + r() * 0.3})`;
    g.fillRect(r() * cols * T, r() * rows * T, 3 + r() * 7, 2 + r() * 4);
  }
}

/**
 * Traffic queued in the streets beyond each road mouth (north, east and west; the south / camera
 * side only gets low okadas). Vehicles face the board: they are the traffic that crosses it.
 */
export function mouthTraffic(
  ctx: SetContext,
  layout: readonly string[],
  o: { kinds: VehicleKind[]; depth?: number; gap?: number; idle?: boolean; seed?: number },
): void {
  const { W, H } = ctx;
  const { wx, wz } = tileWorld(W, H);
  const byKind = new Map<VehicleKind, Placement[]>();
  const push = (k: VehicleKind, p: Placement): void => {
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k)!.push(p);
  };
  const len: Record<VehicleKind, number> = { danfo: 6.4, taxi: 5.6, keke: 3.4, okada: 2.4 };
  let n = o.seed ?? 0;
  const depth = o.depth ?? 2;
  for (const m of roadMouths(layout)) {
    const lanes = m.to - m.from + 1;
    // a vehicle is about two tiles wide: one queue per pair of lanes, centred between them
    for (let lane = 0; lane < lanes; lane += 2) {
      const i = m.from + lane + (lane + 1 < lanes ? 0.5 : 0);
      let off = 1.6 + ((n * 7) % 3) * 0.4;
      for (let d = 0; d < depth; d++) {
        const kind = m.edge === 'south' ? 'okada' : o.kinds[n++ % o.kinds.length]!;
        if (m.edge === 'south' && d > 0) break;
        const l = len[kind];
        const jig = ((n * 13) % 7) * 0.03 - 0.09;
        if (m.edge === 'north') push(kind, { x: wx(i) + jig, y: STREET, z: -H / 2 - off - l / 2, ry: 0 });
        else if (m.edge === 'south')
          push(kind, { x: wx(i) + jig, y: STREET, z: H / 2 + off + 0.4, ry: Math.PI });
        else if (m.edge === 'west')
          push(kind, { x: -W / 2 - off - l / 2, y: STREET, z: wz(i) + jig, ry: Math.PI / 2 });
        else push(kind, { x: W / 2 + off + l / 2, y: STREET, z: wz(i) + jig, ry: -Math.PI / 2 });
        off += l + (o.gap ?? 0.8);
      }
    }
  }
  for (const [kind, list] of byKind) ctx.vehicles(kind, list, { idle: o.idle ?? kind === 'danfo' });
}
