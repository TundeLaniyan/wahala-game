// Player identification marker v2 review (decision TL8, docs/PLAYER_MARKER.md "v2"): the three marker styles in the Test
// Lab's "Player-identification variants" scene (the depot, five enemies close around the human), phone landscape
// 844x390 at deviceScaleFactor 2. The style is switched live through the lab's own HUD button, so every picture is the
// same frame of the same scene. Writes, per style, the full screen and a close-up around the player:
//   lab-phone-<mode>-v2.jpg and lab-phone-<mode>-v2-crop.jpg
//
//   SHOT_URL=http://localhost:<port>/wahala-game/ WAHALA_CHROMIUM=/opt/pw-browsers/chromium \
//   node scripts/player-marker-v2-shots.mjs [outDir]
//
// Screenshot staging only (the lab's fixed-seed scene, frozen); the sim and the rules are untouched.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'docs/screenshots/player-marker';
const base = process.env.SHOT_URL ?? 'http://localhost:4500/wahala-game/';
mkdirSync(outDir, { recursive: true });
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
const ctx = await browser.newContext({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?debug&q=low&seed=7&noattract&testlab=1`);
await page.getByTestId('testlab-home').waitFor();
await page.getByTestId('testlab-entry-identifyPlayer').tap();
await page.getByTestId('testlab-start').tap();
await page.getByTestId('hud').waitFor({ timeout: 240_000 });
await page.waitForFunction(() => window.__WAHALA__.matchLoad().state === null, null, { timeout: 300_000 });
await page.evaluate(() => {
  const w = window.__WAHALA__;
  w.controller().frozen = true;
  w.stepTicks(300);
  w.advance(30);
});
const clip = await page.evaluate(() => {
  const w = window.__WAHALA__;
  const me = w.getState().players[0];
  const pt = w.renderer().projectTiles([{ x: me.x, y: me.y }])?.[0];
  return { x: Math.max(0, pt.x - 130), y: Math.max(0, pt.y - 135), width: 260, height: 180 };
});
// the HUD button cycles Indicator -> Indicator + Ground -> Original; start by going to each style in a fixed order
const order = [
  ['original', 'ORIG'],
  ['indicator', 'IND'],
  ['indicatorGround', 'IND+G'],
];
const button = page.getByTestId('marker-hud-button');
for (const [mode, label] of order) {
  for (let i = 0; i < 3 && (await button.textContent()) !== label; i++) await button.tap();
  const now = await page.evaluate(() => window.__WAHALA__.playerMarker());
  if (now !== mode)
    throw new Error(`HUD button label ${label} but the renderer is on ${now}, expected ${mode}`);
  await page.waitForTimeout(1500); // the eased prominence settles
  await page.screenshot({
    path: join(outDir, `lab-phone-${mode}-v2.jpg`),
    type: 'jpeg',
    quality: 88,
    timeout: 180_000,
  });
  await page.screenshot({
    path: join(outDir, `lab-phone-${mode}-v2-crop.jpg`),
    type: 'jpeg',
    quality: 90,
    clip,
    timeout: 180_000,
  });
  console.log('wrote', mode);
}
await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
