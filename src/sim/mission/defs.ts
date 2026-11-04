/**
 * Mission data: the six district fights. Every number a mission uses lives here (decisions MS1-MS12 in
 * docs/DECISIONS.md, the table in docs/MISSION_SIM.md); the runtime in `runtime.ts` and `objectives/` only reads it.
 *
 * A mission = one City Rumble arena + one objective verb with three phases of rising pressure + a boss post + a
 * protection crew (NPC roles). Node tiles are authored floor tiles ('.' or '_' in the arena layout, never road,
 * track, crate or concrete); `tests/mission-nodes.test.ts` BFS-reaches every one from the human spawn.
 *
 * Fictional faction ids (matched by the campaign content worker): see FACTION_IDS and docs/MISSION_SIM.md.
 */
import { ticks } from '../config';
import type { CharacterId } from '../types';
import type { MissionId, NpcRole, ObjectiveKind, PhaseTuning } from './types';

export type Tile2 = readonly [number, number];

export interface NodeDef {
  id: string;
  x: number;
  y: number;
  label: string;
  /** Hold zone radius (junctions: 1 = 3 x 3). */
  radius?: number;
  /** Tiles turned into open floor when the node completes (a route opens). */
  opens?: Tile2[];
}

/** One phase as authored: its nodes, the numbers that differ from `BASE_PHASE`, and the HUD line. */
export interface PhaseDef extends Partial<Omit<PhaseTuning, 'callout'>> {
  nodes: NodeDef[];
  callout: string;
  /** Evidence run: where the ledgers are delivered in this phase. */
  press?: { x: number; y: number };
}

export interface CrewDef {
  role: NpcRole;
  name: string;
  /** Start tile (snapped to the nearest free floor tile if it is not one). */
  post: Tile2;
  /** Defenders: index into the phase's nodes of the node they stay at (wraps). */
  anchor?: number;
  /** Guard / follow radius in tiles (default per role in directives.ts). */
  radius?: number;
}

export interface MissionDef {
  id: MissionId;
  /** The district's City Rumble arena. */
  arenaId: string;
  objective: ObjectiveKind;
  factionId: string;
  timeLimitSec: number;
  /** Three stars when cleared within this many seconds without losing more than one life. */
  parSec: number;
  /** How long the boss stays exposed once the third phase is done. */
  exposeSec: number;
  /** Exposure windows allowed (the retry loop): a missed window re-shields the boss and repeats phase 3. */
  maxExposures: number;
  /** Crew members that may be brought back (runner / escort only) by 'reinforce' events over the whole mission. */
  reinforceMax: number;
  boss: { name: string; characterId: CharacterId; post: Tile2; radius: number };
  crew: CrewDef[];
  /** Oshodi: the road lanes (tile lists) the convoy strikes run along. */
  lanes?: Tile2[][];
  phases: [PhaseDef, PhaseDef, PhaseDef];
  /** The extra crew member the replay modifier brings (marketDay). */
  modifierCrew?: CrewDef;
}

export const FACTION_IDS = {
  oshodi: 'eko-dispatch-collective',
  mushin: 'ladipo-parts-union',
  fadeyiSomolu: 'brt-route-marshals',
  ebuteMetta: 'rail-yard-dispatch',
  lagosIsland: 'island-audit-bureau',
  lekki: 'lekki-private-security',
} as const satisfies Record<MissionId, string>;

/** The human's seat in the faction map. */
export const PLAYER_FACTION_ID = 'player';

/** A convoy / marshal strike never warns for less than this (2.5 s): lethal and always escapable. */
export const MIN_STRIKE_WARN_TICKS = ticks(2.5);
/** A rail window's train warning never drops below this (3.5 s, the `train` stage style). */
export const MIN_TRAIN_WARN_TICKS = ticks(3.5);
/** Evidence run: standing on the press drop this long hands a ledger over. */
export const PRESS_DROP_TICKS = 30;
/** Lethal strikes alive at once (a landed strike counts until its flames go out). */
export const MAX_STRIKES = 3;
/** Postponements of a landing while the human cannot move (daze, knockdown, slide), each this many ticks. */
export const STRIKE_MERCY_TICKS = 24;
export const STRIKE_MERCY_MAX = 5;
/** Reinforcement: the warning on the entry tile before a runner / escort steps back in. */
export const REINFORCE_WARN_TICKS = ticks(3);
/** Lives the human has when the spec names none. */
export const DEFAULT_LIVES = 3;
/** Crates per tile on a mission board (the City Rumble stages use 0.40-0.46): lighter, so objective routes stay open. */
export const MISSION_SOFT_DENSITY = 0.28;
/** Default human step penalty while carrying a ledger (ticks per step, on top of the normal step). */
export const CARRY_SLOW_TICKS = 4;

