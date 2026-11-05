// Art review of the raid looks on a real standard board (the three variants are shown with ?raidart=, see
// render/arenas/raidArt.ts). Needs a preview server (SHOT_URL, default http://localhost:5391/wahala-game/):
//   node scripts/raid-shots.mjs <out-prefix> <warehouse|yard|storeroom> <desktop|phone> [ticks]
// INSPECT="x,z,zoom;..." adds close-ups of world points. Judge the rendered picture, not the code.
import { chromium } from '@playwright/test';
const [prefix, variant = 'warehouse', device = 'desktop', ticks = '200'] = process.argv.slice(2);
const VP = {
  desktop: { viewport: { width: 1280, height: 720 } },
  phone: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
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
const base = process.env.SHOT_URL ?? 'http://localhost:5391/wahala-game/';
await page.goto(`${base}?debug&noattract&q=${process.env.Q ?? 'medium'}&seed=7&raidart=${variant}`);
await page.getByTestId('title-screen').waitFor();
await page.getByTestId('home-classic').click();
await page.getByTestId('classic-setup').waitFor();
await page.getByTestId('arena-oshodiInterchange').click();
await page.getByTestId('players-4').click();
if ((await page.getByTestId('menu-setup').count()) > 0) await page.getByTestId('menu-continue').click();
if ((await page.getByTestId('menu-fighter').count()) > 0) await page.getByTestId('menu-continue').click();
await page.getByTestId('start-button').click({ noWaitAfter: true, timeout: 180000 });
await page.getByTestId('hud').waitFor({ timeout: 180000 });
await page.waitForTimeout(1200);
await page.evaluate((n) => {
  const w = window.__WAHALA__;
  w.controller().frozen = true;
  w.stepTicks(Math.max(0, n - 240));
  w.advance(Math.min(n, 240));
}, Number(ticks));
await page.evaluate(() => (window.__WAHALA__.controller().frozen = false));
await page.waitForTimeout(Number(process.env.RUNMS ?? 2000));
await page.evaluate(() => (window.__WAHALA__.controller().frozen = true));
await page.waitForTimeout(800);
await page.screenshot({ path: `${prefix}.jpg`, quality: 85, timeout: 180000 });
for (const [n, spec] of (process.env.INSPECT ?? '').split(';').filter(Boolean).entries()) {
  const [x, z, zoom] = spec.split(',').map(Number);
  await page.evaluate((t) => window.__WAHALA__.renderer().debugInspect(t), { x, z, zoom: zoom || 1 });
  await page.evaluate(() => (window.__WAHALA__.controller().frozen = false));
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${prefix}-inspect${n}.jpg`, quality: 85, timeout: 180000 });
}
console.log(
  JSON.stringify({ stats: await page.evaluate(() => window.__WAHALA__.stats()), errors: errors.slice(0, 5) }),
);
await browser.close();
