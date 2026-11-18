import type { GameState, Player } from '../sim';
import type { Layout } from './coords';
import { playerGridPos } from './views/motion';

export interface WorldPoint {
  x: number;
  z: number;
}

/**
 * What the camera should frame this frame. Purely presentational: it is derived from the
 * simulation state each frame and never feeds back into the game.
 */
export interface CameraShot {
  kind: 'action' | 'overview';
  /** World point the action camera centres on (normally the local player). */
  focus: WorldPoint;
  /** Small look-ahead in the direction of travel (world units). */
  lead: WorldPoint;
  /** World points that must stay inside the frame: dangers that can reach the focus. */
  keep: WorldPoint[];
  /** Distance multiplier for the action camera (below 1 = closer, e.g. the winner close-up). */
  zoom: number;
  /** Debug / art review: do not clamp the view to the arena. */
  free?: boolean;
  /**
   * A mission sector (docs/CAMPAIGN_SECTOR_AI.md): the view stays on it. `play` is the playable rects' bounding box in
   * world units (tile edges), `margin` the world units of scenery the camera may show beyond it (the sector's
   * `viewMargin`; the rig never uses less than its own HUD margin). The overview shot frames it instead of the city.
   */
  bounds?: CameraBounds;
}

export interface CameraBounds {
  play: { x0: number; z0: number; x1: number; z1: number };
  margin: number;
}

/** The camera bounds of the match's sector (undefined without one). */
export function sectorBounds(state: GameState, layout: Layout): CameraBounds | undefined {
  const s = state.sector;
  if (!s || s.rects.length === 0) return undefined;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of s.rects) {
    x0 = Math.min(x0, r[0]);
    y0 = Math.min(y0, r[1]);
    x1 = Math.max(x1, r[2]);
    y1 = Math.max(y1, r[3]);
  }
  return {
    play: {
      x0: layout.wx(x0) - 0.5,
      z0: layout.wz(y0) - 0.5,
      x1: layout.wx(x1) + 0.5,
      z1: layout.wz(y1) + 0.5,
    },
    margin: s.viewMargin,
  };
}

/** Fraction of the countdown spent on the establishing (whole-arena) shot before gliding in. */
const ESTABLISH = 0.5;
/** How far beyond a generator's range a threatened player still keeps it in frame. */
const GEN_SLACK = 2;
/** A vehicle route passing within this many tiles of the focus keeps the vehicle in frame. */
const VEHICLE_NEAR = 2;

const DIRS = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] } as const;

/** Boards with more tiles than this (City Rumble) use the crowd-scale rules below; standard boards have 165. */
const LARGE_BOARD_TILES = 400;
/** Large boards: rivals this close (Manhattan tiles) are kept in frame. */
const RIVAL_NEAR = 4;
/** Large boards: kept points are clamped to this box around the focus (tiles), so the view never pulls out far. */
const KEEP_BOX = { x: 7, z: 5 };
/** Large boards: the follow camera sits a little wider than the standard action camera (more street to read). */
const LARGE_ZOOM = 1.12;

export const isLargeBoard = (state: GameState): boolean => state.width * state.height > LARGE_BOARD_TILES;

function world(layout: Layout, x: number, y: number): WorldPoint {
  return { x: layout.wx(x), z: layout.wz(y) };
}

/**
 * Points worth keeping in frame around grid tile (fx, fy): live generators whose cross covers it,
 * vehicles heading past it, and the vehicle the player at that tile called in themselves.
 */
export function threatsNear(
  state: GameState,
  layout: Layout,
  fx: number,
  fy: number,
  ownerId = -1,
): WorldPoint[] {
  const keep: WorldPoint[] = [];
  const tx = Math.round(fx);
  const ty = Math.round(fy);
  for (const g of state.generators) {
    if (g.mode === 'disabled' || g.carriedBy !== null) continue;
    const reach = g.range + GEN_SLACK;
    const inRow = g.y === ty && Math.abs(g.x - tx) <= reach;
    const inCol = g.x === tx && Math.abs(g.y - ty) <= reach;
    const close = Math.abs(g.x - fx) <= 2 && Math.abs(g.y - fy) <= 2;
    if (inRow || inCol || close) keep.push(world(layout, g.x, g.y));
  }
  for (const v of state.vehicles) {
    if (v.phase === 'crashing') continue;
    const from = Math.max(0, v.index);
    if (v.ownerId === ownerId) {
      const at = v.route[Math.min(from, v.route.length - 1)]!;
      keep.push(world(layout, at.x, at.y));
      continue;
    }
    let near = -1;
    for (let i = from; i < v.route.length; i++) {
      const t = v.route[i]!;
      if (Math.abs(t.x - fx) <= VEHICLE_NEAR && Math.abs(t.y - fy) <= VEHICLE_NEAR) {
        near = i;
        break;
      }
    }
    if (near < 0) continue;
    const at = v.route[from]!;
    keep.push(world(layout, at.x, at.y), world(layout, v.route[near]!.x, v.route[near]!.y));
  }
  return keep;
}

