import type { Dir } from '../sim';
import { PERPENDICULAR, TURN_REACH_TILES, canStep, planSidestep, planTurn } from './moveAssist';
import type { AssistLevel, MoveBoard } from './moveAssist';

/** A press arriving up to this long before the player can step is remembered (one move, never a queue). */
export const MOVE_BUFFER_TICKS = 10;
/** A direction must be held this long before it auto-repeats; shorter presses are single taps. */
export const MOVE_REPEAT_DELAY_TICKS = 12;
/**
 * Corner-turn buffer (decision WA2): a turn pressed one tile too early is carried for at most this many
 * tiles along the way the player was already walking, then taken as soon as it is legal.
 */
export const TURN_BUFFER_TILES = 1;
/** "Already walking": a move was handed over at most this long ago (a step is 5-13 ticks). */
export const TURN_CONTINUE_TICKS = 18;

/**
 * Assisted movement for one `next` call (see `moveAssist.ts`). Without it the gate behaves exactly as it
 * did before assisted movement. `board` is lazy: most ticks never need it.
 */
export interface GateAssist {
  level: Exclude<AssistLevel, 'off'>;
  board(): MoveBoard;
  /** Diagonal thumb: the secondary axis, taken as a turn at the first legal junction. */
  wish?: Dir | null;
}

/**
 * Turns "which direction buttons are down" into the per-tick `Intent.move` the simulation expects.
 *
 * The simulation is level-triggered: while `move` is set it starts a new step the instant the previous
 * one ends. Feeding it the raw held state therefore turns every press that outlasts one step into two,
 * and any grace period after release adds another. The gate makes input edge-triggered instead:
 *
 *  - a press is one request, delivered on the first tick the player can step, then discarded whether
 *    or not it produced a step (wall, kick, ...). A later press replaces an undelivered one, so at most
 *    one move is ever buffered, and it expires after `MOVE_BUFFER_TICKS`;
 *  - a direction still held `MOVE_REPEAT_DELAY_TICKS` after its press repeats at the player's own step
 *    cadence (speed upgrades and the Okada bonus apply) until it is released;
 *  - releasing stops repeating immediately and nothing is carried over;
 *  - corner turns (when the caller passes `legal`): a perpendicular turn that is blocked right now, made
 *    while walking and still held, keeps the player walking the way they were going for at most
 *    `TURN_BUFFER_TILES` tile(s) and is taken on the first tile where it is legal. Every hand-over is
 *    still exactly one step; a turn that never opens up is simply delivered (the player faces the wall
 *    and stops, as before) - never a skipped tile, never a turn the player did not ask for.
 */
export class MoveGate {
  private pending: { dir: Dir; expires: number; notBefore: number } | null = null;
  private readonly since = new Map<Dir, number>();
  private last: { dir: Dir; tick: number } | null = null;
  private carried = 0;
  /** The diagonal wish was already taken since the primary direction last moved the player (alternate: wish, primary, wish ...). */
  private wishTaken = false;

  /**
   * A direction went down (keydown, pointer-down, D-pad edge).
   * @param settle ticks to wait before the press may be handed over (a thumb switching direction, so a swipe through the centre can still be overwritten)
   */
  press(dir: Dir, tick: number, settle = 0): void {
    this.since.set(dir, tick);
    this.pending = { dir, expires: tick + MOVE_BUFFER_TICKS, notBefore: tick + settle };
    this.carried = 0;
    this.wishTaken = false;
  }

