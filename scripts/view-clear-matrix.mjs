// Real-camera view-clear matrix (docs/DECISIONS.md VF-B). Starts a real City Rumble match, places the local
// fighter on a grid of walkable tiles, lets the real follow camera settle and measures what hides the fighter
// and the floor around it, from the real camera pose, at the given device size and quality.
//   node scripts/view-clear-matrix.mjs <out-dir> <arenaId> <phoneL|phoneP|desktop> <auto|veryLow|low|medium|high> [step=4] [shots=bad|all|none]
// Needs a preview server (SHOT_URL, default http://localhost:5432/wahala-game/) and WAHALA_CHROMIUM.
// Per position: rayFighter (0..1: share of the camera->fighter rays [feet, torso, head] that scenery blocks, a
// dissolved object counts 1 - its dither), rayRing (the same for 36 floor points on a 0.8 / 1.6 / 2.5 tile disc
// around the fighter), pixVisible (share of the fighter's own pixels that really show it, from a fighter-only
// render compared with the frame), faded (objects dissolving now), unrelated (faded objects no sample ray crosses).
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { installProbe } from './lib/viewClearProbe.mjs';

const [
  dir = 'vc-out',
  arena = 'rumbleLekki',
  device = 'phoneL',
  quality = 'auto',
  stepArg = '4',
  shots = 'bad',
] = process.argv.slice(2);
const STEP = Number(stepArg);
const BASE = process.env.SHOT_URL ?? 'http://localhost:5432/wahala-game/';
const SETTLE = Number(process.env.SETTLE ?? 600);
const FRAMES = Number(process.env.FRAMES ?? 14);
const VP = {
  phoneL: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  phoneP: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1280, height: 720 } },
}[device];
mkdirSync(dir, { recursive: true });
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
const context = await browser.newContext(VP);
await context.addInitScript((arenaId) => {
  const key = 'wahala.settings.v1';
  const s = JSON.parse(localStorage.getItem(key) || '{}');
  localStorage.setItem(
    key,
    JSON.stringify({
      ...s,
      play: 'rumble',
      rumbleArenaId: arenaId,
      rumbleCompetitors: 16,
      rumbleMode: 'deathmatch',
      difficulty: 'standard',
    }),
  );
}, arena);
const page = await context.newPage();
page.setDefaultTimeout(300000);
const q = quality === 'auto' ? '' : `&q=${quality}`;
await page.goto(`${BASE}?debug&noattract&nobots&seed=7${q}`);
const quick = page.getByTestId('quick-play');
await quick.or(page.getByTestId('start-button')).first().waitFor({ timeout: 180000 });
if ((await quick.count()) > 0) await quick.click();
else await page.getByTestId('start-button').click();
await page.getByTestId('hud').waitFor();
await page.waitForTimeout(1200);
const info = await page.evaluate(() => {
  const w = window.__WAHALA__;
  w.controller().frozen = true;
  w.stepTicks(400);
  // the sim stays frozen from here (no hazard, no bot): spawn protection would only make the models blink in shots
  for (const p of w.getState().players) p.protectedUntil = 0;
  w.advance(6);
  const s = w.getState();
  return { W: s.width, H: s.height, quality: w.quality() };
});
console.log(
  JSON.stringify({
    arena,
    device,
    quality,
    info: { W: info.W, H: info.H, rung: info.quality.rung, name: info.quality.name },
  }),
);
await page.addStyleTag({ content: '.hud, .touch, .touch-controls, .rotate { display: none !important; }' });

await installProbe(page);

const tiles = await page.evaluate(() => {
  const s = window.__WAHALA__.getState();
  const out = [];
  for (let y = 0; y < s.height; y++)
    for (let x = 0; x < s.width; x++) if (s.tiles[y * s.width + x] === 0) out.push([x, y]);
  return { W: s.width, H: s.height, free: out };
});
const freeSet = new Set(tiles.free.map(([x, y]) => y * tiles.W + x));
const spots = [];
for (let gy = 2; gy < tiles.H; gy += STEP)
  for (let gx = 2; gx < tiles.W; gx += STEP) {
    // nearest walkable tile within 2
    let best = null;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = gx + dx;
        const y = gy + dy;
        if (!freeSet.has(y * tiles.W + x)) continue;
        const dd = dx * dx + dy * dy;
        if (!best || dd < best.dd) best = { x, y, dd };
      }
    if (best && !spots.some((s) => s.x === best.x && s.y === best.y)) spots.push(best);
  }
if (process.env.SPOTS) {
  // explicit positions ("x,y;x,y"): exactly these tiles (the nearest walkable one)
  spots.length = 0;
  for (const part of process.env.SPOTS.split(';')) {
    const [sx, sy] = part.split(',').map(Number);
    let best = null;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (!freeSet.has((sy + dy) * tiles.W + sx + dx)) continue;
        const dd = dx * dx + dy * dy;
        if (!best || dd < best.dd) best = { x: sx + dx, y: sy + dy, dd };
      }
    if (best) spots.push(best);
  }
}
console.log(JSON.stringify({ spots: spots.length }));
const rows = [];
const tag = `${arena}_${device}_${quality}`;
for (const s of spots) {
  await page.evaluate(([x, y]) => window.__vc.place(x, y), [s.x, s.y]);
  await page.waitForTimeout(SETTLE);
  await page.evaluate((n) => window.__vc.frames(n), FRAMES);
  const m = await page.evaluate(() => window.__vc.measure());
  const bad = m.rayFighter > 0.4 || m.rayRing > 0.4 || m.unrelated > 0;
  let file = null;
  if (shots === 'all' || (shots === 'bad' && bad)) {
    file = `${dir}/${tag}_${s.x}_${s.y}.jpg`;
    await page.screenshot({ path: file, quality: 55, type: 'jpeg', timeout: 240000 });
  }
  rows.push({ x: s.x, y: s.y, ...m, file, bad });
  console.log(
    JSON.stringify({
      x: s.x,
      y: s.y,
      rf: m.rayFighter,
      rr: m.rayRing,
      pv: m.pixVisible,
      hv: m.headVisible,
      fd: m.faded,
      un: m.unrelated,
      vc: m.viewClear,
      file,
    }),
  );
}
writeFileSync(`${dir}/${tag}.json`, JSON.stringify({ arena, device, quality, rows }, null, 1));
const nb = rows.filter((r) => r.bad).length;
const mean = (k) => rows.reduce((a, r) => a + (r[k] ?? 0), 0) / Math.max(1, rows.length);
console.log(
  JSON.stringify({
    summary: tag,
    positions: rows.length,
    bad: nb,
    meanRayFighter: +mean('rayFighter').toFixed(3),
    meanRayRing: +mean('rayRing').toFixed(3),
    meanPixVisible: +mean('pixVisible').toFixed(3),
    meanUnrelated: +mean('unrelated').toFixed(2),
    fighterHidden: rows.filter((r) => r.rayFighter > 0.4).length,
    ringHidden: rows.filter((r) => r.rayRing > 0.4).length,
  }),
);
await browser.close();