/** Defaults of every phase number; an authored phase overrides what it needs. */
export const BASE_PHASE: Omit<PhaseTuning, 'callout'> = {
  goal: 1,
  holdTicks: 120,
  decayPerTick: 2,
  rearmTicks: 0,
  pulseTicks: 0,
  warnTicks: ticks(3),
  activeTicks: 40,
  strikeSpan: 12,
  hp: 1,
  crewTicks: 0,
  cycleTicks: 0,
  openTicks: 0,
  sequence: 0,
  carryLimitTicks: 0,
};

const row = (y: number, x0: number, x1: number): Tile2[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y] as const);

const n = (id: string, x: number, y: number, label: string, extra: Partial<NodeDef> = {}): NodeDef => ({
  id,
  x,
  y,
  label,
  ...extra,
});

// ------------------------------------------------------------------ Oshodi: dispatch relays (the vertical slice)

const OSHODI: MissionDef = {
  id: 'oshodi',
  arenaId: 'rumbleOshodi',
  objective: 'dispatchRelays',
  factionId: FACTION_IDS.oshodi,
  timeLimitSec: 420,
  parSec: 240,
  exposeSec: 25,
  maxExposures: 3,
  reinforceMax: 3,
  boss: { name: 'Oga Dispatch', characterId: 'lekkiBoy', post: [27, 12], radius: 3 },
  crew: [
    { role: 'meleeGuard', name: 'Dispatch Marshal', post: [26, 13], radius: 3 },
    { role: 'rangedAttacker', name: 'Convoy Spotter', post: [29, 12] },
    { role: 'blocker', name: 'Lane Blocker', post: [33, 14] },
    { role: 'runner', name: 'Relay Runner', post: [24, 14] },
    { role: 'runner', name: 'Relay Runner', post: [45, 14] },
    { role: 'escort', name: 'Dispatch Escort', post: [28, 12], radius: 2 },
  ],
  // the four lanes of the main road: convoys run along them
  lanes: [row(15, 0, 62), row(16, 0, 62), row(17, 0, 62), row(18, 0, 62)],
  phases: [
    {
      nodes: [n('r1', 8, 14, 'RELAY 1'), n('r2', 28, 19, 'RELAY 2'), n('r3', 52, 14, 'RELAY 3')],
      goal: 2,
      holdTicks: ticks(2.5),
      rearmTicks: ticks(25),
      pulseTicks: ticks(10),
      warnTicks: ticks(3),
      strikeSpan: 12,
      callout: 'Jam two of the three dispatch relays before the convoys find you.',
    },
    {
      nodes: [
        n('r1', 3, 19, 'RELAY 1'),
        n('r2', 22, 14, 'RELAY 2'),
        n('r3', 40, 19, 'RELAY 3'),
        n('r4', 58, 14, 'RELAY 4'),
      ],
      goal: 3,
      holdTicks: ticks(3),
      rearmTicks: ticks(20),
      pulseTicks: ticks(7),
      warnTicks: 165,
      strikeSpan: 14,
      crewTicks: ticks(1.5),
      callout: 'Faster convoys. Runners re-arm jammed relays: jam three and put the runners down.',
    },
    {
      nodes: [
        n('r1', 10, 19, 'RELAY 1'),
        n('r2', 30, 14, 'RELAY 2'),
        n('r3', 46, 19, 'RELAY 3'),
        n('r4', 61, 14, 'RELAY 4'),
      ],
      goal: 4,
      holdTicks: ticks(3),
      rearmTicks: ticks(40),
      pulseTicks: ticks(5),
      warnTicks: ticks(2.5),
      strikeSpan: 16,
      crewTicks: ticks(1.5),
      callout: 'Jam all four relays inside the window: every jam wears off after forty seconds.',
    },
  ],
};

// ------------------------------------------------------------------ Mushin: supply routes

