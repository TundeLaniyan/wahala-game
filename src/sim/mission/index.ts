/**
 * Mission runtime public API. STUB written by the integrator so the app / UI layers compile; the `mission-sim`
 * worker replaces the bodies (keep the exported names and signatures).
 */
import type { GameState } from '../types';
import type { MissionView } from './types';

export * from './types';

/** The read-only mission picture for the HUD, or null when this is not a mission match. */
export function missionView(_state: GameState): MissionView | null {
  return null;
}
