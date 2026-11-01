// Performance of every arena (docs/ALL_ARENAS_VEHICLE_GENERATORS.md): draw calls, triangles and frame timing of the
// whole-board view at medium and low (desktop 1280x720) and low on a phone viewport (844x390), plus the same counts
// while a voucher vehicle is on the board, with the gameplay-object counts. Same methodology as oshodi-perf.mjs
// (software WebGL, so frame times are only comparable between runs on the same machine).
//   node scripts/arena-perf.mjs <label> [arenaId,...]      (SHOT_URL, WAHALA_CHROMIUM, CONFIGS=medium-d,low-d,low-p)
// One JSON line per (arena, config).
const [label = 'run', only = ''] = process.argv.slice(2);
import { chromium } from '@playwright/test';

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
const RUMBLE = [
  'rumbleOshodi',
  'rumbleLagosIsland',
  'rumbleOjuelegba',
  'rumbleApapa',
  'rumbleLekkiNight',
  'cityRumble',
];
const ids = only ? only.split(',') : [...STANDARD, ...RUMBLE];
const CONFIGS = (process.env.CONFIGS ?? 'medium-d,low-d,low-p').split(',');
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

const frames = (ms) =>
  new Promise((res) => {
    const d = [];
    let last = performance.now();
    const end = last + ms;
    const f = (t) => {
      d.push(t - last);
      last = t;
      if (t < end) requestAnimationFrame(f);
      else {
        d.sort((a, b) => a - b);
        res({
          n: d.length,
          mean: d.reduce((a, b) => a + b, 0) / d.length,
          p95: d[Math.floor(d.length * 0.95)],
        });
      }
    };
    requestAnimationFrame(f);
  });

async function run(id, cfg) {
  const [q, dev] = cfg.split('-');
  const phone = dev === 'p';
  const rumble = RUMBLE.includes(id);
  const context = await browser.newContext(
    phone
      ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
      : { viewport: { width: 1280, height: 720 } },
  );
  await context.addInitScript(
    ([id, rumble]) => {
      const key = 'wahala.settings.v1';
      const s = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(
        key,
        JSON.stringify(
          rumble
            ? {
                ...s,
                play: 'rumble',
                rumbleArenaId: id,
                rumbleCompetitors: 16,
                rumbleMode: 'survival',
                difficulty: 'standard',
                character: 'streetBaller',
              }
            : {
                ...s,
                play: 'classic',
                arenaId: id,
                competitors: 4,
                difficulty: 'standard',
                character: 'streetBaller',
              },
        ),
      );
    },
    [id, rumble],
  );
  const page = await context.newPage();
  page.setDefaultTimeout(300000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}?debug&noattract&nobots&q=${q === 'medium' ? 'medium' : 'low'}&seed=7`);
  const quick = page.getByTestId('quick-play');
  await quick.or(page.getByTestId('start-button')).first().waitFor({ timeout: 180000 });
  if ((await quick.count()) > 0) await (phone ? quick.tap() : quick.click());
  else await (phone ? page.getByTestId('start-button').tap() : page.getByTestId('start-button').click());
  await page.getByTestId('hud').waitFor();
  const info = await page.evaluate(() => {
    const w = window.__WAHALA__;
    const s = w.getState();
    w.controller().frozen = true;
    for (const p of s.players) p.protectedUntil = 1e9;
    w.stepTicks(400);
    w.advance(6);
    return { w: s.width, h: s.height };
  });
  if (rumble) {
    const zoom = id === 'rumbleOshodi' ? 11 : 4.3 * Math.max(info.w / 41, info.h / 31);
    await page.evaluate((z) => window.__WAHALA__.renderer().debugInspect({ x: 0, z: -1, zoom: z }), zoom);
  }
  await page.evaluate(() => (window.__WAHALA__.controller().frozen = false));
  await page.waitForTimeout(2000);
  const base = await page.evaluate(() => {
    const w = window.__WAHALA__;
    const st = w.stats();
    const s = w.getState();
    return {
      calls: st.drawCalls,
      tris: st.triangles,
      objects: {
        tiles: s.tiles.length,
        generators: s.generators.length,
        vehicles: s.vehicles.length,
        players: s.players.length,
      },
    };
  });
  const ft = await page.evaluate(frames, 4000);
  // a voucher vehicle on the board (the old run-over vehicle on the release, the carrier on the feature branch)
  const car = await page.evaluate(async () => {
    const w = window.__WAHALA__;
    const s = w.getState();
    s.players[0].hasVoucher = true;
    s.players[0].protectedUntil = 1e9;
    return true;
  });
  await page.keyboard.down('KeyK');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyK');
  await page.waitForTimeout(1500);
  const veh = await page.evaluate(() => {
    const w = window.__WAHALA__;
    const st = w.stats();
    const s = w.getState();
    return {
      calls: st.drawCalls,
      tris: st.triangles,
      vehicles: s.vehicles.length,
      phase: s.vehicles[0]?.phase ?? null,
    };
  });
  const ftv = await page.evaluate(frames, 2000);
  console.log(
    JSON.stringify({
      label,
      arena: id,
      cfg,
      board: `${info.w}x${info.h}`,
      ...base,
      frameMs: { mean: +ft.mean.toFixed(1), p95: +ft.p95.toFixed(1), n: ft.n },
      withVehicle: { ...veh, frameMeanMs: +ftv.mean.toFixed(1), voucherGiven: car },
      errors: errors.slice(0, 2),
    }),
  );
  await context.close();
}

for (const id of ids)
  for (const c of CONFIGS)
    await run(id, c).catch((e) =>
      console.log(JSON.stringify({ label, arena: id, cfg: c, failed: String(e).slice(0, 160) })),
    );
await browser.close();
