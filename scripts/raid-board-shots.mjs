// Art review of a REAL classic raid board (docs/CLASSIC_GRID.md): starts the raid through the `?debug` handle
// (`campaign().debugStartRaid`), plays past the countdown and the first spawn warning, and saves one JPEG.
// Needs a preview server (SHOT_URL, default http://localhost:4967/wahala-game/):
//   node scripts/raid-board-shots.mjs <out.jpg> <raidId> [desktop|phone]
// Judge the rendered picture, not the code.
import { chromium } from '@playwright/test';
const [out, raidId = 'warehouseDispatchDepot', device = 'desktop'] = process.argv.slice(2);
const VP = {
  desktop: { viewport: { width: 1280, height: 720 } },
  phone: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
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
const page = await (await browser.newContext(VP[device])).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const base = process.env.SHOT_URL ?? 'http://localhost:4967/wahala-game/';
await page.goto(`${base}?debug&noattract&q=${process.env.Q ?? 'medium'}&seed=7`);
await page.getByTestId('title-screen').waitFor({ timeout: 180000 });
const started = await page.evaluate((id) => {
  const c = window.__WAHALA__.campaign();
  c.load?.();
  c.startNew?.();
  c.storyDone?.();
  return c.debugStartRaid(id);
}, raidId);
if (!started) throw new Error(`debugStartRaid(${raidId}) failed`);
await page.getByTestId('hud').waitFor({ timeout: 180000 });
await page.evaluate(() => {
  const w = window.__WAHALA__;
  w.controller().frozen = true;
  w.stepTicks(260); // past the countdown and the first wave's spawn warning
  w.advance(30);
});
await page.evaluate(() => (window.__WAHALA__.controller().frozen = false));
await page.waitForTimeout(Number(process.env.RUNMS ?? 1500));
await page.evaluate(() => (window.__WAHALA__.controller().frozen = true));
await page.waitForTimeout(800);
await page.screenshot({ path: out, type: 'jpeg', quality: Number(process.env.JPEG ?? 72), timeout: 180000 });
console.log(JSON.stringify({ out, raidId, device, errors: errors.slice(0, 5) }));
await browser.close();
