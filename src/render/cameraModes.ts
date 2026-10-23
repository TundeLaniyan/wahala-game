import type { GameState } from '../sim';
import { directShot } from './cameraDirector';
import type { CameraShot } from './cameraDirector';
import type { Layout } from './coords';

/**
 * Two camera modes, chosen per match (presentation only):
 *
 * - `arena` (every standard 2-4 player match): one shared screen. The WHOLE playable arena is framed
 *   by a fixed cinematic three-quarter camera for the entire match (countdown, play, spectating and
 *   results). It never follows a player or zooms towards survivors, so every competitor can always
 *   see themselves and every opponent.
 * - `stadium` (reserved for the future 32-player stadium arena, which is far too big for one frame):
 *   the closer follow camera of `cameraDirector.ts`, with the whole-arena overview as a toggle.
 *
 * No arena uses `stadium` yet; it can be forced for testing with the `?cam=stadium` URL flag.
 */
export type CameraMode = 'arena' | 'stadium';

/** Arena ids that need the follow camera (none yet: the stadium arena does not exist). */
export const STADIUM_ARENAS: ReadonlySet<string> = new Set<string>();

export function cameraModeFor(arenaId: string, override?: CameraMode | null): CameraMode {
  if (override) return override;
  return STADIUM_ARENAS.has(arenaId) ? 'stadium' : 'arena';
}

/**
 * The shot for this frame, or null for the fixed whole-arena framing. In `arena` mode this is
 * always null; `stadium` mode defers to the follow-camera director (and pulls out to the overview
 * while a vehicle entrance is being chosen, so every border arrow stays clickable).
 */
export function selectShot(
  mode: CameraMode,
  state: GameState,
  layout: Layout,
  localId: number,
  alpha: number,
  opts: { preferOverview: boolean; choosingEntry: boolean; attract: boolean },
): CameraShot | null {
  if (mode === 'arena' || opts.attract) return null;
  return directShot(state, layout, localId, alpha, opts.preferOverview || opts.choosingEntry);
}
