/**
 * Feature flags. Safe defaults for every static build (GitHub Pages): online and voice OFF, campaign ON,
 * experimental content OFF. Flags are read at build time from `WAHALA_*` environment variables (vite
 * `envPrefix`) and can be narrowed or widened at run time only for things that never touch a network:
 *
 *   WAHALA_ONLINE_ENABLED=true  build-time: allows the *server* online adapter (needs WAHALA_ONLINE_URL too)
 *   ?mockonline                 run time: the local MOCK online adapters (no sockets, no fetch, no WebRTC)
 *   WAHALA_VOICE_ENABLED=true   build-time: shows the voice UI state (provider interface only, no WebRTC here)
 *   WAHALA_CAMPAIGN_ENABLED     default true; `false` hides the campaign
 *   WAHALA_EXPERIMENTAL_CONTENT default false; `true` (or ?experimental) shows unfinished roster / content
 *
 * Nothing under `src/online` may open a connection unless `flags.onlineMode === 'server'`, which can only be
 * true when the build was made with WAHALA_ONLINE_ENABLED=true and an endpoint (docs/ONLINE_ARCHITECTURE.md).
 */

export type OnlineMode = 'off' | 'mock' | 'server';

export interface FeatureFlags {
  /** Any online feature surface is visible (mock or server). */
  online: boolean;
  /** 'off' = no online UI; 'mock' = local mock adapters; 'server' = real transport (build-time opt-in only). */
  onlineMode: OnlineMode;
  /** The voice-chat UI state is visible (always the disabled state until a provider ships). */
  voice: boolean;
  campaign: boolean;
  experimentalContent: boolean;
}

/** The defaults baked into every build that sets no variable. */
export const FLAG_DEFAULTS: Readonly<FeatureFlags> = Object.freeze({
  online: false,
  onlineMode: 'off',
  voice: false,
  campaign: true,
  experimentalContent: false,
});

export type FlagEnv = Record<string, string | boolean | undefined>;

const truthy = (v: unknown): boolean =>
  v === true || (typeof v === 'string' && /^(1|true|on|yes)$/i.test(v.trim()));
const falsy = (v: unknown): boolean =>
  v === false || (typeof v === 'string' && /^(0|false|off|no)$/i.test(v.trim()));

function bool(v: unknown, fallback: boolean): boolean {
  if (truthy(v)) return true;
  if (falsy(v)) return false;
  return fallback;
}

/**
 * Resolves the flags. Pure: `env` is the build-time environment, `search` the URL query. Only the campaign and
 * experimental flags and the *mock* online mode may be changed from the URL; `server` and `voice` never can.
 */
export function resolveFlags(env: FlagEnv, search = ''): FeatureFlags {
  const q = new URLSearchParams(search);
  const serverBuild =
    truthy(env.WAHALA_ONLINE_ENABLED) &&
    typeof env.WAHALA_ONLINE_URL === 'string' &&
    env.WAHALA_ONLINE_URL !== '';
  const mock = q.has('mockonline') || (truthy(env.WAHALA_ONLINE_ENABLED) && !serverBuild);
  const onlineMode: OnlineMode = serverBuild ? 'server' : mock ? 'mock' : 'off';
  const campaignQuery = q.get('campaign');
  return {
    online: onlineMode !== 'off',
    onlineMode,
    voice: truthy(env.WAHALA_VOICE_ENABLED),
    campaign:
      campaignQuery !== null
        ? bool(campaignQuery, true)
        : bool(env.WAHALA_CAMPAIGN_ENABLED, FLAG_DEFAULTS.campaign),
    experimentalContent: truthy(env.WAHALA_EXPERIMENTAL_CONTENT) || q.has('experimental'),
  };
}

let cached: FeatureFlags | null = null;

/** The flags of this page load (env + URL), resolved once. */
export function flags(): FeatureFlags {
  if (cached) return cached;
  const env = ((import.meta as unknown as { env?: FlagEnv }).env ?? {}) as FlagEnv;
  const search = typeof location !== 'undefined' ? location.search : '';
  cached = resolveFlags(env, search);
  return cached;
}

/** Test hook: forget the cached flags (or install some). */
export function setFlagsForTests(f: FeatureFlags | null): void {
  cached = f;
}
