/**
 * The mission runtime: called by `tick` only when `state.mission` exists (so every normal match is unchanged).
 *
 *   updateMission            once per playing tick before the explosions: announces the mission, runs the objective, the
 *                            boss exposure window, reinforcements and the strikes, keeps the HUD events in step;
 *   missionAfterEliminations right after the lethal hits: lives, the boss going down;
 *   evaluateMission          replaces `evaluateMatchEnd`: won (boss eliminated while exposed), lost (no lives left) or
 *                            a timeout.
 *
 * The boss cannot be eliminated while `boss.shielded` (lethality.ts asks `isShieldedBoss`). When the third phase is
 * done the shield drops for `exposeTicks`; a window that runs out re-shields the boss and phase 3 starts again, at most
 * `maxExposures` times in all (then the mission is lost: the boss got away).
 */
import type { GameState, SimEvent } from '../types';
import { Tile } from '../types';
import { respawn } from '../systems/respawn';
import { endMatch } from '../systems/matchResult';
import { makeCtx } from './ctx';
import type { MissionCtx } from './ctx';
import { REINFORCE_WARN_TICKS } from './defs';
import { OBJECTIVES } from './objectives';
import { rebaseTimers } from './state';
import { updateStrikes } from './strikes';

const EXPOSED_CALLOUT = 'EXPOSED! Take the boss down before the window closes.';

// ------------------------------------------------------------------ the per-tick update

export function updateMission(state: GameState, events: SimEvent[]): void {
  const m = state.mission;
  if (!m || m.outcome || state.match.phase !== 'playing') return;
  let ctx = makeCtx(state, events);
  if (!m.announced) announce(ctx);
  updateReinforcements(ctx);
  const objective = OBJECTIVES[m.objective];
  if (m.phaseState === 'active') {
    objective.update(ctx);
    if (objective.done(ctx) >= ctx.pd.goal) {
      clearPhase(ctx);
      ctx = makeCtx(state, events);
    }
  } else if (m.phaseState === 'exposed' && state.tick >= m.boss.exposedUntil && !m.boss.defeated) {
    expireExposure(ctx);
    ctx = makeCtx(state, events);
  }
  updateStrikes(ctx);
  syncNodes(ctx);
  syncCallout(ctx);
}

function announce(ctx: MissionCtx): void {
  const { state, m, events } = ctx;
  m.announced = true;
  rebaseTimers(m, state.tick);
  events.push({ type: 'missionStarted', missionId: m.id, objective: m.objective, bossId: m.bossId });
  events.push({ type: 'bossShielded', bossId: m.bossId, reason: 'start' });
  events.push({ type: 'missionPhase', phase: 0, change: 'started' });
}

function clearPhase(ctx: MissionCtx): void {
  const { state, m, events } = ctx;
  events.push({ type: 'missionPhase', phase: m.phase, change: 'cleared' });
  m.phasesCleared++;
  m.strikes = m.strikes.filter((s) => s.landed); // warnings of the old phase go; flames already burning stay lethal
  if (m.phase < 2) {
    m.phase = (m.phase + 1) as 0 | 1 | 2;
    m.phaseStartTick = state.tick;
    const next = makeCtx(state, events);
    OBJECTIVES[m.objective].setup(next);
    events.push({ type: 'missionPhase', phase: m.phase, change: 'started' });
    scheduleReinforcements(next);
    return;
  }
  exposeBoss(ctx);
}

function exposeBoss(ctx: MissionCtx): void {
  const { state, m, events } = ctx;
  m.boss.shielded = false;
  m.boss.exposedUntil = state.tick + m.tuning.exposeTicks;
  m.boss.exposures++;
  m.phaseState = 'exposed';
  events.push({ type: 'bossExposed', bossId: m.bossId, untilTick: m.boss.exposedUntil });
}

function expireExposure(ctx: MissionCtx): void {
  const { state, m, events } = ctx;
  m.boss.shielded = true;
  m.boss.exposedUntil = 0;
  events.push({ type: 'bossShielded', bossId: m.bossId, reason: 'expired' });
  if (m.boss.exposures >= m.tuning.maxExposures) {
    finishMission(state, 'lost', events);
    return;
  }
  // the boss is protected again: phase 3 has to be repeated
  m.phaseState = 'active';
  m.phasesCleared = 2;
  m.phase = 2;
  m.phaseStartTick = state.tick;
  const next = makeCtx(state, events);
  OBJECTIVES[m.objective].setup(next);
  events.push({ type: 'missionPhase', phase: 2, change: 'started' });
  scheduleReinforcements(next);
}

// ------------------------------------------------------------------ reinforcements

