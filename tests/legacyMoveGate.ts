/**
 * VERBATIM copy of src/input/moveGate.ts as it was before assisted movement (git c84d9df), kept only so the tests
 * can prove that "assist off" behaves exactly like it. Do not edit.
 */
import type { Dir } from '../src/sim';
import {
  MOVE_BUFFER_TICKS,
  MOVE_REPEAT_DELAY_TICKS,
  TURN_BUFFER_TILES,
  TURN_CONTINUE_TICKS,
} from '../src/input/moveGate';

const PERPENDICULAR: Readonly<Record<Dir, readonly Dir[]>> = {
  up: ['left', 'right'],
  down: ['left', 'right'],
  left: ['up', 'down'],
  right: ['up', 'down'],
};

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
export class LegacyMoveGate {
  private pending: { dir: Dir; expires: number } | null = null;
  private readonly since = new Map<Dir, number>();
  private last: { dir: Dir; tick: number } | null = null;
  private carried = 0;

  /** A direction went down (keydown, pointer-down, D-pad edge). */
  press(dir: Dir, tick: number): void {
    this.since.set(dir, tick);
    this.pending = { dir, expires: tick + MOVE_BUFFER_TICKS };
    this.carried = 0;
  }

  /**
   * @param held   direction to repeat, or null
   * @param active every direction currently down (a held key keeps its original press time if another is released)
   * @param canMove whether the simulation will read the move this tick
   * @param legal  optional: would a move this way do anything right now (step, kick, ...)? Enables the turn buffer.
   */
  next(
    tick: number,
    held: Dir | null,
    active: ReadonlySet<Dir>,
    canMove: boolean,
    legal?: (dir: Dir) => boolean,
  ): Dir | null {
    for (const dir of [...this.since.keys()]) if (!active.has(dir)) this.since.delete(dir);
    if (held && !this.since.has(held)) this.since.set(held, tick); // already down when we first saw it

    if (this.pending && tick > this.pending.expires) this.pending = null;
    if (this.pending && canMove) {
      const dir = this.pending.dir;
      const carry = legal ? this.carryFor(dir, tick, active, legal) : null;
      if (carry) {
        // keep the turn for the next tile; walk on one tile the way we were going
        this.carried++;
        this.pending = { dir, expires: tick + TURN_CONTINUE_TICKS };
        return this.deliver(carry, tick);
      }
      this.pending = null;
      this.carried = 0;
      return this.deliver(dir, tick);
    }
    if (held && tick - this.since.get(held)! >= MOVE_REPEAT_DELAY_TICKS)
      return canMove ? this.deliver(held, tick) : held;
    return null;
  }

  /** The direction to keep walking while a blocked corner turn waits, or null to deliver the turn now. */
  private carryFor(dir: Dir, tick: number, active: ReadonlySet<Dir>, legal: (d: Dir) => boolean): Dir | null {
    const last = this.last;
    if (!last || tick - last.tick > TURN_CONTINUE_TICKS) return null; // not walking: no carrying
    if (this.carried >= TURN_BUFFER_TILES || !PERPENDICULAR[dir].includes(last.dir)) return null;
    if (!active.has(dir) || legal(dir) || !legal(last.dir)) return null;
    return last.dir;
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
  }
}
