// Screenshots of the real game (not the model viewer) for art reviews against reference/.
// Usage: node tools/viewer/gameshot.mjs <outPrefix> [width] [height] [quality] [ticks...]
// Needs a running Vite dev server (npm run dev -- --port 5199 --strictPort) and WAHALA_CHROMIUM.
// Starts a 4-player match (seed 7, bots on), advances the simulation to each tick count in turn and
// writes <outPrefix>-<ticks>.png. Set MOUNT=1 to put every player on an Okada (debug only, visual check).
import { chromium } from '@playwright/test';

const [prefix, width = '1280', height = '720', quality = 'high', ...tickArgs] = process.argv.slice(2);
const ticks = tickArgs.length ? tickArgs.map(Number) : [200];
const base = process.env.VIEWER_BASE ?? 'http://localhost:5199';
const mobile = +width < 900;
const browser = await chromium.launch({
  executablePath: process.env.WAHALA_CHROMIUM || undefined,
  args: ['--single-process', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({
  viewport: { width: +width, height: +height },
  isMobile: mobile,
  hasTouch: mobile,
  deviceScaleFactor: Number(process.env.DSF ?? (mobile ? 2 : 1)),
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}/?debug&noattract&q=${quality}&seed=${process.env.SEED ?? 7}`);
await page.getByTestId('players-4').click();
if (process.env.ARENA) {
  await page.getByTestId(`arena-${process.env.ARENA}`).click();
}
await page.getByTestId('start-button').click();
await page.waitForFunction(() => window.__WAHALA__?.getState()?.match.phase !== undefined, null, { timeout: 60000 });
let done = 0;
for (const t of ticks) {
  await page.evaluate((n) => {
    const w = window.__WAHALA__;
    w.controller().frozen = true;
    w.stepTicks(n);
  }, t - done);
  done = t;
  if (process.env.MOUNT) {
    await page.evaluate(() => {
      for (const p of window.__WAHALA__.getState().players) p.mounted = true;
    });
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${prefix}-${t}.png`, timeout: 120000 });
}
const stats = await page.evaluate(() => window.__WAHALA__.stats());
console.log(JSON.stringify({ stats, errors }, null, 1));
await browser.close();
