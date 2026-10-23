// Real frames of two features that need a staged moment (art review / delivery report):
//  - Surulere Power Yard: one generator's blast filling its whole row and column (desktop + phone);
//  - the vehicle-attack workflow on Danfo Bus Park: voucher, entry selection with route preview,
//    the Keke turn stage, the warning, and the Keke driving (desktop + phone).
//
//   WAHALA_CHROMIUM=/opt/pw-browsers/chromium node scripts/feature-shots.mjs --url http://localhost:4173/wahala-game/ \
//        --out docs/screenshots/nine-arenas/final/features
//
// Needs a running dev or preview server. Everything shown is the real game; the only staging is moving
// the local player and handing them a voucher / a short fuse through the `?debug` hook.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
    return acc;
  }, []),
);
const url = args.url ?? 'http://localhost:4173/wahala-game/';
const out = args.out ?? 'docs/screenshots/nine-arenas/final/features';
mkdirSync(out, { recursive: true });

const DEVICES = {
  desktop: { viewport: { width: 1280, height: 720 } },
  phone: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

const browser = await chromium.launch({
  executablePath: process.env.WAHALA_CHROMIUM || undefined,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});

async function openMatch(device, settings) {
  const ctx = await browser.newContext(DEVICES[device]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((s) => {
    localStorage.setItem('wahala.settings.v1', JSON.stringify(s));
  }, settings);
  await page.goto(`${url}?debug&nobots&noattract&q=high&seed=7`);
  await page.waitForFunction(() => !!window.__WAHALA__ && window.__WAHALA__.store.getState().loading === null, null, {
    timeout: 300_000,
  });
  await page.getByTestId('start-button').click();
  await page.waitForFunction(() => window.__WAHALA__.getState() !== null);
  await page.evaluate(() => {
    window.__WAHALA__.controller().frozen = true;
    window.__WAHALA__.stepTicks(160);
  });
  return { ctx, page, errors };
}

const mutate = (page, code) =>
  page.evaluate((c) => new Function('s', c)(window.__WAHALA__.getState()), code);
const advance = (page, n) => page.evaluate((k) => window.__WAHALA__.advance(k), n);
const settle = (page) => page.waitForTimeout(1200);
async function shot(page, name) {
  await settle(page);
  const file = join(out, `${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 82 });
  console.log(JSON.stringify({ file }));
}

for (const device of ['desktop', 'phone']) {
  // ---- Power Yard: a full row + column blast
  {
    const { ctx, page, errors } = await openMatch(device, {
      arenaId: 'surulerePowerYard',
      competitors: 4,
      character: 'streetBaller',
    });
    // park the local player safely in a corner, a rival generator in the middle of row 4
    await mutate(
      page,
      `const p = s.players[0]; p.x = p.stepFromX = 0; p.y = p.stepFromY = 10; p.stepRemaining = 0;
       s.generators.push({ id: s.nextId++, ownerId: 1, x: 6, y: 4, stepFromX: 6, stepFromY: 4, range: 2, pierce: false,
         mode: 'timed', timer: 3, carriedBy: null, carryBonusUsed: false, slide: null, flight: null, triggered: false,
         placedTick: s.tick });`,
    );
    await advance(page, 6);
    await shot(page, `powerYard-full-line-blast-${device}`);
    if (errors.length) console.log(JSON.stringify({ errors }));
    await ctx.close();
  }

  // ---- Vehicle workflow: Campus Queen's Keke (entry, preview, turn, warning, drive)
  {
    const { ctx, page, errors } = await openMatch(device, {
      arenaId: 'danfoBusPark',
      competitors: 2,
      character: 'campusQueen',
    });
    await mutate(
      page,
      `const p = s.players[0]; p.hasVoucher = true; p.x = p.stepFromX = 6; p.y = p.stepFromY = 6; p.stepRemaining = 0;`,
    );
    await advance(page, 2);
    await shot(page, `vehicle-1-voucher-ready-${device}`);
    await page.keyboard.press('v');
    await advance(page, 3);
    await shot(page, `vehicle-2-entrances-${device}`);
    await page.keyboard.press('ArrowRight');
    await advance(page, 3);
    await shot(page, `vehicle-3-route-preview-${device}`);
    await page.keyboard.press('Enter');
    await advance(page, 3);
    await shot(page, `vehicle-4-keke-turn-${device}`);
    await page.keyboard.press('Enter');
    await advance(page, 20);
    await shot(page, `vehicle-5-warning-${device}`);
    await advance(page, 75);
    await shot(page, `vehicle-6-keke-driving-${device}`);
    if (errors.length) console.log(JSON.stringify({ errors }));
    await ctx.close();
  }
}
await browser.close();
