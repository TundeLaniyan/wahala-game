// One gameplay screenshot of an arena (needs a dev server; SHOT_URL defaults to http://localhost:5199/wahala-game/):
//   node scripts/quick-shot.mjs <out-prefix> <arena> <desktop|mobile> [ticks] [extra query]
// INSPECT="x,z,zoom;..." adds unclamped close-ups of world points (art review); Q=low|medium|high.
import { chromium } from '@playwright/test';
const [prefix, arena = 'danfoBusPark', device = 'desktop', ticks = '260', query = ''] = process.argv.slice(2);
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
const page = await (await browser.newContext(VP[device])).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(
  `${process.env.SHOT_URL ?? 'http://localhost:5199/wahala-game/'}?debug&noattract&q=${process.env.Q ?? 'high'}&seed=7${query}`,
);
await page.getByTestId('title-screen').waitFor();
await page.getByTestId(`arena-${arena}`).click();
await page.getByTestId('players-4').click();
await page.getByTestId('start-button').click();
await page.getByTestId('hud').waitFor();
await page.waitForTimeout(1500);
await page.evaluate((n) => {
  const w = window.__WAHALA__;
  w.controller().frozen = true;
  w.stepTicks(n);
}, Number(ticks));
await page.evaluate(() => (window.__WAHALA__.controller().frozen = false));
await page.waitForTimeout(Number(process.env.RUNMS ?? 2500));
await page.evaluate(() => (window.__WAHALA__.controller().frozen = true));
await page.waitForTimeout(800);
await page.screenshot({ path: `${prefix}.jpg`, quality: 85, timeout: 180000 });
// INSPECT="x,z,zoom;x,z,zoom" adds close-up frames of the surroundings (art review)
for (const [n, spec] of (process.env.INSPECT ?? '').split(';').filter(Boolean).entries()) {
  const [x, z, zoom] = spec.split(',').map(Number);
  await page.evaluate((t) => window.__WAHALA__.renderer().debugInspect(t), { x, z, zoom: zoom || 1 });
  await page.evaluate(() => (window.__WAHALA__.controller().frozen = false));
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${prefix}-inspect${n}.jpg`, quality: 85, timeout: 180000 });
}
const stats = await page.evaluate(() => window.__WAHALA__.stats());
console.log(JSON.stringify({ stats, errors: errors.slice(0, 5) }));
await browser.close();
