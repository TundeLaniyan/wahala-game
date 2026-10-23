// Captures real gameplay screenshots of every arena on a desktop and a phone viewport.
//
//   node scripts/gameplay-shots.mjs --url http://localhost:5173/ --out shots/after [--arenas a,b] [--tag x]
//
// Needs a running dev/preview server. Uses the `?debug` hook to step the deterministic simulation
// (seeded), then lets the real-time loop run briefly so animations and particles are live.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
    return acc;
  }, []),
);
const url = args.url ?? 'http://localhost:5173/';
const out = args.out ?? 'shots';
const tag = args.tag ? `-${args.tag}` : '';
const arenas = (args.arenas ?? 'danfoBusPark,balogunMarket,lekkiRoadworks').split(',');
const query = args.query ?? '';
const devices = (args.devices ?? 'desktop,mobile').split(',');
mkdirSync(out, { recursive: true });

const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 720 } },
  mobile: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

const browser = await chromium.launch({
  executablePath: process.env.WAHALA_CHROMIUM || undefined,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});

const step = (page, n) =>
  page.evaluate((count) => {
    const w = window.__WAHALA__;
    w.controller().frozen = true;
    w.stepTicks(count);
  }, n);
const run = async (page, ms) => {
  await page.evaluate(() => (window.__WAHALA__.controller().frozen = false));
  await page.waitForTimeout(ms);
  await page.evaluate(() => (window.__WAHALA__.controller().frozen = true));
};
// Software WebGL renders a few frames per second, so the damped camera is cut to its goal before a shot.
const settle = async (page) => {
  await page.evaluate(() => window.__WAHALA__.renderer().cutCamera());
  await page.waitForTimeout(700);
};
const force = (page, intent) =>
  page.evaluate((i) => window.__WAHALA__.controller().forceIntent(0, i), intent);

for (const device of devices) {
  const ctx = await browser.newContext(VIEWPORTS[device]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  for (const arena of arenas) {
    await page.goto(`${url}?debug&q=${args.q ?? 'high'}&seed=${args.seed ?? 7}${query}`);
    await page.getByTestId('title-screen').waitFor();
    await page.getByTestId(`arena-${arena}`).click();
    await page.getByTestId('players-4').click();
    await page.getByTestId('start-button').click();
    await page.getByTestId('hud').waitFor();
    await page.waitForTimeout(1500);
    const name = (s) => join(out, `${arena}-${device}${tag}-${s}.jpg`);
    await step(page, 20);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: name('0-countdown'), quality: 82 });
    await step(page, 200);
    // Walk the local player one tile, drop a generator and walk away so the blast is in frame.
    const me = await page.evaluate(() => {
      const p = window.__WAHALA__.getState().players[0];
      return { x: p.x, y: p.y };
    });
    const w = await page.evaluate(() => window.__WAHALA__.getState().width);
    const right = me.x < w / 2;
    for (const move of [right ? 'right' : 'left']) {
      await force(page, { move });
      await step(page, 14);
    }
    await force(page, { place: true });
    await step(page, 2);
    await run(page, 1500);
    await settle(page);
    await page.screenshot({ path: name('1-running'), quality: 82 });
    await step(page, 120);
    await run(page, 600);
    await settle(page);
    await page.screenshot({ path: name('2-blast'), quality: 82 });
    // Screenshot-only: put the local player on an open tile near the north wall to show the far backdrop.
    await page.evaluate(() => {
      const s = window.__WAHALA__.getState();
      const p = s.players[0];
      for (const y of [1, 2, 3]) {
        for (let d = 0; d < s.width / 2; d++) {
          for (const x of [Math.floor(s.width / 2) - d, Math.floor(s.width / 2) + d]) {
            if (s.tiles[y * s.width + x] === 0 && !s.generators.some((g) => g.x === x && g.y === y)) {
              p.x = p.stepFromX = x;
              p.y = p.stepFromY = y;
              p.stepRemaining = 0;
              p.facing = 'up';
              return;
            }
          }
        }
      }
    });
    await step(page, 1);
    await settle(page);
    await page.screenshot({ path: name('3-north'), quality: 82 });
    // Vehicle attack: give the local player a voucher, open the entry chooser, launch, then watch it drive.
    if (args.vehicles !== undefined) {
      await page.evaluate(() => {
        const p = window.__WAHALA__.getState().players[0];
        p.hasVoucher = true;
      });
      await step(page, 2);
      await page.keyboard.press('v');
      await step(page, 2);
      await settle(page);
      await page.screenshot({ path: name('5-entry'), quality: 82 });
      await page.keyboard.press('Enter');
      await step(page, 2);
      await page.keyboard.press('Enter');
      await step(page, 75);
      await run(page, 400);
      await settle(page);
      await page.screenshot({ path: name('6-vehicle'), quality: 82 });
    }
    if (args.overview !== undefined) {
      await page.keyboard.press('o');
      await settle(page);
      await page.screenshot({ path: name('4-overview'), quality: 82 });
      await page.keyboard.press('o');
    }
    console.log('captured', arena, device);
  }
  await ctx.close();
}
await browser.close();
