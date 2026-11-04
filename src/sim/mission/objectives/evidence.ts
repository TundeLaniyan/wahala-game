/**
 * Lagos Island: EVIDENCE RUN. Ledgers lie on plaza and street tiles; the press drop is a tile of its own.
 *  - the human COLLECTS a ledger by standing on it for `holdTicks` (one at a time) and then CARRIES it: each step takes
 *    `tuning.carrySlowTicks` longer;
 *  - auditors (the crew's defenders) chase the carrier; a daze, a knockdown or a fall DROPS the ledger (it goes back
 *    to where it was); phase 3 also loses a ledger carried for `carryLimitTicks`;
 *  - while carrying, a telegraphed audit strike (3 x 3, >= 2.5 s) is called on the carrier's tile every `pulseTicks`:
 *    keep moving;
 *  - the carrier DELIVERS by standing on the press drop for `PRESS_DROP_TICKS`; phase 1: 2 of 3 ledgers; phase 2: 3 of 4;
 *    phase 3: 4 of 4 to a far press.
 */
import { PRESS_DROP_TICKS } from '../defs';
import { areaTiles, baseNodeView, completeNode, livingHuman, newNode, onNode, resetNode } from '../ctx';
import type { MissionCtx } from '../ctx';
import { callStrike } from '../strikes';
import type { MissionNodeRuntime } from '../types';
import type { Objective } from './types';

export const PRESS_ID = 'press';

const pressOf = (ctx: MissionCtx): MissionNodeRuntime | undefined => ctx.m.nodes.find((n) => n.id === PRESS_ID);

function dropCarry(ctx: MissionCtx): void {
  const { m } = ctx;
  if (!m.carry) return;
  const node = m.nodes.find((n) => n.id === m.carry!.nodeId);
  if (node) resetNode(ctx, node);
  m.carry = null;
}

export const evidenceRun: Objective = {
  label: 'ledgers delivered',

  setup(ctx) {
    const { m, def, state } = ctx;
    const phase = def.phases[m.phase];
    m.nodes = phase.nodes.map((d) => newNode(d, -1, state.width, 0));
    if (phase.press) {
      m.nodes.push(newNode({ id: PRESS_ID, x: phase.press.x, y: phase.press.y, label: 'PRESS DROP' }, -1, state.width, 0));
    }
    m.carry = null;
    m.delivered = 0;
    m.pulseAt = -1;
  },

  update(ctx) {
    const { state, m, pd } = ctx;
    const human = livingHuman(state);
    const press = pressOf(ctx);
    if (m.carry) {
      const lost =
        !human ||
        state.tick < human.dazedUntil ||
        state.tick < human.knockedUntil ||
        (pd.carryLimitTicks > 0 && state.tick - m.carry.since >= pd.carryLimitTicks);
      if (lost) dropCarry(ctx);
    }
    if (m.carry && human) {
      if (press && onNode(human, press)) {
        if (++press.progress >= PRESS_DROP_TICKS) {
          m.delivered++;
          m.carry = null;
          press.progress = 0;
        }
      } else if (press) press.progress = 0;
      if (m.carry && pd.pulseTicks > 0 && m.pulseAt >= 0 && state.tick >= m.pulseAt) {
        callStrike(ctx, {
          kind: 'audit',
          tiles: areaTiles(state, human.x, human.y, pd.strikeSpan),
          source: m.carry.nodeId,
          warnTicks: pd.warnTicks,
          activeTicks: pd.activeTicks,
        });
        m.pulseAt = state.tick + pd.pulseTicks;
      }
      return;
    }
    // not carrying: collect the ledger they stand on
    for (const node of m.nodes) {
      if (node.id === PRESS_ID || node.done) continue;
      if (human && onNode(human, node)) node.progress++;
      else node.progress = Math.max(0, node.progress - pd.decayPerTick);
      if (node.progress >= pd.holdTicks && human) {
        completeNode(ctx, node);
        m.carry = { playerId: human.id, nodeId: node.id, since: state.tick };
        m.pulseAt = pd.pulseTicks > 0 ? state.tick + pd.pulseTicks : -1;
        break;
      }
    }
  },

  done: (ctx) => ctx.m.delivered,

  nodeView(ctx, node) {
    if (node.id === PRESS_ID) {
      if (node.progress > 0) return { state: 'progress', fraction: Math.min(1, node.progress / PRESS_DROP_TICKS) };
      return { state: ctx.m.carry ? 'live' : 'idle', fraction: 0 };
    }
    if (node.done) return { state: 'done', fraction: 1 };
    return baseNodeView(node, ctx.pd.holdTicks);
  },

  runnerTarget: () => null,
};
