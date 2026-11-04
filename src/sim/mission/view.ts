import type { GameState } from '../types';
import { makeCtx } from './ctx';
import { OBJECTIVES } from './objectives';
import { trainLane } from './objectives/windows';
import { pendingWarnings } from './strikes';
import type { MissionNodeView, MissionView, MissionWarningView } from './types';

/** The read-only mission picture for the HUD, the renderer's markers and the app; null when this is not a mission. */
export function missionView(state: GameState): MissionView | null {
  const m = state.mission;
  if (!m) return null;
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
  const crewAlive = m.seats.filter((s) => s.role !== 'player' && s.role !== 'boss' && state.players[s.playerId]?.alive).length;
  return {
    missionId: m.id,
    objective: m.objective,
    phase: m.phase,
    phaseCount: 3,
    phaseState: m.phaseState,
    progress: { done: exposed || m.outcome?.result === 'won' ? goal : Math.min(goal, objective.done(ctx)), goal, label: objective.label },
    nodes,
    warnings,
    boss: {
      playerId: m.bossId,
      shielded: m.boss.shielded,
      exposed: !m.boss.shielded && !m.boss.defeated,
      exposedRemainingTicks: m.boss.exposedUntil > state.tick ? m.boss.exposedUntil - state.tick : 0,
      defeated: m.boss.defeated,
    },
    lives: { used: m.livesUsed, max: m.livesMax },
    timeRemainingSec: Math.max(0, Math.ceil((m.tuning.timeLimitTicks - state.match.playTicks) / 60)),
    callout: m.callout,
    crewAlive,
    outcome: m.outcome,
  };
}
