/**
 * The mission runtime: called by `tick` only when `state.mission` exists (so every normal match is unchanged).
 *
 *   updateMission            once per playing tick before the explosions: announces the mission, runs the objective, the
 *                            boss exposure window, reinforcements and the strikes, keeps the HUD events in step;
 *   missionAfterEliminations right after the lethal hits: lives, the boss going down;
 *   evaluateMission          replaces `evaluateMatchEnd`: won (boss eliminated while exposed), lost (no lives left) or
 *                            a timeout.
 *
 * The boss cannot be eliminated while `boss.shielded` (lethality.ts asks `isShieldedBoss`). The boss recipe (`boss.ts`,
 * decisions BX1-BX8): when a phase's objective is broken the shield drops for `exposeTicks` and the boss walks to his
 * anchor to restore it (committed - rooted - while he stands on it); a lethal event that reaches him costs one hit
 * (`rules.missionBossAbsorbs`), he reels, re-shields and the next phase starts; the last hit eliminates him. A window
 * that runs out re-shields him and the same phase is rebuilt, at most `maxExposures` windows in all (then the mission is
 * lost: the boss got away). A punch of the human's that lands on him interrupts the restore (the window grows a little).
 */
import type { GameState, SimEvent } from '../types';
import { Tile } from '../types';
import { respawn } from '../systems/respawn';
import { endMatch } from '../systems/matchResult';
import { makeCtx } from './ctx';
import { evaluateFieldMission, fieldAfterEliminations, updateFieldMission } from './field';
import type { MissionCtx } from './ctx';
import { REINFORCE_WARN_TICKS } from './defs';
import { OBJECTIVES } from './objectives';
import { rebaseTimers } from './state';
import { onBossAnchor } from './boss';
import { updateStrikes } from './strikes';

/** The HUD line while the boss is exposed (short: the rail panel shows the countdown and the hits). */
export function exposedCallout(name: string, hitsLeft: number): string {
  return hitsLeft <= 1
    ? `EXPOSED! One more blast finishes ${name}.`
    : `EXPOSED! Blast ${name} before the shield is back (${hitsLeft} hits to go).`;
}

// ------------------------------------------------------------------ the per-tick update

export function updateMission(state: GameState, events: SimEvent[]): void {
  const m = state.mission;
  if (!m || m.outcome || state.match.phase !== 'playing') return;
  if (m.field) return updateFieldMission(state, events); // a section field mission: legs, not phases and a boss
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
  } else if (m.phaseState === 'exposed' && !m.boss.defeated) {
    updateExposure(ctx);
    if (state.tick >= m.boss.exposedUntil) {
      expireExposure(ctx);
      ctx = makeCtx(state, events);
    }
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
  const { m, events } = ctx;
  events.push({ type: 'missionPhase', phase: m.phase, change: 'cleared' });
  m.phasesCleared++;
  m.strikes = m.strikes.filter((s) => s.landed); // warnings of the old phase go; flames already burning stay lethal
  exposeBoss(ctx); // every broken phase exposes the boss (decision BX1)
}

/** Starts phase `phase` (a new one after a hit, or the same one again after a missed window). */
function startPhase(ctx: MissionCtx, phase: 0 | 1 | 2): void {
  const { state, m, events } = ctx;
  m.phaseState = 'active';
  m.phase = phase;
  m.phasesCleared = phase;
  m.phaseStartTick = state.tick;
  const next = makeCtx(state, events);
  OBJECTIVES[m.objective].setup(next);
  events.push({ type: 'missionPhase', phase, change: 'started' });
  scheduleReinforcements(next, ['runner', 'escort'], Infinity, true);
}

/** Where the exposed boss restores his shield: his post, or the node broken last (the press drop when it was a delivery). */
function anchorOf(ctx: MissionCtx): { x: number; y: number } {
  const { m } = ctx;
  const post = m.seats[m.bossId]!.post!;
  if (m.tuning.boss?.anchor !== 'lastBroken') return post;
  let last: { x: number; y: number; at: number } | null = null;
  for (const n of m.nodes)
    if (n.done && (!last || n.doneAt >= last.at)) last = { x: n.x, y: n.y, at: n.doneAt };
  return last ? { x: last.x, y: last.y } : post;
}

function exposeBoss(ctx: MissionCtx): void {
  const { state, m, events } = ctx;
  const window = m.tuning.exposeTicks;
  m.boss.shielded = false;
  m.boss.exposedAt = state.tick;
  m.boss.windowTicks = window;
  m.boss.interrupts = 0;
  m.boss.exposedUntil = state.tick + window;
  m.boss.exposures++;
  m.boss.anchor = anchorOf(ctx);
  m.phaseState = 'exposed';
  events.push({
    type: 'bossExposed',
    bossId: m.bossId,
    untilTick: m.boss.exposedUntil,
    anchorX: m.boss.anchor.x,
    anchorY: m.boss.anchor.y,
    hitsLeft: m.boss.hp ?? 1,
  });
  // he calls his crew back (telegraphed, never on the human: the seat's own post)
  const b = m.tuning.boss;
  if (b && b.callCount > 0) scheduleReinforcements(ctx, b.callRoles, b.callCount, false);
}

