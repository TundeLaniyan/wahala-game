/**
 * Optional vibration feedback (decision NV4): a short tick when a touch action button goes down and a firmer buzz
 * when the local player is hurt or knocked out. Only where `navigator.vibrate` exists (Android Chrome; iOS Safari and
 * desktops have none, so nothing happens there), only while Settings > Vibration is On, and never for keyboard or
 * gamepad input. Presentation only: it reads events, it changes nothing.
 */
import type { SimEvent } from '../sim';

/** A touch action button press. */
export const TAP_MS = 12;
/** The local player lost health / was dazed by a hit. */
export const HURT_MS = 40;
/** The local player was knocked out. */
export const DOWN_MS: readonly number[] = [60, 40, 90];

/** The vibration pattern for one batch of events, or null for none (pure; tests read it). */
export function hapticFor(events: readonly SimEvent[], localId: number): number | readonly number[] | null {
  let hurt = false;
  for (const e of events) {
    if (e.type === 'playerEliminated' && e.playerId === localId) return DOWN_MS;
    if (
      e.type === 'campaignHit' &&
      e.victimId === localId &&
      (e.result === 'damaged' || e.result === 'defeated')
    )
      hurt = true;
    if (e.type === 'playerDazed' && e.playerId === localId) hurt = true;
  }
  return hurt ? HURT_MS : null;
}

/** Vibrates when `enabled` and the device can; never throws. */
export function vibrate(pattern: number | readonly number[] | null, enabled: boolean): void {
  if (!enabled || pattern === null) return;
  try {
    const nav = globalThis.navigator as
      (Navigator & { vibrate?: (p: number | number[]) => boolean }) | undefined;
    nav?.vibrate?.(typeof pattern === 'number' ? pattern : [...pattern]);
  } catch {
    /* blocked by the browser (no user gesture yet, permissions): feedback is optional */
  }
}