const MUSHIN: MissionDef = {
  id: 'mushin',
  arenaId: 'rumbleMushin',
  objective: 'supplyRoutes',
  factionId: FACTION_IDS.mushin,
  timeLimitSec: 420,
  parSec: 270,
  exposeSec: 25,
  maxExposures: 3,
  reinforceMax: 3,
  boss: { name: 'Mama Spare-Parts', characterId: 'campusQueen', post: [27, 31], radius: 3 },
  crew: [
    { role: 'runner', name: 'Market Runner', post: [20, 25] },
    { role: 'runner', name: 'Market Runner', post: [30, 10] },
    { role: 'runner', name: 'Market Runner', post: [9, 28] },
    { role: 'meleeGuard', name: 'Stall Guard', post: [26, 30], radius: 3 },
    { role: 'blocker', name: 'Aisle Blocker', post: [22, 28] },
  ],
  modifierCrew: { role: 'runner', name: 'Market Runner', post: [44, 7] },
  phases: [
    {
      nodes: [
        n('s1', 11, 8, 'PARTS STACK 1'),
        n('s2', 25, 22, 'PARTS STACK 2'),
        n('s3', 44, 7, 'PARTS STACK 3'),
      ],
      goal: 2,
      hp: 1,
      crewTicks: ticks(10),
      pulseTicks: ticks(8),
      warnTicks: ticks(3),
      strikeSpan: 1,
      callout: 'Blast two of the three parts stacks. Market runners will restock them.',
    },
    {
      nodes: [
        n('s1', 9, 28, 'PARTS STACK 1'),
        n('s2', 20, 25, 'PARTS STACK 2'),
        n('s3', 30, 10, 'PARTS STACK 3'),
        n('s4', 49, 30, 'PARTS STACK 4'),
      ],
      goal: 3,
      hp: 2,
      crewTicks: ticks(7),
      pulseTicks: ticks(6),
      warnTicks: 165,
      strikeSpan: 1,
      callout: 'Tougher stacks take two blasts. Take the runners out before they restock.',
    },
    {
      nodes: [
        n('s1', 6, 36, 'PARTS STACK 1'),
        n('s2', 21, 13, 'PARTS STACK 2'),
        n('s3', 41, 25, 'PARTS STACK 3'),
        n('s4', 49, 10, 'PARTS STACK 4'),
      ],
      goal: 4,
      hp: 2,
      crewTicks: ticks(5),
      pulseTicks: ticks(5),
      warnTicks: ticks(2.5),
      strikeSpan: 1,
      callout: 'All four stacks down at once. Any runner left standing will bring one back.',
    },
  ],
};

// ------------------------------------------------------------------ Fadeyi / Somolu: junction access

const FADEYI: MissionDef = {
  id: 'fadeyiSomolu',
  arenaId: 'rumbleFadeyi',
  objective: 'junctionAccess',
  factionId: FACTION_IDS.fadeyiSomolu,
  timeLimitSec: 420,
  parSec: 270,
  exposeSec: 25,
  maxExposures: 3,
  reinforceMax: 3,
  boss: { name: 'Marshal Toll', characterId: 'streetBaller', post: [35, 22], radius: 3 },
  crew: [
    { role: 'objectiveDefender', name: 'Route Marshal', post: [11, 23], anchor: 0, radius: 3 },
    { role: 'objectiveDefender', name: 'Route Marshal', post: [26, 11], anchor: 1, radius: 3 },
    { role: 'objectiveDefender', name: 'Route Marshal', post: [46, 11], anchor: 2, radius: 3 },
    { role: 'meleeGuard', name: 'Toll Guard', post: [34, 22], radius: 3 },
    { role: 'blocker', name: 'Junction Blocker', post: [30, 22] },
  ],
  phases: [
    {
      nodes: [
        n('j1', 10, 22, 'JUNCTION 1', { radius: 1 }),
        n('j2', 25, 10, 'JUNCTION 2', { radius: 1 }),
        n('j3', 47, 10, 'JUNCTION 3', { radius: 1 }),
      ],
      goal: 2,
      holdTicks: ticks(4),
      decayPerTick: 1,
      pulseTicks: ticks(9),
      warnTicks: ticks(3),
      strikeSpan: 6,
      callout: 'Hold two of the three junctions. A marshal inside a zone stops the hold.',
    },
    {
      nodes: [
        n('j1', 6, 5, 'JUNCTION 1', { radius: 1 }),
        n('j2', 33, 22, 'JUNCTION 2', { radius: 1 }),
        n('j3', 27, 27, 'JUNCTION 3', { radius: 1 }),
      ],
      goal: 3,
      holdTicks: ticks(5),
      decayPerTick: 1,
      pulseTicks: ticks(7),
      warnTicks: 165,
      strikeSpan: 7,
      callout: 'Hold all three. A held junction switches its marshal strikes off.',
    },
    {
      nodes: [
        n('j1', 10, 22, 'JUNCTION 1', { radius: 1 }),
        n('j2', 25, 10, 'JUNCTION 2', { radius: 1 }),
        n('j3', 47, 10, 'JUNCTION 3', { radius: 1 }),
      ],
      goal: 3,
      holdTicks: ticks(5),
      decayPerTick: 1,
      rearmTicks: ticks(35),
      pulseTicks: ticks(5),
      warnTicks: ticks(2.5),
      strikeSpan: 8,
      callout: 'Hold all three inside the window: a held junction is retaken after thirty-five seconds.',
    },
  ],
};

