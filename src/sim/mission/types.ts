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
import type { RaidId, RaidOutcome, RaidRequest } from '../campaign/types';
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
  | 'dispatchWindows'
  /** Section FIELD missions (src/sim/mission/field.ts): a route of legs (markers, a group, an escape, a door, the way back). */
  | 'fieldRoute';

/**
 * What a leg of a section field mission asks (docs/CAMPAIGN_SECTIONS.md). The legs of a mission run in order; the
 * last one is always `returnRoute`.
 *   reachMarkers  walk to marked tiles in order
 *   clearGroup    defeat an enemy group (existing eliminations; campaign damage joins when combat-core is merged)
 *   escapeRoute   reach an exit before the pursuer (an enemy group set on the player when the leg starts) catches you
 *   door          stand on a door about a second: raises a `RaidRequest` (`state.mission.pendingRaid`)
 *   returnRoute   walk to the return marker: the mission is complete
 */
export type FieldObjectiveKind = 'reachMarkers' | 'clearGroup' | 'escapeRoute' | 'door' | 'returnRoute';

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
  /**
   * A SECTION field mission of the district `id` (`FIELD_MISSION_DEFS`): the same arena and match rules, but a route of
   * legs instead of the boss fight. Absent = the district's boss mission (unchanged).
   */
  fieldId?: string;
  /** Human lives (default 3). A life is spent when the human is eliminated; 0 left = mission lost. */
  lives?: number;
  /**
   * Overrides the mission's clock (seconds). Not offered by the campaign: for practice variants and tests (a short
   * clock makes a timeout test cheap). Absent = the mission's own limit from its data (`MISSION_DEFS`).
   */
  timeLimitSec?: number;
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
  /** Section field missions: the field mission id (`missionId` is then the district). Absent for the boss missions. */
  sectionMissionId?: string;
  /** Section field missions: raids completed with three stars (a bonus that can earn the third star). */
  raidBonus?: number;
}

/** The read-only mission picture for HUD, renderer markers and the app (built by `missionView(state)`). */
export interface MissionDoorView {
  id: string;
  x: number;
  y: number;
  label: string;
  raidId: RaidId;
  status: 'idle' | 'inRaid' | 'done' | 'failed';
  /** 0..1 of the hold that raises the raid request. */
  fraction: number;
  required: boolean;
}

export interface MissionView {
  /** Optional extension: 'field' for a section field mission; absent for the boss missions (and raids have their own view). */
  format?: 'field';
  /** Section field missions: the field mission id, the current leg's text, its position in the route and its doors. */
  fieldId?: string;
  phaseText?: string;
  legIndex?: number;
  legCount?: number;
  legKind?: FieldObjectiveKind;
  doors?: MissionDoorView[];
  /** A door raised a raid request that the app has not answered yet. */
  pendingRaid?: RaidRequest | null;
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
    /** The boss's display name (for the HUD boss bar). */
    name?: string;
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
  /** Crew: the tile the bot stands on at the start and returns to (after snapping to free floor). */
  post?: { x: number; y: number };
  /** Crew: guard / follow radius in tiles, and for defenders the index of the phase node they stay at. */
  radius?: number;
  anchor?: number;
  /** Section field missions: the enemy group this seat belongs to (`clearGroup` / `escapeRoute` legs name it). */
  group?: string;
}

// ---------------------------------------------------------------- runtime state (plain JSON in `GameState.mission`)

/** A crew bot's directive for the AI (computed by the sim from its role; carried by `Observation.directive`). */
export interface NpcDirective {
  /**
   * guard: stay within `radius` of (x, y) and fight what comes in; block: stand on the tile; chase: hunt the rival
   * (the AI picks its own target); run: go to the tile (a restock / objective tile); escort: stay with the tile's
   * occupant (the boss); support: stay with an ally; flee: keep away from the human (x, y is the human's tile).
   * Campaign enemy groups (src/sim/campaign/tactics.ts): surround: take this tile next to the target (each enemy of
   * the group gets a different one); standoff: take this tile in a clear cardinal line to the target, 2+ tiles away,
   * to throw from; hold: stay put (nobody in sight); reinforce: go to the caller's tile (a call is open).
   */
  kind:
    | 'guard'
    | 'block'
    | 'chase'
    | 'run'
    | 'escort'
    | 'support'
    | 'flee'
    | 'surround'
    | 'standoff'
    | 'hold'
    | 'reinforce';
  x: number;
  y: number;
  radius?: number;
}

