// Screenshots of How to Play (needs a dev or preview server; SHOT_URL defaults to http://localhost:5199/wahala-game/):
//   WAHALA_CHROMIUM=/opt/pw-browsers/chromium node scripts/tutorial-shots.mjs <out-dir> [desktop|mobile|both]
// Every frame is the real engine running the chapter's scripted demo or practice.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [outDir = 'docs/screenshots/nine-arenas/tutorial', which = 'both'] = process.argv.slice(2);
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

/** Opens How to Play on a chapter (by id) and advances its demo `ticks` through the real event path. */
async function chapter(page, id, ticks) {
  await page.getByTestId('htp-chapters').click();
  await page.getByTestId(`htp-chapter-${id}`).click();
  await page.waitForTimeout(400);
  await advance(page, ticks);
}

async function advance(page, ticks) {
  // simulate silently, then route the last few ticks through the renderer / effects like real play
  await page.evaluate((n) => {
    const w = window.__WAHALA__;
    w.controller().frozen = true;
    w.stepTicks(Math.max(0, n - 3));
    w.advance(Math.min(n, 3));
  }, ticks);
  // let the caption fade-in finish even at software-rendering frame rates
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

  await chapter(page, 'generator', 232);
  await shot(page, `${device}-02-generator-blast`);

  await chapter(page, 'vehicle', 1);
  // play until the selector shows the chosen entrance's route preview (step 4), then the turn (step 6)
  for (let i = 0; i < 80; i++) {
    const step = await page.evaluate(() => window.__WAHALA__.store.getState().tutorial.step);
    const stage = await page.evaluate(() => window.__WAHALA__.controller().entryOverlay()?.focusKey);
    if (step === 'Step 4 of 6' && stage === '0,4,right') break;
    await advance(page, 20);
  }
  await advance(page, 30);
  await shot(page, `${device}-03-vehicle-preview`);
  for (let i = 0; i < 40; i++) {
    const o = await page.evaluate(() => window.__WAHALA__.controller().entryOverlay());
    if (o && o.stage === 'turn' && o.focusTurnKey === '8:down') break;
    await advance(page, 10);
  }
  await advance(page, 20);
  await shot(page, `${device}-04-vehicle-turn`);
  await advance(page, 190);
  await shot(page, `${device}-05-vehicle-drive`);

  await chapter(page, 'powerYard', 428);
  await shot(page, `${device}-06-power-yard`);

  await chapter(page, 'endgame', 330);
  await shot(page, `${device}-07-endgame-traps`);

  // practice: the vehicle lesson, with the selector open
  await chapter(page, 'vehicle', 1);
  await page.getByTestId('htp-practice').click();
  if (device === 'desktop') await page.getByTestId('htp-char-campusQueen').click();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    // staging: stand the player on the voucher (it is collected on the next tick, like walking there)
    const p = window.__WAHALA__.getState().players[0];
    p.x = p.stepFromX = 2;
  });
  await advance(page, 4);
  if (device === 'mobile') {
    await page.getByTestId('btn-vehicle').dispatchEvent('pointerdown');
  } else {
    await page.keyboard.press('v');
  }
  await advance(page, 30);
  await shot(page, `${device}-08-vehicle-practice`);

  // a phone practice starts with the lesson panel folded away
  if (await page.getByTestId('htp-expand').isVisible()) await page.getByTestId('htp-expand').click();
  await page.getByTestId('htp-chapters').click();
  await page.waitForTimeout(300);
  await shot(page, `${device}-09-chapter-list`);
  await page.getByTestId('htp-chapter-cityRumble').click();
  await advance(page, 200);
  await shot(page, `${device}-10-city-rumble`);
  console.log(device, 'errors', JSON.stringify(errors.slice(0, 5)));
}
await browser.close();
