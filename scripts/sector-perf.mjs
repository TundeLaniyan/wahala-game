// District-sector render cost (docs/CAMPAIGN_SECTOR_AI.md, "Render cost"): every field mission loaded through the debug
// handle WITH its sector and WITHOUT it (`noSector`, the whole district), on a low and a high quality preset. Reports
// the scene build time (`loadMs`, renderer.loadGame), draw calls and triangles once the follow camera has settled,
// GPU resources alive (geometries / textures) and frame time mean / p95 over a few seconds of real play.
// `--leak` instead loads three missions one after another in ONE page and prints the GPU resources after each (a leak
// grows them). Software rendering (SwiftShader): the numbers compare the two variants; they are not phone timings.
//   SHOT_URL=http://localhost:<port>/wahala-game/ WAHALA_CHROMIUM=/opt/pw-browsers/chromium WAHALA_MULTIPROCESS=1 \
//   node scripts/sector-perf.mjs [fieldId,...|all] [low,high] [--leak] [--seconds=4]
import { chromium } from '@playwright/test';

const ALL = [
  'oshodi.approach',
  'oshodi.railEdge',
  'mushin.approach',
  'mushin.market',
  'fadeyiSomolu.approach',
  'fadeyiSomolu.junctions',
  'ebuteMetta.approach',
  'lagosIsland.approach',
  'lagosIsland.press',
  'lekki.approach',
  'lekki.estate',
];
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const [list = 'all', qualities = 'low,high'] = args.filter((a) => !a.startsWith('--'));
const ids = list === 'all' ? ALL : list.split(',');
const seconds = Number(flags.find((f) => f.startsWith('--seconds='))?.split('=')[1] ?? 4);
const base = process.env.SHOT_URL ?? 'http://localhost:5199/wahala-game/';
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

async function open(q) {
  const page = await (
    await browser.newContext({ viewport: { width: 740, height: 360 }, deviceScaleFactor: 1 })
  ).newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto(`${base}?debug&noattract&seed=7&q=${q}`);
  await page.getByTestId('title-screen').waitFor();
  return page;
}

/** Starts a field mission and waits until the loading screen has gone and the camera has had a moment. */
async function start(page, id, noSector) {
  await page.evaluate(({ id, noSector }) => window.__WAHALA__.startFieldMission(id, { noSector }), {
    id,
    noSector,
  });
  await page.waitForFunction(
    () => window.__WAHALA__.matchLoad().state === null && !!window.__WAHALA__.getState(),
    null,
    {
      timeout: 180_000,
    },
  );
  // past the countdown (on software WebGL it would take many seconds of slow frames): the follow camera, in play
  await page.evaluate(() => {
    const w = window.__WAHALA__;
    const c = w.controller();
    c.frozen = true;
    while (c.state.match.phase !== 'playing') w.stepTicks(10);
    c.frozen = false;
    w.renderer().cutCamera();
  });
  await page.waitForTimeout(1500);
}

/** Frame deltas over `seconds` of real play (the human stands still; the enemies are live). */
async function frames(page) {
  return page.evaluate(
    (seconds) =>
      new Promise((resolve) => {
        const out = [];
        let last = performance.now();
        const end = last + seconds * 1000;
        const step = (now) => {
          out.push(now - last);
          last = now;
          if (now < end) requestAnimationFrame(step);
          else {
            const sorted = [...out].sort((a, b) => a - b);
            const mean = out.reduce((a, b) => a + b, 0) / out.length;
            resolve({ mean, p95: sorted[Math.floor(sorted.length * 0.95)], n: out.length });
          }
        };
        requestAnimationFrame(step);
      }),
    seconds,
  );
}

const round = (v) => Math.round(v * 10) / 10;

if (flags.includes('--leak')) {
  const page = await open(qualities.split(',')[0]);
  const picks = ids.length >= 3 ? ids.slice(0, 3) : [ids[0], ids[0], ids[0]];
  for (const [i, id] of picks.entries()) {
    await start(page, id, false);
    const s = await page.evaluate(() => window.__WAHALA__.stats());
    console.log(`load ${i + 1} ${id}: geometries ${s.geometries} textures ${s.textures} loadMs ${s.loadMs}`);
  }
  // back to the title: everything the match built must be released
  await page.evaluate(() => window.__WAHALA__.controller().stop());
  await page.waitForTimeout(500);
  console.log('after stop', JSON.stringify(await page.evaluate(() => window.__WAHALA__.stats())));
  await browser.close();
  process.exit(0);
}

console.log(
  '| mission | quality | variant | build ms | draw calls | triangles | geometries | textures | frame mean ms | frame p95 ms |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const q of qualities.split(',')) {
  for (const id of ids) {
    for (const noSector of [false, true]) {
      const page = await open(q);
      await start(page, id, noSector);
      const f = await frames(page);
      const s = await page.evaluate(() => window.__WAHALA__.stats());
      console.log(
        `| ${id} | ${q} | ${noSector ? 'whole district' : 'sector'} | ${round(s.loadMs)} | ${s.drawCalls} | ${s.triangles} | ${s.geometries} | ${s.textures} | ${round(f.mean)} | ${round(f.p95)} |`,
      );
      await page.context().close();
    }
  }
}
await browser.close();
