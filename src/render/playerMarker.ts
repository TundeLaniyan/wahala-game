/** Player identification marker style (decision PI1). Render-only; the Test Lab switches it live. */
export type PlayerMarkerMode = 'original' | 'indicator' | 'indicatorGround';
export const DEFAULT_PLAYER_MARKER: PlayerMarkerMode = 'indicator';
let mode: PlayerMarkerMode = DEFAULT_PLAYER_MARKER;
export function playerMarkerMode(): PlayerMarkerMode {
  return mode;
}
export function setPlayerMarkerMode(m: PlayerMarkerMode): void {
  mode = m;
}

/** Tiles: a rival this close or nearer counts in full; beyond `PROXIMITY_FAR` it does not count at all. */
export const PROXIMITY_NEAR = 1.2;
export const PROXIMITY_FAR = 2.4;
/** Screen overlap at the fixed camera: a rival standing in this column of tiles stacks over the player's head. */
const STACK_HALF_WIDTH = 0.8;
const STACK_DEPTH = 2.2;

const smooth = (t: number): number => {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
};

/**
 * How much one rival crowds the local player (0..1) from the tile offset to it: distance (about 2 tiles) or
 * overlapping the player on screen (a rival in the same column a little in front of or behind them).
 */
export function rivalProximity(dx: number, dy: number): number {
  const d = Math.hypot(dx, dy);
  const byDistance = 1 - smooth((d - PROXIMITY_NEAR) / (PROXIMITY_FAR - PROXIMITY_NEAR));
  const stacked = Math.abs(dx) < STACK_HALF_WIDTH && Math.abs(dy) < STACK_DEPTH ? 1 : 0;
  return Math.max(byDistance, stacked);
}

/** Target prominence (0..1) from the summed proximity of every rival: one close rival is clear, two or more full. */
export function markerProminence(summedProximity: number): number {
  return Math.min(1, summedProximity * 0.7);
}

/** Eases the shown prominence toward its target (quick to rise, slower to fall): no popping. */
export function easeProminence(current: number, target: number, dt: number): number {
  const rate = target > current ? 9 : 3.5;
  return current + (target - current) * (1 - Math.exp(-rate * Math.max(0, dt)));
}

/** Subtle -> prominent look of the tag (scale, opacity); `p` is the eased prominence. */
export function tagScale(p: number): number {
  return 0.78 + 0.34 * p;
}
export function tagOpacity(p: number): number {
  return 0.62 + 0.38 * p;
}
