/**
 * Online layer entry point. `createOnline(flags, env)` returns the client the UI talks to:
 *   - `null`  when online is off (the default: nothing is created, nothing is imported);
 *   - the local MOCK (in memory, no network) for `onlineMode: 'mock'`;
 *   - the real server adapter ONLY when the build was made with WAHALA_ONLINE_ENABLED=true and WAHALA_ONLINE_URL
 *     (`__WAHALA_SERVER_ONLINE__`, defined in vite.config.ts) AND the flags ask for 'server'.
 *
 * The server adapter is behind a build-time constant and a dynamic import, so a default build contains none of its
 * code (scripts/check-static-build.mjs proves it by scanning dist/ for socket / WebRTC / microphone APIs).
 */
import type { FeatureFlags } from '../platform';
import type { OnlineClient } from './contracts';
import { createMockOnline } from './mock';
import type { MockOnline, MockOptions } from './mock';

export type { OnlineClient } from './contracts';
export type * from './contracts';
export * from './types';
export * from './errors';
export { err, ok, unwrap } from './result';
export type { Result } from './result';
export type { ServerEvent } from './schema';

export interface OnlineEnv {
  /** `WAHALA_ONLINE_URL` (public endpoint, never a secret). Only read in a server-enabled build. */
  serverUrl?: string;
  /** Options for the mock (clock, seed, stores, latency ...). */
  mock?: MockOptions;
}

export async function createOnline(
  flags: Pick<FeatureFlags, 'onlineMode'>,
  env: OnlineEnv = {},
): Promise<OnlineClient | null> {
  if (flags.onlineMode === 'off') return null;
  if (flags.onlineMode === 'server') {
    if (__WAHALA_SERVER_ONLINE__ && env.serverUrl) {
      const { createServerOnline } = await import('./server/adapter');
      return createServerOnline({ url: env.serverUrl });
    }
    return null; // 'server' was asked for but this build has no server transport: never fall back silently
  }
  return createMockOnline(env.mock);
}

export type { MockOnline };
