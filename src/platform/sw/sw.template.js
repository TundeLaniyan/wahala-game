/* WAHALA! offline cache (docs/MOBILE_PERFORMANCE.md). Plain JS: it is emitted verbatim as /sw.js by the build
 * (scripts/vite/offlineCache.ts), with the asset list below replaced by the build's own hashed asset list.
 *
 * Why it exists: GitHub Pages sends `Cache-Control: max-age=600` for EVERYTHING and that cannot be changed. Content-hashed
 * files (assets/<name>-<hash>.<ext>) never change, so after 10 minutes the browser still re-asks for every one of them
 * (~70 conditional requests at start-up), and a phone's HTTP cache may evict the big models at any time. This worker:
 *   - serves hashed build files cache-first (a name that exists never changes content: no staleness is possible);
 *   - serves the app shell (index.html and other un-hashed files) network-first with the cache as the offline fallback;
 *   - never precaches (installing it downloads nothing), never touches audio / Range requests (music streams as before);
 *   - on activate drops hashed files that this build no longer references, so the cache cannot grow without bound.
 * It changes WHEN bytes are fetched, never what the game does. `?nosw` unregisters it (platform/serviceWorker.ts).
 */
const CACHE = 'wahala-assets-v1';
const BUILD_ASSETS = new Set(/*ASSETS*/ []);
const SCOPE_PATH = new URL(self.registration.scope).pathname; // e.g. /wahala-game/
const HASHED = /^assets\/.+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/;
/** One canonical key for the app shell: index.html is the same document whatever query string a visit used. */
const SHELL = new URL('index.html', self.registration.scope).href;

const relOf = (url) => (url.pathname.startsWith(SCOPE_PATH) ? url.pathname.slice(SCOPE_PATH.length) : null);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // drop hashed files this build no longer references; the app shell entry is replaced by the next online visit
      for (const req of await cache.keys()) {
        const rel = relOf(new URL(req.url));
        if (rel !== null && HASHED.test(rel) && !BUILD_ASSETS.has(rel)) await cache.delete(req);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const rel = relOf(url);
  if (rel === null) return;
  if (HASHED.test(rel) && BUILD_ASSETS.has(rel)) {
    event.respondWith(cacheFirst(req));
  } else if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.status === 200 && res.type === 'basic') cache.put(req, res.clone()).catch(() => undefined);
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    // `no-cache`: revalidate with the server (a 304 is a few hundred bytes) instead of trusting GitHub's 10-minute max-age
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.status === 200 && res.type === 'basic') cache.put(SHELL, res.clone()).catch(() => undefined);
    return res;
  } catch (error) {
    const hit = await cache.match(SHELL, { ignoreVary: true });
    if (hit) return hit;
    throw error;
  }
}
