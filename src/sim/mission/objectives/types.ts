import type { Player } from '../../types';
import type { MissionCtx } from '../ctx';
import type { MissionNodeRuntime, MissionNodeState } from '../types';

/** One objective mechanic: a verb, node based, three phases of rising pressure (numbers come from `PhaseTuning`). */
export interface Objective {
  /** The unit word of the progress counter ("relays jammed"). */
  readonly label: string;
  /** Builds the nodes (and any mechanic state) of the phase in play. Called at every phase start and on a retry. */
  setup(ctx: MissionCtx): void;
  /** One playing tick: the human's interaction, the crew's, the pressure. */
  update(ctx: MissionCtx): void;
  /** How many units of the phase goal are done right now. */
  done(ctx: MissionCtx): number;
  /** The picture of one node. */
  nodeView(ctx: MissionCtx, node: MissionNodeRuntime): { state: MissionNodeState; fraction: number };
  /** Where a runner crew bot should head (a restock / re-arm tile), or null. */
  runnerTarget(ctx: MissionCtx, runner: Player): { x: number; y: number } | null;
  /** An extra HUD line that depends on the live state (the contingency order), or null for the phase's callout. */
  callout?(ctx: MissionCtx): string | null;
}

/** The nearest node of `nodes` to `p` that satisfies `pick`, or null. */
export function nearestNode(
  nodes: readonly MissionNodeRuntime[],
  p: { x: number; y: number },
  pick: (n: MissionNodeRuntime) => boolean,
): MissionNodeRuntime | null {
  let best: MissionNodeRuntime | null = null;
  let bestD = Infinity;
  for (const n of nodes) {
    if (!pick(n)) continue;
    const d = Math.abs(n.x - p.x) + Math.abs(n.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

/** Is a runner crew bot standing on the node? */
export function runnerOn(ctx: MissionCtx, node: MissionNodeRuntime): boolean {
  const { state, m } = ctx;
  return m.seats.some((s) => {
    if (s.role !== 'runner') return false;
    const p = state.players[s.playerId];
    return p !== undefined && p.alive && p.x === node.x && p.y === node.y;
  });
}
