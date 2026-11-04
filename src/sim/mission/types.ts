/**
 * CONTRACT (campaign missions in the simulation). Written by the integrator; the `mission-sim` worker owns this
 * file and `src/sim/mission/**` from here on and may extend it (add optional fields / union members) but must not
 * rename or remove anything the campaign, UI and app layers import (see docs/CAMPAIGN_ARCHITECTURE.md).
 *
 * A mission is an ordinary match (`GameOptions.mission` set) in which the rules of the match end are replaced by
 * a mission runtime: the human (seat 0) faces a fictional boss (seat 1, a bot) and a protection crew (seats 2...,
 * bots with an NPC role). The boss cannot be hurt until the district's objective is completed (three phases, a
 * different verb per district); then the boss is exposed for a short window and the mission is won when the boss
 * is eliminated (or, for escape-style bosses, `defeat: 'ousted'` when the window completes). Pure, deterministic,
 * ticks only, no DOM / Math.random / Date.now, like the rest of src/sim.
 */
import type { CharacterId, Difficulty } from '../types';

/** The six district bosses, in the campaign's order. Ojuelegba is the hub (no mission). */
export type MissionId = 'oshodi' | 'mushin' | 'fadeyiSomolu' | 'ebuteMetta' | 'lagosIsland' | 'lekki';
export const MISSION_IDS: readonly MissionId[] = [
  'oshodi',
  'mushin',
  'fadeyiSomolu',
  'ebuteMetta',
  'lagosIsland',
  'lekki',
];

/** One distinct verb per district (never "kill the wave"). */
export type ObjectiveKind =
  /** Oshodi: JAM radio relays by standing on them; live relays call telegraphed convoy strikes. */
  | 'dispatchRelays'
  /** Mushin: DESTROY parts stacks with blasts; market runners restock them unless eliminated. */
  | 'supplyRoutes'
  /** Fadeyi/Somolu: HOLD junction zones against route marshals; held junctions open routes. */
  | 'junctionAccess'
  /** Lagos Island: COLLECT ledgers and DELIVER them to the press drop while auditors chase the carrier. */
  | 'evidenceRun'
  /** Lekki: SWITCH private systems off in the signalled order; a wrong switch triggers a contingency strike. */
  | 'contingencyGrid'
  /** Ebute-Metta: HIT dispatch switches only inside timed rail windows. */
  | 'dispatchWindows';

/** Reusable NPC roles for the protection crew (they drive bot behaviour through a directive, ai/directive.ts). */
export type NpcRole =
  | 'meleeGuard'
  | 'rangedAttacker'
  | 'blocker'
  | 'runner'
  | 'escort'
  | 'objectiveDefender'
  | 'supportUnit'
  | 'bossAssistant';

/** Replay modifiers (one per boss, unlocked by beating it; each is a small, labelled rule tweak). */
export type MissionModifierId =
  | 'rushHourDispatch' // oshodi: dispatch pulses come faster
  | 'marketDay' // mushin: extra market runners restock faster
  | 'tollSeason' // fadeyiSomolu: junctions take longer to hold
  | 'expressTimetable' // ebuteMetta: shorter rail windows
  | 'auditWeek' // lagosIsland: one more ledger and a shorter clock
  | 'longBlackout'; // lekki: a longer switch sequence

export const MODIFIER_FOR: Readonly<Record<MissionId, MissionModifierId>> = {
  oshodi: 'rushHourDispatch',
  mushin: 'marketDay',
  fadeyiSomolu: 'tollSeason',
  ebuteMetta: 'expressTimetable',
  lagosIsland: 'auditWeek',
  lekki: 'longBlackout',
};

/** What `GameOptions.mission` carries (everything else is resolved inside the sim from the mission's data). */
export interface MissionSpec {
  id: MissionId;
  modifiers?: MissionModifierId[];
  /** Crew bot level (the boss is always at least Standard). Default 'rookie' on the first clear. */
  difficulty?: Difficulty;
  /** Human lives (default 3). A life is spent when the human is eliminated; 0 left = mission lost. */
  lives?: number;
}

export type MissionNodeState =
  | 'idle'
  | 'live' // armed / calling / counting down: a threat or a target right now
  | 'progress' // the player is working on it (fraction > 0)
  | 'done' // completed or jammed / destroyed / held
  | 'locked'; // not part of the current phase

export interface MissionNodeView {
  id: string;
  x: number;
  y: number;
  /** Short HUD / world label, e.g. "RELAY 2", "PARTS STACK", "LEDGER", "SWITCH B". */
  label: string;
  state: MissionNodeState;
  /** 0..1 progress of the current action (jam channel, hold, window). */
  fraction: number;
}

export type MissionPhaseState = 'active' | 'exposed' | 'won' | 'lost';

export interface MissionWarningView {
  kind: 'strike' | 'convoy' | 'window' | 'contingency' | 'reinforce';
  x: number;
  y: number;
  /** Tiles the warning covers (a convoy lane, a blast area ...), as indices y * width + x. */
  tiles: number[];
  remainingTicks: number;
}

export interface MissionOutcome {
  result: 'won' | 'lost' | 'timeout';
  missionId: MissionId;
  modifiers: MissionModifierId[];
  seconds: number;
  livesUsed: number;
  phasesCleared: number;
  /** The boss's way out: how the defeat sequence should read ('eliminated' | 'ousted'). Null when not won. */
  defeat: 'eliminated' | 'ousted' | null;
  /** 0 on a loss; 1 = cleared, 2 = cleared on at most one lost life, 3 = also within the par time. */
  stars: 0 | 1 | 2 | 3;
  creditedKills: number;
}

/** The read-only mission picture for HUD, renderer markers and the app (built by `missionView(state)`). */
export interface MissionView {
  missionId: MissionId;
  objective: ObjectiveKind;
  /** 0, 1 or 2: the active encounter phase. */
  phase: 0 | 1 | 2;
  phaseCount: 3;
  phaseState: MissionPhaseState;
  /** Objective progress of THIS phase: done of goal, with the unit word ("relays jammed"). */
  progress: { done: number; goal: number; label: string };
  nodes: MissionNodeView[];
  warnings: MissionWarningView[];
  boss: {
    playerId: number;
    shielded: boolean;
    exposed: boolean;
    exposedRemainingTicks: number;
    defeated: boolean;
  };
  lives: { used: number; max: number };
  timeRemainingSec: number;
  /** The phase's HUD line ("Jam two relays before the next convoy"); null when there is nothing to say. */
  callout: string | null;
  /** Crew still standing (the boss excluded). */
  crewAlive: number;
  outcome: MissionOutcome | null;
}

/** Seat map: who is who in a mission game (`state.mission.seats`). Seat 0 is always the human, seat 1 the boss. */
export interface MissionSeat {
  playerId: number;
  role: NpcRole | 'player' | 'boss';
  factionId: string;
  characterId: CharacterId;
  name: string;
}
