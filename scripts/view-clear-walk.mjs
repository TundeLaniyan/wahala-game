// Walk test (docs/DECISIONS.md VF-B): the local fighter really walks a route through a City Rumble stage on the real
// controller at a deterministic 30 fps game clock (requestAnimationFrame timestamps are replaced, so a slow software
// renderer does not make the fade look faster than it would on a phone), and every frame the probe measures from the
// real camera how much scenery covers the fighter's torso / head and the floor disc around it.
//   node scripts/view-clear-walk.mjs <out-dir> <arenaId> <phoneL|phoneP|desktop> <auto|high> <fromX,fromY> <toX,toY> [fps=30]
// Needs a preview server (SHOT_URL, default http://localhost:5432/wahala-game/) and WAHALA_CHROMIUM.
// Prints: frames walked, frames the fighter was hidden (coverage >= 0.5), the longest run, frames the disc was hidden,
// and writes <out-dir>/walk_<arena>_<device>_<quality>.json (per frame samples).
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { installProbe } from './lib/viewClearProbe.mjs';

const [
  dir = 'vc-walk',
  arena = 'rumbleLekki',
  device = 'phoneL',
  quality = 'auto',
  fromArg = '3,9',
  toArg = '50,25',
  fpsArg = '30',
] = process.argv.slice(2);
const FPS = Number(fpsArg);
const [fx, fy] = fromArg.split(',').map(Number);
const [tx, ty] = toArg.split(',').map(Number);
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
await context.addInitScript(
  ([arenaId, fps]) => {
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
    // a steady game clock: every drawn frame is 1/fps of game time, however long the software renderer takes
    const orig = window.requestAnimationFrame.bind(window);
    let fake = 0;
    window.__fakeClock = { on: false };
    window.requestAnimationFrame = (cb) =>
      orig((ts) => {
        if (window.__fakeClock.on) {
          fake += 1000 / fps;
          cb(fake);
        } else {
          fake = ts;
          cb(ts);
        }
      });
  },
  [arena, FPS],
);
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
  for (const p of w.getState().players) p.protectedUntil = 1e9;
  w.stepTicks(400);
  w.advance(6);
});
await page.addStyleTag({ content: '.hud, .touch, .touch-controls, .rotate { display: none !important; }' });
await installProbe(page);
const result = await page.evaluate(
  async ([fx, fy, tx, ty]) => {
    const w = window.__WAHALA__;
    const s = w.getState();
    const me = s.players[0];
    // the random breakables wall the board into pockets: clear them so the route is a real street walk
    for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i] === 2) s.tiles[i] = 0;
    const free = (x, y) => x >= 0 && y >= 0 && x < s.width && y < s.height && s.tiles[y * s.width + x] === 0;
    const nearest = (x, y) => {
      let best = null;
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++)
          if (free(x + dx, y + dy)) {
            const d = dx * dx + dy * dy;
            if (!best || d < best.d) best = { x: x + dx, y: y + dy, d };
          }
      return best;
    };
    const A = nearest(fx, fy);
    const target = nearest(tx, ty);
    // BFS flood on free tiles; the walk ends on the reachable tile nearest to the target
    const prev = new Map();
    const q = [A.y * s.width + A.x];
    prev.set(q[0], -1);
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      const cx = c % s.width;
      const cy = Math.floor(c / s.width);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx + dx;
        const ny = cy + dy;
        const n = ny * s.width + nx;
        if (free(nx, ny) && !prev.has(n)) {
          prev.set(n, c);
          q.push(n);
        }
      }
    }
    let B = A;
    let bd = Infinity;
    for (const c of q) {
      const d = ((c % s.width) - target.x) ** 2 + (Math.floor(c / s.width) - target.y) ** 2;
      if (d < bd) {
        bd = d;
        B = { x: c % s.width, y: Math.floor(c / s.width) };
      }
    }
    const path = [];
    for (let c = B.y * s.width + B.x; c !== -1 && c !== undefined; c = prev.get(c))
      path.push([c % s.width, Math.floor(c / s.width)]);
    path.reverse();
    // start
    me.x = me.stepFromX = A.x;
    me.y = me.stepFromY = A.y;
    me.stepRemaining = 0;
    w.renderer().debugInspect(null);
    w.renderer().cutCamera();
    window.__fakeClock.on = true;
    await window.__vc.frames(20); // the camera settles at the start
    w.controller().frozen = false;
    const samples = [];
    let idx = 1;
    const dirOf = (a, b) => (b[0] > a[0] ? 'right' : b[0] < a[0] ? 'left' : b[1] > a[1] ? 'down' : 'up');
    let guard = 0;
    while (idx < path.length && guard++ < 4000) {
      // reached the next tile?
      if (me.x === path[idx][0] && me.y === path[idx][1]) idx++;
      if (idx >= path.length) break;
      w.controller().forceIntent(0, { move: dirOf([me.x, me.y], path[idx]) });
      await window.__vc.frames(1);
      const m = window.__vc.quick();
      samples.push({
        f: samples.length,
        x: me.x,
        y: me.y,
        fighter: m.fighter,
        ring: m.ring,
        tiles: m.vc ? m.vc.tiles : null,
        fading: m.vc ? m.vc.fading : null,
        wanted: m.vc ? m.vc.wanted : null,
      });
    }
    w.controller().frozen = true;
    window.__fakeClock.on = false;
    return { route: [A, B, path.length], samples };
  },
  [fx, fy, tx, ty],
);
const smp = result.samples;
const hidden = smp.filter((r) => r.fighter >= 0.5);
let run = 0;
let maxRun = 0;
for (const r of smp) {
  run = r.fighter >= 0.5 ? run + 1 : 0;
  maxRun = Math.max(maxRun, run);
}
const ringHidden = smp.filter((r) => r.ring >= 0.5);
// blinks: a tile wanted, not wanted, wanted again within 8 frames (it should stay faded, not flicker)
const lastOn = new Map();
let blinks = 0;
smp.forEach((r, i) => {
  const now = new Set(r.wanted ?? []);
  for (const t of now) {
    const prev = lastOn.get(t);
    if (prev !== undefined && prev !== i - 1 && i - prev <= 8) blinks++;
    lastOn.set(t, i);
  }
});
const summary = {
  arena,
  device,
  quality,
  fps: FPS,
  route: result.route,
  frames: smp.length,
  fighterHiddenFrames: hidden.length,
  fighterHiddenShare: +(hidden.length / Math.max(1, smp.length)).toFixed(3),
  longestHiddenRunFrames: maxRun,
  longestHiddenRunMs: Math.round((maxRun * 1000) / FPS),
  ringHiddenFrames: ringHidden.length,
  ringHiddenShare: +(ringHidden.length / Math.max(1, smp.length)).toFixed(3),
  blinks,
};
writeFileSync(
  `${dir}/walk_${arena}_${device}_${quality}.json`,
  JSON.stringify({ summary, samples: smp }, null, 1),
);
console.log(JSON.stringify(summary));
await browser.close();
