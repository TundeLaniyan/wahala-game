/**
 * Data model of the WAHALA! Training Academy. Everything here is pure: a lesson builds a real simulation
 * state with `createGame` (plus programmatic scenario setup) and either drives it with a deterministic
 * script of the same `Intent`s a player sends (the demonstration) or hands player 0 to the human and
 * watches the real state and events tick by tick (the practice). Nothing in this folder may import outside
 * `src/sim`.
 */
import type {
  CharacterId,
  Dir,
  GameState,
  Intents,
  SimEvent,
  TilePos,
  VehicleEntry,
  VehicleTurn,
} from '../sim';

/** One-shot buttons a scripted actor can press (the same fields a human's Intent sets). */
export type ScriptButton = 'place' | 'special' | 'detonate' | 'action' | 'skill' | 'disarm';

/**
 * Vehicle-entry selector operations (legacy manual route choice). The V2 lessons use the one-press
 * vehicle (button B) instead; kept so a scenario can still drive the selector if one ever needs it.
 */
export type UiCommand =
  | { kind: 'vehiclePress' }
  | { kind: 'nav'; command: 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' }
  | { kind: 'pickEntry'; entry: VehicleEntry }
  | { kind: 'pickTurn'; turn: VehicleTurn };

export type UntilTest = (state: GameState, seen: readonly SimEvent[]) => boolean;

/** One scripted action of one actor. */
export type Act =
  /** Walk `tiles` steps in `dir` (holds the direction like a player would). */
  | { kind: 'walk'; dir: Dir; tiles: number }
  /** A single move press: walks one tile if it is free, otherwise just turns to face it (or touches a generator). */
  | { kind: 'bump'; dir: Dir }
  | { kind: 'press'; button: ScriptButton }
  | { kind: 'wait'; ticks: number }
  /** Waits until the test passes (events seen since this act started are passed in). */
  | { kind: 'until'; test: UntilTest; max: number; label: string }
  /** Local player only: operate the vehicle-entry selector. */
  | { kind: 'ui'; command: UiCommand }
  /** Scene direction (e.g. "skip ahead to 0:47"); always announced by the beat caption. */
  | { kind: 'do'; run: (state: GameState) => void };

/** A caption plus the actions that happen while it is shown. */
export interface Beat {
  caption: string;
  /** Optional step label, e.g. "Step 3 of 6". */
  step?: string;
  /** Actions per player id; all actors run in parallel. */
  acts?: Record<number, Act[]>;
  /** Minimum ticks the caption stays up (default: reading time of the caption). */
  hold?: number;
}

export interface DemoDef {
  /** Builds the starting state (deterministic). */
  build(): GameState;
  beats: Beat[];
}

/** What a practice detector sees after every simulation tick. */
export interface PracticeContext {
  state: GameState;
  /** Events of the tick that just ran. */
  events: readonly SimEvent[];
  /** Intents that were applied in that tick. */
  intents: Intents;
  localId: number;
}

/** A per-run test: `create` returns fresh memory; the test answers every tick. */
export interface Detector {
  create(): (ctx: PracticeContext) => boolean;
}

/**
 * Gentle corrective guidance: each tick the test returns the tip to show when it spots a common mistake,
 * else null (the practice carries on).
 */
export interface Mistake {
  id: string;
  create(): (ctx: PracticeContext) => string | null;
}

/**
 * A failure of the task besides being caught (returns its explanation, else null): the attempt restarts
 * from the latest checkpoint.
 */
export interface Failure {
  id: string;
  create(): (ctx: PracticeContext) => string | null;
}

/** Approved voice-clip triggers the Academy may cue (narration setting). Only triggers that have clips. */
export type CueTrigger =
  'ON_GENERATOR_CRITICAL_PROXIMITY' | 'ON_PLAYER_NARROW_ESCAPE' | 'ON_GENERATOR_DETONATE';

/**
 * Control ids the lesson panel and task hints refer to. The V2 human controls are exactly: the move
 * stick / keys, button A (place), button B tap (special) and button B hold (Remote Detonator).
 */
export type ControlId = 'move' | 'place' | 'special' | 'detonate' | 'pause' | 'camera';

/** One step of a practice: an objective the simulation has to see happen. */
export interface TaskDef {
  id: string;
  /** Short checklist label. */
  label: string;
  /**
   * The instruction shown while the task is active. Tokens are resolved per device from the real
   * control bindings: `{A}`, `{B}`, `{holdB}`, `{move}` (see hints.ts).
   */
  instruction: string;
  /** Controls this task is about (highlighted in the legend and on the touch layout). */
  controls?: ControlId[];
  /** Floor markers to show while the task is active (rendered as glowing rings on the board). */
  markers?: (state: GameState, localId: number) => TilePos[];
  /** The task is complete when this detector passes. */
  done: Detector;
  /** Common mistakes and the tip each one shows. */
  mistakes?: Mistake[];
  /** Task-specific failures (being caught is always one unless the practice allows respawns). */
  failures?: Failure[];
  /** On a failure the attempt restarts from the state at the start of the latest checkpoint task. */
  checkpoint?: boolean;
  /** Shown briefly when the task is done. */
  praise?: string;
  /** Skip the generic "you are on a red tile" tip (tasks that ask you to stand in a blast). */
  noLaneTip?: boolean;
  /** Optional approved voice cues (narration setting). */
  cue?: { start?: CueTrigger; done?: CueTrigger };
}

export interface PracticeDef {
  /** Builds the practice state for the chosen character (the human is always player 0). */
  build(character: CharacterId): GameState;
  tasks: TaskDef[];
  /** The player picks a character inside the practice (vehicle lesson); otherwise their menu choice is used. */
  characterChoice?: boolean;
  /** Scripted (harmless) opponents: acts per actor id, started with the practice. */
  opponents?: Record<number, Act[]>;
  /**
   * What being caught means: 'retry' (default) restarts from the latest checkpoint; 'respawn' lets the
   * respawn rules of the scenario bring the player back (Deathmatch / Team lessons).
   */
  onCaught?: 'retry' | 'respawn';
}

export type CourseId = 'beginner' | 'power' | 'tricks' | 'combat' | 'modes';

export interface Course {
  id: CourseId;
  title: string;
  blurb: string;
}

export interface Lesson {
  id: string;
  course: CourseId;
  title: string;
  /** One line for the lesson list. */
  summary: string;
  /** Step 1: what the player will learn to do (shown first, and above the demo and the practice). */
  objective: string;
  /** Key facts shown in the panel (always true statements about the real game). */
  facts: string[];
  controls: ControlId[];
  /** Step 2: a brief demonstration in the real engine. */
  demo: DemoDef;
  /** Steps 3-7: the human's attempt, checked against the real simulation. */
  practice: PracticeDef;
}