function scheduleReinforcements(ctx: MissionCtx): void {
  const { state, m, events } = ctx;
  for (const seat of m.seats) {
    if (seat.role !== 'runner' && seat.role !== 'escort') continue;
    const p = state.players[seat.playerId];
    if (!p || p.alive || m.reinforcementsUsed >= m.tuning.reinforceMax) continue;
    if (m.reinforcements.some((r) => r.playerId === p.id) || !seat.post) continue;
    m.reinforcements.push({ playerId: p.id, atTick: state.tick + REINFORCE_WARN_TICKS });
    m.reinforcementsUsed++;
    events.push({
      type: 'missionWarning',
      warning: {
        kind: 'reinforce',
        x: seat.post.x,
        y: seat.post.y,
        tiles: [seat.post.y * state.width + seat.post.x],
        remainingTicks: REINFORCE_WARN_TICKS,
      },
    });
  }
}

function updateReinforcements(ctx: MissionCtx): void {
  const { state, m, events } = ctx;
  if (m.reinforcements.length === 0) return;
  const due = m.reinforcements.filter((r) => state.tick >= r.atTick);
  if (due.length === 0) return;
  m.reinforcements = m.reinforcements.filter((r) => state.tick < r.atTick);
  for (const r of due) {
    const p = state.players[r.playerId];
    const post = m.seats[r.playerId]?.post;
    if (!p || p.alive || !post) continue;
    const i = post.y * state.width + post.x;
    if (state.tiles[i] !== Tile.Empty) state.tiles[i] = Tile.Empty;
    respawn(state, p, post.x, post.y);
    events.push({ type: 'playerRespawned', playerId: p.id, x: p.x, y: p.y });
  }
}

// ------------------------------------------------------------------ HUD events

function syncNodes(ctx: MissionCtx): void {
  const { m, events } = ctx;
  const objective = OBJECTIVES[m.objective];
  for (const node of m.nodes) {
    const v = objective.nodeView(ctx, node);
    if (v.state === node.shown) continue;
    node.shown = v.state;
    events.push({
      type: 'missionNode',
      nodeId: node.id,
      x: node.x,
      y: node.y,
      state: v.state,
      fraction: v.fraction,
    });
  }
}

function syncCallout(ctx: MissionCtx): void {
  const { m, pd, events } = ctx;
  const text =
    m.phaseState === 'exposed' ? EXPOSED_CALLOUT : (OBJECTIVES[m.objective].callout?.(ctx) ?? pd.callout);
  if (text === m.callout) return;
  m.callout = text;
  events.push({ type: 'missionCallout', text });
}

// ------------------------------------------------------------------ eliminations, end of the mission

export function missionAfterEliminations(
  state: GameState,
  eliminated: readonly number[],
  events: SimEvent[],
): void {
  const m = state.mission;
  if (!m || m.outcome) return;
  for (const id of eliminated) {
    if (id === m.bossId) {
      const boss = state.players[id]!;
      if (m.boss.shielded) {
        // cannot happen (lethality protects a shielded boss); never leave a mission without its boss
        const post = m.seats[id]!.post!;
        respawn(state, boss, post.x, post.y);
        continue;
      }
      m.boss.defeated = true;
      events.push({ type: 'bossDefeated', bossId: id, creditId: boss.eliminatedBy, defeat: 'eliminated' });
    } else if (id === 0) {
      m.livesUsed++;
      if (m.carry) {
        const node = m.nodes.find((n) => n.id === m.carry!.nodeId);
        if (node) {
          node.done = false;
          node.progress = 0;
        }
        m.carry = null;
      }
    }
  }
}

/** Replaces `evaluateMatchEnd` for a mission. */
export function evaluateMission(state: GameState, events: SimEvent[]): void {
  const m = state.mission;
  if (!m || m.outcome || state.match.phase !== 'playing') return;
  if (m.boss.defeated) finishMission(state, 'won', events);
  else if (m.livesUsed >= m.livesMax) finishMission(state, 'lost', events);
  else if (state.match.playTicks >= m.tuning.timeLimitTicks) finishMission(state, 'timeout', events);
}

export function finishMission(
  state: GameState,
  result: 'won' | 'lost' | 'timeout',
  events: SimEvent[],
): void {
  const m = state.mission!;
  const ticks = state.match.playTicks;
  const won = result === 'won';
  const stars = won
    ? ((1 + (m.livesUsed <= 1 ? 1 : 0) + (m.livesUsed <= 1 && ticks <= m.tuning.parTicks ? 1 : 0)) as
        1 | 2 | 3)
    : 0;
  m.outcome = {
    result,
    missionId: m.id,
    modifiers: [...m.modifiers],
    seconds: Math.round(ticks / 60),
    livesUsed: m.livesUsed,
    phasesCleared: m.phasesCleared,
    defeat: won ? 'eliminated' : null,
    stars,
    creditedKills: state.players[0]!.stats.kills,
  };
  m.phaseState = won ? 'won' : 'lost';
  m.callout = null;
  events.push({ type: 'missionOutcome', outcome: m.outcome, phaseState: m.phaseState });
  endMatch(
    state,
    won
      ? { kind: 'win', winnerId: 0 }
      : result === 'timeout'
        ? { kind: 'draw', reason: 'timeout' }
        : { kind: 'win', winnerId: m.bossId },
    events,
  );
}
