// Ebute-Metta West performance comparison (docs/EBUTE_METTA_WEST.md): the static scene budget (visible meshes = an upper bound of the
// draw calls, triangles, as map-identity-perf.mjs) and the real per-frame draw calls / triangles of the normal City Rumble follow
// camera, at the low and medium presets on a desktop and an 844x390 phone viewport, for ONE build (a preview server on SHOT_URL).
//   SHOT_URL=http://localhost:5301/wahala-game/ WAHALA_CHROMIUM=/opt/pw-browsers/chromium node scripts/ebute-perf.mjs [label]
import { chromium } from '@playwright/test';

const label = process.argv[2] ?? 'build';
const BASE = process.env.SHOT_URL ?? 'http://localhost:5206/';
const VIEWS = {
  desktop: { viewport: { width: 1280, height: 720 } },
  phone: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
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
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const [view, opts] of Object.entries(VIEWS))
  for (const q of ['low', 'medium']) {
    const context = await browser.newContext(opts);
    await context.addInitScript(() => {
      const key = 'wahala.settings.v1';
      const s = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(
        key,
        JSON.stringify({
          ...s,
          play: 'rumble',
          rumbleArenaId: 'rumbleEbuteMetta',
          rumbleCompetitors: 16,
          rumbleMode: 'deathmatch',
          difficulty: 'standard',
        }),
      );
    });
    const page = await context.newPage();
    page.setDefaultTimeout(300000);
    await page.goto(`${BASE}?debug&noattract&nobots&q=${q}&seed=7`);
    const quick = page.getByTestId('quick-play');
    await quick.or(page.getByTestId('start-button')).first().waitFor({ timeout: 180000 });
    if ((await quick.count()) > 0) await quick.click();
    else await page.getByTestId('start-button').click();
    await page.getByTestId('hud').waitFor();
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      const w = window.__WAHALA__;
      w.controller().frozen = true;
      w.stepTicks(300);
      w.advance(6);
    });
    // stage the local player at the same two spots (old-board coordinates through the shift where the board is the expanded one)
    const w = await page.evaluate(() => window.__WAHALA__.getState().width);
    const dx = w - 55;
    const spots = [
      ['station', 31 + dx, 17],
      ['yard', 28 + dx, 23],
      ['west-edge-old', 5 + dx, 9],
    ];
    const rows = [];
    for (const [name, x, y] of spots) {
      await page.evaluate(
        ([x, y]) => {
          const s = window.__WAHALA__.getState();
          const p = s.players[0];
          p.x = p.stepFromX = x;
          p.y = p.stepFromY = y;
          p.stepRemaining = 0;
          p.protectedUntil = 1e9;
          window.__WAHALA__.renderer().cutCamera();
        },
        [x, y],
      );
      await page.waitForTimeout(1200);
      const calls = [];
      const tris = [];
      for (let i = 0; i < 5; i++) {
        const st = await page.evaluate(() => window.__WAHALA__.stats());
        calls.push(st.drawCalls);
        tris.push(st.triangles);
        await page.waitForTimeout(250);
      }
      rows.push({ name, calls: median(calls), tris: median(tris) });
    }
    const staticBudget = await page.evaluate(() => {
      const scene = window.__WAHALA__.renderer().scene;
      let meshes = 0;
      let tris = 0;
      scene.traverseVisible((o) => {
        if (!o.isMesh) return;
        meshes++;
        const g = o.geometry;
        const n = g.index ? g.index.count : g.attributes.position.count;
        tris += (n / 3) * (o.isInstancedMesh ? o.count : 1);
      });
      return { meshes, tris: Math.round(tris) };
    });
    console.log(JSON.stringify({ label, board: w, view, q, static: staticBudget, frames: rows }));
    await context.close();
  }
await browser.close();
