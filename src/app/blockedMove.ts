/**
 * "That way is blocked" feedback for a classic raid (decision TN3). A move request that the simulation will refuse - a
 * wall, a pillar, a crate, a barrel, another fighter - is turned into one small cue (a direction and a counter) that the
 * renderer plays as a short bump of the fighter. Presentation only: the simulation is not asked for anything new, it
 * is the same `moveWouldAct` read the input layer already uses, taken on the tick the request is handed over.
 *
 * A request pushed against the same obstacle repeats at most every `BLOCKED_REPEAT_TICKS`, so holding the thumb into a
 * wall is a calm repeating nudge instead of a shake on every tick; a new press (after a release) or a new direction
 * cues at once. No text, nothing over the board.
 */
import type { Dir } from '../sim';

/** A held request against the same obstacle cues again after this many ticks (half a second). */
export const BLOCKED_REPEAT_TICKS = 30;

export interface BlockedCue {
  dir: Dir;
  /** Increases with every cue, so the renderer plays each one once. */
  seq: number;
}

export class BlockedMoves {
  private seq = 0;
  private lastDir: Dir | null = null;
  private lastTick = 0;
  /** The latest cue (kept, not cleared: the counter says whether it is new). */
  cue: BlockedCue | null = null;

  /**
   * One call per tick with the local fighter's request.
   * @param move   the intent's move (null = no request: the next press cues afresh)
   * @param ready  the fighter's step is finished, so the request is read this tick
   * @param locked the fighter cannot act (daze, slide, arriving): a refusal is not the wall's doing
   * @param acts   `moveWouldAct(state, me, move)`: the request steps or touches something
   * @returns whether this tick raised a cue
   */
  observe(tick: number, move: Dir | null, ready: boolean, locked: boolean, acts: boolean): boolean {
    if (move === null) {
      this.lastDir = null;
      return false;
    }
    if (!ready || locked) return false;
    if (acts) {
      this.lastDir = null;
      return false;
    }
    if (move === this.lastDir && tick - this.lastTick < BLOCKED_REPEAT_TICKS) return false;
    this.lastDir = move;
    this.lastTick = tick;
    this.cue = { dir: move, seq: ++this.seq };
    return true;
  }

  /** A new match: forget everything. */
  reset(): void {
    this.seq = 0;
    this.lastDir = null;
    this.lastTick = 0;
    this.cue = null;
  }
}
