// Classic Battle review frames (decision CC-F1): a punch that hits and one that whiffs on a 15 x 11 arena (needs a preview server; LAB_URL defaults to
// http://localhost:5413/wahala-game/):   node scripts/classic-combat-shots.mjs <out-dir>
// Starts a local City Rumble (no bots), stands the local fighter beside a rival, switches the lab level through the
// debug handle, presses B once through the controller's intents and screenshots the frames after the swing.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'docs/screenshots/combat-lab';
mkdirSync(out, { recursive: true });
const base = process.env.LAB_URL ?? 'http://localhost:5413/wahala-game/';
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
const page = await (
  await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })
).newPage();
page.setDefaultTimeout(180000);
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?debug&noattract&nobots&q=low&seed=7`);
await page.getByTestId('title-screen').waitFor();
await page.getByTestId('home-classic').click();
for (let i = 0; i < 4; i++) {
  if ((await page.getByTestId('start-button').count()) > 0) break;
  await page.getByTestId('menu-continue').click();
}
await page.getByTestId('start-button').click();
await page.getByTestId('hud').waitFor();
await page.evaluate(() => window.__WAHALA__.stepTicks(200));
await page.evaluate(() => {
  const c = window.__WAHALA__.controller();
  c.frozen = true;
  window.__press = false;
  c.collectIntents = () => {
    const i = window.__press ? { 0: { special: true } } : {};
    window.__press = false;
    return i;
  };
  const real = performance.now.bind(performance);
  window.__clock = { t: real(), frozen: false };
  performance.now = () => (window.__clock.frozen ? window.__clock.t : real());
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((ts) => cb(window.__clock.frozen ? window.__clock.t : ts));
});
const freeze = () =>
  page.evaluate(() => {
    window.__clock.t = performance.now();
    window.__clock.frozen = true;
  });
const bump = async (ms) => {
  await page.evaluate((d) => {
    window.__clock.t += d;
  }, ms);
  await page.waitForTimeout(2500);
};
async function stage(rivalAt) {
  await page.evaluate((rivalAt) => {
    const w = window.__WAHALA__;
    const s = w.getState();
    const me = s.players[0];
    const at = (p, x, y, f) => {
      p.x = p.stepFromX = x;
      p.y = p.stepFromY = y;
      p.stepRemaining = 0;
      p.facing = f;
      p.dazedUntil = 0;
      p.attack = null;
      p.protectedUntil = 0;
      p.armour = 0;
    };
    // clear a strip on the open floor so the fighters stand on bare ground
    const y = Math.floor(s.height / 2);
    for (let x = 3; x <= 9; x++) {
      s.tiles[y * s.width + x] = 0;
      delete s.hidden[y * s.width + x];
    }
    s.generators = [];
    at(me, 4, y, 'right');
    const rival = s.players[1];
    rival.alive = true;
    at(rival, 4 + (rivalAt ? rivalAt[0] : 5), y, 'left');
    for (const p of s.players) if (p.id > 1) p.alive = false;
    me.meleeLock = {};
    w.advance(1);
  }, rivalAt);
  await page.evaluate(() => {
    window.__clock.frozen = false;
  });
  await page.waitForTimeout(500);
}
for (const [name, rivalAt, ticks] of [
  ['hit', [1, 0], 4],
  ['whiff', null, 3],
]) {
  await stage(rivalAt);
  await freeze();
  await page.evaluate(() => {
    window.__press = true;
    window.__WAHALA__.advance(1);
  });
  await page.waitForTimeout(2500);
  await bump(Number(process.env.LAB_BUMP ?? 70));
  await page.screenshot({ path: `${out}/classic-${name}-swing.png`, timeout: 180000 });
  await page.evaluate((n) => window.__WAHALA__.advance(n), ticks);
  await page.waitForTimeout(2500);
  await bump(50);
  await page.screenshot({ path: `${out}/classic-${name}-after.png`, timeout: 180000 });
}
await browser.close();
