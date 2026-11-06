/**
 * The objective compass of a campaign mission (pure, unit-tested): which node (or the exposed boss) the player should
 * be pointed at, and where on the screen edge the small pointer sits. The follow camera shows about a dozen tiles of a
 * 49 x 35 district, so an objective is often off screen; the pointer shows the way and the distance in tiles, never
 * over the centre of the screen and never over another HUD block. It reads only the sim's `MissionView` and screen
 * positions; it invents no rules.
 */
import type { MissionNodeView, MissionView } from '../sim';

export interface CompassTarget {
  /** Node id, or 'boss'. */
  id: string;
  kind: 'node' | 'boss';
  x: number;
  y: number;
  /** Straight-line distance from the player in tiles, rounded. */
  tiles: number;
}

const PRESS_ID = 'press';

/**
 * Nodes worth walking to right now: live or being worked (a required one before an optional bonus door); else the idle
 * ones (junctions, ledgers) without the press drop.
 */
export function candidateNodes(nodes: readonly MissionNodeView[]): MissionNodeView[] {
  const active = nodes.filter((n) => n.state === 'live' || n.state === 'progress');
  const required = active.filter((n) => !n.optional);
  if (required.length > 0) return required;
  if (active.length > 0) return active;
  return nodes.filter((n) => n.state === 'idle' && n.id !== PRESS_ID);
}

/**
 * The thing to point at: the exposed boss during his window, else the nearest candidate node. Null when there is
 * nothing to go to (everything done or locked, the boss shielded and the phase waiting, the mission over).
 */
export function compassTarget(
  view: MissionView,
  player: { x: number; y: number },
  boss: { x: number; y: number } | null,
): CompassTarget | null {
  if (view.outcome) return null;
  const dist = (x: number, y: number): number => Math.round(Math.hypot(x - player.x, y - player.y));
  if (view.boss.exposed && !view.boss.defeated) {
    return boss ? { id: 'boss', kind: 'boss', x: boss.x, y: boss.y, tiles: dist(boss.x, boss.y) } : null;
  }
  // a field mission: always the CURRENT objective (the current checkpoint, the door, the exit), never a later one
  const goalId = view.fieldGoal?.nodeId;
  const goal = goalId ? view.nodes.find((n) => n.id === goalId && n.state !== 'done') : undefined;
  if (goal) return { id: goal.id, kind: 'node', x: goal.x, y: goal.y, tiles: dist(goal.x, goal.y) };
  let best: CompassTarget | null = null;
  for (const n of candidateNodes(view.nodes)) {
    const tiles = dist(n.x, n.y);
    if (!best || tiles < best.tiles) best = { id: n.id, kind: 'node', x: n.x, y: n.y, tiles };
  }
  return best;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CompassPlacement {
  /** Centre of the badge in the same pixels as the inputs. */
  x: number;
  y: number;
  /** Direction of the arrow from the badge to the target, radians (0 = right, positive = down, as on the screen). */
  angle: number;
}

export interface PlaceInput {
  /** The screen rectangle the pointer may use (the canvas), and the player's own screen position. */
  bounds: Rect;
  player: { x: number; y: number };
  /** The target's screen position (a point behind the camera has been mirrored by the caller: `ahead` false). */
  target: { x: number; y: number; ahead?: boolean };
  /** Badge side in pixels; it keeps this far (plus `pad`) from the bounds' edge. */
  size: number;
  pad?: number;
  /** HUD blocks the badge must not cover. */
  avoid?: readonly Rect[];
  /** The target counts as on screen this far inside the bounds (the marker in the world is enough then). */
  visibleInset?: number;
}

const intersects = (a: Rect, b: Rect): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const badgeRect = (x: number, y: number, size: number): Rect => ({
  left: x - size / 2,
  top: y - size / 2,
  right: x + size / 2,
  bottom: y + size / 2,
});

/** Walks the rectangle's perimeter from the corner (left, top) clockwise; `s` in [0, perimeter). */
function perimeterPoint(r: Rect, s: number): { x: number; y: number } {
  const w = r.right - r.left;
  const h = r.bottom - r.top;
  if (s < w) return { x: r.left + s, y: r.top };
  s -= w;
  if (s < h) return { x: r.right, y: r.top + s };
  s -= h;
  if (s < w) return { x: r.right - s, y: r.bottom };
  s -= w;
  return { x: r.left, y: r.bottom - s };
}

/**
 * Where the pointer sits: on the inset edge of the screen along the line from the player to the target, nudged along
 * the edge past HUD blocks. Null when the target is on screen (its world marker is visible) or nothing fits.
 */
export function placeCompass(input: PlaceInput): CompassPlacement | null {
  const { bounds, player, target, size } = input;
  const pad = input.pad ?? 8;
  const inset = input.visibleInset ?? 34;
  const ahead = target.ahead !== false;
  if (
    ahead &&
    target.x > bounds.left + inset &&
    target.x < bounds.right - inset &&
    target.y > bounds.top + inset &&
    target.y < bounds.bottom - inset
  )
    return null;

  const m = size / 2 + pad;
  const area: Rect = {
    left: bounds.left + m,
    top: bounds.top + m,
    right: bounds.right - m,
    bottom: bounds.bottom - m,
  };
  if (area.right <= area.left || area.bottom <= area.top) return null;

  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  const origin = { x: clamp(player.x, area.left, area.right), y: clamp(player.y, area.top, area.bottom) };
  let dx = target.x - player.x;
  let dy = target.y - player.y;
  if (!ahead) {
    dx = -dx;
    dy = -dy;
  }
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) dy = -1;

  // distance along (dx, dy) from the origin to the edge of the area
  const tx = dx > 0 ? (area.right - origin.x) / dx : dx < 0 ? (area.left - origin.x) / dx : Infinity;
  const ty = dy > 0 ? (area.bottom - origin.y) / dy : dy < 0 ? (area.top - origin.y) / dy : Infinity;
  const t = Math.max(0, Math.min(tx, ty));
  let p = { x: origin.x + dx * t, y: origin.y + dy * t };

  const avoid = input.avoid ?? [];
  const blocked = (q: { x: number; y: number }): boolean => {
    const r = badgeRect(q.x, q.y, size);
    return avoid.some((a) => intersects(r, a));
  };
  if (blocked(p)) {
    // slide along the edge to the nearest free spot (24 px steps)
    const w = area.right - area.left;
    const h = area.bottom - area.top;
    const perimeter = 2 * (w + h);
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let s = 0; s < perimeter; s += 24) {
      const q = perimeterPoint(area, s);
      if (blocked(q)) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
    if (!best) return null;
    p = best;
  }
  const toward = Math.atan2(target.y - p.y, target.x - p.x);
  return { x: p.x, y: p.y, angle: ahead ? toward : toward + Math.PI };
}

/** "12 tiles" / "1 tile" (the badge's small caption). */
export function tilesLabel(tiles: number): string {
  return `${tiles} ${tiles === 1 ? 'tile' : 'tiles'}`;
}
