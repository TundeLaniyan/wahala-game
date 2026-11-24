/**
 * The client's model of what the SERVER does with this seat's input messages (server/src/core/RumbleMatch.ts `input()` and
 * `intentsForTick()`, docs/CITY_RUMBLE_ONLINE.md section 4.6), so the prediction walks exactly when the server will:
 *  - a message received at server tick `r` is first used by step `r + 1`;
 *  - the held direction walks continuously;
 *  - a NEW direction press is latched until it produces a step or `SERVER_PRESS_KEEP_TICKS` pass (a tap = one step, even
 *    when press and release both arrive mid-step);
 *  - the latch is dropped when the fighter's tile changes or it is eliminated.
 * Pure data and functions; the server's own copy stays the authority (this only decides where the fighter is DRAWN).
 */
import type { Dir } from '../../../sim';
import { SERVER_PRESS_KEEP_TICKS } from './config';

export interface Latch {
  held: Dir | null;
  press: { dir: Dir; until: number; receivedTick: number } | null;
}

/** One sent input message as the prediction needs it: its held direction and the server tick it is estimated to arrive at. */
export interface SentMove {
  m: Dir | null;
  /** Estimated server tick at receipt (`state.tick` when the server's `input()` runs); first used by step `r + 1`. */
  r: number;
}

export const emptyLatch = (): Latch => ({ held: null, press: null });

export function cloneLatch(l: Latch): Latch {
  return { held: l.held, press: l.press ? { ...l.press } : null };
}

/** `RumbleMatch.input()`: a message received while the server's state is at tick `r`. */
export function receive(l: Latch, move: SentMove): void {
  if (move.m !== null && move.m !== l.held)
    l.press = { dir: move.m, until: move.r + SERVER_PRESS_KEEP_TICKS, receivedTick: move.r };
  l.held = move.m;
}

/** `intentsForTick()`: the move intent of the step that follows tick `prevTick` (the press expires first). */
export function moveFor(l: Latch, prevTick: number): Dir | null {
  if (l.press && prevTick >= l.press.until) l.press = null;
  return l.held ?? l.press?.dir ?? null;
}

/** `step()`: a latched press is spent once the fighter's tile changed (or it was eliminated). */
export function afterStep(l: Latch, moved: boolean, alive: boolean): void {
  if (l.press && (moved || !alive)) l.press = null;
}
