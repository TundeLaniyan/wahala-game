/**
 * Fadeyi / Somolu: JUNCTION ACCESS. Each junction is a zone (3 x 3 around its node) with a TOLL BOX on the node.
 *  - the human BREAKS the box with blasts (decision BX4): a generator blast of the human's that reaches the box while no
 *    marshal (any living crew bot) stands in the zone takes one hit; a marshal inside SHIELDS it (that blast is wasted):
 *    draw the marshals out, push them out or blast them first. `hp` hits (1; `tollSeason` +1) break it;
 *  - a broken box makes the junction held: it opens its routes (authored soft blocks are cleared) and its marshal
 *    strikes stop for good;
 *  - a junction that is not held calls a telegraphed marshal strike (>= 2.5 s) on the lane through it, outside the zone,
 *    every `pulseTicks`;
 *  - phase 1: break 2 of 3; phase 2: all 3 (faster marshals); phase 3: all 3 inside the window: a broken box is
 *    rebuilt after `rearmTicks`.
 */
import { nextInt } from '../../rng';
import { Tile } from '../../types';
import { completeNode, livingCrew, newNode, nodeDistance, resetNode } from '../ctx';
import type { MissionCtx } from '../ctx';
import { callStrike } from '../strikes';
import type { MissionNodeRuntime } from '../types';
import { freshBlasts, nearestNode } from './types';
import type { Objective } from './types';

function marshalTiles(ctx: MissionCtx, node: MissionNodeRuntime): number[] {
  const { state, pd } = ctx;
  const horizontal = nextInt(state, 2) === 0;
  const out: number[] = [];
  for (let d = node.radius + 1; d <= node.radius + pd.strikeSpan; d++) {
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

export const junctionAccess: Objective = {
  label: 'toll boxes broken',

  setup(ctx) {
    const { m, def, state, pd } = ctx;
    m.nodes = def.phases[m.phase].nodes.map((d, i) => {
      const node = newNode(d, -1, state.width, pd.hp);
      node.nextPulse = pd.pulseTicks > 0 ? state.tick + Math.round(pd.pulseTicks * (0.6 + 0.25 * i)) : -1;
      return node;
    });
  },

  update(ctx) {
    const { state, m, pd } = ctx;
    const crew = livingCrew(state);
    m.nodes.forEach((node, i) => {
      if (node.done) {
        if (pd.rearmTicks > 0 && state.tick - node.doneAt >= pd.rearmTicks) {
          resetNode(ctx, node);
          node.nextPulse = state.tick + Math.round(pd.pulseTicks * (0.6 + 0.25 * i));
        }
        return;
      }
      const marshal = crew.some((p) => nodeDistance(p, node) <= node.radius);
      const blasts = freshBlasts(ctx, node).length;
      if (blasts > 0 && !marshal) node.hp -= 1; // one hit per tick at most: a blast counts once
      if (node.hp <= 0) {
        completeNode(ctx, node);
        for (const t of node.opens) if (state.tiles[t] === Tile.Soft) state.tiles[t] = Tile.Empty;
        return;
      }
      if (pd.pulseTicks > 0 && node.nextPulse >= 0 && state.tick >= node.nextPulse) {
        callStrike(ctx, {
          kind: 'marshal',
          tiles: marshalTiles(ctx, node),
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
    // a marshal in the zone shields the box: 'locked' until the zone is clear
    if (livingCrew(ctx.state).some((p) => nodeDistance(p, node) <= node.radius))
      return { state: 'locked', fraction: 0 };
    const total = Math.max(1, ctx.pd.hp);
    if (node.hp < total) return { state: 'progress', fraction: (total - node.hp) / total };
    return { state: 'live', fraction: 0 };
  },

  runnerTarget: (ctx, runner) => nearestNode(ctx.m.nodes, runner, (n) => !n.done),
};
