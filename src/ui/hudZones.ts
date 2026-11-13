/**
 * HUD zones for the follow camera (City Rumble and Rumble-stage campaign missions). The camera keeps the local
 * fighter near the middle of the screen, so transient notices (checkpoint steps, streak progress, spawn
 * protection, stage alerts, status toasts) hang in a column on the left edge, under the Rumble panel, and never
 * enter the PLAY ZONE around the fighter. Pure, so the guarantee is unit-testable (tests/ui/hudZones.test.ts).
 *
 * The fixed Sudden Death announcement is not part of this: it keeps its own place (decision SD-B1).
 */
import { RAIL_GAP } from './hudRail';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Share of the screen height the notice column may reach (the touch pad and the bottom row stay clear below it). */
export const NOTICE_HEIGHT_FRACTION = 0.7;
/** The column is as wide as the Rumble panel above it: clamp(180px, 22vw, 250px) in RumbleHud.css. */
export const NOTICE_MIN_WIDTH = 180;
export const NOTICE_MAX_WIDTH = 250;
/** Where the left edge column starts (RumbleHud.css `.rh-panel`). */
export const NOTICE_LEFT = 10;

/**
 * The region of the screen the followed fighter, its name tag and the action around it occupy. The follow camera
 * puts the fighter slightly below the middle (cameraRig FOCUS_BAND_Y); the zone scales with the smaller screen side
 * because the character's size on screen does.
 */
export function playZone(vw: number, vh: number): Rect {
  const unit = Math.min(vw, vh);
  const half = Math.min(150, Math.max(56, unit * 0.2));
  const cx = vw / 2;
  return {
    left: cx - half,
    right: cx + half,
    top: vh * 0.5 - half,
    bottom: vh * 0.5 + half * 1.2,
  };
}

export const intersects = (a: Rect, b: Rect): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

export interface NoticeColumn {
  width: number;
  /** Height the column may use from its top; what does not fit is clipped (the most important blocks come first). */
  maxHeight: number;
}

/**
 * The left-edge notice column for a viewport of vw x vh whose top is at `top` (just under the Rumble panel).
 * `limitBottom` is the top of whatever sits below on the left (the touch move pad), or null. The column
 * never enters the play zone: when it is wide enough to reach it sideways, it stops above it.
 */
export function noticeColumn(
  vw: number,
  vh: number,
  top: number,
  limitBottom: number | null = null,
): NoticeColumn {
  const width = Math.round(Math.min(NOTICE_MAX_WIDTH, Math.max(NOTICE_MIN_WIDTH, vw * 0.22)));
  const zone = playZone(vw, vh);
  let bottom = vh * NOTICE_HEIGHT_FRACTION;
  if (limitBottom !== null) bottom = Math.min(bottom, limitBottom - RAIL_GAP);
  if (NOTICE_LEFT + width + RAIL_GAP > zone.left) bottom = Math.min(bottom, zone.top - RAIL_GAP);
  return { width, maxHeight: Math.max(0, Math.floor(bottom - top)) };
}
