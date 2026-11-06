// Checkpoint clarity screenshots (docs/CHECKPOINT_CLARITY.md): Oshodi Terminal Approach staged through the real runtime.
//   SHOT_URL=http://localhost:<port>/wahala-game/ WAHALA_CHROMIUM=/opt/pw-browsers/chromium \
//   node scripts/checkpoint-clarity-shots.mjs <out-dir> <desktop|mobile|portrait> <scenario,...> [prefix]
// Scenarios (staging only: the human is moved through `__WAHALA__.controller().state`, then the real sim ticks on):
//   start       spawn, 2 s into play (the first checkpoint is off screen: compass, panel, minimap)
//   checkpoint  three tiles short of CHECKPOINT A (the current beacon in view, B and the gate further on)
//   reached     a third of a second after stepping onto CHECKPOINT A (feedback + the next objective)
//   door        the three checkpoints walked, standing on the depot door, the hold 40 % done
//   drain       as `door`, then a step off the door: the hold draining
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const [outDir = 'docs/screenshots/checkpoint-clarity', device = 'desktop', list = 'start', prefix = ''] =
  process.argv.slice(2);
const VP = {
  desktop: { viewport: { width: 1280, height: 720 } },
  mobile: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  portrait: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
mkdirSync(outDir, { recursive: true });
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
for (const scenario of list.split(',')) {
  const page = await (await browser.newContext(VP[device])).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${process.env.SHOT_URL ?? 'http://localhost:4931/wahala-game/'}?debug&noattract&seed=7`);
  await page.getByTestId('title-screen').waitFor();
  await page.evaluate(() => {
    const c = window.__WAHALA__.campaign();
    c.load();
    c.startNew();
    c.storyDone();
    c.startSectionMission('oshodi.approach');
  });
  await page.getByTestId('hud').waitFor();
  await page.waitForTimeout(800);
  const info = await page.evaluate((scenario) => {
    const w = window.__WAHALA__;
    const c = w.controller();
    c.frozen = true;
    const s = c.state;
    const put = (x, y) => {
      const p = s.players[0];
      p.x = p.stepFromX = x;
      p.y = p.stepFromY = y;
      p.stepRemaining = 0;
      p.protectedUntil = s.tick + 100000;
    };
    // the countdown passes and the match starts
    while (s.match.phase !== 'playing') w.stepTicks(10);
    w.stepTicks(120);
    const legs = [
      [9, 39],
      [19, 39],
      [26, 40],
    ];
    if (scenario === 'checkpoint') {
      put(6, 39);
      w.stepTicks(2);
    } else if (scenario === 'reached') {
      put(9, 39);
      w.stepTicks(20);
    } else if (scenario === 'door' || scenario === 'drain') {
      for (const [x, y] of legs) {
        put(x, y);
        w.stepTicks(2);
      }
      put(25, 44);
      w.stepTicks(scenario === 'door' ? 24 : 40);
      if (scenario === 'drain') {
        put(25, 43);
        w.stepTicks(6);
      }
    }
    const m = s.mission;
    return {
      tick: s.tick,
      leg: m.field.leg,
      markersDone: m.field.markersDone,
      hold: m.field.doors[0].hold,
      callout: m.callout,
      player: [s.players[0].x, s.players[0].y],
    };
  }, scenario);
  // the follow camera catches up and the HUD publishes (frozen: the sim does not move)
  await page.waitForTimeout(2200);
  const file = `${outDir}/${prefix}${device}-${scenario}.jpg`;
  await page.screenshot({ path: file, type: 'jpeg', quality: 72 });
  console.log(file, JSON.stringify(info), errors.length ? `ERRORS ${errors.join(' | ')}` : '');
  await page.context().close();
}
await browser.close();