function followPlayer(state: GameState, layout: Layout, p: Player, alpha: number, zoom: number): CameraShot {
  const pos = playerGridPos(p, alpha);
  const d = DIRS[p.facing];
  const lead = pos.moving ? 0.55 : 0;
  const focus = world(layout, pos.x, pos.y);
  let keep = state.match.phase === 'playing' ? threatsNear(state, layout, pos.x, pos.y, p.id) : [];
  if (isLargeBoard(state)) {
    if (state.match.phase === 'playing') keep.push(...rivalsNear(state, layout, p, pos.x, pos.y, alpha));
    keep = clampKeep(keep, focus);
  }
  return {
    kind: 'action',
    focus,
    lead: { x: d[0] * lead, z: d[1] * lead },
    keep,
    zoom: isLargeBoard(state) ? zoom * LARGE_ZOOM : zoom,
    // large boards: keep the followed player centred even at the city's edge (the street beyond is
    // dressed); clamping the view to the board pushed a player at the edge under the HUD panels
    free: isLargeBoard(state) ? true : undefined,
    // a mission sector: the view stays on it, with a margin wide enough that the player is never under the HUD
    ...(state.sector ? { bounds: sectorBounds(state, layout) } : {}),
  };
}

/** Large boards: opponents standing within RIVAL_NEAR tiles of the followed player. */
export function rivalsNear(
  state: GameState,
  layout: Layout,
  self: Player,
  fx: number,
  fy: number,
  alpha: number,
): WorldPoint[] {
  const out: WorldPoint[] = [];
  for (const q of state.players) {
    if (!q.alive || q.id === self.id) continue;
    if (Math.abs(q.x - fx) + Math.abs(q.y - fy) > RIVAL_NEAR) continue;
    const g = playerGridPos(q, alpha);
    out.push(world(layout, g.x, g.y));
  }
  return out;
}

/** Large boards: pulls kept points into a box around the focus so the camera never tries to frame the city. */
export function clampKeep(keep: WorldPoint[], focus: WorldPoint): WorldPoint[] {
  return keep.map((k) => ({
    x: Math.min(focus.x + KEEP_BOX.x, Math.max(focus.x - KEEP_BOX.x, k.x)),
    z: Math.min(focus.z + KEEP_BOX.z, Math.max(focus.z - KEEP_BOX.z, k.z)),
  }));
}

/**
 * Chooses the shot: an establishing view of the whole arena at the start of the countdown, then a
 * low three-quarter camera that follows the local player and widens to keep incoming danger in
 * frame; spectating follows `focusId` when given (City Rumble) or frames the survivors; a win ends
 * on a close-up of the winner.
 */
export function directShot(
  state: GameState,
  layout: Layout,
  localId: number,
  alpha: number,
  preferOverview: boolean,
  focusId: number | null = null,
): CameraShot {
  const bounds = sectorBounds(state, layout);
  const overview: CameraShot = {
    kind: 'overview',
    focus: { x: 0, z: 0 },
    lead: { x: 0, z: 0 },
    keep: [],
    zoom: 1,
    ...(bounds ? { bounds } : {}),
  };
  if (preferOverview) return overview;
  const m = state.match;
  if (m.phase === 'countdown' && m.countdownRemaining > state.config.match.countdownTicks * ESTABLISH)
    return overview;
  if (m.phase === 'ended') {
    const r = m.result;
    if (r?.kind !== 'win') return overview;
    return followPlayer(state, layout, state.players[r.winnerId]!, alpha, 0.72);
  }
  const me = state.players[localId];
  if (me?.alive) return followPlayer(state, layout, me, alpha, 1);
  // Spectating one competitor (City Rumble: the camera rides along with a survivor).
  const watched = focusId !== null ? state.players[focusId] : undefined;
  if (watched?.alive) return followPlayer(state, layout, watched, alpha, 1);
  // Spectating: frame everyone still standing (a large board would need the whole city: overview).
  const alive = state.players.filter((p) => p.alive);
  if (alive.length === 0 || isLargeBoard(state)) return overview;
  const pts = alive.map((p) => {
    const g = playerGridPos(p, alpha);
    return world(layout, g.x, g.y);
  });
  const focus = {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    z: pts.reduce((s, p) => s + p.z, 0) / pts.length,
  };
  return { kind: 'action', focus, lead: { x: 0, z: 0 }, keep: pts, zoom: 1 };
}
