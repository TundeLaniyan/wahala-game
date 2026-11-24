/**
 * The ONE edge from the main bundle into the online City Rumble code (docs/ONLINE_INTEGRATION.md section 2/3). With the
 * build-time switch off, `__WAHALA_SERVER_ONLINE__` is the literal `false`: the bundler removes the dynamic import, no
 * online chunk is emitted, and `loadRumbleOnline()` resolves `null` without touching the network. Agent F owns this file.
 */
import type { RumbleOnlineApi } from '../app/rumbleOnline';

export async function loadRumbleOnline(): Promise<RumbleOnlineApi | null> {
  if (!__WAHALA_SERVER_ONLINE__) return null;
  const m = await import('../app/rumbleOnline');
  return m.rumbleOnline;
}
