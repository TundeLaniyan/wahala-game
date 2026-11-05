/**
 * Display model of the campaign mission panel in the HUD rail (decision HC5): phase pips, the objective with its
 * progress, the phase's callout, the boss's status, lives, time and the incoming warnings. A pure function of the
 * sim's read-only `MissionView` (src/sim/mission/types.ts); it invents no numbers and no rules.
 */
import type { MissionView, MissionWarningView, ObjectiveKind } from '../sim';

/** The verb of each district's objective, as the panel's heading says it. */
export const OBJECTIVE_LABEL: Readonly<Record<ObjectiveKind, string>> = {
  dispatchRelays: 'JAM THE RELAYS',
  supplyRoutes: 'DESTROY THE PARTS STACKS',
  junctionAccess: 'HOLD THE JUNCTIONS',
  evidenceRun: 'COLLECT AND DELIVER THE LEDGERS',
  contingencyGrid: 'SWITCH THE SYSTEMS OFF IN ORDER',
  dispatchWindows: 'HIT THE SWITCHES IN THE RAIL WINDOWS',
  fieldRoute: 'FOLLOW THE ROUTE',
};

export const WARNING_LABEL: Readonly<Record<MissionWarningView['kind'], string>> = {
  strike: 'STRIKE',
  convoy: 'CONVOY',
  window: 'WINDOW',
  contingency: 'CONTINGENCY',
  reinforce: 'REINFORCEMENTS',
};

/** At most this many warnings are listed (the soonest first). */
export const MISSION_WARNINGS_MAX = 3;
/** A warning this close (seconds) is drawn urgent. */
export const MISSION_WARNING_URGENT_SECONDS = 3;

export interface MissionPip {
  index: 0 | 1 | 2;
  state: 'done' | 'active' | 'todo';
}

export interface MissionBossStatus {
  state: 'shielded' | 'exposed' | 'defeated';
  /** "BOSS SHIELDED", "BOSS EXPOSED 0:08", "BOSS DEFEATED". */
  label: string;
  /** Seconds of the exposed window left (only while exposed). */
  seconds: number | null;
}

export interface MissionWarningLine {
  kind: MissionWarningView['kind'];
  /** "CONVOY 4s" */
  label: string;
  seconds: number;
  urgent: boolean;
}

export interface MissionPanelModel {
  pips: MissionPip[];
  /** "PHASE 2 OF 3" */
  phaseLabel: string;
  objective: string;
  progress: { done: number; goal: number; label: string; fraction: number; text: string };
  callout: string | null;
  boss: MissionBossStatus;
  /** "LIVES 2/3": lives left of the maximum. */
  lives: { left: number; max: number; label: string };
  /** "4:12" */
  time: { seconds: number; label: string };
  warnings: MissionWarningLine[];
  /** The mission is over: the panel says how. */
  outcome: 'won' | 'lost' | 'timeout' | null;
}

const clock = (sec: number): string => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const seconds = (ticks: number): number => Math.max(0, Math.ceil(ticks / 60));

/** Everything the rail panel shows, from the sim's mission view. */
export function missionPanelModel(view: MissionView): MissionPanelModel {
  const finished = view.phaseState === 'exposed' || view.phaseState === 'won';
  const pips: MissionPip[] = ([0, 1, 2] as const).map((index) => ({
    index,
    state:
      index < view.phase || (index === view.phase && finished)
        ? 'done'
        : index === view.phase
          ? 'active'
          : 'todo',
  }));

  const { done, goal, label } = view.progress;
  const fraction = goal > 0 ? Math.min(1, Math.max(0, done / goal)) : 0;

  const b = view.boss;
  const boss: MissionBossStatus = b.defeated
    ? { state: 'defeated', label: 'BOSS DEFEATED', seconds: null }
    : b.exposed
      ? {
          state: 'exposed',
          label: `BOSS EXPOSED ${clock(seconds(b.exposedRemainingTicks))}`,
          seconds: seconds(b.exposedRemainingTicks),
        }
      : { state: 'shielded', label: 'BOSS SHIELDED', seconds: null };

  const left = Math.max(0, view.lives.max - view.lives.used);
  const warnings = view.warnings
    .map((w): MissionWarningLine => {
      const s = seconds(w.remainingTicks);
      return {
        kind: w.kind,
        label: `${WARNING_LABEL[w.kind]} ${s}s`,
        seconds: s,
        urgent: s <= MISSION_WARNING_URGENT_SECONDS,
      };
    })
    .sort((a, c) => a.seconds - c.seconds)
    .slice(0, MISSION_WARNINGS_MAX);

  return {
    pips,
    phaseLabel: `PHASE ${view.phase + 1} OF ${view.phaseCount}`,
    objective: OBJECTIVE_LABEL[view.objective],
    progress: { done, goal, label, fraction, text: `${done}/${goal} ${label}` },
    callout: view.callout && view.callout.length > 0 ? view.callout : null,
    boss,
    lives: { left, max: view.lives.max, label: `LIVES ${left}/${view.lives.max}` },
    time: { seconds: view.timeRemainingSec, label: clock(view.timeRemainingSec) },
    warnings,
    outcome: view.outcome?.result ?? null,
  };
}
