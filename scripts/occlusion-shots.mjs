// Occlusion readability shots (decisions OX1-OX6): a Lekki (City Rumble) building between the follow camera and the
// fighter, at phone landscape on Auto quality, at three moments: fighter behind the building, fighter touching it
// (standing next to it facing it) and in the open. The fade is read back from `__WAHALA__.viewClear()`.
//   SHOT_URL=http://localhost:5432/wahala-game/ node scripts/occlusion-shots.mjs <out-prefix> [arena=rumbleLekki] [x,y;x,y;...]
// Needs WAHALA_CHROMIUM for an offline browser.
import { chromium } from '@playwright/test';

const [prefix = 'occlusion', arena = 'rumbleLekki', posesArg = '26,34;26,32;14,26'] = process.argv.slice(2);
const poses = posesArg.split(';').map((s) => s.split(',').map(Number));
const BASE = process.env.SHOT_URL ?? 'http://localhost:5432/wahala-game/';
const W = Number(process.env.W ?? 844);
const H = Number(process.env.H ?? 390);
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
const context = await browser.newContext({
  viewport: { width: W, height: H },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
await context.addInitScript((arenaId) => {
  const key = 'wahala.settings.v1';
  const s = JSON.parse(localStorage.getItem(key) || '{}');
  localStorage.setItem(
    key,
    JSON.stringify({
      ...s,
      play: 'rumble',
      rumbleArenaId: arenaId,
      rumbleCompetitors: 8,
      rumbleMode: 'deathmatch',
    }),
  );
}, arena);
const page = await context.newPage();
page.setDefaultTimeout(300000);
await page.goto(`${BASE}?debug&noattract&nobots&seed=7${process.env.Q ? `&q=${process.env.Q}` : ''}`);
await page.getByTestId('title-screen').waitFor({ timeout: 180000 });
await page.getByTestId('home-play').click();
await page.getByTestId('home-rumble').click();
await page.getByTestId('setup-start').click();
await page.getByTestId('hud').waitFor();
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const w = window.__WAHALA__;
  w.stepTicks(400); // past the spawn protection, so the fighter does not blink
});
await page.addStyleTag({ content: '.touch, .touch-controls, .rotate { display: none !important; }' });
let n = 0;
for (const [x, y] of poses) {
  await page.evaluate(
    ([px, py]) => {
      const w = window.__WAHALA__;
      const p = w.getState().players[0];
      p.x = p.stepFromX = px;
      p.y = p.stepFromY = py;
      p.stepRemaining = 0;
      p.facing = 'down';
      w.renderer().cutCamera();
    },
    [x, y],
  );
  await page.waitForTimeout(Number(process.env.SETTLE ?? 5000));
  const st = await page.evaluate(() => window.__WAHALA__.viewClear());
  console.log(
    `pose ${x},${y}`,
    JSON.stringify({
      tiles: st.tiles,
      fading: st.fading,
      groups: st.groups,
      hide: st.hide,
      footprints: st.footprints,
    }),
  );
  await page.screenshot({ path: `${prefix}-${n++}.png`, timeout: 180000 });
}
await browser.close();
