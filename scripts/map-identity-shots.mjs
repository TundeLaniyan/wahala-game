// Map-identity review (docs/MAP_IDENTITY.md): real frames of the real game from the NORMAL City Rumble gameplay camera
// (the stadium follow camera on the local player, at a chosen board tile) plus a whole-board overview, per arena.
//   node scripts/map-identity-shots.mjs <out-dir> <prefix: before|after> [arenaId,...] [shotName,...]
// Needs a dev / preview server (SHOT_URL, default http://localhost:5206/) and WAHALA_CHROMIUM
// (/opt/pw-browsers/chromium offline). The HUD is hidden (the follow frame is judged without panels); the sim is frozen
// after staging the local player on the tile (screenshot staging only). Each shot prints draw calls / triangles.
// Output files: <dir>/<prefix>_<arena>_<shot>.jpg
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [dir = 'shots', prefix = 'after', only = '', onlyShots = ''] = process.argv.slice(2);
const BASE = process.env.SHOT_URL ?? 'http://localhost:5206/';
const TOD = process.env.TOD ?? 'day';

// [shot name, tile x, tile y, optional camera-distance zoom] : the follow camera sits on the player at that tile.
// `whole` is the overview (debugInspect, zoomed out) of the entire stage.
export const SHOTS = {
  rumbleOjuelegba: [
    ['follow-centre', 22, 14],
    ['follow-north', 22, 5],
    ['whole', 'whole'],
  ],
  rumbleOshodi: [
    ['follow-plaza', 21, 12],
    ['follow-north', 30, 8],
    ['whole', 'whole'],
  ],
  rumbleMushin: [
    ['follow-redline', 28, 4],
    ['follow-footbridge', 1, 17],
    ['follow-idioro', 26, 28],
    ['whole', 'whole'],
  ],
  rumbleFadeyi: [
    ['follow-footbridge', 48, 11],
    ['follow-brt', 11, 14],
    ['follow-bank', 27, 29],
    ['whole', 'whole'],
  ],
  rumbleLagosIsland: [
    ['follow-cathedral', 44, 5],
    ['follow-civic', 36, 4],
    ['follow-textile', 12, 12],
    ['whole', 'whole'],
  ],
  rumbleLekki: [
    ['follow-bridge', 22, 2],
    ['follow-admiralty', 22, 22],
    ['follow-plaza', 24, 10],
    ['whole', 'whole'],
  ],
  rumbleEbuteMetta: [
    ['follow-station', 31, 17],
    ['follow-yard', 28, 23],
    ['follow-gantry', 23, 5],
    ['whole', 'whole'],
  ],
};

const ids = (only ? only.split(',') : Object.keys(SHOTS)).filter(Boolean);
const want = new Set(onlyShots.split(',').filter(Boolean));
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

async function start(id) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(
    ([id]) => {
      const key = 'wahala.settings.v1';
      const s = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(
        key,
        JSON.stringify({
          ...s,
          play: 'rumble',
          rumbleArenaId: id,
          rumbleCompetitors: 16,
          rumbleMode: 'deathmatch',
          difficulty: 'standard',
        }),
      );
    },
    [id],
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
  await page.goto(
    `${BASE}?debug&noattract&nobots&q=${process.env.Q ?? 'medium'}&seed=7${TOD === 'night' ? '&tod=night' : ''}`,
  );
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
  return { context, page, errors };
}

// the sim stays frozen (a lethal stage wave could otherwise end the staged player's run); the renderer still settles the camera
const run = async (page, ms) => {
  await page.waitForTimeout(ms);
};

for (const id of ids) {
  const list = SHOTS[id];
  if (!list) throw new Error(`unknown arena ${id}`);
  const { context, page, errors } = await start(id);
  const arenaNow = await page.evaluate(() => window.__WAHALA__.getState().arenaId);
  if (arenaNow !== id) throw new Error(`started ${arenaNow}, wanted ${id}`);
  for (const [name, a, b, zoom] of list) {
    if (want.size && !want.has(name)) continue;
    if (a === 'whole') {
      const dims = await page.evaluate(() => {
        const s = window.__WAHALA__.getState();
        return { w: s.width, h: s.height };
      });
      const z = id === 'rumbleOshodi' ? 11 : 5.4 * Math.max(dims.w / 41, dims.h / 31);
      await page.evaluate(
        ([z, o]) => window.__WAHALA__.renderer().debugInspect({ x: 0, z: o, zoom: z }),
        [z, id === 'rumbleOshodi' ? -1 : -0.6],
      );
    } else {
      await page.evaluate(() => window.__WAHALA__.renderer().debugInspect(null));
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
        [a, b],
      );
      if (zoom) await page.evaluate((z) => window.__WAHALA__.renderer().debugInspect(null), zoom);
    }
    await run(page, 1500);
    const file = `${dir}/${prefix}_${id}_${name}.jpg`;
    await page.screenshot({ path: file, quality: 78, type: 'jpeg', timeout: 240000 });
    const st = await page.evaluate(() => window.__WAHALA__.stats());
    const alive = await page.evaluate(() => window.__WAHALA__.getState().players[0].alive);
    console.log(JSON.stringify({ id, name, alive, calls: st.drawCalls, tris: st.triangles, file }));
  }
  if (errors.length) console.log(JSON.stringify({ id, errors: errors.slice(0, 3) }));
  await context.close();
}
await browser.close();
