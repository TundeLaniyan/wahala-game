// Lekki Phase 1 interlocking roads review (docs/LEKKI_INTERLOCK_ROADS.md): real frames of the real game, the HUD hidden.
//   node scripts/lekki-paving-shots.mjs <out-dir> <prefix> <desktop|mobile> [low|medium|high] [day|night] [views]
// Needs a preview / dev server (SHOT_URL, default http://localhost:5301/wahala-game/) and WAHALA_CHROMIUM
// (/opt/pw-browsers/chromium). Files: <dir>/<prefix>_<device>_<tod>_<view>.jpg. `views` is a comma list (default all):
//   gameplay  the normal follow camera on Admiralty Way        close      the block pattern up close
//   junction  the follow camera on the Admiralty x Freedom crossing   junction_close  the crossing up close
//   freedom   the follow camera on Freedom Way (east)          estates    a residential estate street
//   edge      where Admiralty Way meets the expressway asphalt overview   the whole of Lekki Phase 1
//   motion    16 frames of a slow camera pan along Admiralty Way (sub-tile steps) into <dir>/motion_<prefix>_<device>_<tod>/
// Prints draw calls, triangles, GPU texture count and the smoothed render ms per view.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [dir = 'shots', prefix = 'after', device = 'desktop', quality = 'medium', tod = 'day', only = ''] =
  process.argv.slice(2);
const BASE = process.env.SHOT_URL ?? 'http://localhost:5301/wahala-game/';
const VP = {
  desktop: { viewport: { width: 1280, height: 720 } },
  mobile: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
}[device];
const want = new Set(only.split(',').filter(Boolean));
const on = (v) => want.size === 0 || want.has(v);
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
const context = await browser.newContext(VP);
await context.addInitScript(() => {
  const key = 'wahala.settings.v1';
  const s = JSON.parse(localStorage.getItem(key) || '{}');
  localStorage.setItem(
    key,
    JSON.stringify({
      ...s,
      play: 'rumble',
      rumbleArenaId: 'rumbleLekki',
      rumbleCompetitors: 16,
      rumbleMode: 'deathmatch',
      difficulty: 'standard',
    }),
  );
});
const page = await context.newPage();
page.setDefaultTimeout(300000);
const t0 = Date.now();
await page.goto(`${BASE}?debug&noattract&nobots&q=${quality}&seed=7${tod === 'night' ? '&tod=night' : ''}`);
const quick = page.getByTestId('quick-play');
await quick.or(page.getByTestId('start-button')).first().waitFor({ timeout: 180000 });
const tClick = Date.now();
if ((await quick.count()) > 0) await quick.click();
else await page.getByTestId('start-button').click();
await page.getByTestId('hud').waitFor();
console.log(JSON.stringify({ load: { pageMs: tClick - t0, arenaMs: Date.now() - tClick } }));
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const w = window.__WAHALA__;
  w.controller().frozen = true;
  for (const p of w.getState().players) p.protectedUntil = 1e9;
  w.stepTicks(400);
  w.advance(6);
});
await page.addStyleTag({ content: '.hud, .touch, .touch-controls { display: none !important; }' });

const W = 57;
const H = 39;
const world = (x, y) => ({ x: x - W / 2, z: y - H / 2 }); // tile coordinates of a point -> world
const shot = async (name, settle = 1500) => {
  await page.waitForTimeout(settle);
  const file = `${dir}/${prefix}_${device}_${tod}_${name}.jpg`;
  await page.screenshot({ path: file, quality: 82, type: 'jpeg', timeout: 240000 });
  const st = await page.evaluate(() => {
    const w = window.__WAHALA__;
    const s = w.stats();
    const info = w.renderer().renderer?.info;
    return {
      calls: s.drawCalls,
      tris: s.triangles,
      textures: info?.memory?.textures ?? null,
      render: w.timings()?.render ?? null,
    };
  });
  console.log(JSON.stringify({ view: name, ...st, file }));
};
const follow = async (x, y) =>
  page.evaluate(
    ([x, y]) => {
      const w = window.__WAHALA__;
      const p = w.getState().players[0];
      p.x = p.stepFromX = x;
      p.y = p.stepFromY = y;
      p.stepRemaining = 0;
      w.renderer().debugInspect(null);
      w.renderer().cutCamera();
    },
    [x, y],
  );
const inspect = async (x, y, zoom) =>
  page.evaluate(
    ([t, zoom]) => window.__WAHALA__.renderer().debugInspect({ ...t, zoom }),
    [world(x, y), zoom],
  );

if (on('gameplay')) await (await follow(22, 25), shot('gameplay'));
if (on('close')) await (await inspect(21.5, 25.5, 0.45), shot('close'));
if (on('junction')) await (await follow(22, 19), shot('junction'));
if (on('junction_close')) await (await inspect(22, 19.5, 0.6), shot('junction_close'));
if (on('freedom')) await (await follow(44, 19), shot('freedom'));
if (on('estates')) await (await follow(40, 24), shot('estates'));
if (on('edge')) await (await follow(22, 30), shot('edge'));
if (on('overview')) await (await inspect(28.5, 19.5 - 2.6, 8.2), shot('overview'));
if (on('motion')) {
  const mdir = `${dir}/motion_${prefix}_${device}_${tod}`;
  mkdirSync(mdir, { recursive: true });
  for (let i = 0; i < 16; i++) {
    // a slow drift along and across the road: 0.07 tile per frame, never a whole block, at the gameplay zoom
    await inspect(21.6 + i * 0.07, 24 + i * 0.05, 1);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${mdir}/f${String(i).padStart(2, '0')}.png`, timeout: 240000 });
  }
  console.log(JSON.stringify({ view: 'motion', frames: 16, dir: mdir }));
}
await browser.close();
