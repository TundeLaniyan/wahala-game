/**
 * Geometry of the HUD rail: the column beside the board (left of it, under the portraits) that holds the
 * remaining transient notices (stage alerts, status toasts, the arena rule) and the optional subtitles, so
 * none of them ever covers a playable tile. Pure, so the guarantee is unit-testable.
 *
 * The whole-arena camera shows the board as a trapezoid that widens towards the near (bottom) row, so the
 * free strip on the left is narrowest at the rail's lowest point: the rail's width is the gap there.
 */
export interface Point {
  x: number;
  y: number;
}

/** Gap kept between the rail and the board edge (px). */
export const RAIL_GAP = 10;
export const RAIL_MIN_WIDTH = 80;
export const RAIL_MAX_WIDTH = 300;
/** The rail may use this fraction of the screen height (it stays clear of the board's near row too). */
export const RAIL_HEIGHT_FRACTION = 0.42;

export interface RailBox {
  width: number;
  maxHeight: number;
}

/** X of the board's left edge at screen height y (between its far-left and near-left corners). */
export function boardLeftEdgeAt(board: readonly Point[], y: number): number {
  const far = board[0]!;
  const near = board[3]!;
  const span = near.y - far.y;
  const t = span === 0 ? 1 : Math.min(1, Math.max(0, (y - far.y) / span));
  return far.x + (near.x - far.x) * t;
}

/**
 * Width and height of a rail whose top-left corner is at (left, top), for a board with these screen corners
 * (far-left, far-right, near-right, near-left). Null when no board is known (the CSS defaults apply).
 */
export function railBox(
  board: readonly Point[] | null,
  left: number,
  top: number,
  viewportH: number,
): RailBox | null {
  if (!board || board.length < 4) return null;
  const near = board[3]!;
  const bottom = Math.max(top + 40, Math.min(near.y - RAIL_GAP, top + viewportH * RAIL_HEIGHT_FRACTION));
  const width = boardLeftEdgeAt(board, bottom) - left - RAIL_GAP;
  return {
    width: Math.round(Math.min(RAIL_MAX_WIDTH, Math.max(RAIL_MIN_WIDTH, width))),
    maxHeight: Math.round(bottom - top),
  };
}
