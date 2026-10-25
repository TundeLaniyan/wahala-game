import type { Dir, TilePos, VehicleEntry } from '../sim';

/** What the vehicle-entry overlay should display. Built by the app layer, drawn by the renderer. */
export interface EntryOverlayModel {
  stage: 'entry' | 'turn';
  entries: VehicleEntry[];
  focusKey: string | null;
  route: TilePos[] | null;
  turns: { key: string; pos: TilePos; dir: Dir; atIndex: number }[];
  focusTurnKey: string | null;
  /** Seconds left in the selection window, 0..1 as a fraction. */
  timeFraction: number;
}

export type EntryPick = { kind: 'entry'; key: string } | { kind: 'turn'; key: string };

/** Per-frame inputs the renderer needs besides the simulation state. */
export interface FrameInfo {
  localPlayerId: number;
  entryOverlay: EntryOverlayModel | null;
  /** 0..1 crowd excitement. */
  excitement: number;
  /** Title-screen demo: the camera drifts gently and no HUD markers are shown. */
  attract?: boolean;
  /**
   * Stadium camera only: the competitor to follow while the local player is out (spectating).
   * Ignored by the fixed whole-arena camera of standard matches.
   */
  focusPlayerId?: number | null;
  /** Training Academy: tiles to mark with a glowing "go here" ring (presentation only). */
  markers?: readonly { x: number; y: number }[];
}