// ------------------------------------------------------------------ Ebute-Metta: dispatch windows

const EBUTE: MissionDef = {
  id: 'ebuteMetta',
  arenaId: 'rumbleEbuteMetta',
  objective: 'dispatchWindows',
  factionId: FACTION_IDS.ebuteMetta,
  timeLimitSec: 480,
  parSec: 330,
  exposeSec: 25,
  maxExposures: 3,
  reinforceMax: 3,
  boss: { name: 'Yard Master', characterId: 'lekkiBoy', post: [30, 28], radius: 3 },
  crew: [
    { role: 'objectiveDefender', name: 'Signal Guard', post: [25, 13], anchor: 0, radius: 3 },
    { role: 'objectiveDefender', name: 'Signal Guard', post: [28, 22], anchor: 2, radius: 3 },
    { role: 'runner', name: 'Yard Runner', post: [31, 27] },
    { role: 'blocker', name: 'Platform Blocker', post: [29, 20] },
    { role: 'supportUnit', name: 'Yard Hand', post: [31, 28], radius: 3 },
  ],
  phases: [
    {
      nodes: [n('d1', 25, 12, 'SWITCH 1'), n('d2', 28, 15, 'SWITCH 2'), n('d3', 25, 23, 'SWITCH 3')],
      goal: 2,
      holdTicks: ticks(1.5),
      decayPerTick: 3,
      cycleTicks: ticks(25),
      openTicks: ticks(10),
      warnTicks: ticks(4),
      callout: 'Throw two of the three switches, but only while the rail window is open.',
    },
    {
      nodes: [
        n('d1', 25, 10, 'SWITCH 1'),
        n('d2', 28, 13, 'SWITCH 2'),
        n('d3', 25, 21, 'SWITCH 3'),
        n('d4', 28, 24, 'SWITCH 4'),
      ],
      goal: 3,
      holdTicks: 100,
      decayPerTick: 3,
      cycleTicks: ticks(22),
      openTicks: ticks(8),
      warnTicks: 225,
      callout: 'Shorter windows. Three switches, and the yard crew stands in your way.',
    },
    {
      nodes: [
        n('d1', 25, 12, 'SWITCH 1'),
        n('d2', 28, 14, 'SWITCH 2'),
        n('d3', 25, 22, 'SWITCH 3'),
        n('d4', 28, 25, 'SWITCH 4'),
      ],
      goal: 4,
      holdTicks: 100,
      decayPerTick: 3,
      rearmTicks: ticks(25),
      cycleTicks: ticks(20),
      openTicks: ticks(7),
      warnTicks: 216,
      callout:
        'All four switches thrown inside twenty-five seconds: they reset when the dispatcher recovers.',
    },
  ],
};

// ------------------------------------------------------------------ Lagos Island: evidence run

const LAGOS: MissionDef = {
  id: 'lagosIsland',
  arenaId: 'rumbleLagosIsland',
  objective: 'evidenceRun',
  factionId: FACTION_IDS.lagosIsland,
  timeLimitSec: 420,
  parSec: 280,
  exposeSec: 25,
  maxExposures: 3,
  reinforceMax: 3,
  boss: { name: 'The Auditor', characterId: 'campusQueen', post: [29, 20], radius: 3 },
  crew: [
    { role: 'objectiveDefender', name: 'Auditor', post: [11, 9], anchor: 0, radius: 3 },
    { role: 'objectiveDefender', name: 'Auditor', post: [31, 28], anchor: 1, radius: 3 },
    { role: 'meleeGuard', name: 'Records Guard', post: [28, 21], radius: 3 },
    { role: 'bossAssistant', name: 'Audit Assistant', post: [28, 19] },
    { role: 'supportUnit', name: 'Clerk', post: [30, 21], radius: 3 },
  ],
  phases: [
    {
      nodes: [n('l1', 10, 8, 'LEDGER 1'), n('l2', 6, 14, 'LEDGER 2'), n('l3', 14, 21, 'LEDGER 3')],
      press: { x: 4, y: 21 },
      goal: 2,
      holdTicks: 60,
      pulseTicks: ticks(9),
      warnTicks: ticks(3),
      strikeSpan: 1,
      callout: 'Collect a ledger and carry it to the press drop. Auditors chase the carrier.',
    },
    {
      nodes: [
        n('l1', 21, 8, 'LEDGER 1'),
        n('l2', 40, 6, 'LEDGER 2'),
        n('l3', 30, 28, 'LEDGER 3'),
        n('l4', 45, 21, 'LEDGER 4'),
      ],
      press: { x: 30, y: 21 },
      goal: 3,
      holdTicks: 60,
      pulseTicks: ticks(7),
      warnTicks: 165,
      strikeSpan: 1,
      callout: 'Three ledgers to the press. A hit or a daze drops what you carry.',
    },
    {
      nodes: [
        n('l1', 8, 28, 'LEDGER 1'),
        n('l2', 28, 2, 'LEDGER 2'),
        n('l3', 50, 12, 'LEDGER 3'),
        n('l4', 20, 34, 'LEDGER 4'),
        n('l5', 11, 13, 'LEDGER 5'),
      ],
      press: { x: 50, y: 25 },
      goal: 4,
      holdTicks: 60,
      pulseTicks: ticks(5),
      warnTicks: ticks(2.5),
      strikeSpan: 1,
      carryLimitTicks: ticks(45),
      callout: 'Four ledgers to the far press. A carried ledger is lost after forty-five seconds.',
    },
  ],
};

