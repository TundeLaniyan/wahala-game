// The committed screenshot pack of the seven City Rumble communities (docs/screenshots/city-rumble-researched-arenas/):
// real frames of the real game, for each arena: zoomed-out day, zoomed-out night, a medium-quality play frame, a low-quality
// frame, a phone frame, a landmark / identity close-up, the vehicle approaching, the late fuse warning, the detonation, and
// the phone controls with the contextual vehicle action.
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
  rumbleEbuteMetta: [55, 39, 29, 12, 1.5, 'the station hall, platforms, tracks and the colonial terminus'],
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

  // 7-9: the vehicle generator: approaching, the late fuse warning, the detonation (medium, desktop)
  r = await start(id, { q: 'medium', competitors: 8 });
  const { page } = r;
  await page.evaluate(() => {
    const w = window.__WAHALA__;
    const st = w.getState();
    for (const p of st.players) p.protectedUntil = 0;
    st.players[0].hasVoucher = true;
  });
  await page.keyboard.down('KeyK');
  await page.evaluate(() => window.__WAHALA__.stepTicks(3));
  await page.keyboard.up('KeyK');
  const planned = await page.evaluate(() => {
    const w = window.__WAHALA__;
    const s = w.getState();
    const v = s.vehicles[0];
    if (!v) return null;
    const near = (x, y) => v.route.some((q) => Math.abs(q.x - x) + Math.abs(q.y - y) <= 7);
    const put = (p, x, y) => {
      p.x = p.stepFromX = x;
      p.y = p.stepFromY = y;
      p.stepRemaining = 0;
    };
    const t = v.route[Math.min(8, v.route.length - 1)];
    put(s.players[1], t.x, t.y);
    const free = [];
    for (let y = 1; y < s.height - 1; y++)
      for (let x = 1; x < s.width - 1; x++)
        if (s.tiles[y * s.width + x] === 0 && !near(x, y)) free.push([x, y]);
    s.players
      .slice(2)
      .forEach(
        (p, i) => free.length && put(p, ...free[Math.floor((free.length * (i + 1)) / s.players.length)]),
      );
    if (free.length) put(s.players[0], ...free[0]);
    return { kind: v.kind, route: v.route.length };
  });
  if (!planned) {
    log({ id, frame: 'vehicle', skipped: 'no legal route' });
  } else {
    const until = (pred, max = 2500) =>
      page.evaluate(
        ([src, max]) => {
          const w = window.__WAHALA__;
          const f = new Function('s', `return ${src}`);
          for (let i = 0; i < max; i++) {
            if (f(w.getState())) return i;
            w.stepTicks(1);
          }
          return -1;
        },
        [pred, max],
      );
    const look = async (name) => {
      await page.evaluate(() => {
        const w = window.__WAHALA__;
        const s = w.getState();
        const v = s.vehicles[0];
        const t = v ? v.route[Math.max(0, v.index)] : s.players[1];
        w.renderer().debugInspect({ x: t.x - s.width / 2 + 0.5, z: t.y - s.height / 2 + 0.5, zoom: 2.4 });
        w.advance(2);
      });
      await page.waitForTimeout(700);
      await hide(page);
      await shot(page, name, id);
    };
    const a = await until("s.vehicles[0] && s.vehicles[0].phase === 'driving' && s.vehicles[0].index >= 3");
    if (a >= 0) await look('07-vehicle-approach');
    const f = await until(
      "s.vehicles[0] && s.vehicles[0].payload && s.vehicles[0].payload.state === 'fusing'",
    );
    if (f >= 0) {
      await page.evaluate(() => window.__WAHALA__.stepTicks(12));
      await look('08-vehicle-fuse-warning');
    }
    const b = await until('s.flames.length > 0');
    if (b >= 0) {
      await page.evaluate(() => window.__WAHALA__.stepTicks(5));
      await look('09-vehicle-detonation');
    }
    log({ id, frame: 'vehicle', ...planned, approach: a, fuse: f, blast: b, errors: r.errors.slice(0, 2) });
  }
  await r.context.close();
}

for (const id of ids) await run(id).catch((e) => log({ id, failed: String(e).slice(0, 300) }));
await browser.close();
