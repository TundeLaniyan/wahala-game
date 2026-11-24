// The scans behind `scripts/check-static-build.mjs` and `tests/online/public-bundle.test.ts` (docs/ONLINE_INTEGRATION.md
// section 2, decisions ON1 / ON11). Pure functions over a built output directory: no network, no build.
//
// Two kinds of rule, deliberately different:
//  - API names (`WebSocket`, `EventSource`, ...) are scanned in built JavaScript only, as bare words: they never occur in a
//    public build (three / react / zustand do not name them).
//  - Addresses are scanned as URL-SHAPED literals in every text file of the build, never as bare words, so a vendored library
//    that merely contains the characters "10.1.2.3" in a table cannot trip them. Every URL-shaped literal that the vendored
//    libraries legitimately carry is listed in ALLOWED_ABSOLUTE_HOSTS with its reason; anything else fails.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Transport / device APIs that a public build must never name (the original static-build guard). */
export const API_RULES = [
  ['WebSocket', /\bWebSocket\b/],
  ['EventSource', /\bEventSource\b/],
  ['RTCPeerConnection', /\bRTCPeerConnection\b/],
  ['getUserMedia', /\bgetUserMedia\b/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['wss:// endpoint', /wss?:\/\/(?!localhost)[a-z0-9.-]+/i],
];

/**
 * Strings that only the online chunk (src/net/**, src/app/rumbleOnline.ts, src/ui/online/rumble/**) can contain. Stable data,
 * not minified names: the SDK's own name, the room-code alphabet of src/net/protocol.ts, the session's class name. They must
 * not appear in ANY built file of ANY build outside the online chunk. (`rumbleOnline` itself is a property of the feature
 * flags and is present in every build, so it is not a marker.)
 */
export const ONLINE_CHUNK_MARKERS = [
  ['colyseus', /colyseus/i],
  ['room-code alphabet (src/net/protocol.ts)', /ABCDEFGHJKMNPQRSTUVWXYZ23456789/],
  ['RumbleSession', /RumbleSession/],
];

/** Strings of the online UI that live in the MAIN bundle of a server build (the Home entry), but never in a public one. */
export const ONLINE_ENTRY_MARKERS = [
  ['home-rumble-online (Home entry)', /home-rumble-online/],
  ['data-testid rumble-online screens', /rumble-online-/],
];

/** Where a build could be pointed at a developer machine, a private network or a tunnel. URL-shaped, never bare words. */
export const ADDRESS_RULES = [
  ['ws:// or wss:// literal', /wss?:\/\//i],
  [
    'http(s) URL to localhost / loopback / 0.0.0.0 / RFC1918 / .local',
    /https?:\/\/(?:localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|\[::1?\]|[a-z0-9-]+\.local)\b/i,
  ],
  [
    'quoted loopback / any-address host',
    /["'`](?:localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0)(?::\d+)?(?:\/[^"'`]*)?["'`]/i,
  ],
  ['localhost:port', /\blocalhost:\d+/i],
  [
    'private address with a port',
    /(?<![\d.])(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|127\.0\.0\.1|0\.0\.0\.0):\d{2,5}\b/,
  ],
  ['tunnel host', /ngrok|trycloudflare|cloudflared|loca\.lt|localtunnel|serveo\.net|\.lhr\.life/i],
];

/**
 * Absolute http(s) URLs that the vendored libraries carry in the entry chunk. They are namespace identifiers or documentation
 * links, never fetched. Anything else found in index.html or the entry chunk fails tests/online/public-bundle.test.ts.
 */
export const ALLOWED_ABSOLUTE_HOSTS = {
  'www.w3.org': 'XML / SVG / MathML namespace identifiers (createElementNS); never requested',
  'react.dev': 'documentation link inside a React error-message string; never requested',
  'jcgt.org': 'citation inside a three.js source string; never requested',
};

/** Matches the allow-list above plus the server build's own template. `{host}` is a template, not a host. */
export const SERVER_TEMPLATE = 'ws://{host}:2567';

const TEXT_EXT = /\.(?:js|mjs|html|css|json|webmanifest|svg|txt|md)$/i;

/** Every file under `dir` (absolute paths) whose name matches `re`. */
export function filesUnder(dir, re = TEXT_EXT) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? filesUnder(p, re) : re.test(p) ? [p] : [];
  });
}

/** The first `n` characters around a match, for a readable failure message. */
function around(src, re, n = 40) {
  const m = re.exec(src);
  if (!m) return '';
  const a = Math.max(0, m.index - n);
  return JSON.stringify(src.slice(a, m.index + m[0].length + n));
}

/**
 * Scans a built directory. `options.api` also applies the API-name rules to `.js` files, `options.markers` is a list of marker
 * rule tables applied to every text file, `options.addresses` applies ADDRESS_RULES to every text file. Returns
 * `{ file, rule, sample }` rows (file relative to `dir`); empty means clean. `skip` is a predicate on the relative file name; `transform` rewrites a file's text before it is scanned
 * (the server-build test uses it to blank out the one allowed template).
 */
export function scanBuild(dir, options = {}) {
  const {
    api = true,
    markers = [],
    addresses = true,
    skip = () => false,
    transform = (src) => src,
  } = options;
  const problems = [];
  for (const file of filesUnder(dir)) {
    const rel = relative(dir, file).split('\\').join('/');
    if (skip(rel)) continue;
    const src = transform(readFileSync(file, 'utf8'));
    const rules = [];
    if (api && file.endsWith('.js')) rules.push(...API_RULES);
    for (const table of markers) rules.push(...table);
    if (addresses) rules.push(...ADDRESS_RULES);
    for (const [rule, re] of rules)
      if (re.test(src)) problems.push({ file: rel, rule, sample: around(src, re) });
  }
  return problems;
}

/** Absolute http(s) / ws(s) URLs in `src`, as `{ url, host }` (host without port; `{host}` template kept as written). */
export function absoluteUrls(src) {
  const out = [];
  for (const m of src.matchAll(/\b(?:https?|wss?):\/\/([^\s"'`<>)\\]+)/gi)) {
    out.push({ url: m[0], host: m[1].split(/[/:?#]/)[0] });
  }
  return out;
}
