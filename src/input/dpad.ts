/**
 * The raid CROSS control (decisions RR6, RR7; docs/RAID_PRESENTATION.md): the movement control of a classic raid on a
 * touch device. Four large arrow buttons (up, down, left, right) replace the analogue stick, and the output is
 * CARDINAL only: one direction or none, never two at once, never a diagonal, no corner assistance. Pure model, no DOM.
 *
 * It is movement, NOT an action button: the two action buttons (A generator, B context) are untouched.
 *
 * Every arrow is held by its own finger (pointer). The direction reported is the most recently pressed arrow that is
 * still held, so a second finger on another arrow REPLACES the first, and lifting it hands the control back to the
 * arrow still held. A finger that slides from one arrow onto another switches direction in the same way. The result
 * goes to `InputManager.setTouchDir`, whose move gate turns it into exactly one tile per press and repeats at the
 * player's own step cadence while held.
 */
import type { Dir } from '../sim';

export const CROSS_DIRS: readonly Dir[] = ['up', 'left', 'right', 'down'];

/** Smallest side of one arrow button in CSS px (the brief: thumb-sized, at least 56). */
export const CROSS_MIN_BUTTON = 56;
/** Largest side of one arrow button in CSS px (a tablet or a desktop with touch). */
export const CROSS_MAX_BUTTON = 96;

export class CrossPad {
  /** Held arrows by pointer id, oldest first; the newest one is the output. */
  private readonly held: { pointerId: number; dir: Dir }[] = [];

  /** The single direction being sent, or null. */
  get dir(): Dir | null {
    return this.held.length ? this.held[this.held.length - 1]!.dir : null;
  }

  /** Whether any finger is on the cross. */
  get active(): boolean {
    return this.held.length > 0;
  }

  /** A finger went down on `dir`. Returns the output direction. */
  press(pointerId: number, dir: Dir): Dir | null {
    this.drop(pointerId);
    this.held.push({ pointerId, dir });
    return this.dir;
  }

  /** The same finger slid onto another arrow (or off every arrow: `dir` null). Returns the output direction. */
  slide(pointerId: number, dir: Dir | null): Dir | null {
    const mine = this.held.find((h) => h.pointerId === pointerId);
    if (!mine) return this.dir;
    if (dir === null) {
      this.drop(pointerId);
      return this.dir;
    }
    if (mine.dir === dir) return this.dir;
    return this.press(pointerId, dir);
  }

  /** The finger lifted or the gesture was cancelled. Returns the output direction (the arrow still held, if any). */
  release(pointerId: number): Dir | null {
    this.drop(pointerId);
    return this.dir;
  }

  /** Drops every finger (orientation change, pause, lost capture). */
  reset(): void {
    this.held.length = 0;
  }

  private drop(pointerId: number): void {
    const i = this.held.findIndex((h) => h.pointerId === pointerId);
    if (i >= 0) this.held.splice(i, 1);
  }
}

// ------------------------------------------------------------------------------------------------ layout

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Viewport {
  width: number;
  height: number;
  /** Safe-area insets in px (notch, rounded corners, home indicator). */
  safe?: { left?: number; right?: number; bottom?: number };
}

export interface CrossLayout {
  /** Side of one arrow button. */
  button: number;
  /** The cross as a whole (what must not overlap the action buttons or the board). */
  box: Rect;
  /** One rect per arrow. */
  buttons: Record<Dir, Rect>;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The landscape phone layout of styles.css (`max-height: 480px`, landscape) - the movement strip is 36 vh wide. */
export function isCompactLandscape(v: Viewport): boolean {
  return v.height <= 480 && v.width > v.height;
}

/**
 * Where the cross sits: the lower-left corner, above the safe areas. The arrows are laid out as
 *
 *         [ up ]
 *     [ left ][ right ]
 *         [ down ]
 *
 * (left and right side by side with no empty centre cell) so the whole control is only two buttons wide: that is what
 * fits the 36 vh movement strip of a landscape phone beside the board's near row (the camera keeps the board's near
 * corners out of the strip, cameraRig.ts `PHONE_CONTROL_STRIP`) with arrows of at least `CROSS_MIN_BUTTON`. On roomier
 * screens the arrows grow with the viewport. The thumb rests on the seam between left and right.
 */
export function crossLayout(v: Viewport): CrossLayout {
  const short = Math.min(v.width, v.height);
  const compact = isCompactLandscape(v);
  const edge = compact ? 12 : 16;
  const left = Math.max(v.safe?.left ?? 0, 0) + edge;
  const bottom = Math.max(v.safe?.bottom ?? 0, 0) + edge;
  // compact: the two buttons must fit the movement strip, 36 vh from the screen edge (the safe area counts against it)
  const fitted = compact ? Math.floor((v.height * 0.36 - left) / 2) : Infinity;
  // roomy screens have no reserved strip (only phones do), so the cross stays modest to leave the board's corner free
  const roomy = short * 0.08;
  const button = Math.round(
    clamp(
      compact ? Math.min(short * 0.15, fitted) : roomy,
      CROSS_MIN_BUTTON,
      compact ? CROSS_MAX_BUTTON : 84,
    ),
  );
  const gap = 0;
  const width = button * 2 + gap;
  const height = button * 3 + gap * 2;
  const x0 = left;
  const y1 = v.height - bottom;
  const y0 = y1 - height;
  const mid = x0 + width / 2;
  const rect = (l: number, t: number): Rect => ({ left: l, top: t, right: l + button, bottom: t + button });
  return {
    button,
    box: { left: x0, top: y0, right: x0 + width, bottom: y1 },
    buttons: {
      up: rect(mid - button / 2, y0),
      left: rect(x0, y0 + button + gap),
      right: rect(x0 + button + gap, y0 + button + gap),
      down: rect(mid - button / 2, y0 + 2 * (button + gap)),
    },
  };
}

/**
 * The action-button cluster's box (styles.css `.actions`), so a test can prove the cross never touches it. Mirrors the
 * CSS: a square of `clamp(150px, min(60vh, 56vw), 320px)` at the right edge on roomy screens; on a landscape phone a
 * column `36vh - 12px` wide, 80 vh tall, 12 px from the edge.
 */
export function actionColumn(v: Viewport): Rect {
  const compact = isCompactLandscape(v);
  const right = Math.max(v.safe?.right ?? 0, 0) + (compact ? 12 : 16);
  const bottom = Math.max(v.safe?.bottom ?? 0, 0) + (compact ? 12 : 20);
  const w = compact ? v.height * 0.36 - 12 : clamp(Math.min(v.height * 0.6, v.width * 0.56), 150, 320);
  const h = compact ? v.height * 0.8 : w;
  return {
    left: v.width - right - w,
    top: v.height - bottom - h,
    right: v.width - right,
    bottom: v.height - bottom,
  };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}
