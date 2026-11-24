// Deterministic screenshots of the same scene on a given build, for before/after comparison (docs/MOBILE_PERFORMANCE.md).
//   node scripts/perf/visual-capture.mjs --url http://localhost:4180/wahala-game/ --out dir [--scenes classic,rumble,taxi,danfo,keke]
// Every scene: ?seed=7, q=high, 960x540 @1x, sim stepped by N ticks then frozen, a second of rendering to settle, then a PNG.
// The renderer's ambient motion is wall-clock driven, so two captures of the SAME build differ a little: compare a build
// with itself first (the noise floor) before reading a difference between builds (scripts/perf/visual-diff.py).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const URL_ = opt('url', 'http://localhost:4180/wahala-game/');
const OUT = opt('out', '/tmp/shots');
const EXTRA = opt('extra', '');
const SCENES = opt('scenes', 'classic,rumble,taxi,danfo,keke').split(',');
fs.mkdirSync(OUT, { recursive: true });
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
for (const scene of SCENES) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const rumble = scene === 'rumble';
  await ctx.addInitScript(
    ([rumble, scene]) =>
      localStorage.setItem(
        'wahala.settings.v1',
        JSON.stringify({
          play: rumble ? 'rumble' : 'classic',
          competitors: 2,
          rumbleCompetitors: 16,
          rumbleMode: 'survival',
          rumbleArenaId: 'rumbleOshodi',
          arenaId: 'danfoBusPark',
          character: scene === 'taxi' ? 'streetBaller' : scene === 'keke' ? 'lekkiBoy' : 'campusQueen',
        }),
      ),
    [rumble, scene],
  );
  const page = await ctx.newPage();
  await page.goto(`${URL_}?debug&noattract&seed=7&q=high${scene === 'rumble' ? '' : '&nobots'}${EXTRA}`);
  await page.getByTestId('title-screen').waitFor({ timeout: 120000 });
  await page.getByTestId('home-play').click();
  await page.getByTestId(rumble ? 'home-rumble' : 'home-classic').click();
  if (rumble) await page.getByTestId('mode-survival').click();
  await page.getByTestId('setup-start').click();
  await page.getByTestId('hud').waitFor({ timeout: 300000 });
  await page
    .getByTestId('match-loading')
    .waitFor({ state: 'detached', timeout: 300000 })
    .catch(() => undefined);
  const step = (n) =>
    page.evaluate((count) => {
      const w = window.__WAHALA__;
      w.controller().frozen = true;
      w.stepTicks(count);
    }, n);
  await step(180);
  if (['taxi', 'danfo', 'keke'].includes(scene)) {
    // hand out the voucher and press B once, as e2e/game.spec.ts does
    await page.evaluate((kind) => {
      const s = window.__WAHALA__.getState();
      const p = s.players[0];
      p.hasVoucher = true;
      p.voucherKind = kind;
      p.x = p.stepFromX = 0;
      p.y = p.stepFromY = 10;
      const r = s.players[1];
      r.x = r.stepFromX = 9;
      r.y = r.stepFromY = 6;
      r.stepRemaining = 0;
    }, scene);
    await step(2);
    await page.keyboard.press('k');
    await step(2);
    await step(70); // the vehicle is on its way in
  }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, `${scene}.png`) });
  console.log('captured', scene);
  await ctx.close();
}
await browser.close();
