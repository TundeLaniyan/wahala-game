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
}

/** Fraction of the countdown spent on the establishing (whole-arena) shot before gliding in. */
const ESTABLISH = 0.5;
/** How far beyond a generator's range a threatened player still keeps it in frame. */
const GEN_SLACK = 2;
/** A vehicle route passing within this many tiles of the focus keeps the vehicle in frame. */
const VEHICLE_NEAR = 2;

const DIRS = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] } as const;

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
  return {
    kind: 'action',
    focus: world(layout, pos.x, pos.y),
    lead: { x: d[0] * lead, z: d[1] * lead },
    keep: state.match.phase === 'playing' ? threatsNear(state, layout, pos.x, pos.y, p.id) : [],
    zoom,
  };
}

/**
 * Chooses the shot: an establishing view of the whole arena at the start of the countdown, then a
 * low three-quarter camera that follows the local player and widens to keep incoming danger in
 * frame; spectating frames the survivors; a win ends on a close-up of the winner.
 */
export function directShot(
  state: GameState,
  layout: Layout,
  localId: number,
  alpha: number,
  preferOverview: boolean,
): CameraShot {
  const overview: CameraShot = {
    kind: 'overview',
    focus: { x: 0, z: 0 },
    lead: { x: 0, z: 0 },
    keep: [],
    zoom: 1,
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
  // Spectating: frame everyone still standing.
  const alive = state.players.filter((p) => p.alive);
  if (alive.length === 0) return overview;
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
