/**
 * Lekki: CONTINGENCY GRID. Private systems are switches on floor tiles of the estate.
 *  - the signalled ORDER (drawn from the match RNG when the phase starts, shown in the callout and as the number on the
 *    switch label) lists which switches go off and in what sequence; some switches are decoys outside it;
 *  - the human switches one off with a BLAST (decision BX4): a generator blast of the human's that reaches the next
 *    switch of the order switches it off (a blast that also reaches another switch counts for the right one only);
 *  - a blast that reaches only WRONG switches (out of order, or a decoy) calls a telegraphed contingency strike (3 x 3,
 *    >= 2.5 s) on that switch and RESETS the whole sequence;
 *  - from phase 2 a contingency strike is also called on the human every `pulseTicks`;
 *  - phase 1: sequence of 3; phase 2: 4; phase 3: 5 (the `longBlackout` replay modifier adds one).
 */
import { shuffle } from '../../rng';
import { areaTiles, completeNode, livingHuman, newNode, resetNode } from '../ctx';
import type { MissionCtx } from '../ctx';
import { callStrike } from '../strikes';
import { freshBlasts } from './types';
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
    // every fresh blast of the human's, with the switches it reached (in event order: one blast is one decision)
    const hitsBy = new Map<number, string[]>();
    for (const node of m.nodes) {
      if (node.done) continue;
      for (const id of freshBlasts(ctx, node)) hitsBy.set(id, [...(hitsBy.get(id) ?? []), node.id]);
    }
    for (const id of [...hitsBy.keys()].sort((a, b) => a - b)) {
      const reached = hitsBy.get(id)!;
      const expected = m.sequence[m.seqIndex];
      if (expected !== undefined && reached.includes(expected)) {
        const node = m.nodes.find((n) => n.id === expected)!;
        if (node.done) continue;
        completeNode(ctx, node);
        m.seqIndex++;
        continue;
      }
      const wrong = m.nodes.find((n) => !n.done && reached.includes(n.id));
      if (!wrong) continue;
      // wrong switch: a contingency strike on it and the sequence starts again
      callStrike(ctx, {
        kind: 'contingency',
        tiles: areaTiles(state, wrong.x, wrong.y, 1),
        source: wrong.id,
        warnTicks: pd.warnTicks,
        activeTicks: pd.activeTicks,
      });
      resetSequence(ctx);
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
    if (node.done) return { state: 'done', fraction: 1 };
    if (ctx.m.sequence[ctx.m.seqIndex] === node.id) return { state: 'live', fraction: 0 };
    return { state: 'idle', fraction: 0 };
  },

  runnerTarget: () => null,

  callout(ctx) {
    const { m } = ctx;
    const letters = m.sequence.map((id) => id.toUpperCase());
    if (letters.length === 0) return null;
    const next = letters[m.seqIndex];
    return `Blast in this order: ${letters.join(' > ')}${next ? ` (next: ${next})` : ''}. A wrong blast calls a strike.`;
  },
};
