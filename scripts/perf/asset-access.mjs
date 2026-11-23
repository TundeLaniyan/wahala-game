// Which 3D models does each arena actually touch while it builds and plays? (docs/MOBILE_PERFORMANCE.md)
// Starts every standard arena and every City Rumble stage in a real page with the asset recorder on
// (`__WAHALA__.assetRecorder()`) and prints/saves {arena: {touched, missed}} so the on-demand model manifest in
// src/render/assets/modelGroups.ts can be derived from facts and re-verified.
//   WAHALA_CHROMIUM=... node scripts/perf/asset-access.mjs [--url http://localhost:4181/wahala-game/] [--q veryLow,high] [--out file.json] [--only id,id]
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const URL_ = opt('url', 'http://localhost:4181/wahala-game/');
const QS = opt('q', 'veryLow,high').split(',');
const OUT = opt('out', '');
const ONLY = opt('only', '') ? opt('only', '').split(',') : null;
const SETTLE_MS = Number(opt('settle', '4000'));

const CLASSIC = [
  'danfoBusPark',
  'balogunMarket',
  'lekkiRoadworks',
  'oshodiInterchange',
  'lagoonJetty',
  'ajegunleBackstreets',
  'surulerePowerYard',
  'thirdMainland',
  'yabaAfterDark',
];
const RUMBLE = [
  'rumbleOshodi',
  'rumbleOjuelegba',
  'rumbleMushin',
  'rumbleFadeyi',
  'rumbleLagosIsland',
  'rumbleLekki',
  'rumbleEbuteMetta',
];
const jobs = [
  ...CLASSIC.map((id) => ({ game: 'classic', id })),
  ...RUMBLE.map((id) => ({ game: 'rumble', id })),
].filter((j) => !ONLY || ONLY.includes(j.id));

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
const result = {};
async function runOne(job, q) {
  const ctx = await browser.newContext({
    viewport: { width: Number(opt('w', '844')), height: Number(opt('h', '390')) },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  await ctx.addInitScript(
    ([game, id]) =>
      localStorage.setItem(
        'wahala.settings.v1',
        JSON.stringify({
          play: game,
          competitors: 4,
          rumbleCompetitors: 16,
          rumbleMode: 'survival',
          ...(game === 'classic' ? { arenaId: id } : { rumbleArenaId: id }),
        }),
      ),
    [job.game, job.id],
  );
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [pageerror ${job.id}/${q}]`, e.message));
  await page.goto(`${URL_}?debug&noattract&seed=7&q=${q}${opt('extra', '')}`);
  await page.getByTestId('title-screen').waitFor({ timeout: 120000 });
  // wait for the boot preload (eager mode) or just the menu (lazy mode), then start recording
  await page
    .waitForFunction(() => window.__WAHALA__?.store.getState().loading === null, null, { timeout: 120000 })
    .catch(() => undefined);
  await page.evaluate(() => window.__WAHALA__.assetRecorder(true));
  await page.getByTestId('home-play').click();
  await page.getByTestId(job.game === 'classic' ? 'home-classic' : 'home-rumble').click();
  if (job.game === 'rumble') await page.getByTestId('mode-survival').click();
  await page.getByTestId('setup-start').click();
  await page.getByTestId('hud').waitFor({ timeout: 300000 });
  await page
    .getByTestId('match-loading')
    .waitFor({ state: 'detached', timeout: 300000 })
    .catch(() => undefined);
  await page.waitForTimeout(SETTLE_MS);
  const access = await page.evaluate(() => {
    const st = window.__WAHALA__.stats();
    return {
      ...window.__WAHALA__.assetAccess(),
      loaded: window.__WAHALA__.assets().loaded.length,
      scene: { geometries: st.geometries, textures: st.textures },
    };
  });
  const key = `${job.id}@${q}`;
  result[key] = access;
  console.log(
    `${key}: touched ${access.touched.length} [${access.touched.join(' ')}] missed ${access.missed.length} [${access.missed.join(' ')}] (loaded ${access.loaded}) scene ${JSON.stringify(access.scene)}`,
  );
  await ctx.close();
}
for (const job of jobs) {
  for (const q of QS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await runOne(job, q);
        break;
      } catch (e) {
        console.log(`  [retry ${attempt}] ${job.id}@${q}: ${String(e.message).split('\n')[0]}`);
      }
    }
    if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
  }
}
await browser.close();
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
