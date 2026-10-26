/**
 * Assisted movement (decisions RE-A1..): pure, deterministic helpers that make a thumb easier to steer
 * around corners, obstacles and generators WITHOUT touching the simulation's grid rules.
 *
 * The simulation stays orthogonal, one tile per step. The assist only chooses WHICH of the four
 * directions the input layer hands over on a tick, and only from the same information a player sees:
 *
 *  - turn planning: a turn pressed early is carried along the corridor to the first tile where it opens
 *    (`planTurn`);
 *  - sidestep: a direction held against a wall, with the opening one tile along the corridor (`planSidestep`);
 *  - thumb wish: a diagonal thumb's secondary axis is taken at the first legal junction (`canStep`).
 *
 * Every move the assist substitutes or continues on the player's behalf must be a plain step onto open
 * floor (never a kick or a jump), and must not enter anything dangerous (`MoveBoard.safe`): a flame, a
 * generator or its blast footprint, a warned or live lethal stage event, a Wahala Crush warning, a floor
 * trap, a manhole or an attack vehicle's route. The direction the player explicitly holds is never
 * second-guessed by that rule: the assist adds help, it never removes control.
 *
 * Reads the game state, never changes it.
 */
import { DIR_VEC, OPPOSITE, Tile, isLethalStageEvent, manholePartners, previewBlast } from '../sim';
import type { Dir, GameState, Player } from '../sim';
import type { InputSourceName } from './types';

/** The Settings value: Auto = assisted on touch, the plain WA2 behaviour with the keyboard / gamepad. */
export type MoveAssistSetting = 'auto' | 'on' | 'off';
export const MOVE_ASSIST_SETTINGS: readonly MoveAssistSetting[] = ['auto', 'on', 'off'];

/**
 * What the input layer actually does this tick:
 *  - `off`   exactly the behaviour before assisted movement (the WA2 one-tile corner buffer, nothing more);
 *  - `basic` the same, plus the danger check on a carried tile (keyboard / gamepad under Auto);
 *  - `full`  early-turn planning, sidestep, the diagonal wish and direction-switch settling.
 */
export type AssistLevel = 'off' | 'basic' | 'full';

export function resolveAssistLevel(setting: MoveAssistSetting, device: InputSourceName): AssistLevel {
  if (setting === 'off') return 'off';
  if (setting === 'on') return 'full';
  return device === 'touch' ? 'full' : 'basic';
}

/** How many tiles ahead a turn pressed early is looked for (full assistance). */
export const TURN_REACH_TILES = 2;
/** A thumb switching straight from one direction to another waits this long, so a swipe through the stick centre cannot leak a stray step. */
export const SWITCH_SETTLE_TICKS = 2;

export const PERPENDICULAR: Readonly<Record<Dir, readonly [Dir, Dir]>> = {
  up: ['left', 'right'],
  down: ['left', 'right'],
  left: ['up', 'down'],
  right: ['up', 'down'],
};

/**
 * The player's surroundings as the assist sees them. All coordinates are tiles; directions are the
 * INPUT directions (an inverted-controls curse is folded into `vec`, so planning matches what the
 * simulation will really do with the intent).
 */
export interface MoveBoard {
  /** The player's tile. */
  readonly x: number;
  readonly y: number;
  /** A plain step may enter this tile: inside the board, bare floor, no grounded generator. */
  open(x: number, y: number): boolean;
  /** The tile holds a soft block (a crate): the assist never slides away from one the player may want to bomb. */
  soft(x: number, y: number): boolean;
  /** An assisted move may enter this tile: no flame, generator footprint, warned hazard ... */
  safe(x: number, y: number): boolean;
  /** Where one step with this input direction goes. */
  vec(dir: Dir): { dx: number; dy: number };
}

/** Plain step onto open, safe floor (the only kind of move the assist ever makes by itself). */
export function canStep(board: MoveBoard, dir: Dir, fromX = board.x, fromY = board.y): boolean {
  const v = board.vec(dir);
  const x = fromX + v.dx;
  const y = fromY + v.dy;
  return board.open(x, y) && board.safe(x, y);
}

