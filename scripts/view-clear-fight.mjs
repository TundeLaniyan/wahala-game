// Staged fight in a real City Rumble match (docs/DECISIONS.md VF-B): the local fighter stands where tall buildings
// stand between the follow camera and it, a rival is close, a generator is armed and then blasts. Three frames per
// device: armed (fuse burning), the blast (flames out), the aftermath. Real controller, real follow camera.
//   node scripts/view-clear-fight.mjs <out-dir> <label> <arenaId> <x> <y> <phoneL|phoneP|desktop> [auto|high]
// Needs a preview server (SHOT_URL, default http://localhost:5432/wahala-game/) and WAHALA_CHROMIUM.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [
  dir = 'vc-fight',
  label = 'after',
  arena = 'rumbleLekki',
  xs = '26',
  ys = '13',
  device = 'phoneL',
  quality = 'auto',
] = process.argv.slice(2);
const BASE = process.env.SHOT_URL ?? 'http://localhost:5432/wahala-game/';
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
      rumbleCompetitors: 8,
      rumbleMode: 'deathmatch',
      difficulty: 'standard',
    }),
  );
}, arena);
const page = await context.newPage();
page.setDefaultTimeout(300000);
await page.goto(`${BASE}?debug&noattract&nobots&seed=7${quality === 'auto' ? '' : `&q=${quality}`}`);
const quick = page.getByTestId('quick-play');
await quick.or(page.getByTestId('start-button')).first().waitFor({ timeout: 180000 });
if ((await quick.count()) > 0) await quick.click();
else await page.getByTestId('start-button').click();
await page.getByTestId('hud').waitFor();
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const w = window.__WAHALA__;
  w.controller().frozen = true;
  w.stepTicks(400);
  // the sim stays frozen from here (no hazard, no bot): spawn protection would only make the models blink in shots
  for (const p of w.getState().players) p.protectedUntil = 0;
  w.advance(6);
});
await page.addStyleTag({ content: '.hud, .touch, .touch-controls, .rotate { display: none !important; }' });
const staged = await page.evaluate(
  ([x, y]) => {
    const w = window.__WAHALA__;
    const s = w.getState();
    const free = (a, b) => a >= 0 && b >= 0 && a < s.width && b < s.height && s.tiles[b * s.width + a] === 0;
    const near = (tx, ty) => {
      let best = null;
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++)
          if (free(tx + dx, ty + dy)) {
            const d = dx * dx + dy * dy;
            if (!best || d < best.d) best = { x: tx + dx, y: ty + dy, d };
          }
      return best;
    };
    const put = (p, t) => {
      p.x = p.stepFromX = t.x;
      p.y = p.stepFromY = t.y;
      p.stepRemaining = 0;
    };
    const me = s.players[0];
    const here = near(x, y);
    // the generator is armed three tiles east of the fighter (out of its own blast), a rival stands beside it
    const gen = near(here.x + 3, here.y);
    put(me, gen);
    w.controller().forceIntent(0, { place: true });
    w.advance(2);
    put(me, here);
    const rival = near(gen.x + 1, gen.y);
    put(s.players[1], rival);
    const rival2 = near(here.x - 2, here.y);
    put(s.players[2], rival2);
    for (let i = 3; i < s.players.length; i++) put(s.players[i], { x: 1 + i, y: 1 });
    const away = here;
    w.renderer().debugInspect(null);
    w.renderer().cutCamera();
    return { me: away, gen: [gen.x, gen.y], rival, rival2 };
  },
  [Number(xs), Number(ys)],
);
console.log(JSON.stringify({ label, device, quality, staged }));
const snap = async (name, settle = 1600) => {
  await page.waitForTimeout(settle);
  // the fade is eased per drawn frame: wait for frames, not seconds (a software renderer draws few)
  await page.evaluate(
    (n) =>
      new Promise((res) => {
        let k = 0;
        const f = () => (++k >= n ? res(k) : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
    12,
  );
  const file = `${dir}/${label}_${arena}_${device}_${name}.jpg`;
  await page.screenshot({ path: file, quality: 70, type: 'jpeg', timeout: 240000 });
  const v = await page.evaluate(() => window.__WAHALA__.viewClear?.() ?? null);
  console.log(JSON.stringify({ name, file, viewClear: v }));
};
await snap('a_armed');
await page.evaluate(() => {
  const w = window.__WAHALA__;
  const s = w.getState();
  for (let i = 0; i < 400 && s.flames.length === 0; i++) w.advance(1);
});
await snap('b_blast', 700);
await page.evaluate(() => window.__WAHALA__.advance(20));
await snap('c_after', 700);
await browser.close();
