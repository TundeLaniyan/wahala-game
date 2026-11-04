/**
 * Oshodi: DISPATCH RELAYS (the vertical slice). Relays stand on floor tiles beside the main road.
 *  - the human JAMS one by standing on it for `holdTicks`; the progress decays when they step off;
 *  - every live relay calls a telegraphed convoy strike (a lane segment of the road, >= 2.5 s warning, lethal, credited to
 *    the boss, never unavoidable) every `pulseTicks`; a jammed relay is silent;
 *  - a jammed relay re-arms after `rearmTicks`, or as soon as a runner has stood on it for `crewTicks` (phases 2 and 3);
 *  - phase 1: jam 2 of 3; phase 2: jam 3 of 4 with faster pulses and runners; phase 3: all 4 jammed at once
 *    (every jam wears off after 40 s) which exposes the boss.
 */
import { nextInt } from '../../rng';
import { baseNodeView, completeNode, laneSegment, livingHuman, newNode, onNode, resetNode } from '../ctx';
import type { MissionCtx } from '../ctx';
import { callStrike } from '../strikes';
import type { MissionNodeRuntime } from '../types';
import { nearestNode, runnerOn } from './types';
import type { Objective } from './types';

function stagger(ctx: MissionCtx, index: number): number {
  const { pd, state } = ctx;
  return pd.pulseTicks > 0 ? state.tick + Math.round(pd.pulseTicks * (0.6 + 0.25 * index)) : -1;
}

function callConvoy(ctx: MissionCtx, relay: MissionNodeRuntime): void {
  const { state, def, pd } = ctx;
  const lanes = def.lanes ?? [];
  if (lanes.length === 0) return;
  const start = nextInt(state, lanes.length);
  for (let k = 0; k < lanes.length; k++) {
    const lane = lanes[(start + k) % lanes.length]!;
    const tiles = laneSegment(state, lane, relay.x, pd.strikeSpan);
    if (callStrike(ctx, { kind: 'convoy', tiles, source: relay.id, warnTicks: pd.warnTicks, activeTicks: pd.activeTicks })) return;
  }
}

export const dispatchRelays: Objective = {
  label: 'relays jammed',

  setup(ctx) {
    const { m, def, state } = ctx;
    m.nodes = def.phases[m.phase].nodes.map((d, i) => {
      const node = newNode(d, -1, state.width, 0);
      node.nextPulse = stagger(ctx, i);
      return node;
    });
  },

  update(ctx) {
    const { state, m, pd } = ctx;
    const human = livingHuman(state);
    m.nodes.forEach((node, i) => {
      if (node.done) {
        if (pd.rearmTicks > 0 && state.tick - node.doneAt >= pd.rearmTicks) {
          resetNode(ctx, node);
          node.nextPulse = stagger(ctx, i);
        } else if (pd.crewTicks > 0 && runnerOn(ctx, node)) {
          if (++node.crewProgress >= pd.crewTicks) {
            resetNode(ctx, node);
            node.nextPulse = state.tick + 60;
          }
        } else node.crewProgress = 0;
        return;
      }
      if (onNode(human, node)) node.progress++;
      else node.progress = Math.max(0, node.progress - pd.decayPerTick);
      if (node.progress >= pd.holdTicks) {
        completeNode(ctx, node);
        return;
      }
      if (pd.pulseTicks > 0 && node.nextPulse >= 0 && state.tick >= node.nextPulse) {
        callConvoy(ctx, node);
        node.nextPulse = state.tick + pd.pulseTicks;
      }
    });
  },

  done: (ctx) => ctx.m.nodes.filter((n) => n.done).length,

  nodeView(ctx, node) {
    const v = baseNodeView(node, ctx.pd.holdTicks);
    return v.state === 'idle' ? { state: 'live', fraction: 0 } : v;
  },

  runnerTarget(ctx, runner) {
    return (
      nearestNode(ctx.m.nodes, runner, (n) => n.done) ?? nearestNode(ctx.m.nodes, runner, () => true)
    );
  },
};
