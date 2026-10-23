/**
 * What the City Rumble minimap shows, as a pure projection of the game state (unit-tested). It only
 * uses public information: the board, the closing city, live hazards and where everybody stands.
 * Pickups are never drawn (hidden ones must not leak, and revealed ones would only be clutter).
 */
import { Tile } from '../sim';
import type { GameState } from '../sim';

export interface MinimapGeometry {
  cols: number;
  rows: number;
  /** CSS pixels per tile. */
  cell: number;
  width: number;
  height: number;
}

/** The largest whole-pixel cell that fits the board into maxW x maxH CSS pixels (at least 2). */
export function minimapGeometry(cols: number, rows: number, maxW: number, maxH: number): MinimapGeometry {
  const cell = Math.max(2, Math.floor(Math.min(maxW / cols, maxH / rows)));
  return { cols, rows, cell, width: cols * cell, height: rows * cell };
}

/** Centre of tile (x, y) in minimap pixels (fractional tiles allowed for moving players). */
export function tileToMinimap(geo: MinimapGeometry, x: number, y: number): { x: number; y: number } {
  return { x: (x + 0.5) * geo.cell, y: (y + 0.5) * geo.cell };
}

export interface MinimapPlayer {
  id: number;
  slot: number;
  x: number;
  y: number;
  kind: 'local' | 'focus' | 'rival';
}

export interface MinimapLayers {
  players: MinimapPlayer[];
  /** Grounded generators and burning tiles near the followed player. */
  generators: { x: number; y: number }[];
  flames: { x: number; y: number }[];
  /** Tile indices: soft blocks (crates) still standing. */
  soft: number[];
  /** Tile indices: concrete that the closing city has added. */
  crushed: number[];
  /** Tile indices: telegraphed and about to land. */
  warning: number[];
  /** Tile indices: the next stretch of the ring (landing within `soonSeconds`). */
  closingSoon: number[];
  /** Tile indices of live stage hazards (traffic lanes ...). */
  hazards: number[];
  /** The square that never closes, once the city has started closing (null before / without one). */
  core: { x0: number; y0: number; w: number; h: number } | null;
}

/** Hazards and generators further than this (Chebyshev tiles) from the followed player are left out. */
export const NEAR_TILES = 10;

/**
 * `layout` is the arena's original layout rows (to tell the city's new concrete from buildings);
 * `focusId` is whoever the camera follows (the local player, or the survivor being watched).
 */
export function minimapLayers(
  state: GameState,
  layout: readonly string[],
  localId: number,
  focusId: number,
  soonSeconds = 8,
): MinimapLayers {
  const w = state.width;
  const focus = state.players[focusId] ?? state.players[localId];
  const near = (x: number, y: number): boolean =>
    !focus || (Math.abs(x - focus.x) <= NEAR_TILES && Math.abs(y - focus.y) <= NEAR_TILES);

  const players: MinimapPlayer[] = [];
  for (const p of state.players) {
    if (!p.alive) continue;
    players.push({
      id: p.id,
      slot: p.slot,
      x: p.x,
      y: p.y,
      kind: p.id === localId ? 'local' : p.id === focusId ? 'focus' : 'rival',
    });
  }
  // local and watched players are drawn last (on top)
  const rank = { rival: 0, focus: 1, local: 2 } as const;
  players.sort((a, b) => rank[a.kind] - rank[b.kind] || a.id - b.id);

  const soft: number[] = [];
  const crushed: number[] = [];
  for (let i = 0; i < state.tiles.length; i++) {
    const t = state.tiles[i];
    if (t === Tile.Soft) soft.push(i);
    else if (t === Tile.Hard && layout[Math.floor(i / w)]?.[i % w] !== '#') crushed.push(i);
  }

  const crush = state.crush;
  const warning = crush ? crush.pending.map((p) => p.index) : [];
  const closingSoon: number[] = [];
  if (crush && state.match.phase === 'playing') {
    const until = state.match.playTicks + soonSeconds * 60;
    for (let j = crush.next; j < crush.order.length && crush.warnAt[j]! <= until; j++) {
      const i = crush.order[j]!;
      if (state.tiles[i] !== Tile.Hard) closingSoon.push(i);
    }
  }
  let core: MinimapLayers['core'] = null;
  const keep = state.config.crush.keepCore;
  if (crush && keep && state.match.playTicks >= crush.warnAt[0]! - 10 * 60) {
    core = { x0: (w - keep.w) / 2, y0: (state.height - keep.h) / 2, w: keep.w, h: keep.h };
  }

  const hazards: number[] = [];
  for (const e of state.stage.events) {
    if (e.kind === 'drop') continue;
    for (const t of e.tiles) hazards.push(t);
  }

  return {
    players,
    generators: state.generators
      .filter((g) => g.carriedBy === null && near(g.x, g.y))
      .map((g) => ({ x: g.x, y: g.y })),
    flames: state.flames.filter((f) => near(f.x, f.y)).map((f) => ({ x: f.x, y: f.y })),
    soft,
    crushed,
    warning,
    closingSoon,
    hazards,
    core,
  };
}