  /**
   * @param held   direction to repeat, or null
   * @param active every direction currently down (a held key keeps its original press time if another is released)
   * @param canMove whether the simulation will read the move this tick
   * @param legal  optional: would a move this way do anything right now (step, kick, ...)? Enables the turn buffer.
   * @param assist optional: assisted movement (see `GateAssist`); needs `legal`
   */
  next(
    tick: number,
    held: Dir | null,
    active: ReadonlySet<Dir>,
    canMove: boolean,
    legal?: (dir: Dir) => boolean,
    assist?: GateAssist,
  ): Dir | null {
    for (const dir of [...this.since.keys()]) if (!active.has(dir)) this.since.delete(dir);
    if (held && !this.since.has(held)) this.since.set(held, tick); // already down when we first saw it

    if (this.pending && tick > this.pending.expires) this.pending = null;
    if (this.pending && canMove && tick >= this.pending.notBefore) {
      const { dir, notBefore } = this.pending;
      const carry = legal ? this.carryFor(dir, tick, active, legal, assist) : null;
      if (carry) {
        // keep the turn for the next tile; walk on one tile the way we were going
        this.carried++;
        this.pending = { dir, expires: tick + TURN_CONTINUE_TICKS, notBefore };
        return this.deliver(carry, tick);
      }
      const delayed = this.carried > 0;
      this.pending = null;
      this.carried = 0;
      // a turn the assist waited for is not taken blindly: never into a danger that appeared meanwhile
      // (the player's own explicit hold still goes through the repeat path below)
      if (delayed && assist && !canStep(assist.board(), dir)) return null;
      return this.deliver(dir, tick);
    }
    if (held && tick - this.since.get(held)! >= MOVE_REPEAT_DELAY_TICKS) {
      if (!canMove) return held;
      return this.deliver(
        assist?.level === 'full' && legal ? this.assistHold(held, legal, assist) : held,
        tick,
      );
    }
    return null;
  }

  /**
   * The direction to keep walking while a blocked corner turn waits, or null to deliver the turn now.
   * Before assisted movement: one tile, unconditionally (WA2). Basic adds the danger check on that tile; full
   * plans ahead and only carries when the turn really opens within `TURN_REACH_TILES`.
   */
  private carryFor(
    dir: Dir,
    tick: number,
    active: ReadonlySet<Dir>,
    legal: (d: Dir) => boolean,
    assist?: GateAssist,
  ): Dir | null {
    const last = this.last;
    if (!last || tick - last.tick > TURN_CONTINUE_TICKS) return null; // not walking: no carrying
    if (!PERPENDICULAR[dir].includes(last.dir)) return null;
    if (!active.has(dir) || legal(dir) || !legal(last.dir)) return null;
    if (assist?.level === 'full') {
      const reach = TURN_REACH_TILES - this.carried;
      return reach > 0 && planTurn(assist.board(), last.dir, dir, reach) !== null ? last.dir : null;
    }
    if (this.carried >= TURN_BUFFER_TILES) return null;
    if (assist && !canStep(assist.board(), last.dir)) return null;
    return last.dir;
  }

  /**
   * A direction held long enough to repeat (full assistance): the player's own direction, unless
   *  1. the thumb is diagonal and its secondary axis is a safe step here - the turn the thumb asked for, taken at
   *     the first legal junction (then the primary direction gets its step before the wish is taken again);
   *  2. the direction is blocked by a wall and the opening is one tile along the corridor (a sidestep).
   */
  private assistHold(held: Dir, legal: (d: Dir) => boolean, assist: GateAssist): Dir {
    const board = assist.board();
    const wish = assist.wish ?? null;
    if (wish && wish !== held && PERPENDICULAR[held].includes(wish) && canStep(board, wish)) {
      if (!this.wishTaken || !legal(held)) {
        this.wishTaken = true;
        return wish;
      }
    }
    this.wishTaken = false;
    if (legal(held)) return held;
    return planSidestep(board, held, [wish, this.last?.dir]) ?? held;
  }

  private deliver(dir: Dir, tick: number): Dir {
    this.last = { dir, tick };
    return dir;
  }

  /** Drops everything (menus, pause, new match, lost focus). */
  clear(): void {
    this.pending = null;
    this.since.clear();
    this.last = null;
    this.carried = 0;
    this.wishTaken = false;
  }
}
