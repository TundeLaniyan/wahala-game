// Frame-time / memory / simulation-cost benchmark for a running match (docs/MOBILE_PERFORMANCE.md).
//   WAHALA_CHROMIUM=... node scripts/perf/frame-bench.mjs --url http://localhost:4181/wahala-game/ --n 16 --q low,medium \
//        [--game rumble|classic] [--stage rumbleOshodi] [--seconds 20] [--throttle 4] [--w 844 --h 390 --dpr 2] [--out f.json]
//
// HONESTY NOTE: this is SOFTWARE-rendered Chromium (SwiftShader) on a CI-class CPU. Absolute fps is NOT a phone's.
// What is meaningful: (a) the ORDER and RATIOS between presets / builds, (b) main-thread JS cost (sim, bots, render
// submission: `timings()`), which `--throttle N` scales by N (CDP CPU throttling) to approximate a weaker CPU, (c) draw
// calls, triangles and JS heap, which are device independent. Physical-Android numbers must be taken with `?fps`.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const URL_ = opt('url', 'http://localhost:4181/wahala-game/');
const GAME = opt('game', 'rumble');
const N = Number(opt('n', '16'));
const QS = opt('q', 'low').split(',');
const SECONDS = Number(opt('seconds', '20'));
const THROTTLE = Number(opt('throttle', '1'));
const STAGE = opt('stage', 'rumbleOshodi');
const W = Number(opt('w', '844'));
const H = Number(opt('h', '390'));
const DPR = Number(opt('dpr', '2'));
const WARM_S = Number(opt('warm', '8'));
const EXTRA = opt('extra', '');

const pct = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : NaN;
};

const browser = await chromium.launch({
  executablePath: process.env.WAHALA_CHROMIUM,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-precise-memory-info',
  ],
});
const rows = [];
for (const q of QS) {
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: DPR,
  });
  await ctx.addInitScript(
    ([game, n, stage]) =>
      localStorage.setItem(
        'wahala.settings.v1',
        JSON.stringify({
          play: game,
          competitors: 4,
          rumbleCompetitors: n,
          rumbleMode: 'survival',
          rumbleArenaId: stage,
          arenaId: stage,
        }),
      ),
    [GAME, N, STAGE],
  );
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto(`${URL_}?debug&noattract&seed=7&q=${q}${EXTRA}`);
  await page.getByTestId('title-screen').waitFor({ timeout: 120000 });
  await page
    .waitForFunction(() => window.__WAHALA__?.store.getState().loading === null, null, { timeout: 120000 })
    .catch(() => undefined);
  const heapBefore =
    (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0;
  await page.getByTestId('home-play').click();
  await page.getByTestId(GAME === 'rumble' ? 'home-rumble' : 'home-classic').click();
  if (GAME === 'rumble') await page.getByTestId('mode-survival').click();
  await page.getByTestId('setup-start').click();
  await page.getByTestId('hud').waitFor({ timeout: 300000 });
  await page
    .getByTestId('match-loading')
    .waitFor({ state: 'detached', timeout: 300000 })
    .catch(() => undefined);
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await page.waitForTimeout(WARM_S * 1000);
  const r = await page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const dts = [];
        let last = performance.now();
        const t0 = last;
        const tick = (now) => {
          dts.push(now - last);
          last = now;
          if (now - t0 < ms) requestAnimationFrame(tick);
          else {
            const w = window.__WAHALA__;
            const players = w.getState()?.players.length ?? 0;
            resolve({
              dts,
              stats: w.stats(),
              timings: w.timings(),
              quality: w.quality(),
              players,
              heap: performance.memory?.usedJSHeapSize ?? 0,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
    SECONDS * 1000,
  );
  const m = (await cdp.send('Performance.getMetrics')).metrics;
  const get = (n) => m.find((x) => x.name === n)?.value ?? 0;
  const dts = r.dts.slice(1);
  rows.push({
    q,
    fighters: r.players,
    throttle: THROTTLE,
    fps: +((dts.length * 1000) / dts.reduce((a, b) => a + b, 0)).toFixed(2),
    frameP50: +pct(dts, 50).toFixed(1),
    frameP95: +pct(dts, 95).toFixed(1),
    frameMax: +Math.max(...dts).toFixed(1),
    over50ms: dts.filter((d) => d > 50).length,
    drawCalls: r.stats?.drawCalls,
    kTris: Math.round((r.stats?.triangles ?? 0) / 1000),
    pixelRatio: r.stats?.pixelRatio,
    simMs: r.timings?.sim,
    aiMs: r.timings?.ai,
    renderMs: r.timings?.render,
    rung: r.quality?.rung ?? r.quality?.current,
    jsHeapMB: +(get('JSHeapUsedSize') / 1e6).toFixed(1),
    jsHeapBootMB: +(heapBefore / 1e6).toFixed(1),
    domNodes: get('Nodes'),
  });
  console.log(JSON.stringify(rows.at(-1)));
  await ctx.close();
}
await browser.close();
if (opt('out', '')) fs.writeFileSync(opt('out', ''), JSON.stringify(rows, null, 1));
console.table(rows);
