/**
 * District SECTORS at run time (docs/CAMPAIGN_SECTOR_AI.md, "District-sector architecture", decisions DS1-DS8).
 *
 * A field mission keeps its district's whole City Rumble layout; its sector (`sectors.ts`) stamps a mission-only
 * boundary into the board once, in `createGame`, right after the authored crates are placed:
 *
 *   - every barricade tile becomes concrete (`Tile.Hard`: a parked bus, a jersey barrier, a gate - never a soft crate,
 *     which a blast would open), and its hidden pickup / supply entry is dropped;
 *   - `GameState.sector` records the rects, the blocked tiles, the gates and the camera clip.
 *
 * The stamp draws no random number, so every later RNG draw of the match is the one it was. Without a sector the
 * `sector` key does not exist and a match is byte-for-byte what it was (tests/mission-sectors.test.ts).
 *
 * The questions the core systems ask (`inSector`) answer `true` when there is no sector, so they cost one property
 * read in every other match. Pure and deterministic like the rest of src/sim.
 */
import { tileIndex } from '../grid';
import { Tile } from '../types';
import type { GameState, SimEvent } from '../types';
import type { MissionSectorDef, SectorRect } from './sectors';
import type { SectorClip, SectorState } from './types';

/** Is (x, y) inside one of the rects (inclusive corners)? */
export function rectsContain(rects: readonly SectorRect[], x: number, y: number): boolean {
  for (const r of rects) if (x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]) return true;
  return false;
}

/** Is (x, y) playable ground of the match's sector? Always true when the match has none. */
export function inSector(state: Pick<GameState, 'sector'>, x: number, y: number): boolean {
  const s = state.sector;
  return !s || rectsContain(s.rects, x, y);
}

/** Same for a tile index. */
export function indexInSector(state: Pick<GameState, 'sector' | 'width'>, i: number): boolean {
  return inSector(state, i % state.width, Math.floor(i / state.width));
}

/** The rects' bounding box grown by `margin` tiles, clamped to the board. */
export function sectorClip(
  rects: readonly SectorRect[],
  margin: number,
  width: number,
  height: number,
): SectorClip {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r[0]);
    y0 = Math.min(y0, r[1]);
    x1 = Math.max(x1, r[2]);
    y1 = Math.max(y1, r[3]);
  }
  return {
    x0: Math.max(0, x0 - margin),
    y0: Math.max(0, y0 - margin),
    x1: Math.min(width - 1, x1 + margin),
    y1: Math.min(height - 1, y1 + margin),
  };
}

/** Every tile a sector closes at the start: its barricades and its gates (closed until their leg is done). */
export function sectorBlockedTiles(def: MissionSectorDef): [number, number][] {
  return [...def.barricades.flatMap((b) => b.tiles), ...(def.gates ?? []).flatMap((g) => g.tiles)].map(
    ([x, y]) => [x, y],
  );
}

/**
 * Stamps the sector into a freshly built board (called by `createGame` after `placeSupplies`). Draws no random number.
 */
export function applySector(state: GameState, def: MissionSectorDef): void {
  const blocked: number[] = [];
  for (const [x, y] of sectorBlockedTiles(def)) {
    const i = tileIndex(state, x, y);
    state.tiles[i] = Tile.Hard;
    delete state.hidden[i];
    blocked.push(i);
  }
  const closed = new Set(blocked);
  state.supplies = state.supplies.filter((i) => !closed.has(i));
  const sector: SectorState = {
    id: def.id,
    rects: def.rects.map((r) => [r[0], r[1], r[2], r[3]]),
    blocked,
    gates: (def.gates ?? []).map((g) => ({
      id: g.id,
      tiles: g.tiles.map(([x, y]) => tileIndex(state, x, y)),
      opensAfterLeg: g.opensAfterLeg,
      open: false,
    })),
    clip: sectorClip(def.rects, def.viewMargin, state.width, state.height),
    viewMargin: def.viewMargin,
    hazards: def.hazards,
  };
  state.sector = sector;
}

/**
 * A field leg was completed: the sector's gates that open after it go from concrete to open floor (the renderer hides
 * their barricade). A tile that is no longer concrete is left alone.
 */
export function openSectorGates(state: GameState, completedLeg: number, events: SimEvent[]): void {
  const s = state.sector;
  if (!s) return;
  for (const g of s.gates) {
    if (g.open || g.opensAfterLeg !== completedLeg) continue;
    g.open = true;
    for (const i of g.tiles) if (state.tiles[i] === Tile.Hard) state.tiles[i] = Tile.Empty;
    s.blocked = s.blocked.filter((i) => !g.tiles.includes(i));
    events.push({ type: 'sectorGateOpened', gateId: g.id, tiles: [...g.tiles] });
  }
}

// ------------------------------------------------------------------ data checks (tests and the authoring script)

/**
 * Walkable tiles (not '#') just outside the rects that touch a rect tile and are not closed by a barricade or a gate:
 * where the play area would leak. Pure data check over the arena layout; [] for a sound sector.
 */
export function sectorLeaks(layout: readonly string[], def: MissionSectorDef): [number, number][] {
  const closed = new Set(sectorBlockedTiles(def).map(([x, y]) => `${x},${y}`));
  const out: [number, number][] = [];
  const seen = new Set<string>();
  const H = layout.length;
  const W = layout[0]!.length;
  for (const r of def.rects)
    for (let y = r[1]; y <= r[3]; y++)
      for (let x = r[0]; x <= r[2]; x++) {
        if (layout[y]?.[x] === '#' || closed.has(`${x},${y}`)) continue;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const k = `${nx},${ny}`;
          if (rectsContain(def.rects, nx, ny) || layout[ny]![nx] === '#' || closed.has(k) || seen.has(k))
            continue;
          seen.add(k);
          out.push([nx, ny]);
        }
      }
  return out;
}
