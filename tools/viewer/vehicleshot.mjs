// In-game vehicle captures from the real gameplay camera, for art reviews.
// Usage: node tools/viewer/vehicleshot.mjs <outPrefix> [arenaId] [width] [height] [quality]
// Needs a running Vite dev server (npm run dev -- --port 5199 --strictPort) and WAHALA_CHROMIUM.
// For each signature vehicle it starts a 2-player match (no bots), gives the human a voucher, launches
// the vehicle from the default border entry (aimed at a rival parked mid-field) and steps until it is on the field, then writes
// <outPrefix>-<vehicle>.png (full frame) and <outPrefix>-<vehicle>-crop.png (the frame's pixels around
// the vehicle, i.e. exactly what a player sees, for enlarging).
import { chromium } from '@playwright/test';

const [prefix, arena = 'danfoBusPark', width = '1280', height = '720', quality = 'high'] =
  process.argv.slice(2);
const base = process.env.VIEWER_BASE ?? 'http://localhost:5199';
const mobile = +width < 900;
const browser = await chromium.launch({
  executablePath: process.env.WAHALA_CHROMIUM || undefined,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const pairs = [
  ['streetBaller', 'danfo', 64],
  ['lekkiBoy', 'taxi', 34],
  ['campusQueen', 'keke', 40],
];
for (const [character, vehicle, ticks] of pairs) {
  const page = await browser.newPage({
    viewport: { width: +width, height: +height },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: Number(process.env.DSF ?? (mobile ? 2 : 1)),
  });
  await page.goto(`${base}/?debug&nobots&noattract&q=${quality}&seed=7`);
  await page.getByTestId('players-2').click();
  await page.getByTestId(`char-${character}`).click();
  await page.getByTestId(`arena-${arena}`).click();
  await page.getByTestId('start-button').click();
  await page.waitForFunction(() => window.__WAHALA__?.getState()?.match.phase !== undefined, null, {
    timeout: 60000,
  });
  const step = (n) =>
    page.evaluate((k) => {
      const w = window.__WAHALA__;
      w.controller().frozen = true;
      w.stepTicks(k);
    }, n);
  await step(160);
  await page.evaluate(() => {
    const [p, rival] = window.__WAHALA__.getState().players;
    p.hasVoucher = true;
    p.x = p.stepFromX = 0;
    p.y = p.stepFromY = 10;
    // a rival in the middle row: the default entry aims at it, so the vehicle crosses the centre
    rival.x = rival.stepFromX = 7;
    rival.y = rival.stepFromY = 6;
    // clear the destructible clutter on the middle rows so the capture shows the whole vehicle
    const s = window.__WAHALA__.getState();
    for (let y = 4; y <= 7; y++)
      for (let x = 0; x < s.width; x++) if (s.tiles[y * s.width + x] === 2) s.tiles[y * s.width + x] = 0;
  });
  await step(2);
  await page.keyboard.press('v');
  await step(2);
  await page.keyboard.press('Enter');
  if (vehicle === 'keke') {
    await step(2);
    await page.keyboard.press('Enter');
  }
  await step(72 + ticks);
  await page.waitForTimeout(1200);
  const at = await page.evaluate(() => {
    const w = window.__WAHALA__;
    const s = w.getState();
    const v = s.vehicles[0];
    if (!v) return null;
    const t = v.route[Math.max(0, v.index)];
    const cam = w.renderer().rig.camera;
    const p = cam.position
      .clone()
      .set(t.x - s.width / 2 + 0.5, 0.45, t.y - s.height / 2 + 0.5)
      .project(cam);
    return { x: (p.x + 1) / 2, y: (1 - p.y) / 2, kind: v.kind };
  });
  await page.screenshot({ path: `${prefix}-${vehicle}.png`, timeout: 120000 });
  if (at) {
    const W = +width;
    const H = +height;
    const cw = Math.round(W * 0.2);
    const ch = Math.round(cw * 0.62);
    const x = Math.max(0, Math.min(W - cw, Math.round(at.x * W - cw / 2)));
    const y = Math.max(0, Math.min(H - ch, Math.round(at.y * H - ch / 2)));
    await page.screenshot({
      path: `${prefix}-${vehicle}-crop.png`,
      clip: { x, y, width: cw, height: ch },
      timeout: 120000,
    });
    console.log(vehicle, 'on field at', at);
  } else console.log(vehicle, 'not on the field');
  await page.close();
}
await browser.close();