/** One telegraphed mission strike (a convoy lane, an audit, a contingency...). Lethal flames land at `landTick`. */
export interface MissionStrike {
  id: number;
  kind: 'convoy' | 'strike' | 'contingency' | 'marshal' | 'audit';
  /** Tile indices (y * width + x) that burn. */
  tiles: number[];
  warnTick: number;
  landTick: number;
  /** Tick the flames go out (landTick + active time; the strike is dropped after it). */
  endTick: number;
  eventId: number;
  /** Node id that called it ('' = the mission). */
  source: string;
  /** Times the landing was postponed because the target could not move (mercy; bounded). */
  postponed: number;
  /** The flames have been created. */
  landed: boolean;
}

/** One objective node at run time. Every mechanic uses the fields it needs; the rest stay at their defaults. */
export interface MissionNodeRuntime {
  id: string;
  x: number;
  y: number;
  label: string;
  /** Channel / hold progress in ticks (relay jam, junction hold, ledger pickup, switch-off, switch throw). */
  progress: number;
  /** Completed right now: jammed / destroyed / held / collected / thrown / switched off. */
  done: boolean;
  /** Tick it completed (lapse timers). */
  doneAt: number;
  /** Next pulse tick of a live relay / junction (-1 = none). */
  nextPulse: number;
  /** Blast hits left (parts stack). */
  hp: number;
  /** Last flame event that already counted against this stack (one blast counts once). */
  lastEvent: number;
  /** Crew progress ticks (a runner re-arming a relay / restocking a stack). */
  crewProgress: number;
  /** Hold zone radius in tiles (junction), 0 = the tile only. */
  radius: number;
  /** Position in the contingency order (-1 = not part of it). */
  order: number;
  /** Switch cannot trigger again until the player has stepped off it. */
  needsRelease: boolean;
  /** Last state reported through a `missionNode` event. */
  shown: MissionNodeState;
  /** Tile indices opened (soft blocks cleared) when completed (junctions). */
  opens: number[];
}

/** The rail window cycle of the dispatch-windows mission. */
export interface MissionRail {
  /** Next cycle starts (its train warning begins) at this tick. */
  nextCycleAt: number;
  /** Tick the telegraphed railcar enters the lane (-1 = no cycle running). */
  trainAt: number;
  /** Tick the lane is clear again and the dispatch window opens. */
  openAt: number;
  /** Tick the window closes. */
  closeAt: number;
  open: boolean;
  route: number;
  cycles: number;
}

export interface MissionBossState {
  shielded: boolean;
  /** Tick the exposure window ends (0 = not exposed). */
  exposedUntil: number;
  /** Windows opened so far (retry loop bound: `tuning.maxExposures`). */
  exposures: number;
  defeated: boolean;
}

export interface MissionReinforcement {
  playerId: number;
  atTick: number;
}

/** One phase of the encounter with every number resolved (data + replay modifiers). Ticks unless stated. */
export interface PhaseTuning {
  goal: number;
  /** Channel / hold time (relay jam, junction hold, ledger pickup, switch-off, switch throw). */
  holdTicks: number;
  /** Progress lost per tick while nobody works the node. */
  decayPerTick: number;
  /** A completed node reverts after this long (0 = it stays done). */
  rearmTicks: number;
  /** Pressure cadence per source (0 = none). */
  pulseTicks: number;
  /** Strike telegraph: never below 150 ticks (2.5 s) for a lethal strike, 210 for a train. */
  warnTicks: number;
  /** How long a strike burns. */
  activeTicks: number;
  /** Strike size: lane tiles (convoy / marshal) or area radius (targeted strikes). */
  strikeSpan: number;
  /** Parts stack: separate blasts needed. */
  hp: number;
  /** A runner standing on a destroyed stack / jammed relay needs this long to restock / re-arm it (0 = never). */
  crewTicks: number;
  /** Rail windows: gap between two cycle starts, how long a window stays open. */
  cycleTicks: number;
  openTicks: number;
  /** Contingency: length of the switch-off sequence. */
  sequence: number;
  /** Evidence: how long a carried ledger may be carried before it is lost (0 = unlimited). */
  carryLimitTicks: number;
  callout: string;
}

