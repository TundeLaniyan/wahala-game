/**
 * THE TWO WIRING POINTS between the online UI/controller (agent U) and the release owner's session code
 * (docs/ONLINE_INTEGRATION.md section 8). Both are online-chunk code (imported only by src/app/rumbleOnline.ts).
 *
 *  1. `createSession(events)`: today an in-memory FAKE (src/app/rumbleOnlineFake.ts, scripted, no network). The release
 *     owner swaps the body for the real client:
 *         import { createRumbleSession } from '../net/client/session';
 *         export const SESSION_IS_FAKE = false;
 *         export const createSession = (events) => createRumbleSession(endpoint, events);
 *     (`endpoint` = `rumbleOnlineEndpoint()` from ./rumbleFlags; the flow never calls `createSession` when it is null.)
 *  2. `startRemote(driver)`: today a typed no-op stub. Swap for `commands.startRemote(driver)` from ./session once it exists.
 *
 * While `SESSION_IS_FAKE` is true the online screens say "Test session: no real server" so a fake can never be mistaken
 * for the real thing. The fake's dev query (`?online&fakeonline[=scenario]`) is handled inside the fake.
 */
import type { RumbleSession, RumbleSessionEvents } from '../net/client/types';
import type { RemoteMatchDriver } from './remoteMatch';
import { createFakeSession } from './rumbleOnlineFake';

export const SESSION_IS_FAKE = true;

export function createSession(events: RumbleSessionEvents): RumbleSession {
  return createFakeSession(events);
}

/** STUB: `commands.startRemote(driver)` (src/app/session.ts, release owner) replaces this body. */
export function startRemote(_driver: RemoteMatchDriver): void {
  // intentionally empty until session.ts provides it
}
