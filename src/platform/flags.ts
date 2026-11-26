/**
 * Feature flags. Safe defaults for every static build (GitHub Pages): online and voice OFF, campaign ON,
 * experimental content OFF. Flags are read at build time from `WAHALA_*` environment variables (vite
 * `envPrefix`) and can be narrowed or widened at run time only for things that never touch a network:
 *
 *   WAHALA_ONLINE_ENABLED=true  build-time: allows the *server* online adapter (needs WAHALA_ONLINE_URL too)
 *   ?mockonline                 run time: the local MOCK online adapters (no sockets, no fetch, no WebRTC);
 *                               `?mockonline=0` (or off/false/no) is "not set"
 *   WAHALA_ONLINE_URL           build-time: the server endpoint (may contain `{host}`, the page's hostname). With
 *                               WAHALA_ONLINE_ENABLED this makes a SERVER build (docs/ONLINE_INTEGRATION.md)
 *   ?online                     run time: in a SERVER build only, shows the Online City Rumble entry (`rumbleOnline`)
 *   WAHALA_PLATFORM_URL         build-time: the player-platform HTTP API (may contain `{host}`). Only in a SERVER build: then
 *                               the online flow gains guest identity, friends, parties and quick signals (`platform`,
 *                               docs/PLATFORM_CLIENT.md). Never read from the URL; a default build has none of it.
 *   WAHALA_VOICE_ENABLED=true   build-time: shows the voice UI state (provider interface only, no WebRTC here)
 *   WAHALA_CAMPAIGN_ENABLED     default true; `false` hides the campaign
 *   WAHALA_EXPERIMENTAL_CONTENT default false; `true` (or ?experimental) shows unfinished roster / content
 *
 * `rumbleOnline` needs BOTH switches: a server build AND `?online`. The endpoint is never read from the URL or from a
 * source default; it is `WAHALA_ONLINE_URL` with `{host}` replaced by `location.hostname`.
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
  /** Online City Rumble is offered: a server build (build switch + endpoint) AND the page was opened with `?online`. */
  rumbleOnline: boolean;
  /** The resolved endpoint of a server build (`{host}` substituted), null otherwise or when it is not a valid ws/http URL. */
  onlineEndpoint: string | null;
  /**
   * The player-platform features (guest identity, friends, parties, quick signals) are offered: `rumbleOnline` AND a
   * `platformEndpoint`. False in every build without both switches, whatever the URL says.
   */
  platform: boolean;
  /**
   * The platform API base URL of a SERVER build made with `WAHALA_PLATFORM_URL` (`{host}` substituted), null otherwise or
   * when it is not an http:// or https:// URL.
   */
  platformEndpoint: string | null;
}

/** The defaults baked into every build that sets no variable. */
export const FLAG_DEFAULTS: Readonly<FeatureFlags> = Object.freeze({
  online: false,
  onlineMode: 'off',
  voice: false,
  campaign: true,
  experimentalContent: false,
  rumbleOnline: false,
  onlineEndpoint: null,
  platform: false,
  platformEndpoint: null,
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

/** The token of `WAHALA_ONLINE_URL` that stands for the page's own hostname (the LAN development case). */
export const HOST_TOKEN = '{host}';
const ENDPOINT_RE = /^(?:wss?|https?):\/\/[^\s{}]+$/i;
// a DNS name, an IPv4 address or a bracketed IPv6 address, as `location.hostname` reports them
const HOSTNAME_RE =
  /^(?:[a-z0-9]([a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*|\[[0-9a-f:.]+\])$/i;

/**
 * The endpoint of a server build: `url` with `{host}` replaced by `hostname`, or null when it is empty, needs a hostname
 * that is missing or malformed, or is not a ws:// wss:// http:// https:// URL. Pure.
 */
export function resolveEndpoint(url: unknown, hostname: string): string | null {
  if (typeof url !== 'string') return null;
  let out = url.trim();
  if (out.includes(HOST_TOKEN)) {
    if (!HOSTNAME_RE.test(hostname)) return null;
    out = out.split(HOST_TOKEN).join(hostname);
  }
  return ENDPOINT_RE.test(out) ? out : null;
}

const HTTP_RE = /^https?:\/\//i;

/**
 * The platform API endpoint: `url` resolved like `resolveEndpoint` but http:// or https:// only (it is a REST API, not a
 * socket), without a trailing slash. Pure.
 */
export function resolvePlatformEndpoint(url: unknown, hostname: string): string | null {
  const out = resolveEndpoint(url, hostname);
  return out !== null && HTTP_RE.test(out) ? out.replace(/\/+$/, '') : null;
}

/**
 * Resolves the flags. Pure: `env` is the build-time environment, `search` the URL query, `hostname` the page's
 * `location.hostname` (only used to fill `{host}` in the endpoint). Only the campaign and experimental flags, the
 * *mock* online mode and the `?online` request may be changed from the URL; `server`, `voice` and the endpoint never can.
 */
export function resolveFlags(env: FlagEnv, search = '', hostname = ''): FeatureFlags {
  const q = new URLSearchParams(search);
  const serverBuild =
    truthy(env.WAHALA_ONLINE_ENABLED) &&
    typeof env.WAHALA_ONLINE_URL === 'string' &&
    env.WAHALA_ONLINE_URL !== '';
  const mockQuery = q.has('mockonline') && !falsy(q.get('mockonline'));
  const mock = mockQuery || (truthy(env.WAHALA_ONLINE_ENABLED) && !serverBuild);
  const onlineMode: OnlineMode = serverBuild ? 'server' : mock ? 'mock' : 'off';
  const campaignQuery = q.get('campaign');
  const onlineEndpoint = serverBuild ? resolveEndpoint(env.WAHALA_ONLINE_URL, hostname) : null;
  // the platform exists only inside a server build: a platform URL alone (or with only half of the online switch) is nothing
  const platformEndpoint = serverBuild ? resolvePlatformEndpoint(env.WAHALA_PLATFORM_URL, hostname) : null;
  return {
    online: onlineMode !== 'off',
    onlineMode,
    voice: truthy(env.WAHALA_VOICE_ENABLED),
    campaign:
      campaignQuery !== null
        ? bool(campaignQuery, true)
        : bool(env.WAHALA_CAMPAIGN_ENABLED, FLAG_DEFAULTS.campaign),
    experimentalContent: truthy(env.WAHALA_EXPERIMENTAL_CONTENT) || q.has('experimental'),
    rumbleOnline: onlineEndpoint !== null && q.has('online'),
    onlineEndpoint,
    platform: onlineEndpoint !== null && q.has('online') && platformEndpoint !== null,
    platformEndpoint,
  };
}

let cached: FeatureFlags | null = null;

/** The flags of this page load (env + URL), resolved once. */
export function flags(): FeatureFlags {
  if (cached) return cached;
  const env = ((import.meta as unknown as { env?: FlagEnv }).env ?? {}) as FlagEnv;
  const search = typeof location !== 'undefined' ? location.search : '';
  const hostname = typeof location !== 'undefined' ? location.hostname : '';
  cached = resolveFlags(env, search, hostname);
  return cached;
}

/** Test hook: forget the cached flags (or install some). */
export function setFlagsForTests(f: FeatureFlags | null): void {
  cached = f;
}
