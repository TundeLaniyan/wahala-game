/**
 * Ojuelegba finale (decision FN5): CONTROL POINTS. The territorial enforcer ("The Landlord", a provisional working title)
 * runs the junction through Ring control equipment standing at the mouths of the neighbourhood's routes.
 *  - the human SHUTS a control point DOWN with blasts only (decision BX4): each separate generator blast of the human's
 *    that reaches its tile takes one hit (a chain counts once); `hp` hits shut it down. Standing on it or punching it does
 *    nothing;
 *  - a shut-down point physically reopens its route: its authored `opens` tiles (Ring barricade crates) are cleared;
 *  - LOCKERS (runner crew) re-lock a shut point by standing on it for `crewTicks` (0 = never): put them down first;
 *  - a live point calls a telegraphed LOCKDOWN strike (>= 2.5 s warning) along the route through it, never on the point's
 *    own tile, every `pulseTicks` (staggered per point);
 *  - the phases ask for more points at once, tougher and re-locked faster (the data in `finaleDefs.ts`).
 * Built from the shared pieces of the supply (restock) and junction (lanes, opened routes) verbs: no new engine.
 */
import { nextInt } from '../../rng';
import { Tile } from '../../types';
import { completeNode, newNode, resetNode } from '../ctx';
import type { MissionCtx } from '../ctx';
import { callStrike } from '../strikes';
import type { MissionNodeRuntime } from '../types';
import { freshBlasts, nearestNode, runnerOn } from './types';
import type { Objective } from './types';

/** The lockdown lane of a live point: `strikeSpan` floor tiles each way along a row or a column, the point excluded. */
function lockdownTiles(ctx: MissionCtx, node: MissionNodeRuntime): number[] {
  const { state, pd } = ctx;
  const horizontal = nextInt(state, 2) === 0;
  const out: number[] = [];
  for (let d = 1; d <= pd.strikeSpan; d++) {
    for (const s of [-1, 1]) {
      const x = horizontal ? node.x + s * d : node.x;
      const y = horizontal ? node.y : node.y + s * d;
      if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
      const i = y * state.width + x;
      if (state.tiles[i] === Tile.Empty) out.push(i);
    }
  }
  return out;
}

/** The stagger of point `i`'s first lockdown (so two points never warn on the same tick). */
const firstPulse = (pulseTicks: number, i: number): number => Math.round(pulseTicks * (0.7 + 0.3 * i));

export const controlPoints: Objective = {
  label: 'control points shut down',

  setup(ctx) {
    const { m, def, state, pd } = ctx;
    m.nodes = def.phases[m.phase].nodes.map((d, i) => {
      const node = newNode(d, -1, state.width, pd.hp);
      node.nextPulse = pd.pulseTicks > 0 ? state.tick + firstPulse(pd.pulseTicks, i) : -1;
      return node;
    });
  },

  update(ctx) {
    const { state, m, pd } = ctx;
    m.nodes.forEach((node, i) => {
      if (node.done) {
        // a locker standing on a shut point re-locks it; nobody on it, the lock work is lost
        if (pd.crewTicks > 0 && runnerOn(ctx, node)) {
          if (++node.crewProgress >= pd.crewTicks) {
            resetNode(ctx, node);
            node.nextPulse = pd.pulseTicks > 0 ? state.tick + firstPulse(pd.pulseTicks, i) : -1;
          }
        } else node.crewProgress = 0;
        return;
      }
      for (const _id of freshBlasts(ctx, node)) {
        node.hp--;
        if (node.hp <= 0) {
          completeNode(ctx, node);
          for (const t of node.opens) if (state.tiles[t] === Tile.Soft) state.tiles[t] = Tile.Empty;
          return;
        }
      }
      if (pd.pulseTicks > 0 && node.nextPulse >= 0 && state.tick >= node.nextPulse) {
        callStrike(ctx, {
          kind: 'marshal',
          tiles: lockdownTiles(ctx, node),
          source: node.id,
          warnTicks: pd.warnTicks,
          activeTicks: pd.activeTicks,
        });
        node.nextPulse = state.tick + pd.pulseTicks;
      }
    });
  },

  done: (ctx) => ctx.m.nodes.filter((n) => n.done).length,

  nodeView(ctx, node) {
    if (node.done) return { state: 'done', fraction: 1 };
    const total = Math.max(1, ctx.pd.hp);
    if (node.hp < total) return { state: 'progress', fraction: (total - node.hp) / total };
    return { state: 'live', fraction: 0 };
  },

  runnerTarget(ctx, runner) {
    return nearestNode(ctx.m.nodes, runner, (n) => n.done) ?? nearestNode(ctx.m.nodes, runner, () => true);
  },
};