/**
 * One tick of an open window: a punch of the human's that landed on the boss interrupts his restore (the window grows,
 * a bounded number of times), and standing on his anchor he is committed - rooted - so a generator beside him lands.
 */
function updateExposure(ctx: MissionCtx): void {
  const { state, m, events } = ctx;
  const b = m.tuning.boss;
  const boss = state.players[m.bossId];
  if (!b || !boss || !boss.alive) return;
  for (const e of events) {
    if (e.type !== 'attackResolved' || !e.hit || e.playerId !== 0 || e.targetId !== m.bossId) continue;
    if ((m.boss.interrupts ?? 0) >= b.interruptMax) break;
    m.boss.interrupts = (m.boss.interrupts ?? 0) + 1;
    m.boss.exposedUntil += b.interruptTicks;
    m.boss.windowTicks = (m.boss.windowTicks ?? 0) + b.interruptTicks;
    events.push({ type: 'bossInterrupted', bossId: m.bossId, byId: 0, untilTick: m.boss.exposedUntil });
  }
  // committed until the window ends (his planner sees it: he lays no generator he could not walk away from); pushed
  // off the anchor he is free to walk back
  const onAnchor = onBossAnchor(boss, m.boss.anchor, b.restoreRadius);
  // still walking to the anchor: the restore countdown waits (bounded by the recipe's walk grace)
  if (!onAnchor && state.tick - (m.boss.exposedAt ?? state.tick) <= b.walkGraceTicks) {
    m.boss.exposedUntil++; // the countdown (and the HUD arc) holds while he walks
  }
  if (onAnchor) boss.rootedUntil = Math.max(boss.rootedUntil, m.boss.exposedUntil);
  else if (boss.rootedUntil >= m.boss.exposedUntil - 1) boss.rootedUntil = state.tick;
}

/** The exposed boss took a hit that was not his last (lethality recorded it this tick): he reels, the next phase starts. */
function resolveBossHit(ctx: MissionCtx): void {
  const { state, m, events } = ctx;
  const hit = m.boss.pendingHit;
  m.boss.pendingHit = null;
  if (!hit || m.boss.defeated || m.boss.shielded) return;
  const boss = state.players[m.bossId]!;
  m.boss.hp = Math.max(1, (m.boss.hp ?? 1) - 1);
  m.boss.shielded = true;
  m.boss.exposedUntil = 0;
  m.boss.anchor = null;
  boss.rootedUntil = 0;
  boss.dazedUntil = Math.max(boss.dazedUntil, state.tick + (m.tuning.boss?.reelTicks ?? 0));
  events.push({
    type: 'bossHit',
    bossId: m.bossId,
    byId: hit.byId,
    hitsLeft: m.boss.hp,
    maxHits: m.boss.maxHits ?? m.boss.hp,
    x: boss.x,
    y: boss.y,
  });
  events.push({ type: 'bossShielded', bossId: m.bossId, reason: 'phase' });
  startPhase(ctx, Math.min(2, m.phase + 1) as 0 | 1 | 2);
}

function expireExposure(ctx: MissionCtx): void {
  const { state, m, events } = ctx;
  m.boss.shielded = true;
  m.boss.exposedUntil = 0;
  m.boss.anchor = null;
  const boss = state.players[m.bossId];
  if (boss) boss.rootedUntil = Math.min(boss.rootedUntil, state.tick); // the restore is done: he walks again
  events.push({ type: 'bossShielded', bossId: m.bossId, reason: 'expired' });
  if (m.boss.exposures >= m.tuning.maxExposures) {
    finishMission(state, 'lost', events);
    return;
  }
  // the boss restored his shield: the same phase's equipment is rebuilt and has to be broken again
  startPhase(ctx, m.phase);
}

// ------------------------------------------------------------------ reinforcements

/**
 * Brings fallen crew of `roles` back to their posts after a telegraphed warning: at a phase start (runners and escorts,
 * within the mission's `reinforceMax`) and when a window opens (the recipe's `callRoles`, at most `limit`).
 */
function scheduleReinforcements(
  ctx: MissionCtx,
  roles: readonly string[],
  limit: number,
  budgeted: boolean,
): void {
  const { state, m, events } = ctx;
  let called = 0;
  for (const seat of m.seats) {
    if (!roles.includes(seat.role) || called >= limit) continue;
    const p = state.players[seat.playerId];
    if (!p || p.alive || (budgeted && m.reinforcementsUsed >= m.tuning.reinforceMax)) continue;
    if (m.reinforcements.some((r) => r.playerId === p.id) || !seat.post) continue;
    m.reinforcements.push({ playerId: p.id, atTick: state.tick + REINFORCE_WARN_TICKS });
    if (budgeted) m.reinforcementsUsed++;
    called++;
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
  const { state, m, pd, events } = ctx;
  const text =
    m.phaseState === 'exposed'
      ? exposedCallout(state.players[m.bossId]?.name ?? 'the boss', m.boss.hp ?? 1)
      : (OBJECTIVES[m.objective].callout?.(ctx) ?? pd.callout);
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
  if (m.field) return fieldAfterEliminations(state, eliminated);
  if (m.boss.pendingHit) resolveBossHit(makeCtx(state, events));
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
      m.boss.hp = 0;
      m.boss.anchor = null;
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
  if (m.field) return evaluateFieldMission(state, events);
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
