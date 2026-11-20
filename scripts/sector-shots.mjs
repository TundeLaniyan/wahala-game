// District-sector screenshots (docs/CAMPAIGN_SECTOR_AI.md): a field mission started through the debug handle, the human
// staged on a tile next to the sector's barricades, the follow camera settled, a JPEG of the frame.
//   SHOT_URL=http://localhost:<port>/wahala-game/ WAHALA_CHROMIUM=/opt/pw-browsers/chromium WAHALA_MULTIPROCESS=1 \
//   node scripts/sector-shots.mjs <out-dir> <phone|phoneWide|desktop> <fieldId@XxY[:overview],...> [--nosector]
// `:overview` takes the sector overview (the establishing shot) instead of the follow camera; `:inspect` an unclamped
// close-up of the tile (art review of the barricade objects).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [
  outDir = 'docs/screenshots/campaign-sector-ai',
  device = 'phone',
  list = 'oshodi.approach@20x38',
  ...flags
] = process.argv.slice(2);
const VP = {
  phone: { viewport: { width: 740, height: 360 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  phoneWide: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1280, height: 720 } },
};
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
const noSector = flags.includes('--nosector');
for (const item of list.split(',')) {
  const [id, rest = ''] = item.split('@');
  const [tile, mode = 'follow'] = rest.split(':');
  const [x, y] = tile.split('x').map(Number);
  const page = await (await browser.newContext(VP[device])).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${process.env.SHOT_URL ?? 'http://localhost:5199/wahala-game/'}?debug&noattract&seed=7`);
  await page.getByTestId('title-screen').waitFor();
  await page.evaluate(({ id, noSector }) => window.__WAHALA__.startFieldMission(id, { noSector }), {
    id,
    noSector,
  });
  await page.waitForFunction(
    () => window.__WAHALA__.matchLoad().state === null && !!window.__WAHALA__.getState(),
    null,
    { timeout: 180_000 },
  );
  await page.waitForTimeout(800);
  const info = await page.evaluate(
    ({ x, y, mode }) => {
      const w = window.__WAHALA__;
      const c = w.controller();
      c.frozen = true;
      const s = c.state;
      while (s.match.phase !== 'playing') w.stepTicks(10);
      w.stepTicks(30);
      if (Number.isFinite(x)) {
        const p = s.players[0];
        p.x = p.stepFromX = x;
        p.y = p.stepFromY = y;
        p.stepRemaining = 0;
        p.protectedUntil = s.tick + 100000;
      }
      if (mode === 'overview') w.renderer().setCameraView('overview');
      if (mode === 'inspect')
        w.renderer().debugInspect({ x: x - s.width / 2 + 0.5, z: y - s.height / 2 + 0.5, zoom: 0.55 });
      w.stepTicks(2);
      return { sector: s.sector?.id ?? null, player: [s.players[0].x, s.players[0].y] };
    },
    { x, y, mode },
  );
  // SHOT_SETTLE_MS: a longer settle for a far teleport on a slow software renderer (the follow camera glides per frame)
  await page.waitForTimeout(Number(process.env.SHOT_SETTLE_MS) || 2400);
  const status = await page.evaluate(() => window.__WAHALA__.sector());
  const file = `${outDir}/${device}-${id.replace('.', '-')}-${Number.isFinite(x) ? `${x}x${y}` : 'start'}${mode === 'follow' ? '' : `-${mode}`}${noSector ? '-nosector' : ''}.jpg`;
  await page.screenshot({ path: file, type: 'jpeg', quality: 74 });
  console.log(
    file,
    JSON.stringify({ ...info, view: status?.view }),
    errors.length ? `ERRORS ${errors.join(' | ')}` : '',
  );
  await page.context().close();
}
await browser.close();
