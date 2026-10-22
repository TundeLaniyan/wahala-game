import type { Dir } from '../sim';

/** A press arriving up to this long before the player can step is remembered (one move, never a queue). */
export const MOVE_BUFFER_TICKS = 10;
/** A direction must be held this long before it auto-repeats; shorter presses are single taps. */
export const MOVE_REPEAT_DELAY_TICKS = 12;

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
 *  - releasing stops repeating immediately and nothing is carried over.
 */
export class MoveGate {
  private pending: { dir: Dir; expires: number } | null = null;
  private readonly since = new Map<Dir, number>();

  /** A direction went down (keydown, pointer-down, D-pad edge). */
  press(dir: Dir, tick: number): void {
    this.since.set(dir, tick);
    this.pending = { dir, expires: tick + MOVE_BUFFER_TICKS };
  }

  /**
   * @param held   direction to repeat, or null
   * @param active every direction currently down (a held key keeps its original press time if another is released)
   * @param canMove whether the simulation will read the move this tick
   */
  next(tick: number, held: Dir | null, active: ReadonlySet<Dir>, canMove: boolean): Dir | null {
    for (const dir of [...this.since.keys()]) if (!active.has(dir)) this.since.delete(dir);
    if (held && !this.since.has(held)) this.since.set(held, tick); // already down when we first saw it

    if (this.pending && tick > this.pending.expires) this.pending = null;
    if (this.pending && canMove) {
      const dir = this.pending.dir;
      this.pending = null;
      return dir;
    }
    if (held && tick - this.since.get(held)! >= MOVE_REPEAT_DELAY_TICKS) return held;
    return null;
  }

  /** Drops everything (menus, pause, new match, lost focus). */
  clear(): void {
    this.pending = null;
    this.since.clear();
  }
}
