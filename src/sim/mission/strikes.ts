/**
 * Telegraphed mission strikes (decision MS3): convoy lanes, marshal lanes, audits, contingency strikes. Built from
 * the existing flame primitive: at the landing tick real flames (credited to the boss seat) burn the tiles for
 * `activeTicks`, so lethality, protection layers, spawn protection, credit and the renderer's fire all work as for any
 * blast. Fairness, like stage.ts departures:
 *  - the warning is never shorter than `MIN_STRIKE_WARN_TICKS` (2.5 s);
 *  - a strike is only called when the human could walk off its tiles before it lands (`escapeSteps`);
 *  - a landing is postponed (bounded) while the human cannot move (daze, knockdown, slide, trapdoor);
 *  - at most `MAX_STRIKES` at once; only floor tiles burn (never a crate or concrete);
 *  - the boss and its crew are the same team, so the strike only ever hurts the human.
 */
import type { BlastEvent, Flame, GameState, SimEvent } from '../types';
import { MAX_STRIKES, MIN_STRIKE_WARN_TICKS, STRIKE_MERCY_MAX, STRIKE_MERCY_TICKS } from './defs';
import { escapeSteps, livingHuman, walkTicks } from './ctx';
import type { MissionCtx } from './ctx';
import type { MissionStrike, MissionWarningView } from './types';

export interface StrikeSpec {
  kind: MissionStrike['kind'];
  tiles: number[];
  source: string;
  warnTicks: number;
  activeTicks: number;
}

export function warningView(state: GameState, s: MissionStrike): MissionWarningView {
  const xs = s.tiles.map((i) => i % state.width);
  const ys = s.tiles.map((i) => Math.floor(i / state.width));
  const avg = (a: number[]): number => Math.round(a.reduce((x, y) => x + y, 0) / Math.max(1, a.length));
  return {
    kind: s.kind === 'convoy' || s.kind === 'marshal' ? 'convoy' : s.kind === 'contingency' ? 'contingency' : 'strike',
    x: avg(xs),
    y: avg(ys),
    tiles: [...s.tiles],
    remainingTicks: Math.max(0, s.landTick - state.tick),
  };
}

/** Calls a strike if it is allowed and fair. Returns it, or null (nothing happened). */
export function callStrike(ctx: MissionCtx, spec: StrikeSpec): MissionStrike | null {
  const { state, m } = ctx;
  if (m.strikes.length >= MAX_STRIKES) return null;
  const tiles = [...new Set(spec.tiles)];
  if (tiles.length === 0) return null;
  const warn = Math.max(spec.warnTicks, MIN_STRIKE_WARN_TICKS);
  const human = livingHuman(state);
  if (human) {
    const set = new Set(tiles);
    const steps = escapeSteps(state, set, human.y * state.width + human.x);
    if (steps === Infinity || walkTicks(state, human, steps) > warn - 12) return null;
  }
  const strike: MissionStrike = {
    id: state.nextId++,
    kind: spec.kind,
    tiles,
    warnTick: state.tick,
    landTick: state.tick + warn,
    endTick: state.tick + warn + Math.max(1, spec.activeTicks),
    eventId: state.nextEventId++,
    source: spec.source,
    postponed: 0,
    landed: false,
  };
  m.strikes.push(strike);
  ctx.events.push({ type: 'missionWarning', warning: warningView(state, strike) });
  return strike;
}

/** Lands due strikes (flames), drops finished ones. */
export function updateStrikes(ctx: MissionCtx): void {
  const { state, m } = ctx;
  const human = livingHuman(state);
  for (const s of m.strikes) {
    if (s.landed || state.tick < s.landTick) continue;
    if (human && s.postponed < STRIKE_MERCY_MAX && cannotMove(state, human) && s.tiles.includes(human.y * state.width + human.x)) {
      s.postponed++;
      s.landTick += STRIKE_MERCY_TICKS;
      s.endTick += STRIKE_MERCY_TICKS;
      continue;
    }
    land(state, ctx.m.bossId, s, ctx.events);
  }
  m.strikes = m.strikes.filter((s) => state.tick < s.endTick);
}

function cannotMove(state: GameState, p: GameState['players'][number]): boolean {
  return state.tick < p.dazedUntil || state.tick < p.knockedUntil || p.slide !== null || p.teleportPending !== null;
}

function land(state: GameState, bossId: number, s: MissionStrike, _events: SimEvent[]): void {
  s.landed = true;
  const blast: BlastEvent = {
    id: s.eventId,
    tiles: [...s.tiles],
    seedOwnerId: bossId,
    instigatorId: bossId,
    endTick: s.endTick,
  };
  state.blasts.push(blast);
  for (const i of s.tiles) {
    const flame: Flame = {
      x: i % state.width,
      y: Math.floor(i / state.width),
      eventId: s.eventId,
      genId: -1,
      ownerId: bossId,
      dir: null,
      ownerSafe: true,
      tip: false,
      startTick: state.tick,
      endTick: s.endTick,
    };
    state.flames.push(flame);
  }
}

/** Strikes still telegraphed (not yet landed), for the HUD and the renderer. */
export function pendingWarnings(state: GameState, m: { strikes: MissionStrike[] }): MissionWarningView[] {
  return m.strikes.filter((s) => !s.landed).map((s) => warningView(state, s));
}
