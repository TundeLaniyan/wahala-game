// Relative cost of every manual graphics preset, measured in a real page (needs `vite preview`; BENCH_URL
// defaults to http://localhost:4173/wahala-game/). In a software-rendered Chromium (SwiftShader, as in CI)
// frame time is dominated by pixels and draw calls, so the ORDER of the rows is meaningful even though the
// absolute fps is not a phone's. Real-device numbers: open the game with `?fps` (shows sim / ai / render ms).
//   WAHALA_CHROMIUM=/opt/pw-browsers/chromium node scripts/quality-bench.mjs [classic|rumble] [desktop|mobile]
import { chromium } from '@playwright/test';

const [game = 'classic', device = 'desktop'] = process.argv.slice(2);
const VP = {
  desktop: { viewport: { width: 1280, height: 720 } },
  mobile: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const PRESETS = ['veryLow', 'low', 'mediumLow', 'medium', 'mediumHigh', 'high'];
const URL = process.env.BENCH_URL ?? 'http://localhost:4173/wahala-game/';

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
const rows = [];
for (const preset of PRESETS) {
  const ctx = await browser.newContext(VP[device]);
  await ctx.addInitScript(
    ([g]) =>
      localStorage.setItem(
        'wahala.settings.v1',
        JSON.stringify({ play: g, competitors: 4, arenaId: 'danfoBusPark', rumbleCompetitors: 16 }),
      ),
    [game],
  );
  const page = await ctx.newPage();
  await page.goto(`${URL}?debug&noattract&q=${preset}&seed=7`);
  await page.getByTestId('title-screen').waitFor();
  await page.getByTestId('quick-play').click();
  await page.getByTestId('hud').waitFor();
  await page.waitForTimeout(3000);
  const r = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const w = window.__WAHALA__;
        let frames = 0;
        const t0 = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - t0 < 6000) requestAnimationFrame(tick);
          else
            resolve({
              fps: (frames * 1000) / (performance.now() - t0),
              stats: w.stats(),
              timings: w.timings(),
            });
        };
        requestAnimationFrame(tick);
      }),
  );
  rows.push({
    preset,
    fps: r.fps.toFixed(1),
    drawCalls: r.stats.drawCalls,
    kTris: Math.round(r.stats.triangles / 1000),
    particles: r.stats.particles,
    pixelRatio: r.stats.pixelRatio.toFixed(2),
    renderMs: r.timings?.render ?? '',
  });
  await ctx.close();
}
await browser.close();
console.log(`${game} / ${device}`);
console.table(rows);
