// Landscape-phone review frames for the touch layout: the whole-arena camera fit, the floating thumbstick
// held by a thumb, and every action button shown at once (so nothing covers a tile), on several real
// phone viewports, plus City Rumble. Prints the board's on-screen box and checks it against the controls.
//
//   WAHALA_CHROMIUM=/opt/pw-browsers/chromium node scripts/mobile-shots.mjs --url http://localhost:4173/wahala-game/ \
//        --out docs/screenshots/mobile-joystick
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
const out = args.out ?? 'docs/screenshots/mobile-joystick';
mkdirSync(out, { recursive: true });

const PHONES = [
  { name: 'iphone-se', width: 568, height: 320 },
  { name: 'iphone-8', width: 667, height: 375 },
  { name: 'android-360', width: 740, height: 360 },
  { name: 'iphone-14', width: 844, height: 390 },
  { name: 'iphone-pro-max', width: 932, height: 430 },
];
const only = args.only ? args.only.split(',') : null;

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

async function open(phone, settings) {
  const ctx = await browser.newContext({
    viewport: { width: phone.width, height: phone.height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((s) => localStorage.setItem('wahala.settings.v1', JSON.stringify(s)), settings);
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

const shot = async (page, file) => {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(out, file), type: 'jpeg', quality: 80, timeout: 240_000 });
  console.log(JSON.stringify({ file }));
};

for (const phone of PHONES) {
  if (only && !only.includes(phone.name)) continue;
  const { ctx, page, errors } = await open(phone, { arenaId: 'danfoBusPark', competitors: 4, touchControls: 'on' });
  // every contextual button at once: grip (carry), remote (BOOM), kill switch (DISARM), voucher (vehicle)
  await page.evaluate(() => {
    const s = window.__WAHALA__.getState();
    const p = s.players[0];
    Object.assign(p, { grip: true, remote: true, killSwitchCharges: 2, hasVoucher: true });
    window.__WAHALA__.advance(2);
  });
  await shot(page, `${phone.name}-buttons.jpg`);
  // a thumb on the stick, pushing right
  const zone = await page.getByTestId('stick-zone').boundingBox();
  const x = zone.x + zone.width * 0.45;
  const y = zone.y + zone.height * 0.6;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 6, { steps: 5 });
  await page.evaluate(() => window.__WAHALA__.advance(30));
  await shot(page, `${phone.name}-thumbstick.jpg`);
  await page.mouse.up();
  // the board's on-screen box vs the controls
  const report = await page.evaluate(() => {
    const r = window.__WAHALA__.renderer();
    const s = window.__WAHALA__.getState();
    const corners = [
      [0, 0],
      [s.width - 1, 0],
      [0, s.height - 1],
      [s.width - 1, s.height - 1],
    ].map(([gx, gy]) => r.gridToScreen?.(gx, gy) ?? null);
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)];
    };
    const buttons = [...document.querySelectorAll('.abtn')].map((b) => {
      const q = b.getBoundingClientRect();
      return [Math.round(q.left), Math.round(q.top), Math.round(q.right), Math.round(q.bottom)];
    });
    return { corners, buttons, hint: rect('.stick-hint'), timer: rect('.timer') };
  });
  console.log(JSON.stringify({ phone: phone.name, ...report, errors }));
  await ctx.close();
}

// City Rumble on the iPhone 14 size: follow camera, minimap, stick
if (!only || only.includes('rumble')) {
  const phone = PHONES[3];
  const { ctx, page, errors } = await open(phone, {
    arenaId: 'cityRumble',
    rumbleCompetitors: 16,
    touchControls: 'on',
  });
  await page.evaluate(() => window.__WAHALA__.advance(60));
  await shot(page, `${phone.name}-city-rumble.jpg`);
  console.log(JSON.stringify({ phone: 'rumble', errors }));
  await ctx.close();
}
await browser.close();
