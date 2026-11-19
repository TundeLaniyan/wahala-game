import { CAMPAIGN_ARENA_IDS, RUMBLE_ARENA_IDS } from '../sim';
import type { GameState } from '../sim';
import { campaignShot, directShot, usesCampaignCamera } from './cameraDirector';
import type { CameraShot } from './cameraDirector';
import type { Layout } from './coords';

/**
 * Two camera modes, chosen per match (presentation only):
 *
 * - `arena` (every standard 2-4 player match): one shared screen. The WHOLE playable arena is framed
 *   by a fixed cinematic three-quarter camera for the entire match (countdown, play, spectating and
 *   results). It never follows a player or zooms towards survivors, so every competitor can always
 *   see themselves and every opponent.
 * - `stadium` (City Rumble: 41 x 31 tiles and up to 32 competitors, far too big for one frame): the
 *   close follow camera of `cameraDirector.ts` on the local player (and on a chosen survivor while
 *   spectating), keeping nearby rivals and incoming danger in frame, with the whole-arena overview
 *   as a toggle.
 *
 * - `campaign` (campaign field, boss and finale missions, and classic raids; docs/CAMPAIGN_CAMERA.md, decisions CF1-CF6):
 *   the follow camera framed on the fighter and the few tiles round them, bounded to the mission's sector (or its
 *   board) with a soft edge, never a whole-district establishing view. A raid that fits the screen as well as a standard
 *   board keeps the fixed whole-board framing. Chosen from the match itself, so a campaign-only map needs no entry here.
 *
 * Only the City Rumble stages use `stadium`; it can be forced for testing with the `?cam=stadium` URL flag (which also
 * overrides `campaign`). Standalone Classic Battle and City Rumble never use `campaign`.
 */
export type CameraMode = 'arena' | 'stadium' | 'campaign';

/**
 * Arena ids that need the follow camera: every City Rumble stage (41 x 31 and larger boards) and every campaign-only area
 * board (its field mission is played on it like on a district map: decision WX1).
 */
export const STADIUM_ARENAS: ReadonlySet<string> = new Set<string>([
  ...RUMBLE_ARENA_IDS,
  ...CAMPAIGN_ARENA_IDS,
]);

export function cameraModeFor(arenaId: string, override?: CameraMode | null): CameraMode {
  if (override) return override;
  return STADIUM_ARENAS.has(arenaId) ? 'stadium' : 'arena';
}

/** The camera mode of a loaded match: `campaign` for a campaign mission or a raid, else by arena (`cameraModeFor`). */
export function cameraModeForMatch(state: GameState, override?: CameraMode | null): CameraMode {
  if (override) return override;
  return usesCampaignCamera(state) ? 'campaign' : cameraModeFor(state.arenaId);
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
  opts: { preferOverview: boolean; choosingEntry: boolean; attract: boolean; focusId?: number | null },
): CameraShot | null {
  if (mode === 'arena' || opts.attract) return null;
  if (mode === 'campaign')
    return campaignShot(state, layout, localId, alpha, opts.preferOverview || opts.choosingEntry);
  return directShot(
    state,
    layout,
    localId,
    alpha,
    opts.preferOverview || opts.choosingEntry,
    opts.focusId ?? null,
  );
}
