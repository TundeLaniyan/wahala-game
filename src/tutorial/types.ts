/**
 * Data model of the How to Play tutorial. Everything here is pure: a chapter builds a real simulation
 * state with `createGame` (plus programmatic setup) and drives it with a deterministic script of the
 * same `Intent`s a player sends. Nothing in this folder may import outside `src/sim`.
 */
import type { CharacterId, Dir, GameState, Intents, SimEvent, VehicleEntry, VehicleTurn } from '../sim';

/** One-shot buttons a scripted actor can press (the same fields a human's Intent sets). */
export type ScriptButton = 'place' | 'action' | 'skill' | 'detonate' | 'disarm';

/**
 * What the local player's vehicle-entry selector is told during a demo. These are the exact
 * operations a human performs on it: the vehicle button, the arrow keys / D-pad, confirm / back,
 * and tapping (or clicking) a glowing entrance or turn marker.
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
  /** A single move press: walks one tile if it is free, otherwise just turns to face it (or kicks). */
  | { kind: 'bump'; dir: Dir }
  | { kind: 'press'; button: ScriptButton }
  | { kind: 'wait'; ticks: number }
  /** Waits until the test passes (events seen since this act started are passed in). */
  | { kind: 'until'; test: UntilTest; max: number; label: string }
  /** Local player only: operate the vehicle-entry selector. */
  | { kind: 'ui'; command: UiCommand }
  /** Scene direction (e.g. "skip ahead to 0:16"); always announced by the beat caption. */
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

export interface PracticeContext {
  state: GameState;
  /** Events of the tick that just ran. */
  events: readonly SimEvent[];
  /** Intents that were applied in that tick. */
  intents: Intents;
  localId: number;
}

/** A practice goal: `create` returns a fresh per-run test that stays satisfied once it passed. */
export interface PracticeCheck {
  label: string;
  create(): (ctx: PracticeContext) => boolean;
}

export interface PracticeDef {
  goal: string;
  /** Short tip shown under the goal. */
  hint: string;
  /** Builds the practice state for the chosen character (the human is always player 0). */
  build(character: CharacterId): GameState;
  checks(character: CharacterId): PracticeCheck[];
  /** The player picks a character inside the practice (vehicle lesson); otherwise their menu choice is used. */
  characterChoice?: boolean;
}

/** Which rows of the controls legend a chapter shows. */
export type ControlId =
  | 'move'
  | 'place'
  | 'action'
  | 'skill'
  | 'detonate'
  | 'vehicle'
  | 'entryChoose'
  | 'entryConfirm'
  | 'entryBack'
  | 'pause'
  | 'camera';

export interface Chapter {
  id: string;
  title: string;
  /** One line for the chapter list. */
  summary: string;
  /** Key facts shown beside the demo (always true statements about the real game). */
  facts: string[];
  controls: ControlId[];
  demo: DemoDef;
  practice?: PracticeDef;
}
