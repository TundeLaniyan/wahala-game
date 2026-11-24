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
import { createRumbleSession } from '../net/client/session';
import type { RumbleSession, RumbleSessionEvents } from '../net/client/types';
import type { RemoteMatchDriver } from './remoteMatch';
import { rumbleOnlineEndpoint } from './rumbleFlags';
import { createFakeSession } from './rumbleOnlineFake';
import { commands } from './session';

/** The in-memory fake is for screenshots and tests only (`?online&fakeonline`); everything else talks to the real server. */
export const SESSION_IS_FAKE =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('fakeonline');

export function createSession(events: RumbleSessionEvents): RumbleSession {
  if (SESSION_IS_FAKE) return createFakeSession(events);
  const endpoint = rumbleOnlineEndpoint();
  // the flow never gets here without an endpoint (it shows "Online is not configured in this build" first)
  if (endpoint === null) throw new Error('online endpoint is not configured');
  return createRumbleSession(endpoint, events);
}

let onMatchExit: (() => void) | null = null;
/** The online flow registers what to do when the player leaves a running online match through the game's own menu. */
export function setMatchExitHandler(handler: (() => void) | null): void {
  onMatchExit = handler;
}

/** Hands the server-owned match to the game: the same loading screen and presentation as an offline start. */
export function startRemote(driver: RemoteMatchDriver): void {
  commands.startRemote(driver, () => onMatchExit?.());
}
