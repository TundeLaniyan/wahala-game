// Local-fighter crowd silhouette review (decision PIV2): before / after pictures and cost of the silhouette that shows the
// fighter you control where OTHER FIGHTERS hide it. A City Rumble match of N fighters is frozen, the rivals are packed
// around and in front of the local fighter (staging only: the sim, rules and bots are untouched), and the SAME frame is drawn
// with the silhouette off and on (the live quality switch), plus a wall case (local behind a building: no new silhouette).
//
//   SHOT_URL=http://localhost:4191/wahala-game/ WAHALA_CHROMIUM=/opt/pw-browsers/chromium \
//   node scripts/crowd-silhouette-shots.mjs <outDir> [--n 16] [--w 750 --h 336] [--q low] [--dpr 2] [--measure 1]
//
// HONESTY: software-rendered Chromium (SwiftShader): draw calls and triangle counts are device independent; frame times are
// only useful as a ratio between two states of the same scene, never as phone numbers.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const outDir = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'docs/screenshots/post-integration';
const N = Number(opt('n', '16'));
const W = Number(opt('w', '750'));
const H = Number(opt('h', '336'));
const Q = opt('q', 'low');
const DPR = Number(opt('dpr', '2'));
const MEASURE = Number(opt('measure', '0'));
const STAGE = opt('stage', 'rumbleLagosIsland');
const base = process.env.SHOT_URL ?? 'http://localhost:4191/wahala-game/';
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
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: DPR,
});
await ctx.addInitScript(
  ([n, stage]) =>
    localStorage.setItem(
      'wahala.settings.v1',
      JSON.stringify({ play: 'rumble', rumbleCompetitors: n, rumbleMode: 'survival', rumbleArenaId: stage }),
    ),
  [N, STAGE],
);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?debug&noattract&seed=7&q=${Q}&nobots`);
await page.getByTestId('title-screen').waitFor({ timeout: 120000 });
await page.getByTestId('home-play').tap();
await page.getByTestId('home-rumble').tap();
await page.getByTestId('mode-survival').tap();
await page.getByTestId('setup-start').tap();
await page.getByTestId('hud').waitFor({ timeout: 300000 });
await page
  .getByTestId('match-loading')
  .waitFor({ state: 'detached', timeout: 300000 })
  .catch(() => undefined);
await page.evaluate(() => {
  const w = window.__WAHALA__;
  w.controller().frozen = true;
  w.stepTicks(200);
});

/** Packs the rivals around the local fighter: a tight group in front (toward the camera) and a loose crowd beyond. */
const stage = (opts) =>
  page.evaluate((o) => {
    const w = window.__WAHALA__;
    const s = w.getState();
    const me = s.players[0];
    const put = (p, x, y) => {
      p.alive = true;
      p.x = p.stepFromX = x;
      p.y = p.stepFromY = y;
      p.stepRemaining = 0;
    };
    // the camera looks north from the south: a rival with a larger y stands in front of the local fighter
    const near = [
      [0, 0.55],
      [0.55, 0.65],
      [-0.55, 0.75],
      [0, 1.15],
      [1.0, 0.15],
      [-1.0, 0.1],
      [0.5, 1.3],
      [-0.5, 1.35],
    ];
    const rivals = s.players.filter((p) => p.id !== me.id);
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    rivals.forEach((p, i) => {
      if (o.cleared) return put(p, me.x + 40 + i, me.y + 40); // far away: not in view
      if (i < near.length) put(p, me.x + near[i][0], me.y + near[i][1]);
      else put(p, me.x + (rnd() - 0.5) * 9, me.y + (rnd() - 0.45) * 6);
    });
    me.protectedUntil = 0;
    w.advance(1);
    return { x: me.x, y: me.y, players: s.players.length };
  }, opts);

const info = await stage({});
console.log('staged', info);
// the follow camera eases in over many (software) frames: cut straight to its goal, twice, then let frames draw
for (let i = 0; i < 2; i++) {
  await page.evaluate(() => window.__WAHALA__.renderer().cutCamera());
  await page.waitForTimeout(Number(opt('settle', '3500')));
}

const meOnScreen = () =>
  page.evaluate(() => {
    const w = window.__WAHALA__;
    const me = w.getState().players[0];
    return w.renderer().projectTiles([{ x: me.x, y: me.y }])?.[0];
  });
const pt = await meOnScreen();
const clip = {
  x: Math.max(0, Math.min(W - 260, pt.x - 130)),
  y: Math.max(0, Math.min(H - 190, pt.y - 120)),
  width: 260,
  height: 190,
};
const setCrowd = (on) => page.evaluate((v) => window.__WAHALA__.renderer().players.setCrowdSilhouette(v), on);
const snap = async (name) => {
  await page.waitForTimeout(2200);
  await page.screenshot({ path: join(outDir, `${name}.jpg`), type: 'jpeg', quality: 80, timeout: 180000 });
  await page.screenshot({
    path: join(outDir, `${name}-crop.jpg`),
    type: 'jpeg',
    quality: 82,
    clip,
    timeout: 180000,
  });
};
const stats = () =>
  page.evaluate(() => {
    const r = window.__WAHALA__.renderer();
    const s = window.__WAHALA__.stats();
    return { drawCalls: s?.drawCalls, triangles: s?.triangles, crowd: r.debugCrowdSilhouette() };
  });

const tag = `crowd${N}-${W}x${H}`;
const report = { n: N, viewport: `${W}x${H}`, quality: Q, dpr: DPR, shots: tag };
await setCrowd(false);
await snap(`${tag}-before`);
report.off = await stats();
await setCrowd(true);
await snap(`${tag}-after`);
report.on = await stats();

if (MEASURE) {
  // frame times: alternate off / on so drift cancels; software GL, a ratio only
  const frames = (ms) =>
    page.evaluate(
      (dur) =>
        new Promise((res) => {
          const dts = [];
          let last = performance.now();
          const t0 = last;
          const f = (now) => {
            dts.push(now - last);
            last = now;
            if (now - t0 < dur) requestAnimationFrame(f);
            else res(dts.slice(1));
          };
          requestAnimationFrame(f);
        }),
      ms,
    );
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const rounds = { off: [], on: [] };
  for (let r = 0; r < MEASURE; r++) {
    for (const on of [false, true]) {
      await setCrowd(on);
      await page.waitForTimeout(500);
      rounds[on ? 'on' : 'off'].push(med(await frames(5000)));
    }
  }
  report.frameMedianMs = {
    off: rounds.off.map((v) => +v.toFixed(1)),
    on: rounds.on.map((v) => +v.toFixed(1)),
  };
}
// the wall case: the local fighter stands directly behind a hard building, every rival far away. The crowd silhouette has
// nothing to trigger on, so the frame must be identical with it on and off (the older wall silhouette is unchanged)
await page.evaluate(() => {
  const w = window.__WAHALA__;
  const s = w.getState();
  const me = s.players[0];
  const W = s.width;
  const pick = () => {
    for (let y = 3; y < s.height - 3; y++)
      for (let x = 3; x < W - 3; x++)
        if (s.tiles[y * W + x] === 1 && s.tiles[(y - 1) * W + x] === 0 && s.tiles[(y + 1) * W + x] === 1)
          return { x, y: y - 1 };
    return null;
  };
  const at = pick();
  window.__wallAt = at;
  s.players.slice(1).forEach((p, i) => {
    p.x = p.stepFromX = me.x + 60 + i;
    p.y = p.stepFromY = me.y + 60;
    p.stepRemaining = 0;
  });
  if (at) {
    me.x = me.stepFromX = at.x;
    me.y = me.stepFromY = at.y;
    me.stepRemaining = 0;
  }
  w.advance(1);
});
report.wallAt = await page.evaluate(() => window.__wallAt);
for (let i = 0; i < 2; i++) {
  await page.evaluate(() => window.__WAHALA__.renderer().cutCamera());
  await page.waitForTimeout(3500);
}
await setCrowd(false);
await snap(`wall-${W}x${H}-off`);
await setCrowd(true);
await snap(`wall-${W}x${H}-on`);
report.noRivals = await stats();
console.log(JSON.stringify(report));
writeFileSync(join(outDir, `${tag}.json`), JSON.stringify({ ...report, errors }, null, 1));
await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
