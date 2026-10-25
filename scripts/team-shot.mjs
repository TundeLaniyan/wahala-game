// Art review for the V2 Rumble modes (needs a running preview / dev server; SHOT_URL as in quick-shot.mjs):
//   node scripts/team-shot.mjs <out-prefix> [desktop|mobile]
// Team Rumble 8 v 8: team kit and rings, then the local player knocked out and back with spawn protection.
import { chromium } from '@playwright/test';
const [prefix, device = 'desktop'] = process.argv.slice(2);
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
page.setDefaultTimeout(240000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(
  `${process.env.SHOT_URL ?? 'http://localhost:5199/wahala-game/'}?debug&noattract&q=${process.env.Q ?? 'medium'}&seed=7`,
);
await page.getByTestId('title-screen').waitFor();
await page.getByTestId('play-rumble').click();
await page.getByTestId('mode-team').click();
await page.getByTestId('rumble-16').click();
await page.getByTestId('start-button').click();
await page.getByTestId('hud').waitFor();
// gather a few fighters of both teams around the local player so the kit reads in one frame
await page.evaluate(() => {
  const w = window.__WAHALA__;
  w.controller().frozen = true;
  w.stepTicks(170);
  const s = w.getState();
  const me = s.players[0];
  const near = [
    [1, 0],
    [-1, 0],
    [0, -2],
    [2, -2],
    [-2, -2],
  ];
  let k = 0;
  for (const p of s.players) {
    if (p.id === 0 || k >= near.length) continue;
    const [dx, dy] = near[k];
    const x = me.x + dx;
    const y = me.y + dy;
    if (s.tiles[y * s.width + x] !== 0) continue;
    p.x = p.stepFromX = x;
    p.y = p.stepFromY = y;
    k++;
  }
});
await page.evaluate(() => (window.__WAHALA__.controller().frozen = false));
await page.waitForTimeout(3000);
await page.evaluate(() => (window.__WAHALA__.controller().frozen = true));
await page.waitForTimeout(500);
await page.screenshot({ path: `${prefix}-team.jpg`, quality: 85, timeout: 180000 });
// knocked out, back with spawn protection
await page.evaluate(() => {
  const w = window.__WAHALA__;
  const s = w.getState();
  const me = s.players[0];
  me.alive = false;
  me.eliminatedTick = s.tick;
  me.stats.deaths++;
  me.elimination = { kind: 'crush', eventId: 0 };
  me.respawnAt = s.tick + 2;
  w.controller().frozen = false;
});
await page.waitForTimeout(2500);
await page.evaluate(() => (window.__WAHALA__.controller().frozen = true));
await page.waitForTimeout(300);
await page.screenshot({ path: `${prefix}-protected.jpg`, quality: 85, timeout: 180000 });
console.log(JSON.stringify({ errors }));
await browser.close();
