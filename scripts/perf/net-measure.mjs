// Real-browser network measurement (docs/MOBILE_PERFORMANCE.md). Drives Chromium through the real menu journey and
// records the bytes that crossed the wire (CDP Network.loadingFinished `encodedDataLength`: compressed body + headers),
// per request, grouped into phases. Software-emulated phone profile; NOT a physical Android device.
//
//   node scripts/perf/net-measure.mjs --url https://tundelaniyan.github.io/wahala-game/ --proxy http://127.0.0.1:35507 \
//        --out out.json [--phases cold,warm,menu,rumble,match32,idle] [--idle 60] [--device phone|desktop] [--query "&x=1"]
//
// Phases (each is a delta of wire bytes):
//   cold      first load, empty cache, until the main menu is up and the network is quiet
//   warm      reload in the same browser context (normal HTTP cache; max-age=600 applies)
//   menu      Home -> Play -> City Rumble -> every district card, until the setup screen is quiet
//   match32   32-fighter City Rumble: START MATCH until the HUD is up and the loading screen is gone
//   idle      N seconds of play (default 60) after the match started: any further transfer
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const URL_ = opt('url', 'http://localhost:4180/wahala-game/');
const OUT = opt('out', '');
const PHASES = new Set(opt('phases', 'cold,warm,menu,match32,idle').split(','));
const IDLE_S = Number(opt('idle', '60'));
const DEVICE = opt('device', 'phone');
const PROXY = opt('proxy', '');
const EXTRA = opt('query', '');
const CACHE_OFF = argv.includes('--cache-off');
// --settings '{"dataSaver":"on"}': merged into the saved game settings before the page starts
const SETTINGS = opt('settings', '');
// --size 8: the City Rumble roster size to pick (8 keeps a long software-rendered run light); --offline-after N: cut the network N seconds
// after the match is up (needs the worker: pass --extra-query '&sw' and let it take control first)
const SIZE = opt('size', '32');
const OFFLINE_AFTER = Number(opt('offline-after', '0'));

const DEVICES = {
  phone: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1280, height: 720 } },
};

export const kindOf = (url) => {
  const p = new URL(url).pathname.toLowerCase();
  if (p.includes('/audio/music/')) return 'music';
  if (p.includes('/audio/')) return 'sfx/voice';
  if (/\.(js|mjs)$/.test(p)) return 'js';
  if (p.endsWith('.css')) return 'css';
  if (p.endsWith('.glb') || p.endsWith('.gltf')) return 'model';
  if (/\.(webp|jpg|jpeg|png|ktx2|avif|svg)$/.test(p))
    return /previews|district|boss|story/.test(p) ? 'image' : 'image';
  if (/\.(woff2?|ttf)$/.test(p)) return 'font';
  if (/\.(json|webmanifest)$/.test(p)) return 'data';
  if (/\.html?$/.test(p) || p.endsWith('/')) return 'html';
  return 'other';
};