export interface MissionTuning {
  timeLimitTicks: number;
  parTicks: number;
  exposeTicks: number;
  maxExposures: number;
  reinforceMax: number;
  /** Extra ticks per step while carrying a ledger. */
  carrySlowTicks: number;
  phases: [PhaseTuning, PhaseTuning, PhaseTuning];
}

/** A door of a section field mission at run time. */
export interface FieldDoorRuntime {
  id: string;
  x: number;
  y: number;
  label: string;
  raidId: RaidId;
  required: boolean;
  /** The tile the human is put on when the raid ends (in front of the door). */
  returnTile: { x: number; y: number };
  /** idle: unused; inRaid: the raid request is out; done: the raid was completed; failed: retry allowed. */
  status: 'idle' | 'inRaid' | 'done' | 'failed';
  /** Ticks stood on the door so far. */
  hold: number;
  attempts: number;
  /** Stars of the completed raid (0 until done). */
  stars: number;
  /** The last raid outcome the door received. */
  last: RaidOutcome | null;
}

/** Run time of a section field mission (`MissionState.field`; absent in the boss missions). */
export interface FieldRuntime {
  fieldId: string;
  /** Index of the leg in play (the last leg is the return route). */
  leg: number;
  legStartTick: number;
  /** Markers of the current `reachMarkers` leg reached so far. */
  markersDone: number;
  /** Where the human restarts after a life is lost: the last marker / door return / start. */
  checkpoint: { x: number; y: number };
  doors: FieldDoorRuntime[];
  /** Escape leg: ticks the pursuer has been next to the human, and how many times it caught them. */
  catchTicks: number;
  caught: number;
  /** Tick of the last catch (the HUD line says so for a few seconds). */
  caughtAt: number;
  raidsCompleted: number;
  /** Raids completed with three stars. */
  raidBonus: number;
  /** Set once the return route is walked; the mission result is written on the same tick. */
  done: boolean;
}

export interface MissionState {
  id: MissionId;
  objective: ObjectiveKind;
  modifiers: MissionModifierId[];
  difficulty: Difficulty;
  seats: MissionSeat[];
  bossId: number;
  tuning: MissionTuning;
  phase: 0 | 1 | 2;
  phaseState: MissionPhaseState;
  phaseStartTick: number;
  phasesCleared: number;
  nodes: MissionNodeRuntime[];
  strikes: MissionStrike[];
  rail: MissionRail | null;
  /** Contingency: the signalled order (node ids) and how far it has got. */
  sequence: string[];
  seqIndex: number;
  /** Evidence: the carried ledger (null = none) and how many were delivered this phase. */
  carry: { playerId: number; nodeId: string; since: number } | null;
  delivered: number;
  /** Next mission-wide pressure pulse (targeted strikes of the supply, evidence and contingency missions); -1 = none. */
  pulseAt: number;
  boss: MissionBossState;
  livesUsed: number;
  livesMax: number;
  reinforcements: MissionReinforcement[];
  reinforcementsUsed: number;
  announced: boolean;
  outcome: MissionOutcome | null;
  callout: string | null;
  /** Section field missions only (absent in the boss missions, which stay byte-identical). */
  field?: FieldRuntime;
  /** A door raised this raid request; the app starts the raid and answers with `resolveRaid`. Null/absent otherwise. */
  pendingRaid?: RaidRequest | null;
}
