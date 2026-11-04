/** The per-tick view of a mission that the runtime and the objectives share, plus small geometry helpers. */
import { tileIndex } from '../grid';
import { Tile } from '../types';
import type { GameState, Player, SimEvent } from '../types';
import { groundedGeneratorAt, playerStepTicks } from '../systems/queries';
import { MISSION_DEFS } from './defs';
import type { MissionDef, NodeDef } from './defs';
import type { MissionNodeRuntime, MissionNodeState, MissionState, PhaseTuning } from './types';

export interface MissionCtx {
  state: GameState;
  m: MissionState;
  def: MissionDef;
  /** The numbers of the phase in play. */
  pd: PhaseTuning;
  events: SimEvent[];
}

export function makeCtx(state: GameState, events: SimEvent[]): MissionCtx {
  const m = state.mission!;
  return { state, m, def: MISSION_DEFS[m.id], pd: m.tuning.phases[m.phase], events };
}

/** The human (seat 0) while standing, else null. */
export function livingHuman(state: GameState): Player | null {
  const p = state.players[0];
  return p && p.alive ? p : null;
}

export const tileOf = (state: GameState, x: number, y: number): number => tileIndex(state, x, y);

/** Chebyshev distance of a player to a node tile. */
export function nodeDistance(p: { x: number; y: number }, node: { x: number; y: number }): number {
  return Math.max(Math.abs(p.x - node.x), Math.abs(p.y - node.y));
}

/** Is the player standing on the node (or inside its zone: `radius` tiles, Chebyshev)? */
export function onNode(p: Player | null, node: MissionNodeRuntime, radius = node.radius): boolean {
  return p !== null && p.alive && nodeDistance(p, node) <= radius;
}

/** Living crew bots (seat 2...; the boss is not crew). */
export function livingCrew(state: GameState): Player[] {
  const m = state.mission!;
  return state.players.filter((p) => p.alive && p.id !== 0 && p.id !== m.bossId);
}

export function newNode(def: NodeDef, order: number, width: number, hp: number): MissionNodeRuntime {
  return {
    id: def.id,
    x: def.x,
    y: def.y,
    label: def.label,
    progress: 0,
    done: false,
    doneAt: 0,
    nextPulse: -1,
    hp,
    lastEvent: 0,
    crewProgress: 0,
    radius: def.radius ?? 0,
    order,
    needsRelease: false,
    shown: 'idle',
    opens: (def.opens ?? []).map(([x, y]) => y * width + x),
  };
}

/** Marks a node complete (events and lapse timers are handled by the caller's sync). */
export function completeNode(ctx: MissionCtx, node: MissionNodeRuntime): void {
  node.done = true;
  node.doneAt = ctx.state.tick;
  node.progress = 0;
  node.crewProgress = 0;
}

/** Reverts a completed node (re-armed, retaken, restocked, lapsed). */
export function resetNode(ctx: MissionCtx, node: MissionNodeRuntime): void {
  node.done = false;
  node.progress = 0;
  node.crewProgress = 0;
  node.hp = ctx.pd.hp;
}

/** The default node picture: done, being worked, or `idle`; objectives override `idle`. */
export function baseNodeView(node: MissionNodeRuntime, hold: number): { state: MissionNodeState; fraction: number } {
  if (node.done) return { state: 'done', fraction: 1 };
  if (node.progress > 0) return { state: 'progress', fraction: Math.min(1, node.progress / Math.max(1, hold)) };
  return { state: 'idle', fraction: 0 };
}

// ------------------------------------------------------------------ geometry for strikes

/** Walkable floor tiles within Chebyshev `radius` of (cx, cy), as tile indices. */
export function areaTiles(state: GameState, cx: number, cy: number, radius: number): number[] {
  const out: number[] = [];
  for (let y = cy - radius; y <= cy + radius; y++)
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
      const i = tileIndex(state, x, y);
      if (state.tiles[i] === Tile.Empty) out.push(i);
    }
  return out;
}

/** `span` contiguous tiles of a lane (ascending x) centred as near `nearX` as the lane allows, floor tiles only. */
export function laneSegment(
  state: GameState,
  lane: readonly (readonly [number, number])[],
  nearX: number,
  span: number,
): number[] {
  if (lane.length === 0) return [];
  const len = Math.min(span, lane.length);
  let best = 0;
  let bestD = Infinity;
  for (let s = 0; s + len <= lane.length; s++) {
    const mid = lane[s + Math.floor(len / 2)]![0];
    const d = Math.abs(mid - nearX);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return lane
    .slice(best, best + len)
    .map(([x, y]) => tileIndex(state, x, y))
    .filter((i) => state.tiles[i] === Tile.Empty);
}

/**
 * Fewest steps a fighter standing on `from` needs to leave `set` over floor tiles (a grounded generator stops them);
 * Infinity when boxed in or further than `limit`. Pure; the strike fairness check (decision MS3).
 */
export function escapeSteps(state: GameState, set: ReadonlySet<number>, from: number, limit = 8): number {
  if (!set.has(from)) return 0;
  const seen = new Set<number>([from]);
  let frontier = [from];
  for (let d = 1; d <= limit; d++) {
    const next: number[] = [];
    for (const t of frontier) {
      const x = t % state.width;
      const y = Math.floor(t / state.width);
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
        const i = ny * state.width + nx;
        if (seen.has(i) || state.tiles[i] !== Tile.Empty || groundedGeneratorAt(state, nx, ny)) continue;
        if (!set.has(i)) return d;
        seen.add(i);
        next.push(i);
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return Infinity;
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Ticks the human needs to walk `steps` tiles (with the input allowance of the stage hazards). */
export function walkTicks(state: GameState, p: Player, steps: number): number {
  return steps * playerStepTicks(state, p) + state.config.stage.escapeInputTicks;
}
