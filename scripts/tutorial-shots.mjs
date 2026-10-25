// Screenshots of the Training Academy (needs a dev or preview server; SHOT_URL defaults to http://localhost:5199/wahala-game/):
//   WAHALA_CHROMIUM=/opt/pw-browsers/chromium node scripts/tutorial-shots.mjs <out-dir> [desktop|mobile|both]
// Every frame is the real engine running a lesson's scripted demo or the practice scenario.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [outDir = 'e2e-shots/academy', which = 'both'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const VP = {
  desktop: { viewport: { width: 1280, height: 720 } },
  mobile: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
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

/** Opens a lesson (by id) from the lesson list, on its demo or its practice. */
async function lesson(page, id, mode = 'watch') {
  await page.getByTestId('htp-lessons').click();
  await page.getByTestId(mode === 'watch' ? `htp-watch-${id}` : `htp-practise-${id}`).click();
  await page.waitForTimeout(400);
}

async function advance(page, ticks) {
  // simulate silently, then route the last few ticks through the renderer / effects like real play
  await page.evaluate((n) => {
    const w = window.__WAHALA__;
    w.controller().frozen = true;
    w.stepTicks(Math.max(0, n - 3));
    w.advance(Math.min(n, 3));
  }, ticks);
  await page.waitForTimeout(2500);
}

async function shot(page, name) {
  await page.screenshot({ path: `${outDir}/${name}.jpg`, quality: 82, timeout: 600000 });
  console.log('wrote', name);
}

for (const device of which === 'both' ? ['desktop', 'mobile'] : [which]) {
  const page = await (await browser.newContext(VP[device])).newPage();
  page.setDefaultTimeout(300000); // software WebGL on a shared CPU: loading a lesson's scene can take a while
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(
    `${process.env.SHOT_URL ?? 'http://localhost:5199/wahala-game/'}?debug&noattract&q=${process.env.Q ?? 'medium'}`,
  );
  await page.getByTestId('title-screen').waitFor();
  await page.getByTestId('help-button').click();
  await page.getByTestId('how-to-play').waitFor();
  await advance(page, 90);
  await shot(page, `${device}-01-move-demo`);

  await lesson(page, 'move', 'practice');
  await advance(page, 2);
  await shot(page, `${device}-02-move-practice-marker`);

  await lesson(page, 'escape', 'watch');
  await advance(page, 150);
  await shot(page, `${device}-03-escape-demo`);

  await lesson(page, 'vehicle', 'watch');
  await advance(page, 240);
  await shot(page, `${device}-04-vehicle-one-press`);

  await lesson(page, 'team', 'practice');
  await advance(page, 2);
  await shot(page, `${device}-05-team-practice`);

  await page.getByTestId('htp-lessons').click();
  await page.waitForTimeout(300);
  await shot(page, `${device}-06-lesson-list`);
  console.log(device, 'errors', JSON.stringify(errors.slice(0, 5)));
}
await browser.close();
