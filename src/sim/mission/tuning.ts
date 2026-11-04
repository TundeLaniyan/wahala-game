/**
 * Resolves a mission's authored numbers into the `MissionTuning` the runtime reads, applying the replay modifiers
 * (decision MS9): each modifier is one small, labelled numeric tweak of one number of its own mission.
 *
 * | modifier         | mission      | effect                                                        |
 * | ---------------- | ------------ | ------------------------------------------------------------- |
 * | rushHourDispatch | oshodi       | relay pulse interval x 0.75 (convoys come faster)             |
 * | marketDay        | mushin       | restock time x 0.7 and one extra market runner (crew list)    |
 * | tollSeason       | fadeyiSomolu | hold time x 1.5                                               |
 * | expressTimetable | ebuteMetta   | rail window length x 0.7                                      |
 * | auditWeek        | lagosIsland  | one more ledger to deliver per phase, clock x 0.85            |
 * | longBlackout     | lekki        | switch-off sequence one longer per phase                      |
 */
import { ticks } from '../config';
import { BASE_PHASE, CARRY_SLOW_TICKS, MIN_STRIKE_WARN_TICKS, MIN_TRAIN_WARN_TICKS, MISSION_DEFS } from './defs';
import type { MissionDef } from './defs';
import type { MissionModifierId, MissionSpec, MissionTuning, PhaseTuning } from './types';
import { MODIFIER_FOR } from './types';

export const MODIFIER_NUMBERS = {
  rushHourDispatchPulse: 0.75,
  marketDayCrew: 0.7,
  tollSeasonHold: 1.5,
  expressTimetableOpen: 0.7,
  auditWeekClock: 0.85,
} as const;

/** The modifiers of `spec` that belong to its own mission (others are ignored, duplicates dropped). */
export function activeModifiers(spec: MissionSpec): MissionModifierId[] {
  const own = MODIFIER_FOR[spec.id];
  return (spec.modifiers ?? []).filter((m, i, all) => m === own && all.indexOf(m) === i);
}

export function resolveTuning(def: MissionDef, spec: MissionSpec): MissionTuning {
  const mods = activeModifiers(spec);
  const has = (m: MissionModifierId): boolean => mods.includes(m);
  const phases = def.phases.map((p): PhaseTuning => {
    const t: PhaseTuning = { ...BASE_PHASE, ...p, callout: p.callout };
    const nodeCount = p.nodes.length;
    if (has('rushHourDispatch') && t.pulseTicks > 0) t.pulseTicks = Math.round(t.pulseTicks * MODIFIER_NUMBERS.rushHourDispatchPulse);
    if (has('marketDay') && t.crewTicks > 0) t.crewTicks = Math.round(t.crewTicks * MODIFIER_NUMBERS.marketDayCrew);
    if (has('tollSeason')) t.holdTicks = Math.round(t.holdTicks * MODIFIER_NUMBERS.tollSeasonHold);
    if (has('expressTimetable') && t.openTicks > 0) t.openTicks = Math.round(t.openTicks * MODIFIER_NUMBERS.expressTimetableOpen);
    if (has('auditWeek')) t.goal = Math.min(t.goal + 1, nodeCount);
    if (has('longBlackout')) {
      t.sequence = Math.min(t.sequence + 1, nodeCount);
      t.goal = t.sequence;
    }
    // lethal telegraphs have floors (decision MS2): data and modifiers can never go below them
    t.warnTicks = Math.max(t.warnTicks, def.objective === 'dispatchWindows' ? MIN_TRAIN_WARN_TICKS : MIN_STRIKE_WARN_TICKS);
    return t;
  }) as MissionTuning['phases'];
  let limit = spec.timeLimitSec ?? def.timeLimitSec;
  if (has('auditWeek') && spec.timeLimitSec === undefined) limit = limit * MODIFIER_NUMBERS.auditWeekClock;
  return {
    timeLimitTicks: ticks(limit),
    parTicks: ticks(def.parSec),
    exposeTicks: ticks(def.exposeSec),
    maxExposures: def.maxExposures,
    reinforceMax: def.reinforceMax,
    carrySlowTicks: def.objective === 'evidenceRun' ? CARRY_SLOW_TICKS : 0,
    phases,
  };
}

/** Convenience for tests and docs: the resolved tuning of a mission. */
export function tuningFor(spec: MissionSpec): MissionTuning {
  return resolveTuning(MISSION_DEFS[spec.id], spec);
}
