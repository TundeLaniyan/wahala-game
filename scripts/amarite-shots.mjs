// Lekki Amarite Way paving review (docs/LEKKI_AMARITE_WAY.md): the gameplay-camera view of the paved road and a close-up
// of the block pattern, on desktop (1280x720) or a phone (844x390, touch). Needs a preview / dev server (SHOT_URL, default
// http://localhost:5301/wahala-game/) and WAHALA_CHROMIUM (/opt/pw-browsers/chromium).
//   node scripts/amarite-shots.mjs <out-dir> <prefix> <desktop|mobile> [low|medium|high]
// Files: <dir>/<prefix>_<device>_gameplay.jpg and _close.jpg. Prints draw calls and triangles per shot.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [dir = 'shots', prefix = 'after', device = 'desktop', quality = 'medium'] = process.argv.slice(2);
const BASE = process.env.SHOT_URL ?? 'http://localhost:5301/wahala-game/';
const VP = {
  desktop: { viewport: { width: 1280, height: 720 } },
  mobile: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
}[device];
mkdirSync(dir, { recursive: true });
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
const context = await browser.newContext(VP);
await context.addInitScript(() => {
  const key = 'wahala.settings.v1';
  const s = JSON.parse(localStorage.getItem(key) || '{}');
  localStorage.setItem(
    key,
    JSON.stringify({
      ...s,
      play: 'rumble',
      rumbleArenaId: 'rumbleLekki',
      rumbleCompetitors: 16,
      rumbleMode: 'deathmatch',
      difficulty: 'standard',
    }),
  );
});
const page = await context.newPage();
page.setDefaultTimeout(300000);
await page.goto(`${BASE}?debug&noattract&nobots&q=${quality}&seed=7`);
const quick = page.getByTestId('quick-play');
await quick.or(page.getByTestId('start-button')).first().waitFor({ timeout: 180000 });
if ((await quick.count()) > 0) await quick.click();
else await page.getByTestId('start-button').click();
await page.getByTestId('hud').waitFor();
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const w = window.__WAHALA__;
  w.controller().frozen = true;
  for (const p of w.getState().players) p.protectedUntil = 1e9;
  w.stepTicks(400);
  w.advance(6);
});
await page.addStyleTag({ content: '.hud, .touch, .touch-controls { display: none !important; }' });
const shot = async (name) => {
  await page.waitForTimeout(1500);
  const file = `${dir}/${prefix}_${device}_${name}.jpg`;
  await page.screenshot({ path: file, quality: 80, type: 'jpeg', timeout: 240000 });
  const st = await page.evaluate(() => window.__WAHALA__.stats());
  console.log(JSON.stringify({ name, calls: st.drawCalls, tris: st.triangles, file }));
};
// 1: the normal gameplay camera on the paved road (south segment)
await page.evaluate(() => {
  const s = window.__WAHALA__.getState();
  const p = s.players[0];
  p.x = p.stepFromX = 22;
  p.y = p.stepFromY = 25;
  p.stepRemaining = 0;
  window.__WAHALA__.renderer().cutCamera();
});
await shot('gameplay');
// 2: a close view of the block pattern (world point of tile (21.5, 25.5) on a 57 x 39 board)
await page.evaluate(() =>
  window.__WAHALA__.renderer().debugInspect({ x: 21.5 - 28.5, z: 25.5 - 19.5, zoom: 0.45 }),
);
await shot('close');
await browser.close();
