// Oshodi performance + review shots (docs/OSHODI_METROPOLIS.md): real frames of the real game.
//   node scripts/oshodi-perf.mjs <out-dir> [label]
// Needs a dev / preview server (SHOT_URL, default http://localhost:5206/) and WAHALA_CHROMIUM.
// For q = medium and low (desktop 1280x720, software WebGL): starts the stage, freezes the sim for the
// zoomed-out establishing frame (day), prints draw calls / triangles, then lets the sim run 4 s and prints the
// mean / p95 frame time. Writes <out>/<label>-<q>-day.jpg (and -night.jpg at medium).
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [dir = 'perf', label = 'run'] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const BASE = process.env.SHOT_URL ?? 'http://localhost:5206/';
const Z = Number(process.env.Z || 7);
const TX = Number(process.env.TX || 0);
const TZ = Number(process.env.TZ || -8);
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

async function run(q, tod, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    const key = 'wahala.settings.v1';
    const s = JSON.parse(localStorage.getItem(key) || '{}');
    localStorage.setItem(
      key,
      JSON.stringify({
        ...s,
        play: 'rumble',
        rumbleArenaId: 'rumbleOshodi',
        rumbleCompetitors: 16,
        rumbleMode: 'survival',
        difficulty: 'standard',
      }),
    );
  });
  const page = await context.newPage();
  page.setDefaultTimeout(300000);
  await page.goto(`${BASE}?debug&noattract&nobots&q=${q}&seed=7${tod === 'night' ? '&tod=night' : ''}`);
  const quick = page.getByTestId('quick-play');
  await quick.or(page.getByTestId('start-button')).first().waitFor({ timeout: 180000 });
  if ((await quick.count()) > 0) await quick.click();
  else await page.getByTestId('start-button').click();
  await page.getByTestId('hud').waitFor();
  await page.waitForTimeout(1200);
  const size = await page.evaluate(() => {
    const w = window.__WAHALA__;
    const s = w.getState();
    w.controller().frozen = true;
    s.players[0].protectedUntil = 1e9;
    w.stepTicks(400);
    w.advance(6);
    const cx = Math.floor(s.width / 2);
    const i = Math.floor(s.height * 0.36) * s.width + cx;
    if (s.tiles[i] === 2) s.tiles[i] = 0;
    return { w: s.width, h: s.height };
  });
  await page.evaluate(
    ([x, z, zoom]) => window.__WAHALA__.renderer().debugInspect({ x, z, zoom }),
    [TX, TZ, Z],
  );
  await page.evaluate(() => (window.__WAHALA__.controller().frozen = false));
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window.__WAHALA__.controller().frozen = true));
  await page.waitForTimeout(600);
  await page.addStyleTag({ content: '.hud, .touch, .touch-controls { display: none !important; }' });
  const st = await page.evaluate(() => window.__WAHALA__.stats());
  const name = `${label}-${q}-${tod}${viewport.width < 900 ? '-phone' : ''}`;
  await page.screenshot({ path: `${dir}/${name}.jpg`, quality: 85, type: 'jpeg', timeout: 240000 });
  // frame timing while the sim and the traffic run
  await page.evaluate(() => (window.__WAHALA__.controller().frozen = false));
  const ft = await page.evaluate(
    () =>
      new Promise((res) => {
        const d = [];
        let last = performance.now();
        const end = last + 4000;
        const f = (t) => {
          d.push(t - last);
          last = t;
          if (t < end) requestAnimationFrame(f);
          else {
            d.sort((a, b) => a - b);
            res({
              n: d.length,
              mean: d.reduce((a, b) => a + b, 0) / d.length,
              p95: d[Math.floor(d.length * 0.95)],
            });
          }
        };
        requestAnimationFrame(f);
      }),
  );
  console.log(
    JSON.stringify({
      name,
      board: size,
      calls: st.drawCalls,
      tris: st.triangles,
      frameMs: { mean: +ft.mean.toFixed(1), p95: +ft.p95.toFixed(1), frames: ft.n },
    }),
  );
  await context.close();
}

const D = { width: 1280, height: 720 };
await run('medium', 'day', D);
await run('medium', 'night', D);
await run('low', 'day', D);
await run('low', 'day', { width: 844, height: 390 });
await browser.close();
