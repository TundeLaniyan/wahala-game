// Static scene budget of the City Rumble stages (docs/MAP_IDENTITY.md): the number of visible meshes (an upper bound of the
// draw calls: no frustum culling, no LOD) and the triangles of the built scene, counted by walking `renderer().scene`.
// Deterministic for a given build, unlike a frame's `stats()` (which varies with culling, LOD and the traffic on screen).
//   node scripts/map-identity-perf.mjs [arenaId,...]       (SHOT_URL, WAHALA_CHROMIUM as for map-identity-shots.mjs)
import { chromium } from '@playwright/test';

const only = (process.argv[2] ?? '').split(',').filter(Boolean);
const BASE = process.env.SHOT_URL ?? 'http://localhost:5206/';
const ALL = [
  'rumbleOjuelegba',
  'rumbleOshodi',
  'rumbleMushin',
  'rumbleFadeyi',
  'rumbleLagosIsland',
  'rumbleLekki',
  'rumbleEbuteMetta',
];
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
for (const id of only.length ? only : ALL) {
  const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
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
  await page.goto(`${BASE}?debug&noattract&nobots&q=medium&seed=7`);
  const quick = page.getByTestId('quick-play');
  await quick.or(page.getByTestId('start-button')).first().waitFor({ timeout: 180000 });
  if ((await quick.count()) > 0) await quick.click();
  else await page.getByTestId('start-button').click();
  await page.getByTestId('hud').waitFor();
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
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
    return { arena: window.__WAHALA__.getState().arenaId, meshes, tris: Math.round(tris) };
  });
  console.log(JSON.stringify({ id, ...r }));
  await context.close();
}
await browser.close();
