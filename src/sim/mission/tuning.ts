/**
 * Resolves a mission's authored numbers into the `MissionTuning` the runtime reads, applying the replay modifiers
 * (decision MS9): each modifier is one small, labelled numeric tweak of one number of its own mission.
 *
 * | modifier         | mission      | effect                                                        |
 * | ---------------- | ------------ | ------------------------------------------------------------- |
 * | rushHourDispatch | oshodi       | relay pulse interval x 0.75 (convoys come faster)             |
 * | marketDay        | mushin       | restock time x 0.7 and one extra market runner (crew list)    |
 * | tollSeason       | fadeyiSomolu | every toll box takes one more blast (decision BX5)            |
 * | expressTimetable | ebuteMetta   | rail window length x 0.7                                      |
 * | auditWeek        | lagosIsland  | one more ledger to deliver per phase, clock x 0.85            |
 * | longBlackout     | lekki        | switch-off sequence one longer per phase                      |
 * | curfew           | ojuelegba    | the boss's exposure window x 0.8 (provisional, decision FN6)  |
 *
 * The boss fight's numbers come from the mission's `recipe` at the campaign level (`boss.ts`, decisions BX1-BX8).
 */
import { ticks } from '../config';
import {
  BASE_PHASE,
  CARRY_SLOW_TICKS,
  MIN_STRIKE_WARN_TICKS,
  MIN_TRAIN_WARN_TICKS,
  MISSION_DEFS,
} from './defs';
import type { MissionDef } from './defs';
import { resolveBossRecipe } from './boss';
import type { CampaignLevel } from '../campaign/levels';
import type { MissionModifierId, MissionSpec, MissionTuning, PhaseTuning } from './types';
import { MODIFIER_FOR } from './types';

export const MODIFIER_NUMBERS = {
  rushHourDispatchPulse: 0.75,
  marketDayCrew: 0.7,
  /** Extra blasts every toll box takes (it replaced the x 1.5 hold of the stand-in-the-zone junctions: decision BX5). */
  tollSeasonBoxHits: 1,
  expressTimetableOpen: 0.7,
  auditWeekClock: 0.85,
  /** The finale's replay modifier (provisional, FN6): the Landlord re-locks faster, so his windows are shorter. */
  curfewWindow: 0.8,
} as const;

/** The modifiers of `spec` that belong to its own mission (others are ignored, duplicates dropped). */
export function activeModifiers(spec: MissionSpec): MissionModifierId[] {
  const own = MODIFIER_FOR[spec.id];
  return (spec.modifiers ?? []).filter((m, i, all) => m === own && all.indexOf(m) === i);
}

export function resolveTuning(
  def: MissionDef,
  spec: MissionSpec,
  level: CampaignLevel = 'normal',
): MissionTuning {
  const mods = activeModifiers(spec);
  const has = (m: MissionModifierId): boolean => mods.includes(m);
  const phases = def.phases.map((p): PhaseTuning => {
    const t: PhaseTuning = { ...BASE_PHASE, ...p, callout: p.callout };
    const nodeCount = p.nodes.length;
    if (has('rushHourDispatch') && t.pulseTicks > 0)
      t.pulseTicks = Math.round(t.pulseTicks * MODIFIER_NUMBERS.rushHourDispatchPulse);
    if (has('marketDay') && t.crewTicks > 0)
      t.crewTicks = Math.round(t.crewTicks * MODIFIER_NUMBERS.marketDayCrew);
    if (has('tollSeason')) t.hp += MODIFIER_NUMBERS.tollSeasonBoxHits;
    if (has('expressTimetable') && t.openTicks > 0)
      t.openTicks = Math.round(t.openTicks * MODIFIER_NUMBERS.expressTimetableOpen);
    if (has('auditWeek')) t.goal = Math.min(t.goal + 1, nodeCount);
    if (has('longBlackout')) {
      t.sequence = Math.min(t.sequence + 1, nodeCount);
      t.goal = t.sequence;
    }
    // lethal telegraphs have floors (decision MS2): data and modifiers can never go below them
    t.warnTicks = Math.max(
      t.warnTicks,
      def.objective === 'dispatchWindows' ? MIN_TRAIN_WARN_TICKS : MIN_STRIKE_WARN_TICKS,
    );
    return t;
  }) as MissionTuning['phases'];
  let limit = spec.timeLimitSec ?? def.timeLimitSec;
  if (has('auditWeek') && spec.timeLimitSec === undefined) limit = limit * MODIFIER_NUMBERS.auditWeekClock;
  const boss = resolveBossRecipe(def.recipe, level);
  if (has('curfew')) boss.exposeTicks = Math.round(boss.exposeTicks * MODIFIER_NUMBERS.curfewWindow);
  return {
    timeLimitTicks: ticks(limit),
    parTicks: ticks(def.parSec),
    exposeTicks: boss.exposeTicks,
    maxExposures: boss.maxExposures,
    reinforceMax: def.reinforceMax,
    carrySlowTicks: def.objective === 'evidenceRun' ? CARRY_SLOW_TICKS : 0,
    phases,
    boss,
  };
}

/** Convenience for tests and docs: the resolved tuning of a mission (at a campaign level, default Normal). */
export function tuningFor(spec: MissionSpec, level: CampaignLevel = 'normal'): MissionTuning {
  return resolveTuning(MISSION_DEFS[spec.id], spec, level);
}
