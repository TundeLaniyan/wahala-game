/**
 * Shared counter predictor (docs/CITY_RUMBLE_ONLINE.md section 4.4).
 *
 * Most per-tick change in a City Rumble state is counters stepping by exactly one: the clock, every moving player's
 * `stepRemaining`, every generator's fuse. Before each tick's diff the SERVER runs `predict` on its mirror and every
 * CLIENT runs it on its replica (the same function on the same data, so both stay identical); the patch then carries
 * only what the prediction got wrong. A wrong guess costs bytes, never correctness: the patch overwrites it and the
 * periodic canonical hash proves server and client agree.
 *
 * This is NOT client-side simulation: it never decides a rule outcome (no movement, no blast, no elimination). It only
 * guesses the next value of a counter. Keep it that way; anything that needs a rule belongs to the server's `tick`.
 */
import type { PublicState } from './types';

export function predict(s: PublicState): void {
  s.tick++;
  if (s.match.phase === 'playing') s.match.playTicks++;
  else if (s.match.phase === 'countdown' && s.match.countdownRemaining > 0) s.match.countdownRemaining--;
  else if (s.match.phase === 'ended') return;
  for (const p of s.players) {
    if (p.alive && p.stepRemaining > 0) p.stepRemaining--;
  }
  for (const g of s.generators) {
    if (g.carriedBy !== null || g.mountedOn !== undefined) continue;
    if (g.flight) g.flight.remaining--;
    else if (g.slide && g.slide.stepRemaining > 1) g.slide.stepRemaining--;
    if (g.mode === 'disabled' || !(g.flight && g.timer <= 1)) g.timer--;
  }
}
