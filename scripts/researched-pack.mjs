// The committed screenshot pack of the seven City Rumble communities (docs/screenshots/city-rumble-researched-arenas/):
// real frames of the real game, for each arena: zoomed-out day, zoomed-out night, a medium-quality play frame, a low-quality
// frame, a phone frame, a landmark / identity close-up, and the phone controls with the contextual vehicle action (frame 10).
// Frames 07-09 (vehicle approach / fuse / detonation) belonged to the vehicle-generator branch and are not part of the map-only pack.
//   node scripts/researched-pack.mjs <out-dir> [arenaId,...]
// Needs a dev / preview server (SHOT_URL, default http://localhost:5206/) and WAHALA_CHROMIUM. Frames are staged through the debug API
// (frozen sim, debug camera); everything drawn is the real renderer. One JSON line per frame.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [dir = 'pack', only = ''] = process.argv.slice(2);
const BASE = process.env.SHOT_URL ?? 'http://localhost:5206/';
const ARENAS = {
  // id: [board w, h, landmark tile x, y, zoom, what the landmark frame shows]
  rumbleOjuelegba: [45, 33, 22, 15, 2.2, 'the flyover piers and the Danfo park'],
  rumbleOshodi: [63, 47, 17, 10, 2.4, 'the interchange terminal and its bus bays'],
  rumbleMushin: [53, 39, 26, 22, 1.5, 'the Idi-Oro food hall, parts stalls and the shop rows'],
  rumbleFadeyi: [51, 33, 24, 14, 2.2, 'the BRT centreline, median barriers, shelters and crossing'],
  rumbleLagosIsland: [55, 39, 44, 9, 2.2, 'the civic square, monument, heritage frontage and trees'],
  rumbleLekki: [57, 39, 40, 8, 1.5, 'the sports club, the arts-market sheds and the promenade'],
  rumbleEbuteMetta: [75, 39, 49, 12, 1.5, 'the station hall, platforms, tracks and the colonial terminus'],
};
const ids = only ? only.split(',') : Object.keys(ARENAS);
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
const log = (o) => console.log(JSON.stringify(o));

