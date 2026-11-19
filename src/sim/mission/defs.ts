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
import { ebuteX } from '../arenas/ebuteWest';
import { ticks } from '../config';
import { bossRecipe } from './boss';
import type { BossRecipe } from './boss';
import { FINALE_FACTION_ID, OJUELEGBA_BOSS } from './finaleDefs';
import type { EnemyVariantId } from '../data/enemyVariants';
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
  /**
   * The crew member's variant personality (data/enemyVariants.ts, decision BX8): its trap sense and vision under the
   * campaign tactics layer. The seat stays a generator bot of its role; absent = the role's plain perception.
   */
  variant?: EnemyVariantId;
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
  /**
   * The boss fight (decisions BX1-BX8, `boss.ts`): hits, the exposure window per level, the windows allowed, where he
   * restores his shield, what a punch does to the restore, the crew he calls. Every phase's objective exposes him.
   */
  recipe: BossRecipe;
  /** Crew members that may be brought back (runner / escort only) by 'reinforce' events over the whole mission. */
  reinforceMax: number;
  boss: {
    name: string;
    characterId: CharacterId;
    post: Tile2;
    radius: number;
    /**
     * Presentation only (decision FN8): the boss seat is drawn in this campaign enemy variant's look (the Ojuelegba
     * finale's enforcer reuses the existing Boss variant until a bespoke look is approved). The seat stays a generator
     * bot: `Player.enemyVariant` without `enemyKind` changes no rule. Absent = the character's own look.
     */
    look?: EnemyVariantId;
  };
  crew: CrewDef[];
  /** Oshodi: the road lanes (tile lists) the convoy strikes run along. */
  lanes?: Tile2[][];
  phases: [PhaseDef, PhaseDef, PhaseDef];
  /** The extra crew member the replay modifier brings (marketDay). */
  modifierCrew?: CrewDef;
  /**
   * The boss mission's sector (`BOSS_SECTORS`, src/sim/mission/sectors.ts; decision FN7). Absent = the whole district map
   * (the six district bosses).
   */
  sectorId?: string;
  /** The human's start tile (needed when the arena's own spawn lies outside the sector). Absent = the arena spawn. */
  start?: Tile2;
}

