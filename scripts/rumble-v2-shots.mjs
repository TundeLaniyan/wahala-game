// City Rumble V2 stage screenshots (art review; needs a dev server, SHOT_URL defaults to http://localhost:5206/):
//   node scripts/rumble-v2-shots.mjs <out-dir> <arenaId> [desktop|mobile] [competitors=16] [ticks=900]
// Captures the real game through the follow camera: `play` (the local player where they spawned, after
// `ticks` of play), then the local player moved to each SPOTS entry ("x,y;x,y" tiles, default: the
// north edge, the east edge, the centre) for a few seconds of live play each, and INSPECT close-ups
// ("x,z,zoom;..." world points, unclamped) of the surroundings. Prints render stats and page errors.
// Q=low|medium|high (default medium). HAZARD=1 waits for a stage warning before the `play` frame.
// PREVIEW_OUT=<dir> also writes the 640 x 360 menu card image <dir>/<arenaId>.jpg (HUD hidden).
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [dir = 'shots', arena = 'rumbleOshodi', device = 'desktop', count = '16', ticks = '900'] =
  process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const VP = {
  desktop: { viewport: { width: 1280, height: 720 } },
  mobile: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const browser = await chromium.launch({
  executablePath: process.env.WAHALA_CHROMIUM,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const context = await browser.newContext(VP[device]);
await context.addInitScript(
  ([a, n]) => {
    const key = 'wahala.settings.v1';
    const s = JSON.parse(localStorage.getItem(key) || '{}');
    localStorage.setItem(
      key,
      JSON.stringify({
        ...s,
        play: 'rumble',
        rumbleArenaId: a,
        rumbleCompetitors: n,
        rumbleMode: 'survival',
        difficulty: 'standard',
      }),
    );
  },
  [arena, Number(count)],
);
const page = await context.newPage();
page.setDefaultTimeout(300000);
const t0 = Date.now();
const mark = (what) => console.error(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${what}`);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(
  `${process.env.SHOT_URL ?? 'http://localhost:5206/'}?debug&noattract&q=${process.env.Q ?? 'medium'}&seed=7`,
);
await page.getByTestId('title-screen').waitFor({ timeout: 180000 });
// the Stitch menu starts the saved setup from Home with Quick play (the older single screen had Start)
const quick = page.getByTestId('quick-play');
await quick.or(page.getByTestId('start-button')).first().waitFor({ timeout: 180000 });
if ((await quick.count()) > 0) await quick.click();
else await page.getByTestId('start-button').click();
await page.getByTestId('hud').waitFor();
mark('hud');
const arenaNow = await page.evaluate(() => window.__WAHALA__.getState().arenaId);
if (arenaNow !== arena) throw new Error(`started ${arenaNow}, wanted ${arena}`);
await page.waitForTimeout(1200);
const shot = (name) =>
  page.screenshot({ path: `${dir}/${arena}-${device}-${name}.jpg`, quality: 82, timeout: 240000 });
const run = async (ms) => {
  await page.evaluate(() => (window.__WAHALA__.controller().frozen = false));
  await page.waitForTimeout(ms);
  await page.evaluate(() => (window.__WAHALA__.controller().frozen = true));
  await page.waitForTimeout(500);
};

await page.evaluate((n) => {
  const w = window.__WAHALA__;
  w.controller().frozen = true;
  // screenshot staging only: the local player keeps spawn protection so the follow camera stays on them
  w.getState().players[0].protectedUntil = 1e9;
  w.stepTicks(Math.max(0, n - 12));
  w.advance(Math.min(n, 12));
}, Number(ticks));
if (process.env.HAZARD) {
  await page.evaluate(() => {
    const w = window.__WAHALA__;
    for (let i = 0; i < 1200 && w.getState().stage.events.length === 0; i++) w.stepTicks(1);
    w.stepTicks(50);
    w.advance(6);
  });
}
await run(Number(process.env.RUNMS ?? 1200));
await shot('play');
mark('play');

const spots = (process.env.SPOTS ?? '').split(';').filter(Boolean);
for (const [n, spec] of spots.entries()) {
  const [x, y] = spec.split(',').map(Number);
  await page.evaluate(
    ([x, y]) => {
      const s = window.__WAHALA__.getState();
      const p = s.players[0];
      if (!p.alive) return;
      const i = y * s.width + x;
      if (s.tiles[i] === 2) s.tiles[i] = 0;
      p.x = p.stepFromX = x;
      p.y = p.stepFromY = y;
      p.stepRemaining = 0;
      p.protectedUntil = s.tick + 600;
    },
    [x, y],
  );
  await run(Number(process.env.RUNMS ?? 1200));
  await shot(`spot${n}`);
  mark(`spot ${n}`);
}
for (const [n, spec] of (process.env.INSPECT ?? '').split(';').filter(Boolean).entries()) {
  const [x, z, zoom] = spec.split(',').map(Number);
  await page.evaluate((t) => window.__WAHALA__.renderer().debugInspect(t), { x, z, zoom: zoom || 1 });
  await run(1400);
  await shot(`inspect${n}`);
  mark(`inspect ${n}`);
}
// PREVIEW_OUT=public/previews: the menu card image (640 x 360, HUD hidden) from the current view
if (process.env.PREVIEW_OUT) {
  await page.setViewportSize({ width: 640, height: 360 });
  await page.addStyleTag({ content: '.hud, .touch, .touch-controls { display: none !important; }' });
  await run(1200);
  await page.screenshot({
    path: `${process.env.PREVIEW_OUT}/${arena}.jpg`,
    type: 'jpeg',
    quality: 75,
    timeout: 240000,
  });
  mark('preview');
}
const stats = await page.evaluate(() => window.__WAHALA__.stats());
console.log(JSON.stringify({ arena, stats, errors: errors.slice(0, 5) }));
await browser.close();