/**
 * Early turn: the player walks `walking` and holds `want` (perpendicular), but `want` is blocked here.
 * Returns how many more tiles along `walking` (1..reach) bring them to the first tile where `want` is a
 * plain, safe step - every tile on the way open and safe - or null when there is none in reach.
 */
export function planTurn(board: MoveBoard, walking: Dir, want: Dir, reach: number): number | null {
  let x = board.x;
  let y = board.y;
  const w = board.vec(walking);
  for (let k = 1; k <= reach; k++) {
    x += w.dx;
    y += w.dy;
    if (!board.open(x, y) || !board.safe(x, y)) return null;
    if (canStep(board, want, x, y)) return k;
  }
  return null;
}

/**
 * Sidestep: `held` is blocked and the player keeps pushing it. Returns the perpendicular direction whose
 * neighbouring tile is a safe step AND from where `held` is a safe step (the opening one tile along the
 * corridor), or null when there is none, when both sides qualify and `prefer` cannot tell them apart, or
 * when the obstacle is a crate (a player pressed against one is usually about to bomb it).
 */
export function planSidestep(
  board: MoveBoard,
  held: Dir,
  prefer: readonly (Dir | null | undefined)[],
): Dir | null {
  const f = board.vec(held);
  if (board.soft(board.x + f.dx, board.y + f.dy)) return null;
  const options = PERPENDICULAR[held].filter((side) => {
    if (!canStep(board, side)) return false;
    const s = board.vec(side);
    return canStep(board, held, board.x + s.dx, board.y + s.dy);
  });
  if (options.length === 1) return options[0]!;
  if (options.length === 2) return prefer.find((d): d is Dir => !!d && options.includes(d)) ?? null;
  return null;
}

// ------------------------------------------------------------------ the board, from the real game state

/** Tile indices an assisted step must stay out of, computed from public state only. */
export function hazardTiles(state: GameState): Set<number> {
  const bad = new Set<number>();
  const at = (x: number, y: number): number => y * state.width + x;
  for (const f of state.flames) bad.add(at(f.x, f.y));
  for (const g of state.generators) {
    if (g.flight !== null) continue;
    bad.add(at(g.x, g.y));
    // an armed generator (timed or remote) and anything it would chain into
    if (g.mode !== 'disabled') for (const i of previewBlast(state, g)) bad.add(i);
  }
  for (const c of state.crush?.pending ?? []) bad.add(c.index);
  for (const e of state.stage.events) {
    if (isLethalStageEvent(e) || e.kind === 'drop') for (const i of e.tiles) bad.add(i);
  }
  for (const key in state.floorHazards) bad.add(Number(key));
  for (const w of state.endgameTraps.warnings) bad.add(w.index);
  for (const v of state.vehicles) {
    if (v.phase === 'crashing') continue;
    for (const t of v.route) bad.add(at(t.x, t.y));
  }
  for (const i of manholePartners(state).keys()) bad.add(i);
  return bad;
}

/** The assist's read-only view of `me` in `state`. The hazard set is built on first use (most ticks never need it). */
export function buildMoveBoard(state: GameState, me: Player): MoveBoard {
  const inverted = me.curse?.kind === 'inverted' && state.tick < me.curse.until;
  let bad: Set<number> | null = null;
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < state.width && y < state.height;
  return {
    x: me.x,
    y: me.y,
    open: (x, y) =>
      inside(x, y) &&
      state.tiles[y * state.width + x] === Tile.Empty &&
      !state.generators.some((g) => g.carriedBy === null && g.flight === null && g.x === x && g.y === y),
    soft: (x, y) => inside(x, y) && state.tiles[y * state.width + x] === Tile.Soft,
    safe: (x, y) => {
      if (!inside(x, y)) return false;
      bad ??= hazardTiles(state);
      return !bad.has(y * state.width + x);
    },
    vec: (dir) => DIR_VEC[inverted ? OPPOSITE[dir] : dir],
  };
}
