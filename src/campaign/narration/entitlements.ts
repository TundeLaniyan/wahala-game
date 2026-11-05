/**
 * The hook for a FUTURE premium gate. There is no payment code, no network and no account in this build:
 * `FreeEntitlements` is the only implementation and it grants nothing beyond the free tier. A later release can
 * pass its own `EntitlementPort` (for example one that reads a purchase receipt) to the narration provider
 * without touching any screen. The core mission meaning (a card's summary and objective line, its text and its
 * Read more) is ALWAYS free: entitlements only ever decide which recordings can be played.
 */
import type { NarrationClip } from './types';

/** What a future purchase could unlock. */
export type Entitlement =
  /** Narration of the premium-tier clips (full-length performances). */
  | 'fullNarration'
  /** Extended lore beyond the mission text. */
  | 'extendedLore'
  /** Alternate performances of the same cards. */
  | 'altPerformance';

export interface EntitlementPort {
  has(entitlement: Entitlement): boolean;
}

/** The default: the free tier. Free clips need no entitlement, so nothing premium is granted. */
export const FreeEntitlements: EntitlementPort = Object.freeze({ has: () => false });

/** Asks a port without ever throwing: a port that fails grants nothing. */
export function safeHas(port: EntitlementPort, entitlement: Entitlement): boolean {
  try {
    return port.has(entitlement) === true;
  } catch {
    return false;
  }
}

/** May this clip be played with these entitlements? Free clips always can. */
export function clipAllowed(clip: Pick<NarrationClip, 'tier'>, port: EntitlementPort): boolean {
  return clip.tier === 'free' || safeHas(port, 'fullNarration');
}
