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
const BUILD_ASSETS = new Set(["assets/Frame-BQ-6TRHm.js","assets/Frame-fzXCovi3.css","assets/OnlineScreen-BxWVg5Rn.js","assets/RaidViews-hva2rput.js","assets/anton-latin-400-normal-AUNGEG_V.woff","assets/anton-latin-400-normal-Byf51wtH.woff2","assets/barlow-condensed-latin-500-normal-BgYH2mbd.woff2","assets/barlow-condensed-latin-500-normal-HIEiP5Ov.woff","assets/barlow-condensed-latin-600-normal-BFJEwTuo.woff","assets/barlow-condensed-latin-600-normal-DepVgxBB.woff2","assets/barlow-condensed-latin-700-normal-Dmwat-ge.woff","assets/barlow-condensed-latin-700-normal-v1xN8_Wq.woff2","assets/bebas-neue-latin-400-normal-9mHNbWWO.woff2","assets/bebas-neue-latin-400-normal-Bi-ndsyu.woff","assets/boss-barristerQuill-intro-DnjnjRHt.webp","assets/boss-ikennaWayside-intro-B9yhCkYq.webp","assets/boss-madamRonke-intro-CL6nqdvP.webp","assets/boss-marshalKobo-intro-BG7Z4XCl.webp","assets/boss-ogaSunmola-intro-Y41UEJRF.webp","assets/boss-stewardHalcyon-intro-DEhgVGr9.webp","assets/briefPreview-D7I6hKYK.js","assets/char_agbero-C6ZhO0f6.glb","assets/char_areaBoss-DODfbZ6I.glb","assets/char_areaBoy-CB1e630U.glb","assets/char_bossBarristerQuill-Cepoaeck.glb","assets/char_bossIkennaWayside-DLSm7Avz.glb","assets/char_bossMadamRonke-CXtVfBJV.glb","assets/char_bossMarshalKobo-9CHLNJEn.glb","assets/char_bossOgaSunmola-Jn5tzvGE.glb","assets/char_bossStewardHalcyon-DT9NyzkS.glb","assets/char_bossTheLandlord-Cu873wai.glb","assets/char_bottleThrower-DM9ARUpw.glb","assets/char_campusQueen-CbSwc53a.glb","assets/char_heavyEnforcer-CGJI-Y9h.glb","assets/char_lekkiBoy-9zVnnZp5.glb","assets/char_lieutenant-CApNjih4.glb","assets/char_marketEnforcer-D3iR8q9A.glb","assets/char_ringSecurity-lqMukAqs.glb","assets/char_routeMarshal-BNIOnXuF.glb","assets/char_streetBaller-mzkoV360.glb","assets/crowd-DB9Xu_zL.glb","assets/district-ebuteMetta-briefing-C_wmhHm_.webp","assets/district-fadeyiSomolu-briefing-C0xovHAk.webp","assets/district-lagosIsland-briefing-utk44SQP.webp","assets/district-lekki-briefing-CS8yfgxL.webp","assets/district-mushin-briefing-C3TsSrJG.webp","assets/district-ojuelegba-briefing-P0IgG8cy.webp","assets/district-oshodi-briefing-Bfx6qQOx.webp","assets/ending-BVN0TJTF.webp","assets/env_barrel-BB4fcOuz.glb","assets/env_bleacher-yD1p71eE.glb","assets/env_building_a-BeivkwTZ.glb","assets/env_building_b-jh4eG-0W.glb","assets/env_building_c-BU9zepa5.glb","assets/env_building_d-BMpFrELE.glb","assets/env_kiosk-BGsB0u8B.glb","assets/env_lamp-CEDzD5O8.glb","assets/env_poles-DWCUGe4C.glb","assets/env_shopsign-CxD1GmxE.glb","assets/env_tyrestack-CzY7Frqx.glb","assets/env_wall-BtQkvO3V.glb","assets/env_wall_b-Czj8KKt8.glb","assets/env_wall_c-BeLsTxtB.glb","assets/env_wall_corner-ClHiuIMT.glb","assets/env_wall_low-PUDStiut.glb","assets/fighter-campusQueen-360-Ds68WDhL.webp","assets/fighter-campusQueen-720-DqLUAPey.webp","assets/fighter-lekkiBoy-360-CCD8SrEF.webp","assets/fighter-lekkiBoy-720-D1Hh9gLS.webp","assets/fighter-streetBaller-360-AFX9fXal.webp","assets/fighter-streetBaller-720-DIPNZdgK.webp","assets/finale-u-aeewqY.webp","assets/floor_albedo-Bz49x_ZI.jpg","assets/floor_normal-CM4kDHO6.jpg","assets/floor_orm-DdHogsWG.jpg","assets/gen_generator-C8neSPI4.glb","assets/index-BFrLKRWj.js","assets/index-DdLic9gS.css","assets/keyart-1376-CFEYBsvy.webp","assets/keyart-768-EuE_ghc6.webp","assets/prologue-CFNWUg0Z.webp","assets/prop_pillar_a-BizgeJ3K.glb","assets/prop_pillar_b-CstjhtPz.glb","assets/prop_pillar_bollard-CofkF5ZJ.glb","assets/prop_pillar_c-D7QSyrkh.glb","assets/prop_pillar_cabinet-ZtueMKOC.glb","assets/prop_pillar_column-C2X_aAmo.glb","assets/prop_pillar_container_a-BIK90RLK.glb","assets/prop_pillar_container_b-CII4GDRo.glb","assets/prop_pillar_jersey-9gqLR9b2.glb","assets/prop_pillar_kiosk-Dicp0iNl.glb","assets/prop_pillar_market-BnEiFPw_.glb","assets/prop_pillar_pier-oNvz3OhX.glb","assets/prop_pillar_scaffold-Dm1gsfab.glb","assets/prop_pillar_wallstub-D9Lno0p4.glb","assets/prop_soft_barrier-fyufKS_0.glb","assets/prop_soft_cabledrum-BeT4NZkD.glb","assets/prop_soft_cartons-NqgmkxGg.glb","assets/prop_soft_crate-BMRb_Ugy.glb","assets/prop_soft_crate_b-BR0iAq4I.glb","assets/prop_soft_crates-zqajNMwf.glb","assets/prop_soft_drums-BQ-KF7HW.glb","assets/prop_soft_fishcrates-BqnOJZbR.glb","assets/prop_soft_kegs-BxU0yTsW.glb","assets/prop_soft_sacks-Bf1Zf6VU.glb","assets/prop_soft_tyres-DbRGM9-e.glb","assets/raid-warehouseDispatchDepot-BxkCHYUY.webp","assets/rolldown-runtime-WkwZ5CU-.js","assets/section-ebuteMetta-railYard-tBFxMjho.webp","assets/section-oshodi-approach-njtT_pzl.webp","assets/space-grotesk-latin-400-normal-BnQMeOim.woff","assets/space-grotesk-latin-400-normal-CJ-V5oYT.woff2","assets/space-grotesk-latin-500-normal-CNSSEhBt.woff","assets/space-grotesk-latin-500-normal-lFbtlQH6.woff2","assets/space-grotesk-latin-700-normal-CwsQ-cCU.woff","assets/space-grotesk-latin-700-normal-RjhwGPKo.woff2","assets/testlab-CgZoUBmj.js","assets/testlab-CmPBQqB6.css","assets/three-CLpNnD-j.js","assets/veh_danfo-CNq-0dzv.glb","assets/veh_keke-oGiQo6G0.glb","assets/veh_okada-CtB6Vo0k.glb","assets/veh_taxi-CyGxfCXw.glb","assets/vtex-0bdb644d.jpg","assets/vtex-3e0f2108.jpg","assets/vtex-5d2ea2ec.jpg","assets/vtex-6084a594.jpg","assets/vtex-d1fcd0c5.jpg"]);
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