const browser = await chromium.launch({
  executablePath: process.env.WAHALA_CHROMIUM,
  proxy: PROXY ? { server: PROXY } : undefined,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const ctx = await browser.newContext({ ...DEVICES[DEVICE], serviceWorkers: 'allow' });
if (SETTINGS) await ctx.addInitScript((j) => localStorage.setItem('wahala.settings.v1', j), SETTINGS);
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
if (CACHE_OFF) await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

/** requestId -> record. `phase` is the active phase when the request finished. */
const reqs = new Map();
let phase = 'cold';
let lastActivity = Date.now();
cdp.on('Network.requestWillBeSent', (e) => {
  lastActivity = Date.now();
  reqs.set(e.requestId, { url: e.request.url, method: e.request.method, type: e.type, startPhase: phase });
});
cdp.on('Network.responseReceived', (e) => {
  const r = reqs.get(e.requestId);
  if (!r) return;
  r.status = e.response.status;
  r.fromCache = !!(e.response.fromDiskCache || e.response.fromServiceWorker || e.response.fromPrefetchCache);
  r.encoding = e.response.headers['content-encoding'] ?? e.response.headers['Content-Encoding'] ?? '';
  r.cacheControl = e.response.headers['cache-control'] ?? '';
  r.mime = e.response.mimeType;
  r.protocol = e.response.protocol;
});
cdp.on('Network.loadingFinished', (e) => {
  lastActivity = Date.now();
  const r = reqs.get(e.requestId);
  if (!r) return;
  r.bytes = e.encodedDataLength;
  r.donePhase = phase;
});
cdp.on('Network.loadingFailed', (e) => {
  const r = reqs.get(e.requestId);
  if (r) {
    r.failed = e.errorText;
    r.donePhase = phase;
  }
});

const quiet = async (ms = 3000, max = 120000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < max) {
    if (Date.now() - lastActivity > ms) return;
    await page.waitForTimeout(250);
  }
};

const report = {
  url: URL_,
  device: DEVICE,
  userAgent: await page.evaluate(() => navigator.userAgent),
  phases: {},
  at: new Date().toISOString(),
};
const summarize = (name) => {
  const rows = [...reqs.values()].filter(
    (r) => r.donePhase === name || (r.donePhase === undefined && r.startPhase === name),
  );
  const byKind = {};
  let total = 0;
  let count = 0;
  let cached = 0;
  for (const r of rows) {
    const k = kindOf(r.url);
    const b = r.bytes ?? 0;
    byKind[k] ??= { requests: 0, bytes: 0 };
    byKind[k].requests++;
    byKind[k].bytes += b;
    total += b;
    count++;
    if (b === 0) cached++;
  }
  report.phases[name] = {
    totalBytes: total,
    requests: count,
    zeroByteRequests: cached,
    byKind,
    files: rows
      .filter((r) => (r.bytes ?? 0) > 0)
      .map((r) => ({
        url: new URL(r.url).pathname,
        status: r.status,
        bytes: r.bytes,
        enc: r.encoding,
        kind: kindOf(r.url),
      }))
      .sort((a, b) => b.bytes - a.bytes),
    cacheHits: rows.filter((r) => (r.bytes ?? 0) === 0).map((r) => new URL(r.url).pathname),
  };
  const mb = (n) => (n / 1e6).toFixed(2);
  console.log(
    `[${name}] ${mb(total)} MB over ${count} requests (${cached} from cache) :: ` +
      Object.entries(byKind)
        .map(([k, v]) => `${k} ${mb(v.bytes)}`)
        .join(', '),
  );
};
const endPhase = (name, next) => {
  summarize(name);
  phase = next;
};

const url = (q = '') => `${URL_}?debug&noattract&seed=7${EXTRA}${q}`;

// ---- cold ----------------------------------------------------------------------------------------------------------
await page.goto(url(), { waitUntil: 'load' });
await page.getByTestId('title-screen').waitFor({ timeout: 120000 });
await quiet(4000);
endPhase('cold', 'warm');

// ---- warm (same context, HTTP cache kept) ----------------------------------------------------------------------------
if (PHASES.has('warm')) {
  await page.reload({ waitUntil: 'load' });
  await page.getByTestId('title-screen').waitFor({ timeout: 120000 });
  await quiet(4000);
}
endPhase('warm', 'menu');

// ---- menu: every district card ------------------------------------------------------------------------------------------
if (PHASES.has('menu') || PHASES.has('match32')) {
  await page.getByTestId('home-play').click();
  await page.getByTestId('home-rumble').click();
  await page.getByTestId('mode-survival').click();
  await page.getByTestId('rumble-setup').waitFor();
  await quiet(3000);
  const stages = await page
    .locator('[data-testid^="rumble-stage-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  report.stages = stages;
  for (const id of stages) {
    const card = page.getByTestId(id);
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await quiet(1500, 20000);
  }
  await page.getByTestId(`rumble-${SIZE}`).click();
  await quiet(2000);
}
endPhase('menu', 'match32');

// ---- 32-fighter match start ------------------------------------------------------------------------------------------------
if (PHASES.has('match32')) {
  const t0 = Date.now();
  if ((await page.getByTestId('menu-setup').count()) > 0) await page.getByTestId('menu-continue').click();
  if ((await page.getByTestId('menu-fighter').count()) > 0) await page.getByTestId('menu-continue').click();
  await page.getByTestId('start-button').click();
  await page.getByTestId('hud').waitFor({ timeout: 300000 });
  await page
    .getByTestId('match-loading')
    .waitFor({ state: 'detached', timeout: 300000 })
    .catch(() => undefined);
  await quiet(4000, 60000);
  report.matchStartMs = Date.now() - t0;
}
endPhase('match32', 'idle');

// ---- idle play ------------------------------------------------------------------------------------------------------------
if (PHASES.has('idle')) {
  if (OFFLINE_AFTER > 0) {
    // phase 'idle' = the first OFFLINE_AFTER seconds online; phase 'offline' = the rest with the network cut
    await page.waitForTimeout(OFFLINE_AFTER * 1000);
    summarize('idle');
    phase = 'offline';
    await ctx.setOffline(true);
    await page.waitForTimeout(Math.max(0, IDLE_S - OFFLINE_AFTER) * 1000);
    report.stateAfterOffline = await page
      .evaluate(() => ({
        phase: window.__WAHALA__.getState()?.match.phase,
        tick: window.__WAHALA__.getState()?.tick,
        musicPlaying: window.__WAHALA__.music()?.playing,
      }))
      .catch(() => null);
    summarize('offline');
  } else await page.waitForTimeout(IDLE_S * 1000);
}
endPhase('idle', 'done');

report.musicStatus = await page.evaluate(() => window.__WAHALA__?.music?.() ?? null).catch(() => null);
if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
await browser.close();
