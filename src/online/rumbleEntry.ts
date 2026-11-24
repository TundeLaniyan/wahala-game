/**
 * The ONE edge from the main bundle into the online City Rumble code (docs/ONLINE_INTEGRATION.md section 2/3). With the
 * build-time switch off, `__WAHALA_SERVER_ONLINE__` is the literal `false`: the bundler removes the dynamic import, no
 * online chunk is emitted, and `loadRumbleOnline()` resolves `null` without touching the network. Agent F owns this file.
 */
import type { RumbleOnlineApi } from '../app/rumbleOnline';
import { flags } from '../platform';

/**
 * True only on a server build opened with `?online` (flags `rumbleOnline`, see src/platform/flags.ts). The Home entry and
 * any lazily loaded online screen are gated by this. It is a RUNTIME convenience; the guarantee that a public build
 * contains no online code is the build constant below, not this function.
 */
export function rumbleOnlineAvailable(): boolean {
  return flags().rumbleOnline;
}

/** The endpoint of this server build with `{host}` filled in (null when `rumbleOnlineAvailable()` is false). */
export function rumbleOnlineEndpoint(): string | null {
  return flags().rumbleOnline ? flags().onlineEndpoint : null;
}

export async function loadRumbleOnline(): Promise<RumbleOnlineApi | null> {
  if (!__WAHALA_SERVER_ONLINE__) return null;
  const m = await import('../app/rumbleOnline');
  return m.rumbleOnline;
}
