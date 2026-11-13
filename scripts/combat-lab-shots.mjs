// Combat test lab review frames: a hit and a miss at two levels (needs a preview server; LAB_URL defaults to
// http://localhost:5413/wahala-game/):   node scripts/combat-lab-shots.mjs <out-dir> [level level ...]
// Starts a local City Rumble (no bots), stands the local fighter beside a rival, switches the lab level through the
// debug handle, presses B once through the controller's intents and screenshots the frames after the swing.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'docs/screenshots/combat-lab';
const levels = process.argv.length > 3 ? process.argv.slice(3).map(Number) : [1, 2];
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
await page.getByTestId('home-rumble').click();
await page.getByTestId('mode-deathmatch').click();
await page.getByTestId('rumble-16').click();
if ((await page.getByTestId('menu-setup').count()) > 0) await page.getByTestId('menu-continue').click();
if ((await page.getByTestId('menu-fighter').count()) > 0) await page.getByTestId('menu-continue').click();
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
});

// the effects age with performance.now(): freeze it and move it by hand, so a slow software-GL frame cannot let a
// 0.2 s swing arc expire before the screenshot
await page.evaluate(() => {
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
  await page.waitForTimeout(2500); // a few (slow) frames at the new time
};

async function stage(level, rivalAt) {
  await page.evaluate(
    ({ level, rivalAt }) => {
      const w = window.__WAHALA__;
      w.controller().setCombatLab(level);
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
      // an open spot (nothing solid east, north or south of it, so no building fades over the fighters)
      const free = (x, y) =>
        s.tiles[y * s.width + x] === 0 && !s.generators.some((g) => g.x === x && g.y === y);
      let best = null;
      for (let y = 3; y < s.height - 4 && !best; y++)
        for (let x = 3; x < s.width - 8; x++) {
          let ok = true;
          for (let dy = -1; dy <= 2 && ok; dy++)
            for (let dx = -1; dx <= 3 && ok; dx++) ok = free(x + dx, y + dy);
          if (
            ok &&
            (!best ||
              Math.abs(x - me.x) + Math.abs(y - me.y) < Math.abs(best.x - me.x) + Math.abs(best.y - me.y))
          )
            best = { x, y };
        }
      if (best) {
        me.x = me.stepFromX = best.x;
        me.y = me.stepFromY = best.y;
      }
      at(me, me.x, me.y, 'right');
      const rival = s.players[1];
      rival.alive = true;
      // rivalAt: [dx, dy] from the local fighter, or null = out of reach (far away)
      at(rival, me.x + (rivalAt ? rivalAt[0] : 6), me.y + (rivalAt ? rivalAt[1] : 0), 'left');
      for (const p of s.players) if (p.id > 1) p.alive = false;
      me.meleeLock = {};
      w.advance(1);
    },
    { level, rivalAt },
  );
  await page.evaluate(() => {
    window.__clock.frozen = false;
  });
  await page.waitForTimeout(500);
}

for (const level of levels) {
  for (const [name, rivalAt, ticks] of [
    ['hit', [1, 0], 4],
    ['whiff', null, 3],
  ]) {
    await stage(level, rivalAt);
    await freeze();
    await page.evaluate(() => {
      window.__press = true;
      window.__WAHALA__.advance(1);
    });
    await page.waitForTimeout(2500);
    await bump(Number(process.env.LAB_BUMP ?? 70));
    const clip = { x: 380, y: 230, width: 520, height: 300 };
    await page.screenshot({ path: `${out}/lab${level}-${name}-swing.png`, clip, timeout: 180000 });
    await page.evaluate((n) => window.__WAHALA__.advance(n), ticks);
    await page.waitForTimeout(2500);
    await bump(50);
    await page.screenshot({ path: `${out}/lab${level}-${name}-after.png`, clip, timeout: 180000 });
  }
}
await page.screenshot({ path: `${out}/chip.png` });
await browser.close();
