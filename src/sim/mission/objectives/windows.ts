/**
 * Ebute-Metta: DISPATCH WINDOWS. Dispatch switches stand on the platforms beside the track lanes.
 *  - a switch only counts inside a timed rail WINDOW: every `cycleTicks` a railcar is telegraphed on a track lane
 *    (the arena's own `train` stage hazard: lane lights, bell and horn, >= 3.5 s ahead, one step from a track-free tile),
 *    runs through, and once the lane is clear the window opens for `openTicks`;
 *  - inside the window the human throws a switch by standing on it for `holdTicks`; outside it the switch is locked
 *    and its progress drains;
 *  - phase 1: 2 of 3; phase 2: 3 of 4 (shorter windows); phase 3: all 4, a thrown switch resets after `rearmTicks`.
 * The arena's own scheduled trains are switched off for this mission: the windows are the trains.
 */
import { getArena } from '../../arenas';
import type { StageHazardDef } from '../../arenas';
import { tileIndex } from '../../grid';
import type { GameState, StageEvent } from '../../types';
import { baseNodeView, completeNode, escapeSteps, livingHuman, newNode, onNode, resetNode, walkTicks } from '../ctx';
import type { MissionCtx } from '../ctx';
import type { MissionRail } from '../types';
import { nearestNode } from './types';
import type { Objective } from './types';

type TrainDef = Extract<StageHazardDef, { kind: 'sweep' }>;

/** The arena's railcar hazard (definition index and data), or null when it has none. */
export function trainHazard(state: Pick<GameState, 'arenaId'>): { index: number; def: TrainDef } | null {
  const defs = getArena(state.arenaId).stageHazards;
  const index = defs.findIndex((d) => d.kind === 'sweep' && d.style === 'train');
  return index < 0 ? null : { index, def: defs[index] as TrainDef };
}

/** Tile indices of a train route of the arena (for the warning view). */
export function trainLane(state: GameState, route: number): number[] {
  const t = trainHazard(state);
  if (!t) return [];
  const r = t.def.routes[route % t.def.routes.length]!;
  return r.map(([x, y]) => tileIndex(state, x, y));
}

function newRail(state: GameState, delay: number): MissionRail {
  return { nextCycleAt: state.tick + delay, trainAt: -1, openAt: -1, closeAt: -1, open: false, route: 0, cycles: 0 };
}

function startCycle(ctx: MissionCtx, rail: MissionRail): void {
  const { state, pd } = ctx;
  const hazard = trainHazard(state);
  if (!hazard) {
    rail.nextCycleAt = state.tick + pd.cycleTicks;
    return;
  }
  const route = rail.cycles % hazard.def.routes.length;
  const lane = trainLane(state, route);
  const human = livingHuman(state);
  const warn = pd.warnTicks;
  if (human) {
    const steps = escapeSteps(state, new Set(lane), human.y * state.width + human.x, 6);
    if (steps === Infinity || walkTicks(state, human, steps) > warn - 12) {
      rail.nextCycleAt = state.tick + 60; // someone is boxed in on the track: look again in a second
      return;
    }
  }
  const stepTicks = hazard.def.stepTicks;
  const transit = lane.length * stepTicks;
  rail.route = route;
  rail.trainAt = state.tick + warn;
  rail.openAt = rail.trainAt + transit + 30;
  rail.closeAt = rail.openAt + pd.openTicks;
  rail.nextCycleAt = Math.max(state.tick + pd.cycleTicks, rail.closeAt + 60);
  const first = lane[0]!;
  const second = lane[1] ?? first;
  const dx = (second % state.width) - (first % state.width);
  const dy = Math.floor(second / state.width) - Math.floor(first / state.width);
  const ev: StageEvent = {
    id: state.nextId++,
    hazard: hazard.index,
    kind: 'sweep',
    style: 'train',
    tiles: lane,
    dir: dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : dy < 0 ? 'up' : null,
    warnTick: state.tick,
    startTick: rail.trainAt,
    endTick: rail.trainAt + transit,
    eventId: state.nextEventId++,
    index: -1,
    stepRemaining: 0,
    stepTicks,
  };
  state.stage.events.push(ev);
  ctx.events.push({ type: 'stageWarning', event: { ...ev, tiles: [...ev.tiles] } });
  ctx.events.push({
    type: 'missionWarning',
    warning: {
      kind: 'window',
      x: first % state.width,
      y: Math.floor(first / state.width),
      tiles: [...lane],
      remainingTicks: warn,
    },
  });
}

export const dispatchWindows: Objective = {
  label: 'switches thrown',

  setup(ctx) {
    const { m, def, state } = ctx;
    m.nodes = def.phases[m.phase].nodes.map((d) => newNode(d, -1, state.width, 0));
    m.rail = newRail(state, 120);
  },

  update(ctx) {
    const { state, m, pd } = ctx;
    const rail = m.rail ?? (m.rail = newRail(state, 120));
    const human = livingHuman(state);
    if (!rail.open && rail.trainAt < 0 && state.tick >= rail.nextCycleAt) startCycle(ctx, rail);
    if (rail.trainAt >= 0 && !rail.open && state.tick >= rail.openAt) rail.open = true;
    if (rail.open && state.tick >= rail.closeAt) {
      rail.open = false;
      rail.trainAt = -1;
      rail.cycles++;
      for (const n of m.nodes) if (!n.done) n.progress = 0;
    }
    for (const node of m.nodes) {
      if (node.done) {
        if (pd.rearmTicks > 0 && state.tick - node.doneAt >= pd.rearmTicks) resetNode(ctx, node);
        continue;
      }
      if (rail.open && onNode(human, node)) node.progress++;
      else node.progress = Math.max(0, node.progress - pd.decayPerTick);
      if (node.progress >= pd.holdTicks) completeNode(ctx, node);
    }
  },

  done: (ctx) => ctx.m.nodes.filter((n) => n.done).length,

  nodeView(ctx, node) {
    const v = baseNodeView(node, ctx.pd.holdTicks);
    if (v.state !== 'idle') return v;
    return { state: ctx.m.rail?.open ? 'live' : 'locked', fraction: 0 };
  },

  runnerTarget: (ctx, runner) => nearestNode(ctx.m.nodes, runner, (n) => !n.done),
};
