// HUD combat review frames + geometry check (needs a preview server; HUD_URL defaults to http://localhost:5199/wahala-game/):
//   node scripts/hud-combat-shots.mjs <out-dir> [rumble|classic]
// Plays a City Rumble (or Classic) match on a desktop and a phone viewport, stages kills, a shield hit and QUICK HANDS
// stored through the debug handle, screenshots the HUD, and asserts that the kill feed sits in the rail and that no
// rail text covers the timer, the portraits, the inventory, the touch controls or the bottom row of the board.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'docs/screenshots/hud-combat';
const game = process.argv[3] ?? 'rumble';
mkdirSync(out, { recursive: true });
const VP = {
  desktop: { viewport: { width: 1280, height: 720 } },
  phone: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const base = process.env.HUD_URL ?? 'http://localhost:5199/wahala-game/';
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
const failures = [];
for (const [device, ctx] of Object.entries(VP)) {
  const page = await (await browser.newContext(ctx)).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?debug&noattract&q=low&seed=7`);
  await page.getByTestId('title-screen').waitFor();
  if (game === 'rumble') {
    await page.getByTestId('home-rumble').click();
    await page.getByTestId('mode-deathmatch').click();
    await page.getByTestId('rumble-16').click();
  } else {
    await page.getByTestId('home-classic').click();
    await page.getByTestId('players-4').click();
  }
  if ((await page.getByTestId('menu-setup').count()) > 0) await page.getByTestId('menu-continue').click();
  if ((await page.getByTestId('menu-fighter').count()) > 0) await page.getByTestId('menu-continue').click();
  await page.getByTestId('start-button').click();
  await page.getByTestId('hud').waitFor();
  await page.evaluate(() => window.__WAHALA__.stepTicks(200));
  await page.evaluate(() => {
    window.__WAHALA__.controller().frozen = true;
  });
  const publish = async () => {
    await page.waitForTimeout(160);
    await page.evaluate(() => window.__WAHALA__.advance(1));
    await page.waitForTimeout(160);
  };
  // stage: the local player takes out P3; P5 takes out P6; P7 runs over P8; the city takes P9; armour x2, QUICK HANDS stored
  await page.evaluate(() => {
    const s = window.__WAHALA__.getState();
    const me = s.players[0];
    me.protectedUntil = 0;
    me.armour = 2;
    me.streakRewards.quickHandsBank = 11 * 60;
    const kill = (victim, by, cause) => {
      const v = s.players[victim];
      if (!v) return;
      v.alive = false;
      v.eliminatedTick = s.tick;
      v.eliminatedBy = by;
      v.elimination = cause ?? { kind: 'flame', ownerId: by ?? 0, eventId: 0 };
    };
    kill(1, 0);
    kill(2, 3, { kind: 'vehicle', ownerId: 3, vehicleKind: 'danfo', eventId: 0 });
    kill(3, null, { kind: 'crush', eventId: 0 });
  });
  await publish();
  await page.screenshot({ path: `${out}/${game}-${device}-kill-feed.png`, timeout: 180000 });
  const rects = await page.evaluate(() => {
    const r = (q) =>
      [...document.querySelectorAll(q)]
        .map((e) => e.getBoundingClientRect())
        .filter((b) => b.width > 0 && b.height > 0);
    return {
      feed: r('[data-testid="kill-feed"] li'),
      rail: r('[data-testid="hud-rail"] > *'),
      others: [
        '.timer',
        '.portrait',
        '.round-btn',
        '[data-testid="inventory"]',
        '.abtn',
        '[data-testid="stick-pad"]',
      ].flatMap((q) => r(q).map((b) => ({ q, b }))),
      vh: window.innerHeight,
      board: window.__WAHALA__.store.getState().board,
    };
  });
  console.log(device, game, 'feed lines:', rects.feed.length, 'board:', JSON.stringify(rects.board));
  if (rects.feed.length === 0) failures.push(`${device}: kill feed empty`);
  for (const f of [...rects.feed, ...rects.rail]) {
    for (const { q, b } of rects.others)
      if (f.left < b.right && f.right > b.left && f.top < b.bottom && f.bottom > b.top)
        failures.push(`${device}: rail text overlaps ${q}`);
    if (game === 'classic' && rects.board) {
      const [far, , , near] = rects.board;
      const t = Math.min(1, Math.max(0, (f.bottom - far.y) / (near.y - far.y)));
      if (f.right > far.x + (near.x - far.x) * t + 0.5)
        failures.push(`${device}: rail text reaches the board`);
    }
  }
  console.log(device, 'errors:', errors.slice(0, 3));
  await page.close();
}
await browser.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
