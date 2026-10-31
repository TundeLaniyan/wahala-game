// Art review for the 32 fighter identities (decision FF1; needs a preview server, SHOT_URL defaults to
// http://localhost:5199/wahala-game/): seats all 32 City Rumble competitors in a staged lineup and takes close-ups.
//   node scripts/identity-shots.mjs <out-prefix> [desktop|mobile]
import { chromium } from '@playwright/test';
const [prefix = 'identity', device = 'desktop'] = process.argv.slice(2);
const VP = {
  desktop: { viewport: { width: 1280, height: 720 } },
  mobile: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const browser = await chromium.launch({
  executablePath: process.env.WAHALA_CHROMIUM,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await (await browser.newContext(VP[device])).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${process.env.SHOT_URL ?? 'http://localhost:5199/wahala-game/'}?debug&noattract&q=${process.env.Q ?? 'high'}&seed=7&nobots`);
await page.getByTestId('title-screen').waitFor();
await page.getByTestId('home-rumble').click();
await page.getByTestId('mode-survival').click();
await page.getByTestId('rumble-32').click();
await page.getByTestId('quick-review').click().catch(() => {});
if ((await page.getByTestId('menu-setup').count()) > 0) await page.getByTestId('menu-continue').click();
if ((await page.getByTestId('menu-fighter').count()) > 0) await page.getByTestId('menu-continue').click();
await page.getByTestId('start-button').click();
await page.getByTestId('hud').waitFor();
await page.waitForTimeout(1500);
// staging only: an open stage and every competitor in a 8 x 4 grid, two tiles apart, all facing the camera
const info = await page.evaluate(() => {
  const w = window.__WAHALA__;
  const s = w.getState();
  w.controller().frozen = true;
  s.crush = null;
  const x0 = Math.floor((s.width - 8) / 2);
  const y0 = Math.floor((s.height - 4) / 2);
  for (let y = y0 - 1; y <= y0 + 4; y++) for (let x = x0 - 1; x <= x0 + 8; x++) s.tiles[y * s.width + x] = 0;
  // the follow camera culls fighters far from the local player: seat the local player (slot 0) mid-block
  const cell = (i) => (i === 0 ? 11 : i === 11 ? 0 : i);
  s.players.forEach((p, i) => {
    p.x = p.stepFromX = x0 + (cell(i) % 8);
    p.y = p.stepFromY = y0 + Math.floor(cell(i) / 8);
    p.facing = 'down';
    p.protectedUntil = 0;
  });
  s.match.phase = 'playing';
  w.stepTicks(200);
  return { x0, y0, count: s.players.length, w: s.width, h: s.height };
});
console.log(JSON.stringify(info));
const shots = [
  ['all', info.x0 + 3.5, info.y0 + 1.5, 1.9],
  ['row0', info.x0 + 3.5, info.y0 + 0.3, 0.5],
  ['row1', info.x0 + 3.5, info.y0 + 1.3, 0.5],
  ['row2', info.x0 + 3.5, info.y0 + 2.3, 0.5],
  ['row3', info.x0 + 3.5, info.y0 + 3.3, 0.5],
];
for (const [name, tx, ty, zoom] of shots) {
  // tile -> world (render/coords.ts): the board is centred on the origin
  const target = { x: tx - info.w / 2 + 0.5, z: ty - info.h / 2 + 0.5, zoom };
  await page.evaluate((t) => window.__WAHALA__.renderer().debugInspect(t), target);
  await page.evaluate(() => (window.__WAHALA__.controller().frozen = false));
  await page.waitForTimeout(2500);
  await page.evaluate(() => (window.__WAHALA__.controller().frozen = true));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${prefix}-${name}.jpg`, quality: 88, timeout: 180000 });
}
console.log(errors.length ? `ERRORS ${errors.join('|')}` : 'no page errors');
await browser.close();
