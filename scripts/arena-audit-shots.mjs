// Every arena, real frames of the real game (docs/ALL_ARENAS_VEHICLE_GENERATORS.md): zoomed-out day / night, medium and
// low quality, phone-sized low quality, with draw calls / triangles and frame timing.
//   node scripts/arena-audit-shots.mjs <out-dir> <label> [arenaId,...]
// Needs a dev / preview server (SHOT_URL, default http://localhost:5206/) and WAHALA_CHROMIUM. Standard arenas start in
// Classic Battle with 4 players, the City Rumble stages with 16 competitors; bots idle (?nobots). One JSON line per frame.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [dir = 'arena-shots', label = 'run', only = ''] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const BASE = process.env.SHOT_URL ?? 'http://localhost:5206/';
const STANDARD = [
  'danfoBusPark',
  'balogunMarket',
  'lekkiRoadworks',
  'oshodiInterchange',
  'ajegunleBackstreets',
  'lagoonJetty',
  'surulerePowerYard',
  'yabaAfterDark',
  'thirdMainland',
];
const RUMBLE = ['rumbleOshodi', 'rumbleLagosIsland', 'rumbleOjuelegba', 'rumbleApapa', 'rumbleLekkiNight', 'cityRumble'];
const ids = only ? only.split(',') : [...STANDARD, ...RUMBLE];
const MODES = (process.env.MODES ?? 'medium-day,medium-night,low-day,low-phone').split(',');
const browser = await chromium.launch({
  executablePath: process.env.WAHALA_CHROMIUM,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function shot(id, mode) {
  const [q, tod] = mode.split('-');
  const phone = tod === 'phone';
  const viewport = phone ? { width: 844, height: 390 } : { width: 1280, height: 720 };
  const rumble = RUMBLE.includes(id);
  const context = await browser.newContext(phone ? { viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport });
  await context.addInitScript(
    ([id, rumble]) => {
      const key = 'wahala.settings.v1';
      const s = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(
        key,
        JSON.stringify(
          rumble
            ? { ...s, play: 'rumble', rumbleArenaId: id, rumbleCompetitors: 16, rumbleMode: 'survival', difficulty: 'standard' }
            : { ...s, play: 'classic', arenaId: id, competitors: 4, difficulty: 'standard' },
        ),
      );
    },
    [id, rumble],
  );
  const page = await context.newPage();
  page.setDefaultTimeout(300000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}?debug&noattract&nobots&q=${q}&seed=7${tod === 'night' ? '&tod=night' : ''}`);
  const quick = page.getByTestId('quick-play');
  await quick.or(page.getByTestId('start-button')).first().waitFor({ timeout: 180000 });
  if ((await quick.count()) > 0) await quick.click();
  else await page.getByTestId('start-button').click();
  await page.getByTestId('hud').waitFor();
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => {
    const w = window.__WAHALA__;
    const s = w.getState();
    w.controller().frozen = true;
    s.players[0].protectedUntil = 1e9;
    w.stepTicks(400);
    w.advance(6);
    return { arena: s.arenaId, w: s.width, h: s.height };
  });
  // City Rumble stages use the follow camera: frame the whole board (zoom scales with the board, Oshodi 63 x 47 = 11)
  if (rumble) {
    const zoom = Math.max(6, 11 * Math.max(info.w / 63, info.h / 47));
    await page.evaluate((z) => window.__WAHALA__.renderer().debugInspect({ x: 0, z: -1, zoom: z }), zoom);
  }
  await page.evaluate(() => (window.__WAHALA__.controller().frozen = false));
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window.__WAHALA__.controller().frozen = true));
  await page.waitForTimeout(600);
  await page.addStyleTag({ content: '.hud, .touch, .touch-controls { display: none !important; }' });
  const st = await page.evaluate(() => window.__WAHALA__.stats());
  await page.screenshot({ path: `${dir}/${label}-${id}-${mode}.jpg`, quality: 85, type: 'jpeg', timeout: 240000 });
  console.log(JSON.stringify({ arena: info.arena, board: `${info.w}x${info.h}`, mode, calls: st.drawCalls, tris: st.triangles, errors: errors.slice(0, 3) }));
  await context.close();
}

for (const id of ids) for (const m of MODES) await shot(id, m).catch((e) => console.log(JSON.stringify({ arena: id, mode: m, failed: String(e).slice(0, 160) })));
await browser.close();