// ------------------------------------------------------------------ Lekki: contingency grid

const LEKKI: MissionDef = {
  id: 'lekki',
  arenaId: 'rumbleLekki',
  objective: 'contingencyGrid',
  factionId: FACTION_IDS.lekki,
  timeLimitSec: 420,
  parSec: 260,
  exposeSec: 25,
  maxExposures: 3,
  reinforceMax: 3,
  boss: { name: 'Estate Controller', characterId: 'streetBaller', post: [35, 8], radius: 3 },
  crew: [
    { role: 'objectiveDefender', name: 'Security Contractor', post: [20, 10], anchor: 0, radius: 3 },
    { role: 'objectiveDefender', name: 'Security Contractor', post: [43, 10], anchor: 2, radius: 3 },
    { role: 'rangedAttacker', name: 'Perimeter Marksman', post: [37, 9] },
    { role: 'meleeGuard', name: 'Gate Guard', post: [34, 8], radius: 3 },
    { role: 'bossAssistant', name: 'Controller Aide', post: [36, 9] },
    { role: 'escort', name: 'Estate Escort', post: [35, 9], radius: 2 },
  ],
  phases: [
    {
      nodes: [
        n('a', 9, 8, 'SWITCH A'),
        n('b', 20, 9, 'SWITCH B'),
        n('c', 44, 9, 'SWITCH C'),
        n('d', 30, 13, 'SWITCH D'),
      ],
      goal: 3,
      sequence: 3,
      holdTicks: 30,
      warnTicks: ticks(3),
      strikeSpan: 1,
      callout: 'Switch the private systems off in the signalled order. A wrong switch calls a strike.',
    },
    {
      nodes: [
        n('a', 3, 24, 'SWITCH A'),
        n('b', 12, 23, 'SWITCH B'),
        n('c', 30, 24, 'SWITCH C'),
        n('d', 50, 24, 'SWITCH D'),
        n('e', 40, 17, 'SWITCH E'),
      ],
      goal: 4,
      sequence: 4,
      holdTicks: 30,
      pulseTicks: ticks(9),
      warnTicks: 165,
      strikeSpan: 1,
      callout: 'A longer order, and contingency strikes now chase you between switches.',
    },
    {
      nodes: [
        n('a', 9, 15, 'SWITCH A'),
        n('b', 30, 29, 'SWITCH B'),
        n('c', 40, 17, 'SWITCH C'),
        n('d', 51, 22, 'SWITCH D'),
        n('e', 14, 5, 'SWITCH E'),
        n('f', 44, 9, 'SWITCH F'),
      ],
      goal: 5,
      sequence: 5,
      holdTicks: 30,
      pulseTicks: ticks(7),
      warnTicks: ticks(2.5),
      strikeSpan: 1,
      callout: 'The full blackout order. One wrong switch resets the whole sequence.',
    },
  ],
};

export const MISSION_DEFS: Readonly<Record<MissionId, MissionDef>> = {
  oshodi: OSHODI,
  mushin: MUSHIN,
  fadeyiSomolu: FADEYI,
  ebuteMetta: EBUTE,
  lagosIsland: LAGOS,
  lekki: LEKKI,
};

/** The City Rumble arena a mission is played on. */
export function getMissionArenaId(id: MissionId): string {
  return MISSION_DEFS[id].arenaId;
}
