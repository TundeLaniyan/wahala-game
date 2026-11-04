/**
 * Lekki: CONTINGENCY GRID. Private systems are switches on floor tiles of the estate.
 *  - the signalled ORDER (drawn from the match RNG when the phase starts, shown in the callout and as the number on the
 *    switch label) lists which switches go off and in what sequence; some switches are decoys outside it;
 *  - the human switches one off by standing on it for `holdTicks`; the next switch of the order is accepted;
 *  - a WRONG switch (out of order, or a decoy) calls a telegraphed contingency strike (3 x 3, >= 2.5 s) on the human's
 *    tile and RESETS the whole sequence;
 *  - from phase 2 a contingency strike is also called on the human every `pulseTicks`;
 *  - phase 1: sequence of 3; phase 2: 4; phase 3: 5 (the `longBlackout` replay modifier adds one).
 */
import { shuffle } from '../../rng';
import { areaTiles, baseNodeView, completeNode, livingHuman, newNode, onNode, resetNode } from '../ctx';
import type { MissionCtx } from '../ctx';
import { callStrike } from '../strikes';
import type { Objective } from './types';

function resetSequence(ctx: MissionCtx): void {
  const { m } = ctx;
  for (const n of m.nodes) resetNode(ctx, n);
  m.seqIndex = 0;
}

export const contingencyGrid: Objective = {
  label: 'systems off',

  setup(ctx) {
    const { m, def, state, pd } = ctx;
    m.nodes = def.phases[m.phase].nodes.map((d) => newNode(d, -1, state.width, 0));
    const picked = shuffle(
      state,
      m.nodes.map((n) => n.id),
    ).slice(0, pd.sequence);
    m.sequence = picked;
    m.seqIndex = 0;
    picked.forEach((id, order) => {
      const node = m.nodes.find((n) => n.id === id)!;
      node.order = order;
      node.label = `${node.label} ${order + 1}`;
    });
    m.pulseAt = pd.pulseTicks > 0 ? state.tick + pd.pulseTicks : -1;
  },

  update(ctx) {
    const { state, m, pd } = ctx;
    const human = livingHuman(state);
    for (const node of m.nodes) {
      if (node.done) continue;
      if (!onNode(human, node)) {
        node.progress = Math.max(0, node.progress - pd.decayPerTick);
        node.needsRelease = false;
        continue;
      }
      if (node.needsRelease) continue;
      node.progress++;
      if (node.progress < pd.holdTicks) continue;
      if (node.id === m.sequence[m.seqIndex]) {
        completeNode(ctx, node);
        m.seqIndex++;
      } else {
        // wrong switch: a contingency strike on the culprit and the sequence starts again
        callStrike(ctx, {
          kind: 'contingency',
          tiles: areaTiles(state, node.x, node.y, 1),
          source: node.id,
          warnTicks: pd.warnTicks,
          activeTicks: pd.activeTicks,
        });
        resetSequence(ctx);
        node.needsRelease = true;
      }
      break;
    }
    if (pd.pulseTicks > 0 && m.pulseAt >= 0 && state.tick >= m.pulseAt && human) {
      callStrike(ctx, {
        kind: 'contingency',
        tiles: areaTiles(state, human.x, human.y, pd.strikeSpan),
        source: '',
        warnTicks: pd.warnTicks,
        activeTicks: pd.activeTicks,
      });
      m.pulseAt = state.tick + pd.pulseTicks;
    }
  },

  done: (ctx) => ctx.m.seqIndex,

  nodeView(ctx, node) {
    const v = baseNodeView(node, ctx.pd.holdTicks);
    if (v.state === 'idle' && ctx.m.sequence[ctx.m.seqIndex] === node.id) return { state: 'live', fraction: 0 };
    return v;
  },

  runnerTarget: () => null,

  callout(ctx) {
    const { m } = ctx;
    const letters = m.sequence.map((id) => id.toUpperCase());
    if (letters.length === 0) return null;
    const next = letters[m.seqIndex];
    return `Switch off in this order: ${letters.join(' > ')}${next ? ` (next: ${next})` : ''}. A wrong switch calls a strike.`;
  },
};
