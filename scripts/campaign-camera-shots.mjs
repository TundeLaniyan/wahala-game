// Campaign camera review shots (docs/CAMPAIGN_CAMERA.md): the FIRST frame of a mission (the countdown's opening shot)
// and a frame of play, on a 740 x 360 and an 844 x 390 landscape phone (device scale 2) and a 1280 x 720 desktop.
// Works against any build with the `?debug` handle (production 0b89d09 for "before", a branch for "after").
//   SHOT_URL=http://localhost:<port>/wahala-game/ WAHALA_CHROMIUM=/opt/pw-browsers/chromium \
//   node scripts/campaign-camera-shots.mjs <out-dir> [missions] [viewports]
// A mission is `field:<fieldId>`, `boss:<districtId>` or `raid:<raidId>` (as in scripts/campaign-perf.mjs).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [
  outDir = 'docs/screenshots/campaign-guidance-expansion/camera',
  list = 'field:oshodi.approach,field:oshodi.railEdge,boss:oshodi,raid:warehouseDispatchDepot',
  vps = 'phone740,phone844,desktop',
] = process.argv.slice(2);
const VIEWPORTS = {
  phone740: { viewport: { width: 740, height: 360 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  phone844: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1280, height: 720 } },
};
const ORDER = ['oshodi', 'mushin', 'fadeyiSomolu', 'ebuteMetta', 'lagosIsland', 'lekki'];
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

async function settle(page) {
  let last = '';
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(500);
    const now = await page.evaluate(() => {
      const r = window.__WAHALA__.renderer();
      const p = r.rig?.currentPose?.();
      return p ? `${p.x.toFixed(2)}:${p.z.toFixed(2)}:${p.distance.toFixed(2)}` : '';
    });
    if (now === last && now) return;
    last = now;
  }
}

for (const vpName of vps.split(',')) {
  for (const mission of list.split(',')) {
    const [kind, id] = mission.split(':');
    const page = await (await browser.newContext(VIEWPORTS[vpName])).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(
      `${process.env.SHOT_URL ?? 'http://localhost:5199/wahala-game/'}?debug&noattract&seed=7&q=low`,
    );
    await page.getByTestId('title-screen').waitFor();
    await page.waitForFunction(() => window.__WAHALA__?.store.getState().loading === null, null, {
      timeout: 180_000,
    });
    const ok = await page.evaluate(
      ({ kind, id, order }) => {
        const w = window.__WAHALA__;
        if (kind === 'field') return w.startFieldMission(id);
        const c = w.campaign();
        c.load();
        if (kind === 'raid') return c.debugStartRaid(id);
        c.startNew();
        c.storyDone();
        for (const d of order.slice(0, order.indexOf(id) + 1))
          c.finishMission({
            result: 'won',
            missionId: d,
            modifiers: [],
            seconds: 100,
            livesUsed: 0,
            phasesCleared: 3,
            defeat: 'eliminated',
            stars: 3,
            creditedKills: 1,
          });
        c.toMap();
        return c.startMission(id);
      },
      { kind, id, order: ORDER },
    );
    if (!ok) throw new Error(`${mission} did not start`);
    await page.waitForFunction(
      () => window.__WAHALA__.matchLoad().state === null && !!window.__WAHALA__.getState(),
      null,
      { timeout: 180_000 },
    );
    // the opening shot: the first tick of the countdown, held
    await page.evaluate(() => {
      const w = window.__WAHALA__;
      w.controller().frozen = true;
      const s = w.getState();
      s.match.phase = 'countdown';
      s.match.countdownRemaining = s.config.match.countdownTicks;
      w.renderer().cutCamera();
    });
    await settle(page);
    const name = `${id.replace(/\./g, '-')}-${vpName}`;
    await page.screenshot({
      path: `${outDir}/${name}-start.jpg`,
      type: 'jpeg',
      quality: 80,
      timeout: 180_000,
    });
    // play: past the countdown, a second of the camera settling
    await page.evaluate(() => {
      const w = window.__WAHALA__;
      while (w.getState().match.phase === 'countdown') w.stepTicks(10);
      w.renderer().cutCamera();
    });
    await settle(page);
    await page.screenshot({
      path: `${outDir}/${name}-play.jpg`,
      type: 'jpeg',
      quality: 80,
      timeout: 180_000,
    });
    console.log(name, errors.length ? `ERRORS: ${errors.slice(0, 3).join(' | ')}` : 'ok');
    await page.context().close();
  }
}
await browser.close();
