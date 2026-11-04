/**
 * Fadeyi / Somolu: JUNCTION ACCESS (king of the hill). Each junction is a zone (3 x 3 around its node).
 *  - the human HOLDS a zone: progress grows while they are inside and no marshal (any crew bot) is inside;
 *    it freezes while a marshal contests it and decays (slowly) while the human is away;
 *  - `holdTicks` makes the junction held: it opens its routes (authored soft blocks are cleared) and its marshal strikes
 *    stop for good;
 *  - a junction that is not held calls a telegraphed marshal strike (>= 2.5 s) on the lane through it, outside the zone,
 *    every `pulseTicks`;
 *  - phase 1: hold 2 of 3; phase 2: hold 3 (longer, faster marshals); phase 3: hold all 3 inside the window: a held
 *    junction is retaken after `rearmTicks`.
 */
import { nextInt } from '../../rng';
import { Tile } from '../../types';
import {
  baseNodeView,
  completeNode,
  livingCrew,
  livingHuman,
  newNode,
  nodeDistance,
  onNode,
  resetNode,
} from '../ctx';
import type { MissionCtx } from '../ctx';
import { callStrike } from '../strikes';
import type { MissionNodeRuntime } from '../types';
import { nearestNode } from './types';
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
  label: 'junctions held',

  setup(ctx) {
    const { m, def, state, pd } = ctx;
    m.nodes = def.phases[m.phase].nodes.map((d, i) => {
      const node = newNode(d, -1, state.width, 0);
      node.nextPulse = pd.pulseTicks > 0 ? state.tick + Math.round(pd.pulseTicks * (0.6 + 0.25 * i)) : -1;
      return node;
    });
  },

  update(ctx) {
    const { state, m, pd } = ctx;
    const human = livingHuman(state);
    const crew = livingCrew(state);
    m.nodes.forEach((node, i) => {
      if (node.done) {
        if (pd.rearmTicks > 0 && state.tick - node.doneAt >= pd.rearmTicks) {
          resetNode(ctx, node);
          node.nextPulse = state.tick + Math.round(pd.pulseTicks * (0.6 + 0.25 * i));
        }
        return;
      }
      const inside = onNode(human, node);
      const marshal = crew.some((p) => nodeDistance(p, node) <= node.radius);
      if (inside && !marshal) node.progress++;
      else if (!inside) node.progress = Math.max(0, node.progress - pd.decayPerTick);
      if (node.progress >= pd.holdTicks) {
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

  nodeView: (ctx, node) => baseNodeView(node, ctx.pd.holdTicks),

  runnerTarget: (ctx, runner) => nearestNode(ctx.m.nodes, runner, (n) => !n.done),
};
