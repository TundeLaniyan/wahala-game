// Oshodi Transport Metropolis presentation evidence (docs/OSHODI_METROPOLIS.md): real frames of the real game.
//   node scripts/oshodi-shots.mjs <out-dir> [only,...]
// Needs a running dev / preview server (SHOT_URL, default http://localhost:5206/) and WAHALA_CHROMIUM
// (/opt/pw-browsers/chromium offline). Shots (all of the stage `rumbleOshodi`, 16 competitors, seed 7):
//   1-establishing    desktop, day: the whole interchange from above the plaza (zoomed out)
//   2-landmark        desktop, day: close view of the skywalk piers and stair tower
//   2b-frontage       desktop, day: close view of the far frontage (glass, balcony and plaster blocks) under the terminal fascia
//   3-rail-warning    desktop, day: the railcar telegraphed (lane burning down, crossing lamps, HUD alert)
//   3b-rail-running   desktop, day: the railcar out of its portal block, at the level crossing
//   4-night           desktop, night (?tod=night): the plaza and junction under floodlights
//   4b-night-rail     desktop, night: the railcar warning at night
//   5-mobile          phone landscape 844 x 390, day: the railcar warning with the HUD alert
//   5b-mobile-night   phone landscape, night: the same moment
// (`debugInspect` zoom is a camera DISTANCE multiplier: bigger = farther.) Bots idle (?nobots) so no blast is in frame.
// Each shot freezes the simulation (screenshot staging only: the local player keeps spawn protection so the
// follow camera stays on them) and prints the frame's draw calls / triangles.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [dir = 'shots', only = ''] = process.argv.slice(2);
const want = new Set(only.split(',').filter(Boolean));
mkdirSync(dir, { recursive: true });
const BASE = process.env.SHOT_URL ?? 'http://localhost:5206/';
const ARENA = 'rumbleOshodi';
const DESKTOP = { viewport: { width: 1280, height: 720 } };
const PHONE = { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

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
const t0 = Date.now();
const mark = (what) => console.error(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${what}`);

const wanted = (names) => want.size === 0 || names.some((n) => want.has(n));

async function session(device, tod, names, fn) {
  if (!wanted(names)) return;
  const context = await browser.newContext(device);
  await context.addInitScript(
    ([a]) => {
      const key = 'wahala.settings.v1';
      const s = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(
        key,
        JSON.stringify({
          ...s,
          play: 'rumble',
          rumbleArenaId: a,
          rumbleCompetitors: 16,
          rumbleMode: 'survival',
          difficulty: 'standard',
        }),
      );
    },
    [ARENA],
  );
  const page = await context.newPage();
  page.setDefaultTimeout(300000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on(
    'console',
    (m) =>
      m.type() === 'error' && !/proxy|ERR_|Failed to load resource/.test(m.text()) && errors.push(m.text()),
  );
  await page.goto(`${BASE}?debug&noattract&nobots&q=medium&seed=7${tod === 'night' ? '&tod=night' : ''}`);
  const quick = page.getByTestId('quick-play');
  await quick.or(page.getByTestId('start-button')).first().waitFor({ timeout: 180000 });
  if ((await quick.count()) > 0) await quick.click();
  else await page.getByTestId('start-button').click();
  await page.getByTestId('hud').waitFor();
  const arenaNow = await page.evaluate(() => window.__WAHALA__.getState().arenaId);
  if (arenaNow !== ARENA) throw new Error(`started ${arenaNow}, wanted ${ARENA}`);
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const w = window.__WAHALA__;
    w.controller().frozen = true;
    w.getState().players[0].protectedUntil = 1e9;
    w.stepTicks(400);
    w.advance(6);
  });
  await fn(page);
  const sky = await page.evaluate(() => window.__WAHALA__.renderer().scene.background.getHex());
  console.log(
    JSON.stringify({
      device: device === PHONE ? 'phone' : 'desktop',
      tod,
      sky: sky.toString(16),
      errors: errors.slice(0, 5),
    }),
  );
  await context.close();
}

const run = async (page, ms) => {
  await page.evaluate(() => (window.__WAHALA__.controller().frozen = false));
  await page.waitForTimeout(ms);
  await page.evaluate(() => (window.__WAHALA__.controller().frozen = true));
  await page.waitForTimeout(500);
};
const shot = async (page, name, clean = false) => {
  if (want.size && !want.has(name.split('-')[0]) && !want.has(name)) return;
  if (clean)
    await page.addStyleTag({ content: '.hud, .touch, .touch-controls { display: none !important; }' });
  await page.screenshot({ path: `${dir}/${name}.jpg`, quality: 85, timeout: 240000, type: 'jpeg' });
  const st = await page.evaluate(() => window.__WAHALA__.stats());
  console.error(`  ${name}: ${st.drawCalls} calls, ${(st.triangles / 1e6).toFixed(2)} M triangles`);
};
/** Puts the local player on tile (x, y) (clearing a crate there) and lets the follow camera settle. */
const goto = async (page, x, y) => {
  await page.evaluate(
    ([x, y]) => {
      const s = window.__WAHALA__.getState();
      const p = s.players[0];
      const i = y * s.width + x;
      if (s.tiles[i] === 2) s.tiles[i] = 0;
      p.x = p.stepFromX = x;
      p.y = p.stepFromY = y;
      p.stepRemaining = 0;
      p.protectedUntil = 1e9;
    },
    [x, y],
  );
  await run(page, 1400);
};
/** Steps the sim to `frac` through the first railcar's warning (or, with `index`, until it has run that far). */
/**
 * Queues one railcar event on the southbound lane (x 37, from the north portal) with the exact shape the sim's
 * `create()` gives it, so the frames are reproducible (the natural schedule is random: either lane, either time).
 */
const injectTrain = async (page) => {
  await page.evaluate(() => {
    const w = window.__WAHALA__;
    const s = w.getState();
    const tiles = [];
    for (let y = 10; y <= 22; y++) tiles.push(y * s.width + 37);
    s.stage.events.length = 0;
    s.stage.events.push({
      id: s.nextId++,
      hazard: 2,
      kind: 'sweep',
      style: 'train',
      tiles,
      dir: 'down',
      warnTick: s.tick,
      startTick: s.tick + 210,
      endTick: s.tick + 210 + 4 * tiles.length,
      eventId: s.nextEventId++,
      index: -1,
      stepRemaining: 0,
      stepTicks: 4,
    });
  });
};
const toTrain = async (page, frac, index = null) => {
  const found = await page.evaluate(
    ([frac, index]) => {
      const w = window.__WAHALA__;
      let last = null;
      for (let i = 0; i < 6000; i++) {
        const before = w.getState();
        if (!before || before.match.result) break;
        w.stepTicks(1);
        const s = w.getState();
        const e = s.stage.events.find((ev) => ev.style === 'train');
        if (!e) continue;
        last = { tick: s.tick, index: e.index, warnTick: e.warnTick, startTick: e.startTick };
        if (index === null && s.tick >= e.warnTick + (e.startTick - e.warnTick) * frac) break;
        if (index !== null && e.index >= index) break;
      }
      w.advance(2);
      return last;
    },
    [frac, index],
  );
  console.error(`  railcar: ${JSON.stringify(found)}`);
  if (!found) throw new Error('no railcar event found');
  await page.waitForTimeout(800);
};
const inspect = async (page, x, z, zoom) => {
  await page.evaluate((t) => window.__WAHALA__.renderer().debugInspect(t), { x, z, zoom });
  await run(page, 1400);
};

// ---- desktop, day
await session(DESKTOP, 'day', ['1', '2', '2b'], async (page) => {
  await goto(page, 21, 12);
  await inspect(page, 0, -2, 4.2);
  await shot(page, '1-establishing', true);
  mark('1');
  await inspect(page, 2, -9, 1.3);
  await shot(page, '2-landmark', true);
  mark('2');
  await inspect(page, -7, -19, 1.7);
  await shot(page, '2b-frontage', true);
  mark('2b');
});
await session(DESKTOP, 'day', ['3', '3b'], async (page) => {
  await goto(page, 34, 13);
  await injectTrain(page);
  await toTrain(page, 0.7);
  await run(page, 200);
  await shot(page, '3-rail-warning');
  mark('3');
  await toTrain(page, 0, 5);
  await shot(page, '3b-rail-running');
  mark('3b');
});
// ---- desktop, night
await session(DESKTOP, 'night', ['4', '4b'], async (page) => {
  await goto(page, 21, 13);
  await inspect(page, -3, -4, 2.6);
  await shot(page, '4-night', true);
  mark('4');
  // back to the follow camera (the inspect view stays until it is cleared)
  await page.evaluate(() => window.__WAHALA__.renderer().debugInspect(null));
  await goto(page, 34, 13);
  await injectTrain(page);
  await toTrain(page, 0.7);
  await run(page, 200);
  await shot(page, '4b-night-rail');
  mark('4b');
});
// ---- phone
await session(PHONE, 'day', ['5'], async (page) => {
  await goto(page, 34, 13);
  await injectTrain(page);
  await toTrain(page, 0.7);
  await run(page, 200);
  await shot(page, '5-mobile');
  mark('5');
});
await session(PHONE, 'night', ['5b'], async (page) => {
  await goto(page, 34, 13);
  await injectTrain(page);
  await toTrain(page, 0.7);
  await run(page, 200);
  await shot(page, '5b-mobile-night');
  mark('5b');
});
await browser.close();
