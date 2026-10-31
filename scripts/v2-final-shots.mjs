// V2 integration screenshots of the real game (production build served by `vite preview`):
//   SHOT_URL=http://localhost:4400/wahala-game/ node scripts/v2-final-shots.mjs <out-dir>
// Phone (844 x 390) and small phone (667 x 375) frames of the main menu, a Classic match with the two
// buttons, a City Rumble Survival match on Oshodi Transport Metropolis, a Team Rumble match, and a Training Academy
// practice; plus desktop frames of Apapa Docks and Lekki Nightworks. Prints page errors.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [dir = 'e2e-shots/v2-final'] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const URL = process.env.SHOT_URL ?? 'http://localhost:4400/wahala-game/';
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
const PHONE = { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const SMALL = { viewport: { width: 667, height: 375 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const DESK = { viewport: { width: 1280, height: 720 } };
const errors = [];

async function session(device, settings, fn) {
  const context = await browser.newContext(device);
  await context.addInitScript((s) => {
    const key = 'wahala.settings.v1';
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) || '{}'), ...s }));
  }, settings);
  const page = await context.newPage();
  page.setDefaultTimeout(300000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${URL}?debug&noattract&q=medium&seed=7`);
  await page.getByTestId('title-screen').waitFor({ timeout: 180000 });
  await fn(page);
  await context.close();
}
const shot = (page, name) => page.screenshot({ path: `${dir}/${name}.jpg`, quality: 80, timeout: 240000 });
async function play(page, ticks) {
  await page.getByTestId('start-button').click();
  await page.getByTestId('hud').waitFor();
  await page.evaluate((n) => {
    const w = window.__WAHALA__;
    w.controller().frozen = true;
    w.getState().players[0].protectedUntil = 1e9; // staging only: keep the local player in the frame
    w.stepTicks(n - 30);
    w.advance(30);
  }, ticks);
  await page.waitForTimeout(1500);
}

await session(PHONE, { play: 'rumble', rumbleArenaId: 'rumbleOshodi', rumbleMode: 'survival' }, async (p) => {
  await shot(p, 'phone-844x390-menu-city-rumble');
  await play(p, 900);
  await shot(p, 'phone-844x390-rumble-oshodi-survival');
});
await session(
  SMALL,
  { play: 'classic', arenaId: 'danfoBusPark', competitors: 4, difficulty: 'rookie' },
  async (p) => {
    await shot(p, 'phone-667x375-menu-classic');
    await play(p, 600);
    await shot(p, 'phone-667x375-classic-two-buttons');
  },
);
await session(
  PHONE,
  {
    play: 'rumble',
    rumbleArenaId: 'rumbleOjuelegba',
    rumbleMode: 'team',
    rumbleCompetitors: 16,
    rumbleMinutes: 5,
  },
  async (p) => {
    await play(p, 900);
    await shot(p, 'phone-844x390-team-rumble-ojuelegba');
  },
);
for (const arena of ['rumbleApapa', 'rumbleLekkiNight', 'rumbleLagosIsland']) {
  await session(
    DESK,
    { play: 'rumble', rumbleArenaId: arena, rumbleMode: 'deathmatch', rumbleCompetitors: 16 },
    async (p) => {
      await play(p, 900);
      await shot(p, `desktop-${arena}-deathmatch`);
    },
  );
}
await session(PHONE, {}, async (p) => {
  await p.getByTestId('help-button').click();
  await p.waitForTimeout(4000);
  await shot(p, 'phone-844x390-academy');
});

console.log(JSON.stringify({ dir, errors }, null, 1));
await browser.close();
