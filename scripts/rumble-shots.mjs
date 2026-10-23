// City Rumble screenshots and a frame-rate sample (needs a dev server; SHOT_URL defaults to http://localhost:5199/):
//   node scripts/rumble-shots.mjs <out-dir> <desktop|mobile> [competitors=32] [ticks=900]
// Captures: play (follow camera + minimap + roster), spectate (the local player knocked out), the next
// survivor after cycling, the standings (desktop) and the results. Prints render stats and the fps
// measured over a few seconds of real play. Q=low|medium|high (default medium).
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [dir = 'shots', device = 'desktop', count = '32', ticks = '360'] = process.argv.slice(2);
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
await context.addInitScript((n) => {
  const key = 'wahala.settings.v1';
  const s = JSON.parse(localStorage.getItem(key) || '{}');
  localStorage.setItem(
    key,
    JSON.stringify({ ...s, arenaId: 'cityRumble', rumbleCompetitors: n, difficulty: 'medium' }),
  );
}, Number(count));
const page = await context.newPage();
page.setDefaultTimeout(240000);
const t0 = Date.now();
const mark = (what) => console.error(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${what}`);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(
  `${process.env.SHOT_URL ?? 'http://localhost:5199/'}?debug&noattract&fps&q=${process.env.Q ?? 'medium'}&seed=7`,
);
await page.getByTestId('title-screen').waitFor({ timeout: 120000 });
mark('title');
await page.getByTestId('start-button').click();
await page.getByTestId('hud').waitFor();
mark('hud');
await page.waitForTimeout(1500);
const shot = (name) =>
  page.screenshot({ path: `${dir}/${device}-${name}.jpg`, quality: 82, timeout: 180000 });

// play: fast-forward (simulation only), then a few real frames so effects and the camera settle
await page.evaluate((n) => {
  const w = window.__WAHALA__;
  w.controller().frozen = true;
  w.stepTicks(Math.max(0, n - 30));
}, Number(ticks));
mark('fast-forwarded');
await page.evaluate(() => {
  const w = window.__WAHALA__;
  w.advance(30);
  w.controller().frozen = false;
});
mark('advanced');
await page.waitForTimeout(1500);
// measure a few seconds of real play (frames rendered per second of wall time)
const fps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let frames = 0;
      const t0 = performance.now();
      const loop = () => {
        frames++;
        if (performance.now() - t0 < 3000) requestAnimationFrame(loop);
        else resolve((frames * 1000) / (performance.now() - t0));
      };
      requestAnimationFrame(loop);
    }),
);
await page.evaluate(() => (window.__WAHALA__.controller().frozen = true));
await page.waitForTimeout(500);
mark('fps measured');
await shot('1-play');
mark('play shot');
const stats = await page.evaluate(() => ({
  render: window.__WAHALA__.stats(),
  alive: window.__WAHALA__.getState().players.filter((p) => p.alive).length,
  localAlive: window.__WAHALA__.getState().players[0].alive,
  cam: window.__WAHALA__.renderer().debugCamera(),
}));

// spectate: knock the local player out (staged for the screenshot), as if by the nearest bot
await page.evaluate(() => {
  const s = window.__WAHALA__.getState();
  const me = s.players[0];
  window.__WAHALA__.controller().frozen = false;
  if (!me.alive) return;
  let best = null;
  for (const p of s.players) {
    if (!p.alive || p.id === 0) continue;
    const d = Math.abs(p.x - me.x) + Math.abs(p.y - me.y);
    if (!best || d < best.d) best = { id: p.id, d };
  }
  me.alive = false;
  me.eliminatedTick = s.tick;
  me.elimination = { kind: 'flame', ownerId: best ? best.id : 1, eventId: 0 };
  window.__WAHALA__.controller().frozen = false;
});
await page.getByTestId('spectate-target').waitFor();
await page.waitForTimeout(2500);
await shot('2-spectate');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(2500);
await shot('3-spectate-next');
if (device === 'desktop') {
  await page.getByTestId('roster-button').click();
  await page.waitForTimeout(400);
  await shot('4-standings');
  await page.getByTestId('roster-button').click();
}
await page.getByTestId('skip-results').click();
await page.getByTestId('results').waitFor({ timeout: 900000 });
await page.waitForTimeout(600);
await shot('5-results');
mark('results');
console.log(
  JSON.stringify({ device, count, fps: Math.round(fps * 10) / 10, stats, errors: errors.slice(0, 8) }),
);
await browser.close();
