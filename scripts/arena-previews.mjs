// Captures the arena-picker preview images: a real countdown frame of each arena (HUD hidden),
// 640 x 360 JPEG at quality 75, into public/previews/<arenaId>.jpg.
//
//   node scripts/arena-previews.mjs [--url http://localhost:4173/wahala-game/] [--out public/previews] [--arenas a,b]
//
// Needs a running dev or preview server (`npm run build && npx vite preview`). Set WAHALA_CHROMIUM to a
// preinstalled Chromium when offline. Re-run after arena art changes and commit the images.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ARENA_IDS = [
  'danfoBusPark',
  'balogunMarket',
  'lekkiRoadworks',
  'oshodiInterchange',
  'ajegunleBackstreets',
  'lagoonJetty',
  'surulerePowerYard',
  'yabaAfterDark',
  'thirdMainland',
  'cityRumble',
];

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
    return acc;
  }, []),
);
const url = args.url ?? 'http://localhost:4173/wahala-game/';
const out = args.out ?? 'public/previews';
const arenas = args.arenas ? args.arenas.split(',') : ARENA_IDS;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.WAHALA_CHROMIUM || undefined,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});

for (const id of arenas) {
  const page = await (
    await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 })
  ).newPage();
  page.setDefaultTimeout(300000); // software WebGL on a busy machine can take seconds per frame
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}?debug&noattract&nobots&q=${process.env.Q ?? 'high'}&seed=${process.env.SEED ?? 7}`);
  await page.getByTestId('title-screen').waitFor();
  await page.getByTestId(`arena-${id}`).click();
  if (id !== 'cityRumble') await page.getByTestId('players-4').click();
  else await page.getByTestId('rumble-16').click();
  await page.getByTestId('start-button').click();
  await page.getByTestId('hud').waitFor();
  // a countdown frame: the arena with everyone at their spawns, before anything happens
  await page.evaluate(() => {
    const w = window.__WAHALA__;
    w.controller().frozen = true;
    w.stepTicks(60);
    w.renderer().cutCamera();
  });
  await page.addStyleTag({ content: '.hud, .touch, .touch-controls { display: none !important; }' });
  await page.waitForTimeout(Number(process.env.SETTLE_MS ?? 2500));
  const file = join(out, `${id}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 75, timeout: 240000 });
  console.log(JSON.stringify({ arena: id, file, errors: errors.slice(0, 3) }));
  await page.close();
}
await browser.close();
