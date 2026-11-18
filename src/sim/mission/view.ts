import type { GameState } from '../types';
import { makeCtx } from './ctx';
import { fieldMissionView } from './field';
import { OBJECTIVES } from './objectives';
import { trainLane } from './objectives/windows';
import { pendingWarnings } from './strikes';
import type { MissionNodeView, MissionView, MissionWarningView } from './types';
import { onBossAnchor } from './boss';

/** The read-only mission picture for the HUD, the renderer's markers and the app; null when this is not a mission. */
export function missionView(state: GameState): MissionView | null {
  const m = state.mission;
  if (!m) return null;
  if (m.field) return fieldMissionView(state);
  const ctx = makeCtx(state, []);
  const objective = OBJECTIVES[m.objective];
  const nodes: MissionNodeView[] = m.nodes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    label: n.label,
    ...objective.nodeView(ctx, n),
  }));
  const warnings: MissionWarningView[] = pendingWarnings(state, m);
  if (m.rail && m.rail.trainAt > state.tick) {
    const lane = trainLane(state, m.rail.route);
    const first = lane[0] ?? 0;
    warnings.push({
      kind: 'window',
      x: first % state.width,
      y: Math.floor(first / state.width),
      tiles: lane,
      remainingTicks: m.rail.trainAt - state.tick,
    });
  }
  for (const r of m.reinforcements) {
    const post = m.seats[r.playerId]?.post;
    if (!post) continue;
    warnings.push({
      kind: 'reinforce',
      x: post.x,
      y: post.y,
      tiles: [post.y * state.width + post.x],
      remainingTicks: Math.max(0, r.atTick - state.tick),
    });
  }
  const exposed = m.phaseState === 'exposed';
  const goal = ctx.pd.goal;
  const crewAlive = m.seats.filter(
    (s) => s.role !== 'player' && s.role !== 'boss' && state.players[s.playerId]?.alive,
  ).length;
  return {
    missionId: m.id,
    objective: m.objective,
    phase: m.phase,
    phaseCount: 3,
    phaseState: m.phaseState,
    progress: {
      done: exposed || m.outcome?.result === 'won' ? goal : Math.min(goal, objective.done(ctx)),
      goal,
      label: objective.label,
    },
    nodes,
    warnings,
    boss: bossView(state),
    lives: { used: m.livesUsed, max: m.livesMax },
    timeRemainingSec: Math.max(0, Math.ceil((m.tuning.timeLimitTicks - state.match.playTicks) / 60)),
    callout: m.callout,
    crewAlive,
    outcome: m.outcome,
  };
}

/** The boss part of the view: shield, window, hits left and where he restores (decisions BX1-BX3). */
function bossView(state: GameState): MissionView['boss'] {
  const m = state.mission!;
  const b = m.boss;
  const boss = state.players[m.bossId];
  const exposed = !b.shielded && !b.defeated;
  const anchor = exposed ? (b.anchor ?? null) : null;
  return {
    playerId: m.bossId,
    name: boss?.name,
    shielded: b.shielded,
    exposed,
    exposedRemainingTicks: b.exposedUntil > state.tick ? b.exposedUntil - state.tick : 0,
    defeated: b.defeated,
    ...(b.maxHits !== undefined
      ? {
          hitsLeft: b.hp ?? 0,
          maxHits: b.maxHits,
          exposeTotalTicks: exposed ? (b.windowTicks ?? m.tuning.exposeTicks) : m.tuning.exposeTicks,
          anchor,
          restoring: boss !== undefined && onBossAnchor(boss, anchor, m.tuning.boss?.restoreRadius ?? 0),
        }
      : {}),
  };
}
