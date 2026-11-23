// Process-tree memory of a real Chromium at the menu and in a match (docs/MOBILE_PERFORMANCE.md).
//   node scripts/perf/memory-probe.mjs --url http://localhost:4180/wahala-game/ [--game classic|rumble] [--stage danfoBusPark] [--n 16]
// RSS is the SUM over the browser, renderer, GPU (SwiftShader holds the uploaded textures here) and utility processes,
// in MB. Absolute numbers are this container's, NOT a phone's; the build-to-build DIFFERENCE is the evidence.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const URL_ = opt('url', 'http://localhost:4180/wahala-game/');
const GAME = opt('game', 'classic');
const STAGE = opt('stage', 'danfoBusPark');
const N = Number(opt('n', '16'));
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
// Only this probe's Chromium runs (no other browser job at the same time): sum the RSS of every Chromium process.
function treeRssMb() {
  const rows = execFileSync('ps', ['-eo', 'rss=,args='], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((l) => l.trim());
  let sum = 0;
  for (const l of rows) {
    const [rss, ...cmd] = l.split(/\s+/);
    if (/chrom/i.test(cmd.join(' ')) && !/ps -eo/.test(cmd.join(' '))) sum += Number(rss);
  }
  return +(sum / 1024).toFixed(0);
}
const ctx = await browser.newContext({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
});
await ctx.addInitScript(
  ([g, stage, n]) =>
    localStorage.setItem(
      'wahala.settings.v1',
      JSON.stringify({
        play: g,
        competitors: 4,
        rumbleCompetitors: n,
        rumbleMode: 'survival',
        rumbleArenaId: stage,
        arenaId: stage,
      }),
    ),
  [GAME, STAGE, N],
);
const page = await ctx.newPage();
const out = { url: URL_, game: GAME, stage: STAGE };
out.beforeLoadMb = treeRssMb();
await page.goto(`${URL_}?debug&noattract&seed=7&q=low${opt('extra', '')}`);
await page.getByTestId('title-screen').waitFor({ timeout: 120000 });
await page
  .waitForFunction(() => window.__WAHALA__?.store.getState().loading === null, null, { timeout: 120000 })
  .catch(() => undefined);
await page.waitForTimeout(4000);
out.menuMb = treeRssMb();
out.menuModels = await page.evaluate(() => window.__WAHALA__.assets().loaded.length);
await page.getByTestId('home-play').click();
await page.getByTestId(GAME === 'rumble' ? 'home-rumble' : 'home-classic').click();
if (GAME === 'rumble') await page.getByTestId('mode-survival').click();
await page.getByTestId('setup-start').click();
await page.getByTestId('hud').waitFor({ timeout: 300000 });
await page
  .getByTestId('match-loading')
  .waitFor({ state: 'detached', timeout: 300000 })
  .catch(() => undefined);
await page.waitForTimeout(8000);
out.matchMb = treeRssMb();
out.matchModels = await page.evaluate(() => window.__WAHALA__.assets().loaded.length);
const heap = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
out.jsHeapMb = +(heap / 1e6).toFixed(0);
const st = await page.evaluate(() => window.__WAHALA__.stats());
out.textures = st.textures;
out.geometries = st.geometries;
console.log(JSON.stringify(out));
await browser.close();
