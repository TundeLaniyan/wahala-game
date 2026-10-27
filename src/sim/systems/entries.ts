/**
 * Vehicle entry and route geometry. Pure helpers used by the vehicle system, the UI (to show
 * every selectable border entry and the route preview) and by AI.
 */
import { DIR_VEC, perpendiculars, tileAt } from '../grid';
import type { GridView } from '../grid';
import { Tile } from '../types';
import type { Dir, GameState, TilePos, VehicleEntry, VehicleKind, VehicleTurn } from '../types';

/** Entry geometry only needs the board and the config, so bots can call it with an Observation. */
export type EntryView = GridView & { readonly config: GameState['config'] };

export function entryKey(e: VehicleEntry): string {
  return `${e.x},${e.y},${e.dir}`;
}

/** Tiles from `from` (inclusive or not) walking in `dir` until concrete or the arena edge. Soft blocks are included. */
function walk(state: EntryView, from: TilePos, dir: Dir, includeStart: boolean): TilePos[] {
  const v = DIR_VEC[dir];
  const out: TilePos[] = [];
  let x = from.x + (includeStart ? 0 : v.dx);
  let y = from.y + (includeStart ? 0 : v.dy);
  while (tileAt(state, x, y) !== Tile.Hard) {
    out.push({ x, y });
    x += v.dx;
    y += v.dy;
  }
  return out;
}

/**
 * Every perimeter tile paired with its inward direction (corners appear once per side) - or, when the arena
 * names attack lanes (`config.vehicles.lanes`), only those road mouths that sit on the border.
 */
export function allBorderEntries(state: EntryView): VehicleEntry[] {
  const { width: w, height: h } = state;
  const lanes = state.config.vehicles.lanes;
  if (lanes) {
    const onBorder = ([x, y, dir]: [number, number, Dir]): boolean =>
      (dir === 'down' && y === 0) ||
      (dir === 'up' && y === h - 1) ||
      (dir === 'right' && x === 0) ||
      (dir === 'left' && x === w - 1);
    return lanes.filter(onBorder).map(([x, y, dir]) => ({ x, y, dir }));
  }
  const out: VehicleEntry[] = [];
  for (let x = 0; x < w; x++) out.push({ x, y: 0, dir: 'down' });
  for (let y = 0; y < h; y++) out.push({ x: w - 1, y, dir: 'left' });
  for (let x = w - 1; x >= 0; x--) out.push({ x, y: h - 1, dir: 'up' });
  for (let y = h - 1; y >= 0; y--) out.push({ x: 0, y, dir: 'right' });
  return out;
}

export function straightLeg(state: EntryView, entry: VehicleEntry): TilePos[] {
  return walk(state, entry, entry.dir, true);
}

/** Legal 90 degree turns for a Keke entering at `entry`. */
export function listKekeTurns(state: EntryView, entry: VehicleEntry): VehicleTurn[] {
  const leg = straightLeg(state, entry);
  const min = state.config.vehicles.minKekeLegTiles;
  const turns: VehicleTurn[] = [];
  for (let k = min - 1; k < leg.length - 1; k++) {
    for (const dir of perpendiculars(entry.dir)) {
      if (walk(state, leg[k]!, dir, false).length >= min) turns.push({ atIndex: k, dir });
    }
  }
  return turns;
}

/** Builds the full tile route, or null if the entry/turn is illegal for this vehicle. */
export function buildRoute(
  state: EntryView,
  kind: VehicleKind,
  entry: VehicleEntry,
  turn?: VehicleTurn,
): TilePos[] | null {
  const border = allBorderEntries(state).some(
    (e) => e.x === entry.x && e.y === entry.y && e.dir === entry.dir,
  );
  if (!border) return null;
  const leg = straightLeg(state, entry);
  const cfg = state.config.vehicles;
  if (!cfg.specs[kind].turns) {
    return turn === undefined && leg.length >= cfg.minRouteTiles ? leg : null;
  }
  if (!turn) return null;
  if (!listKekeTurns(state, entry).some((t) => t.atIndex === turn.atIndex && t.dir === turn.dir)) return null;
  return [...leg.slice(0, turn.atIndex + 1), ...walk(state, leg[turn.atIndex]!, turn.dir, false)];
}

/** Every border entry that is currently legal for the vehicle (any border tile, not fixed gates). */
export function listEntries(state: EntryView, kind: VehicleKind): VehicleEntry[] {
  return allBorderEntries(state).filter((entry) => {
    if (state.config.vehicles.specs[kind].turns) return listKekeTurns(state, entry).length > 0;
    return buildRoute(state, kind, entry) !== null;
  });
}
