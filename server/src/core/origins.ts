/**
 * Browser origin policy (CORS for matchmaking requests and the WebSocket upgrade).
 * Entries of `RUMBLE_ALLOWED_ORIGINS` are exact origins, or patterns where `*` after a colon is a port and any other
 * `*` is a host label run (`http://localhost:*`, `https://*.example.com`). Non-browser clients send no Origin: allowed.
 *
 * Production (`development` false): ONLY the explicit list; with no list nothing is allowed.
 * Development: the localhost origins (Vite's dev server) PLUS the explicit list, which is where the laptop's LAN origins
 * go (`npm run dev:online` computes them at start, e.g. `http://192.168.1.23:5173`, docs/CITY_RUMBLE_ONLINE_LOCAL.md).
 * No LAN range is ever allowed implicitly.
 */

const DEV_ORIGINS = ['http://localhost:*', 'http://127.0.0.1:*'];

function compile(entry: string): RegExp {
  const escaped = entry
    .trim()
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:\*/g, ':\\d{1,5}')
    .replace(/\*/g, '[a-z0-9.-]+');
  return new RegExp(`^${escaped}$`, 'i');
}

export interface OriginPolicy {
  /** `null` = no Origin header (not a browser). */
  allows(origin: string | null): boolean;
  readonly patterns: readonly string[];
}

export function createOriginPolicy(list: string | undefined, development: boolean): OriginPolicy {
  const explicit = (list ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const patterns = development ? [...new Set([...DEV_ORIGINS, ...explicit])] : explicit;
  const rules = patterns.map(compile);
  return {
    patterns,
    allows: (origin) => origin === null || rules.some((r) => r.test(origin)),
  };
}