export const FACTION_IDS = {
  oshodi: 'oritaWardens',
  mushin: 'sparehandRunners',
  fadeyiSomolu: 'koboMarshals',
  ebuteMetta: 'ironLaneSwitchmen',
  lagosIsland: 'ledgerBureau',
  lekki: 'gatehouseGuard',
  ojuelegba: FINALE_FACTION_ID,
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
  recipe: bossRecipe({ anchor: 'post', callRoles: ['escort', 'runner', 'meleeGuard'] }),
  reinforceMax: 3,
  // the dispatch corridor of the district map (decision WX9): the relays, the convoy lanes and the boss territory, the
  // rest of the city closed by Ring cordons; the human comes in at the west end of the market front
  sectorId: 'oshodi.dispatchCorridor',
  start: [2, 19],
  boss: { name: 'Oga Sunmola', characterId: 'streetBaller', post: [27, 12], radius: 3 },
  crew: [
    { role: 'meleeGuard', name: 'Dispatch Marshal', variant: 'agbero', post: [26, 13], radius: 3 },
    { role: 'rangedAttacker', name: 'Convoy Spotter', variant: 'bottleThrower', post: [29, 12] },
    { role: 'blocker', name: 'Lane Blocker', variant: 'heavyEnforcer', post: [33, 14] },
    { role: 'runner', name: 'Relay Runner', variant: 'areaBoy', post: [24, 14] },
    { role: 'runner', name: 'Relay Runner', variant: 'areaBoy', post: [45, 14] },
    { role: 'escort', name: 'Dispatch Escort', variant: 'ringSecurity', post: [28, 12], radius: 2 },
  ],
  // the four lanes of the main road: convoys run along them
  lanes: [row(15, 0, 62), row(16, 0, 62), row(17, 0, 62), row(18, 0, 62)],
  phases: [
    {
      nodes: [n('r1', 8, 14, 'RELAY 1'), n('r2', 28, 19, 'RELAY 2'), n('r3', 52, 14, 'RELAY 3')],
      goal: 2,
      rearmTicks: ticks(25),
      pulseTicks: ticks(10),
      warnTicks: ticks(3),
      strikeSpan: 12,
      callout: 'Blast two of the three dispatch relays to jam them before the convoys find you.',
    },
    {
      nodes: [
        n('r1', 3, 19, 'RELAY 1'),
        n('r2', 22, 14, 'RELAY 2'),
        n('r3', 40, 19, 'RELAY 3'),
        n('r4', 58, 14, 'RELAY 4'),
      ],
      goal: 3,
      rearmTicks: ticks(20),
      pulseTicks: ticks(7),
      warnTicks: 165,
      strikeSpan: 14,
      crewTicks: ticks(4),
      callout: 'Faster convoys. Runners re-arm jammed relays: blast three and put the runners down.',
    },
    {
      nodes: [
        n('r1', 10, 19, 'RELAY 1'),
        n('r2', 30, 14, 'RELAY 2'),
        n('r3', 46, 19, 'RELAY 3'),
        n('r4', 61, 14, 'RELAY 4'),
      ],
      goal: 4,
      rearmTicks: ticks(40),
      pulseTicks: ticks(5),
      warnTicks: ticks(2.5),
      strikeSpan: 16,
      crewTicks: ticks(4),
      callout: 'Blast all four relays inside the window: every jam wears off after forty seconds.',
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
  recipe: bossRecipe({ anchor: 'lastBroken', callRoles: ['runner', 'meleeGuard'] }),
  reinforceMax: 3,
  boss: { name: 'Madam Ronke', characterId: 'campusQueen', post: [27, 31], radius: 3 },
  crew: [
    { role: 'runner', name: 'Market Runner', variant: 'areaBoy', post: [20, 25] },
    { role: 'runner', name: 'Market Runner', variant: 'areaBoy', post: [30, 10] },
    { role: 'runner', name: 'Market Runner', variant: 'areaBoy', post: [9, 28] },
    { role: 'meleeGuard', name: 'Stall Guard', variant: 'marketEnforcer', post: [26, 30], radius: 3 },
    { role: 'blocker', name: 'Aisle Blocker', variant: 'heavyEnforcer', post: [22, 28] },
  ],
  modifierCrew: { role: 'runner', name: 'Market Runner', variant: 'areaBoy', post: [44, 7] },
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
  recipe: bossRecipe({ anchor: 'post', callRoles: ['objectiveDefender', 'meleeGuard'] }),
  reinforceMax: 3,
  boss: { name: 'Marshal Kobo', characterId: 'lekkiBoy', post: [35, 22], radius: 3 },
  crew: [
    {
      role: 'objectiveDefender',
      name: 'Route Marshal',
      variant: 'routeMarshal',
      post: [11, 23],
      anchor: 0,
      radius: 3,
    },
    {
      role: 'objectiveDefender',
      name: 'Route Marshal',
      variant: 'routeMarshal',
      post: [26, 11],
      anchor: 1,
      radius: 3,
    },
    {
      role: 'objectiveDefender',
      name: 'Route Marshal',
      variant: 'routeMarshal',
      post: [46, 11],
      anchor: 2,
      radius: 3,
    },
    { role: 'meleeGuard', name: 'Toll Guard', variant: 'routeMarshal', post: [34, 22], radius: 3 },
    { role: 'blocker', name: 'Junction Blocker', variant: 'heavyEnforcer', post: [30, 22] },
  ],
  phases: [
    {
      nodes: [
        n('j1', 10, 22, 'JUNCTION 1', { radius: 1 }),
        n('j2', 25, 10, 'JUNCTION 2', { radius: 1 }),
        n('j3', 47, 10, 'JUNCTION 3', { radius: 1 }),
      ],
      goal: 2,
      pulseTicks: ticks(9),
      warnTicks: ticks(3),
      strikeSpan: 6,
      callout: 'Blast the toll box of two of the three junctions. A marshal inside the zone shields it.',
    },
    {
      nodes: [
        n('j1', 6, 5, 'JUNCTION 1', { radius: 1 }),
        n('j2', 33, 22, 'JUNCTION 2', { radius: 1 }),
        n('j3', 27, 27, 'JUNCTION 3', { radius: 1 }),
      ],
      goal: 3,
      pulseTicks: ticks(7),
      warnTicks: 165,
      strikeSpan: 7,
      callout: 'Blast all three toll boxes. A broken box switches its marshal strikes off.',
    },
    {
      nodes: [
        n('j1', 10, 22, 'JUNCTION 1', { radius: 1 }),
        n('j2', 25, 10, 'JUNCTION 2', { radius: 1 }),
        n('j3', 47, 10, 'JUNCTION 3', { radius: 1 }),
      ],
      goal: 3,
      rearmTicks: ticks(35),
      pulseTicks: ticks(5),
      warnTicks: ticks(2.5),
      strikeSpan: 8,
      callout: 'Break all three inside the window: a broken box is rebuilt after thirty-five seconds.',
    },
  ],
};

// ------------------------------------------------------------------ Ebute-Metta: dispatch windows

// The arena grew westward (EBUTE_WEST_DX columns, docs/EBUTE_METTA_WEST.md): every Ebute tile below is authored in the
// ORIGINAL board's coordinates and shifted with `ebuteX`.
const EBUTE: MissionDef = {
  id: 'ebuteMetta',
  arenaId: 'rumbleEbuteMetta',
  objective: 'dispatchWindows',
  factionId: FACTION_IDS.ebuteMetta,
  timeLimitSec: 480,
  parSec: 330,
  recipe: bossRecipe({ anchor: 'post', callRoles: ['runner', 'objectiveDefender'] }),
  reinforceMax: 3,
  boss: { name: 'Ikenna Wayside', characterId: 'streetBaller', post: [ebuteX(30), 28], radius: 3 },
  crew: [
    {
      role: 'objectiveDefender',
      name: 'Signal Guard',
      variant: 'ringSecurity',
      post: [ebuteX(25), 13],
      anchor: 0,
      radius: 3,
    },
    {
      role: 'objectiveDefender',
      name: 'Signal Guard',
      variant: 'ringSecurity',
      post: [ebuteX(28), 22],
      anchor: 2,
      radius: 3,
    },
    { role: 'runner', name: 'Yard Runner', variant: 'areaBoy', post: [ebuteX(31), 27] },
    { role: 'blocker', name: 'Platform Blocker', variant: 'heavyEnforcer', post: [ebuteX(29), 20] },
    { role: 'supportUnit', name: 'Yard Hand', variant: 'agbero', post: [ebuteX(31), 28], radius: 3 },
  ],
  phases: [
    {
      nodes: [
        n('d1', ebuteX(25), 12, 'SWITCH 1'),
        n('d2', ebuteX(28), 15, 'SWITCH 2'),
        n('d3', ebuteX(25), 23, 'SWITCH 3'),
      ],
      goal: 2,
      cycleTicks: ticks(25),
      openTicks: ticks(10),
      warnTicks: ticks(4),
      callout: 'Blast two of the three switches, but only while the rail window is open.',
    },
    {
      nodes: [
        n('d1', ebuteX(25), 10, 'SWITCH 1'),
        n('d2', ebuteX(28), 13, 'SWITCH 2'),
        n('d3', ebuteX(25), 21, 'SWITCH 3'),
        n('d4', ebuteX(28), 24, 'SWITCH 4'),
      ],
      goal: 3,
      cycleTicks: ticks(22),
      openTicks: ticks(8),
      warnTicks: 225,
      callout: 'Shorter windows. Blast three switches; the yard crew stands in your way.',
    },
    {
      nodes: [
        n('d1', ebuteX(25), 12, 'SWITCH 1'),
        n('d2', ebuteX(28), 14, 'SWITCH 2'),
        n('d3', ebuteX(25), 22, 'SWITCH 3'),
        n('d4', ebuteX(28), 25, 'SWITCH 4'),
      ],
      goal: 4,
      // 40 s (was 25 with the stand-to-throw switches): a blast needs its fuse inside a window (decision BX4)
      rearmTicks: ticks(40),
      cycleTicks: ticks(20),
      openTicks: ticks(7),
      warnTicks: 216,
      callout: 'Blast all four switches inside forty seconds: they reset when the dispatcher recovers.',
    },
  ],
};

// ------------------------------------------------------------------ Lagos Island: evidence run

const LAGOS: MissionDef = {
  id: 'lagosIsland',
  arenaId: 'rumbleLagosIsland',
  objective: 'evidenceRun',
  factionId: FACTION_IDS.lagosIsland,
  timeLimitSec: 480,
  parSec: 320,
  recipe: bossRecipe({ anchor: 'post', callRoles: ['meleeGuard', 'objectiveDefender'] }),
  reinforceMax: 3,
  boss: { name: 'Barrister Quill', characterId: 'campusQueen', post: [29, 20], radius: 3 },
  crew: [
    {
      role: 'objectiveDefender',
      name: 'Auditor',
      variant: 'marketEnforcer',
      post: [11, 9],
      anchor: 0,
      radius: 3,
    },
    {
      role: 'objectiveDefender',
      name: 'Auditor',
      variant: 'marketEnforcer',
      post: [31, 28],
      anchor: 1,
      radius: 3,
    },
    { role: 'meleeGuard', name: 'Records Guard', variant: 'ringSecurity', post: [28, 21], radius: 3 },
    { role: 'bossAssistant', name: 'Audit Assistant', variant: 'heavyEnforcer', post: [28, 19] },
    { role: 'supportUnit', name: 'Clerk', variant: 'bottleThrower', post: [30, 21], radius: 3 },
  ],
  phases: [
    {
      nodes: [n('l1', 10, 8, 'LEDGER 1'), n('l2', 6, 14, 'LEDGER 2'), n('l3', 14, 21, 'LEDGER 3')],
      press: { x: 4, y: 21 },
      goal: 2,
      holdTicks: 1,
      pulseTicks: ticks(9),
      warnTicks: ticks(3),
      strikeSpan: 1,
      callout:
        'Blast a ledger cabinet open, then carry the ledger to the press drop. Auditors chase the carrier.',
    },
    {
      nodes: [
        n('l1', 21, 8, 'LEDGER 1'),
        n('l2', 40, 6, 'LEDGER 2'),
        n('l3', 30, 28, 'LEDGER 3'),
        n('l4', 45, 21, 'LEDGER 4'),
      ],
      // (was 30,21, one step from the boss's post: under the blast verbs the delivery moved out of his guard ring, BX7)
      press: { x: 31, y: 28 },
      goal: 3,
      holdTicks: 1,
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
      goal: 3, // (was 4: every ledger now takes a blast to free it as well as the carry, decision BX7)
      holdTicks: 1,
      pulseTicks: ticks(5),
      warnTicks: ticks(2.5),
      strikeSpan: 1,
      carryLimitTicks: ticks(45),
      callout: 'Three ledgers to the far press. A carried ledger is lost after forty-five seconds.',
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
  recipe: bossRecipe({ anchor: 'lastBroken', callRoles: ['escort', 'objectiveDefender', 'meleeGuard'] }),
  reinforceMax: 3,
  boss: { name: 'Steward Halcyon', characterId: 'lekkiBoy', post: [35, 8], radius: 3 },
  crew: [
    {
      role: 'objectiveDefender',
      name: 'Security Contractor',
      variant: 'ringSecurity',
      post: [20, 10],
      anchor: 0,
      radius: 3,
    },
    {
      role: 'objectiveDefender',
      name: 'Security Contractor',
      variant: 'ringSecurity',
      post: [43, 10],
      anchor: 2,
      radius: 3,
    },
    { role: 'rangedAttacker', name: 'Perimeter Marksman', variant: 'bottleThrower', post: [37, 9] },
    { role: 'meleeGuard', name: 'Gate Guard', variant: 'ringSecurity', post: [34, 8], radius: 3 },
    { role: 'bossAssistant', name: 'Controller Aide', variant: 'heavyEnforcer', post: [36, 9] },
    { role: 'escort', name: 'Estate Escort', variant: 'ringSecurity', post: [35, 9], radius: 2 },
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
      warnTicks: ticks(3),
      strikeSpan: 1,
      callout: 'Blast the private systems in the signalled order. A wrong blast calls a strike.',
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
      pulseTicks: ticks(7),
      warnTicks: ticks(2.5),
      strikeSpan: 1,
      callout: 'The full blackout order. One wrong blast resets the whole sequence.',
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
  // the Ojuelegba finale's boss, "Break the Ring" (decisions FN1-FN10; data in finaleDefs.ts)
  ojuelegba: OJUELEGBA_BOSS,
};

/** The City Rumble arena a mission is played on. */
export function getMissionArenaId(id: MissionId): string {
  return MISSION_DEFS[id].arenaId;
}
