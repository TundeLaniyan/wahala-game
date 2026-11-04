// Mission screenshots (art / HUD review): node scripts/mission-shots.mjs <out-dir> [desktop|mobile] [missionIds,comma] [ticks]
// Needs a preview server (SHOT_URL, default http://localhost:5199/wahala-game/) and WAHALA_CHROMIUM. Uses the ?debug
// campaign controller: earlier districts are cleared with finishMission fixtures so the target is unlocked.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const [outDir = 'docs/screenshots/missions', device = 'desktop', ids = 'oshodi,mushin,fadeyiSomolu,ebuteMetta,lagosIsland,lekki', ticks = '900'] =
  process.argv.slice(2);
const ORDER = ['oshodi', 'mushin', 'fadeyiSomolu', 'ebuteMetta', 'lagosIsland', 'lekki'];
const VP = {
  desktop: { viewport: { width: 1280, height: 720 } },
  mobile: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.WAHALA_CHROMIUM,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
for (const id of ids.split(',')) {
  const page = await (await browser.newContext(VP[device])).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${process.env.SHOT_URL ?? 'http://localhost:5199/wahala-game/'}?debug&noattract&seed=7`);
  await page.getByTestId('title-screen').waitFor();
  await page.evaluate(
    ({ id, order }) => {
      const c = window.__WAHALA__.campaign();
      c.load();
      c.startNew();
      c.storyDone();
      for (const earlier of order.slice(0, order.indexOf(id))) {
        c.finishMission({ result: 'won', missionId: earlier, modifiers: [], seconds: 100, livesUsed: 0, phasesCleared: 3, defeat: 'eliminated', stars: 3, creditedKills: 1 });
      }
      c.beginBriefing(id);
      c.startFromBriefing();
      c.bossIntroDone();
    },
    { id, order: ORDER },
  );
  await page.getByTestId('hud').waitFor();
  await page.waitForTimeout(1500);
  await page.evaluate((n) => {
    const w = window.__WAHALA__;
    w.controller().frozen = true;
    w.stepTicks(Math.max(0, n - 240));
    w.advance(Math.min(n, 240));
  }, Number(ticks));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/${id}-${device}.png`, timeout: 180000 });
  console.log(id, device, errors.length ? `ERRORS: ${errors.slice(0, 3).join(' | ')}` : 'ok');
  await page.close();
}
await browser.close();
