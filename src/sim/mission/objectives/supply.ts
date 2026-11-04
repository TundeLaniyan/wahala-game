/**
 * Mushin: SUPPLY ROUTES. Parts stacks stand on floor tiles in the markets.
 *  - the human DESTROYS a stack with blasts: each separate generator blast of the human's that reaches its tile takes one
 *    hit (a chain counts once); `hp` hits destroy it (phase 1: 1, phases 2-3: 2);
 *  - market RUNNERS restock a destroyed stack by standing on it for `crewTicks`; no runner left, nothing is restocked
 *    (reinforcements bring runners back at the start of phases 2 and 3);
 *  - pressure: while the human is near a live stack a targeted goods-fall strike (3 x 3, >= 2.5 s warning) is called every
 *    `pulseTicks` on the tile they stand on;
 *  - phase 1: 2 of 3; phase 2: 3 of 4 (tougher, faster restock); phase 3: all 4 destroyed at once.
 */
import { areaTiles, completeNode, livingHuman, newNode, resetNode } from '../ctx';
import { callStrike } from '../strikes';
import { nearestNode, runnerOn } from './types';
import type { Objective } from './types';

/** The human has to be this close (Chebyshev tiles) to a live stack for the goods-fall pressure to find them. */
const PRESSURE_RANGE = 8;

export const supplyRoutes: Objective = {
  label: 'stacks destroyed',

  setup(ctx) {
    const { m, def, state, pd } = ctx;
    m.nodes = def.phases[m.phase].nodes.map((d) => newNode(d, -1, state.width, pd.hp));
    m.pulseAt = pd.pulseTicks > 0 ? state.tick + pd.pulseTicks : -1;
  },

  update(ctx) {
    const { state, m, pd } = ctx;
    const human = livingHuman(state);
    for (const node of m.nodes) {
      if (node.done) {
        if (pd.crewTicks > 0 && runnerOn(ctx, node)) {
          if (++node.crewProgress >= pd.crewTicks) resetNode(ctx, node);
        } else node.crewProgress = 0;
        continue;
      }
      // separate blasts of the human's, each counted once (event ids only grow)
      const fresh = new Set<number>();
      for (const f of state.flames) {
        if (f.x !== node.x || f.y !== node.y || f.ownerId !== 0) continue;
        if (state.tick < f.startTick || state.tick >= f.endTick || f.eventId <= node.lastEvent) continue;
        fresh.add(f.eventId);
      }
      for (const id of [...fresh].sort((a, b) => a - b)) {
        node.hp--;
        node.lastEvent = id;
        if (node.hp <= 0) {
          completeNode(ctx, node);
          break;
        }
      }
    }
    if (pd.pulseTicks > 0 && m.pulseAt >= 0 && state.tick >= m.pulseAt && human) {
      const near = m.nodes.some((n) => !n.done && Math.max(Math.abs(n.x - human.x), Math.abs(n.y - human.y)) <= PRESSURE_RANGE);
      if (near) {
        callStrike(ctx, {
          kind: 'strike',
          tiles: areaTiles(state, human.x, human.y, pd.strikeSpan),
          source: '',
          warnTicks: pd.warnTicks,
          activeTicks: pd.activeTicks,
        });
      }
      m.pulseAt = state.tick + pd.pulseTicks;
    }
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

