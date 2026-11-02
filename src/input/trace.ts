/**
 * Input trace (decision MI5): a bounded ring of what happened between a finger and the simulation, so a "stuck" or
 * "unresponsive" report can be read back instead of guessed at. One record per stage:
 *
 *  - `raw`   the touch event as the stick received it (down / move / up / cancel, position);
 *  - `dir`   the stick's quantised direction and diagonal wish after that event;
 *  - `gate`  what the move gate handed to the simulation on a tick (or nothing), and why;
 *  - `sim`   what the simulation did with it (stepped, blocked, ignored because the player could not act ...).
 *
 * It is a debug tool: off unless enabled (`?debug`, or `?trace`), and then it only appends to an array. The
 * simulation never reads it, so tracing cannot change a match.
 */
import type { Dir } from '../sim';

export type TraceEvent =
  | { k: 'raw'; ms: number; type: 'down' | 'move' | 'up' | 'cancel'; id: number; x: number; y: number }
  | { k: 'dir'; tick: number; dir: Dir | null; wish: Dir | null }
  | { k: 'gate'; tick: number; move: Dir | null; reason: string }
  | { k: 'sim'; tick: number; result: string; x: number; y: number };

export class InputTrace {
  enabled = false;
  private readonly ring: TraceEvent[] = [];
  constructor(private readonly capacity = 1200) {}

  record(event: TraceEvent): void {
    if (!this.enabled) return;
    this.ring.push(event);
    if (this.ring.length > this.capacity) this.ring.splice(0, this.ring.length - this.capacity);
  }

  /** The recorded events, oldest first. */
  get events(): readonly TraceEvent[] {
    return this.ring;
  }

  clear(): void {
    this.ring.length = 0;
  }

  /** A paste-able dump for a bug report. */
  dump(): string {
    return JSON.stringify(this.ring);
  }
}

/** The one trace of the running game (the input layer, the stick and the match controller all write to it). */
export const inputTrace = new InputTrace();
