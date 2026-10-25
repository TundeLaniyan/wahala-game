// City Rumble economy / Square Blast / Armour art check (needs a dev server; SHOT_URL defaults to
// http://localhost:4203/):
//   WAHALA_CHROMIUM=/opt/pw-browsers/chromium node scripts/economy-shots.mjs <out-dir> <desktop|mobile>
// Stages the local fighter with eliminations, an Okada, two Armour plates and Square Blast 5 x 5, drops a
// Square Blast generator next to them, and captures: the warning footprint + progression badge, the
// square explosion, and an Armour plate breaking. Prints page errors.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [dir = 'shots', device = 'desktop'] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const VP = {
  desktop: { viewport: { width: 1280, height: 720 } },
  mobile: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const browser = await chromium.launch({
  executablePath: process.env.WAHALA_CHROMIUM,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext(VP[device]);
await context.addInitScript(() => {
  const key = 'wahala.settings.v1';
  const s = JSON.parse(localStorage.getItem(key) || '{}');
  localStorage.setItem(key, JSON.stringify({ ...s, play: 'rumble', rumbleMode: 'survival', rumbleCompetitors: 8 }));
});
const page = await context.newPage();
page.setDefaultTimeout(240000);
const t0 = Date.now();
const mark = (what) => console.error(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${what}`);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${process.env.SHOT_URL ?? 'http://localhost:4203/'}?debug&noattract&q=medium&seed=7&nobots`);
await page.getByTestId('title-screen').waitFor({ timeout: 600000 });
mark('title');
await page.getByTestId('start-button').click();
await page.getByTestId('hud').waitFor();
mark('hud');
await page.waitForTimeout(1200);
const shot = (name) => page.screenshot({ path: `${dir}/${device}-${name}.jpg`, quality: 85, timeout: 180000 });

// stage: the local fighter (id 0) with 4 eliminations, Okada, two plates, Square Blast 5 x 5
const info = await page.evaluate(() => {
  const w = window.__WAHALA__;
  w.stepTicks(200); // through the countdown (simulation only)
  const s = w.getState();
  const p = s.players[0];
  p.stats.kills = 4;
  p.stats.streak = 4;
  p.mounted = true;
  p.armour = 2;
  p.squareTier = 2;
  // a Square Blast generator two tiles away from the player, on open floor
  const free = (x, y) => x >= 0 && y >= 0 && x < s.width && y < s.height && s.tiles[y * s.width + x] === 0;
  let gx = p.x;
  let gy = p.y;
  for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 0], [-1, 0]]) {
    if (free(p.x + dx, p.y + dy)) {
      gx = p.x + dx;
      gy = p.y + dy;
      break;
    }
  }
  s.generators.push({
    id: s.nextId++, ownerId: 1, x: gx, y: gy, stepFromX: gx, stepFromY: gy, range: 2, pierce: false, square: 2,
    fromSpectator: false, mode: 'timed', timer: 150, carriedBy: null, carryBonusUsed: false, slide: null, flight: null,
    triggered: false, placedTick: s.tick,
  });
  w.advance(2);
  return { player: [p.x, p.y], gen: [gx, gy] };
});
console.log('staged', JSON.stringify(info));
mark('staged');
await page.waitForTimeout(600);
await shot('square-warning');
await page.evaluate(() => {
  window.__WAHALA__.stepTicks(68);
  window.__WAHALA__.advance(2);
});
await page.waitForTimeout(400);
await shot('square-danger');
// detonate: the Okada absorbs (the player stands in the square)
await page.evaluate(() => {
  window.__WAHALA__.stepTicks(76);
  window.__WAHALA__.advance(3);
});
await page.waitForTimeout(120);
await shot('square-explosion');
const after = await page.evaluate(() => {
  const p = window.__WAHALA__.getState().players[0];
  return { alive: p.alive, mounted: p.mounted, armour: p.armour };
});
console.log('after blast', JSON.stringify(after));
// a second blast on the player: an Armour plate breaks
await page.evaluate(() => {
  const w = window.__WAHALA__;
  const s = w.getState();
  const p = s.players[0];
  s.generators.push({
    id: s.nextId++, ownerId: 1, x: p.x, y: p.y, stepFromX: p.x, stepFromY: p.y, range: 1, pierce: false, square: 0,
    fromSpectator: false, mode: 'timed', timer: 2, carriedBy: null, carryBonusUsed: false, slide: null, flight: null,
    triggered: false, placedTick: s.tick,
  });
  w.advance(4);
});
await page.waitForTimeout(150);
await shot('armour-break');
const badge = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="progression-badge"]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { html: el.outerHTML.length, armour: el.getAttribute('data-armour'), rect: [r.x, r.y, r.width, r.height] };
});
console.log('badge', JSON.stringify(badge));
console.log('errors', JSON.stringify(errors.slice(0, 5)));
await browser.close();
