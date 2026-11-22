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
