/**
 * The CLASSIC GRID rule of a raid layout (docs/CLASSIC_GRID.md, decisions CG1-CG3). A classic raid is a Bomberman maze:
 * permanent pillars on the (even x, even y) interior cells, 1-tile corridors between them, crates on some of the
 * remaining cells. Open floor is what makes a cross bomb useless (no lane to trap anyone in), so the rule measures it:
 *
 *   - open 3x3: three-by-three squares of walkable floor (a crowd field). None, anywhere, rooms included.
 *   - open 2x2: two-by-two squares of walkable floor. Only a few, and each one must be a DELIBERATE pocket: inside a side
 *     room's rect, touching a conveyor belt (a belt corner or lane), or touching the entrance / the extraction tile.
 *   - pillar lattice: the share of (even, even) interior cells that are permanent walls, not counting the cells of side
 *     rooms and belts (rooms and belts may have their own shape). In a full lattice every 2x2 window holds a pillar.
 *
 * "Walkable" is the layout at the start: floor, belts, switches, spots, bonuses, entrance and exit; walls, closed doors
 * and every destructible are solid. `raidProblems` runs `raidShapeProblems` on every raid, so a layout that drifts back
 * to open halls cannot be built.
 */
import type { RaidDef } from './def';

export const RAID_SHAPE_RULE = {
  /** No open 3x3 square of floor anywhere. */
  maxOpen3x3: 0,
  /** Open 2x2 squares allowed in a raid in all (each also inside an allowed pocket). */
  maxOpen2x2: 4,
  /** Share of (even, even) interior cells outside rooms and belts that are pillars. */
  minLattice: 0.85,
} as const;

export interface RaidShape {
  open2x2: number;
  open3x3: number;
  /** Pillars on (even, even) interior cells outside rooms and belts. */
  pillars: number;
  /** (even, even) interior cells outside rooms and belts. */
  latticeCells: number;
  /** pillars / latticeCells (1 when there is no lattice cell). */
  lattice: number;
  /** Top-left corners ('x,y') of open 2x2 squares that are not an allowed pocket. */
  strayPockets: string[];
  /** Top-left corners ('x,y') of open 3x3 squares. */
  open3x3At: string[];
}

const SOLID = /[#xMKSB1-9]/;
const BELT = /[\^>v<]/;

/** Measures a raid layout against the classic-grid rule (pure, data only). */
export function raidShape(def: RaidDef): RaidShape {
  const rows = def.layout;
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const c = (x: number, y: number): string => rows[y]?.[x] ?? '#';
  const open = (x: number, y: number): boolean => !SOLID.test(c(x, y));
  const inRoom = (x: number, y: number): boolean =>
    def.rooms.some((r) => x >= r.rect[0] && x <= r.rect[2] && y >= r.rect[1] && y <= r.rect[3]);
  const square = (x: number, y: number, n: number): boolean => {
    for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) if (!open(x + dx, y + dy)) return false;
    return true;
  };
  let open2x2 = 0;
  const strayPockets: string[] = [];
  const open3x3At: string[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (square(x, y, 3)) open3x3At.push(`${x},${y}`);
      if (!square(x, y, 2)) continue;
      open2x2++;
      const cells: [number, number][] = [
        [x, y],
        [x + 1, y],
        [x, y + 1],
        [x + 1, y + 1],
      ];
      const room = def.rooms.some((r) =>
        cells.every(([cx, cy]) => cx >= r.rect[0] && cx <= r.rect[2] && cy >= r.rect[1] && cy <= r.rect[3]),
      );
      const pocket = cells.some(([cx, cy]) => BELT.test(c(cx, cy)) || c(cx, cy) === '@' || c(cx, cy) === 'E');
      if (!room && !pocket) strayPockets.push(`${x},${y}`);
    }
  }
  let pillars = 0;
  let latticeCells = 0;
  for (let y = 2; y < h - 1; y += 2) {
    for (let x = 2; x < w - 1; x += 2) {
      if (inRoom(x, y) || BELT.test(c(x, y))) continue;
      latticeCells++;
      if (c(x, y) === '#') pillars++;
    }
  }
  return {
    open2x2,
    open3x3: open3x3At.length,
    pillars,
    latticeCells,
    lattice: latticeCells === 0 ? 1 : pillars / latticeCells,
    strayPockets,
    open3x3At,
  };
}

/** Every way a raid layout breaks the classic-grid rule (empty = a proper pillar maze). */
export function raidShapeProblems(def: RaidDef): string[] {
  const s = raidShape(def);
  const out: string[] = [];
  const R = RAID_SHAPE_RULE;
  if (s.open3x3 > R.maxOpen3x3) out.push(`open 3x3 floor at ${s.open3x3At.join(' ')} (classic grid: none)`);
  if (s.open2x2 > R.maxOpen2x2)
    out.push(`${s.open2x2} open 2x2 squares (classic grid: at most ${R.maxOpen2x2})`);
  if (s.strayPockets.length > 0)
    out.push(`open 2x2 outside a room, belt or entrance/exit pocket at ${s.strayPockets.join(' ')}`);
  if (s.lattice < R.minLattice)
    out.push(
      `pillar lattice ${s.pillars}/${s.latticeCells} (classic grid: at least ${Math.round(R.minLattice * 100)}%)`,
    );
  return out;
}
