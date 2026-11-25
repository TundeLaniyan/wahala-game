// What the audio costs on the wire (decision AU5): bytes and requests, by stage, for ONE build served the way GitHub Pages
// serves it (scripts/perf/pages-server.mjs). Real Chromium, real menu journey, bytes from the DevTools protocol
// (`encodedDataLength`: what crossed the network, after compression), service worker blocked so every visit is a first visit.
//
//   node scripts/perf/pages-server.mjs dist --port 4181 &
//   WAHALA_CHROMIUM=... node scripts/audio-load-measure.mjs --url http://localhost:4181/wahala-game/ --label after \
//       --arena rumbleOjuelegba --datasaver off --out /tmp/after-off.json
//
// Stages (cumulative counters are reset at the start of each):
//   boot     page load to the title screen, then 8 s idle: NOTHING has touched the page yet (the autoplay lock is still on)
//   gesture  the first click on the page, then 6 s: what the menu music costs
//   match    Home > Play > City Rumble > Deathmatch > <arena> > fighter > Ready > Start, until the HUD is up and the loading
//            screen is gone, then 10 s of play: what a first match costs
// For each stage: all bytes, audio bytes (URL contains /audio/), audio GETs by file with their bytes, and the number of audio
// HEAD probes (headers only). `--datasaver on|off|auto` sets the saved Music Data Saver setting before the page loads.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const URL_ = opt('url', 'http://localhost:4181/wahala-game/');
const LABEL = opt('label', 'run');
const ARENA = opt('arena', 'rumbleOjuelegba');
const DATASAVER = opt('datasaver', 'off');
const OUT = opt('out', '');

const browser = await chromium.launch({
  executablePath: process.env.WAHALA_CHROMIUM || undefined,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--autoplay-policy=document-user-activation-required',
    ...(process.env.WAHALA_MULTIPROCESS ? [] : process.env.WAHALA_CHROMIUM ? ['--single-process'] : []),
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
await ctx.addInitScript(
  ([key, ds]) => {
    try {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ dataSaver: ds }));
    } catch {
      /* private mode */
    }
  },
  ['wahala.settings.v1', DATASAVER],
);
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const reqs = new Map(); // requestId -> { url, method, bytes }
cdp.on('Network.requestWillBeSent', (e) => {
  if (!reqs.has(e.requestId))
    reqs.set(e.requestId, { url: e.request.url, method: e.request.method, bytes: 0 });
});
cdp.on('Network.loadingFinished', (e) => {
  const r = reqs.get(e.requestId);
  if (r) r.bytes = e.encodedDataLength;
});
const base = new URL(URL_).pathname;
let mark = 0; // request ids seen before the current stage
const seen = new Set();
const stage = (name) => {
  const out = {
    stage: name,
    requests: 0,
    bytes: 0,
    audioBytes: 0,
    audioGets: {},
    audioHeads: 0,
    otherBytes: 0,
  };
  for (const [id, r] of reqs) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.requests++;
    out.bytes += r.bytes;
    if (r.url.includes('/audio/')) {
      const file = decodeURIComponent(r.url.slice(r.url.indexOf('/audio/') + 7)).split('?')[0];
      if (r.method === 'HEAD') out.audioHeads++;
      else {
        out.audioBytes += r.bytes;
        out.audioGets[file] = (out.audioGets[file] ?? 0) + r.bytes;
      }
    } else out.otherBytes += r.bytes;
  }
  void mark;
  return out;
};

const stages = [];
const t0 = Date.now();
await page.goto(`${URL_}?debug&q=low&seed=7&noattract`);
await page.getByTestId('title-screen').waitFor({ timeout: 180_000 });
await page.waitForFunction(() => !document.querySelector('[data-testid=menu-loading]'), null, {
  timeout: 180_000,
});
await page.waitForTimeout(8000);
stages.push({ ...stage('boot'), ms: Date.now() - t0 });

await page.mouse.click(6, 6); // the first gesture: unlocks audio
await page.waitForTimeout(6000);
stages.push(stage('gesture'));

const click = (id) => page.getByTestId(id).click({ timeout: 180_000 });
const t1 = Date.now();
await click('home-play');
await click('home-rumble');
await click('mode-deathmatch');
const card = page.getByTestId(`rumble-stage-${ARENA}`);
await card.scrollIntoViewIfNeeded();
await card.click();
await page.waitForTimeout(1500);
await click('menu-continue');
await click('menu-continue');
await page.waitForTimeout(1500);
await click('start-button');
await page.getByTestId('hud').waitFor({ timeout: 300_000 });
await page.waitForFunction(() => !document.querySelector('[data-testid=match-loading]'), null, {
  timeout: 300_000,
});
const toHud = Date.now() - t1;
await page.waitForTimeout(10_000);
stages.push({ ...stage('match'), msToHud: toHud });

const music = await page
  .evaluate(() => {
    const w = window;
    return w.__WAHALA__?.audio?.musicState?.() ?? null;
  })
  .catch(() => null);

const total = stages.reduce(
  (a, s) => ({
    bytes: a.bytes + s.bytes,
    audioBytes: a.audioBytes + s.audioBytes,
    requests: a.requests + s.requests,
    audioHeads: a.audioHeads + s.audioHeads,
  }),
  { bytes: 0, audioBytes: 0, requests: 0, audioHeads: 0 },
);
const result = { label: LABEL, arena: ARENA, datasaver: DATASAVER, base, stages, total, music, errors };
const mb = (n) => (n / 1e6).toFixed(2);
console.log(`\n${LABEL}  arena=${ARENA}  datasaver=${DATASAVER}`);
for (const s of stages)
  console.log(
    `  ${s.stage.padEnd(8)} all ${mb(s.bytes).padStart(6)} MB   audio ${mb(s.audioBytes).padStart(5)} MB in ${Object.keys(s.audioGets).length} file(s), ${s.audioHeads} HEAD probes   ${Object.entries(
      s.audioGets,
    )
      .map(([f, b]) => `${f.replace('music/', '')}:${mb(b)}`)
      .join(' ')}`,
  );
console.log(
  `  total    all ${mb(total.bytes)} MB   audio ${mb(total.audioBytes)} MB   ${total.requests} requests (${total.audioHeads} audio HEAD)   errors ${errors.length}`,
);
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
await browser.close();