async function start(
  id,
  { q = 'medium', tod = 'day', phone = false, competitors = 16, character = 'streetBaller' } = {},
) {
  const context = await browser.newContext(
    phone
      ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
      : { viewport: { width: 1280, height: 720 } },
  );
  await context.addInitScript(
    ([id, competitors, character]) => {
      const key = 'wahala.settings.v1';
      const s = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(
        key,
        JSON.stringify({
          ...s,
          play: 'rumble',
          rumbleArenaId: id,
          rumbleCompetitors: competitors,
          rumbleMode: 'deathmatch',
          difficulty: 'standard',
          character,
        }),
      );
    },
    [id, competitors, character],
  );
  const page = await context.newPage();
  page.setDefaultTimeout(300000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}?debug&noattract&nobots&q=${q}&seed=7${tod === 'night' ? '&tod=night' : ''}`);
  const quick = page.getByTestId('quick-play');
  await quick.or(page.getByTestId('start-button')).first().waitFor({ timeout: 180000 });
  if ((await quick.count()) > 0) await (phone ? quick.tap() : quick.click());
  else await (phone ? page.getByTestId('start-button').tap() : page.getByTestId('start-button').click());
  await page.getByTestId('hud').waitFor();
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const w = window.__WAHALA__;
    const s = w.getState();
    w.controller().frozen = true;
    for (const p of s.players) p.protectedUntil = 1e9;
    w.stepTicks(400);
    w.advance(6);
  });
  return { context, page, errors };
}

const hide = (page) =>
  page.addStyleTag({ content: '.hud, .touch, .touch-controls { display: none !important; }' });
const shot = (page, name, id) =>
  page.screenshot({ path: `${dir}/${id}/${name}.jpg`, quality: 72, type: 'jpeg', timeout: 240000 });
async function inspect(page, tx, ty, zoom) {
  await page.evaluate(
    ([tx, ty, zoom]) => {
      const w = window.__WAHALA__;
      const s = w.getState();
      w.renderer().debugInspect({ x: tx - s.width / 2 + 0.5, z: ty - s.height / 2 + 0.5, zoom });
      w.advance(3);
    },
    [tx, ty, zoom],
  );
  await page.waitForTimeout(1200);
}
async function run(id) {
  const [W, H, lx, ly, lz, what] = ARENAS[id];
  mkdirSync(`${dir}/${id}`, { recursive: true });
  const zoomWhole = id === 'rumbleOshodi' ? 11 : 4.8 * Math.max(W / 41, H / 31);
  const wholeFrame = async (page, name, withHud = false) => {
    await page.evaluate(
      ([z, id]) =>
        window.__WAHALA__.renderer().debugInspect({ x: 0, z: id === 'rumbleOshodi' ? -1 : 1.6, zoom: z }),
      [zoomWhole, id],
    );
    await page.evaluate(() => (window.__WAHALA__.controller().frozen = false));
    await page.waitForTimeout(1500);
    await page.evaluate(() => (window.__WAHALA__.controller().frozen = true));
    await page.waitForTimeout(700);
    if (!withHud) await hide(page);
    await shot(page, name, id);
  };

  // 1-2: zoomed-out day (medium) and night (medium)
  let r = await start(id, { q: 'medium', tod: 'day' });
  await wholeFrame(r.page, '01-day-whole', false);
  log({ id, frame: 'day', errors: r.errors.slice(0, 2) });
  // 6: the landmark / identity close-up (same session, medium day)
  await inspect(r.page, lx, ly, lz);
  await shot(r.page, '06-landmark', id);
  log({ id, frame: 'landmark', shows: what });
  // 3: a medium-quality play frame with the normal follow camera and the HUD
  await r.page.evaluate(() => window.__WAHALA__.renderer().debugInspect(null));
  await r.page.evaluate(() => {
    const w = window.__WAHALA__;
    w.controller().frozen = false;
  });
  await r.page.waitForTimeout(1500);
  await r.page.evaluate(() => (window.__WAHALA__.controller().frozen = true));
  await r.page.waitForTimeout(600);
  await shot(r.page, '03-medium-play', id);
  await r.context.close();

  r = await start(id, { q: 'medium', tod: 'night' });
  await wholeFrame(r.page, '02-night-whole', false);
  log({ id, frame: 'night', errors: r.errors.slice(0, 2) });
  await r.context.close();

  // 4: low quality, zoomed out
  r = await start(id, { q: 'low', tod: 'day' });
  await wholeFrame(r.page, '04-low-whole', false);
  log({ id, frame: 'low', errors: r.errors.slice(0, 2) });
  await r.context.close();

  // 5 and 10: phone, low quality: a play frame, then the contextual vehicle action
  r = await start(id, { q: 'low', phone: true, competitors: 8 });
  await r.page.evaluate(() => (window.__WAHALA__.controller().frozen = false));
  await r.page.waitForTimeout(1800);
  await r.page.evaluate(() => (window.__WAHALA__.controller().frozen = true));
  await r.page.waitForTimeout(600);
  await shot(r.page, '05-phone-play', id);
  await r.page.evaluate(() => {
    const w = window.__WAHALA__;
    w.getState().players[0].hasVoucher = true;
    w.advance(3);
  });
  await r.page.waitForTimeout(900);
  const label = await r.page.evaluate(() => document.querySelector('[data-testid=btn-special]')?.textContent);
  await shot(r.page, '10-phone-vehicle-control', id);
  log({ id, frame: 'phone', vehicleLabel: label, errors: r.errors.slice(0, 2) });
  await r.context.close();
}

for (const id of ids) await run(id).catch((e) => log({ id, failed: String(e).slice(0, 300) }));
await browser.close();
