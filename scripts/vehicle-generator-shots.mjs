// The vehicle generator in every arena (docs/ALL_ARENAS_VEHICLE_GENERATORS.md): real frames of the real game, for each
// arena the carrier approaching, the late fuse warning and the detonation, plus the phone controls with the
// contextual vehicle action.
//   node scripts/vehicle-generator-shots.mjs <out-dir> <label> [arenaId,...]
// Needs a dev / preview server (SHOT_URL, default http://localhost:5206/) and WAHALA_CHROMIUM. The match is staged
// (voucher, a rival placed on the carrier's route, the owner far away) and the carrier is sent with the real B key;
// everything after that is the real simulation. Q=low|medium selects the quality (default medium).
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [dir = 'vg-shots', label = 'vg', only = ''] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const BASE = process.env.SHOT_URL ?? 'http://localhost:5206/';
const Q = process.env.Q ?? 'medium';
// first carrier tile that counts as "approaching" (0 on a stage whose blast reaches the entry at once, e.g. Power Yard)
const MINI = Number(process.env.MINI ?? 2);
const CHARACTER = process.env.CHARACTER ?? 'streetBaller';
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
  'rumbleOjuelegba',
  'rumbleOshodi',
  'rumbleMushin',
  'rumbleFadeyi',
  'rumbleLagosIsland',
  'rumbleLekki',
  'rumbleEbuteMetta',
];
const ids = only ? only.split(',') : [...STANDARD, ...RUMBLE];
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

async function run(id) {
  const rumble = RUMBLE.includes(id);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(
    ([id, rumble, CHARACTER]) => {
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
                rumbleCompetitors: 8,
                rumbleMode: 'survival',
                difficulty: 'standard',
                character: CHARACTER,
              }
            : {
                ...s,
                play: 'classic',
                arenaId: id,
                competitors: 4,
                difficulty: 'standard',
                character: CHARACTER,
              },
        ),
      );
    },
    [id, rumble, CHARACTER],
  );
  const page = await context.newPage();
  page.setDefaultTimeout(300000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}?debug&noattract&nobots&q=${Q}&seed=7`);
  const quick = page.getByTestId('quick-play');
  await quick.or(page.getByTestId('start-button')).first().waitFor({ timeout: 180000 });
  if ((await quick.count()) > 0) await quick.click();
  else await page.getByTestId('start-button').click();
  await page.getByTestId('hud').waitFor();
  await page.waitForTimeout(1200);
  // stage: owner with a voucher, protection off, the carrier sent with the real B key
  await page.evaluate(() => {
    const w = window.__WAHALA__;
    const s = w.getState();
    w.controller().frozen = true;
    w.stepTicks(300);
    for (const p of s.players) p.protectedUntil = 0;
    s.players[0].hasVoucher = true;
  });
  await page.keyboard.down('KeyK');
  await page.evaluate(() => window.__WAHALA__.stepTicks(3));
  await page.keyboard.up('KeyK');
  const planned = await page.evaluate(() => {
    const w = window.__WAHALA__;
    const s = w.getState();
    const v = s.vehicles[0];
    if (!v) return null;
    // a rival on the fifth tile of the route, everyone else (the owner included) far away from it
    const near = (x, y) => v.route.some((r) => Math.abs(r.x - x) + Math.abs(r.y - y) <= 7);
    const put = (p, x, y) => {
      p.x = p.stepFromX = x;
      p.y = p.stepFromY = y;
      p.stepRemaining = 0;
    };
    const t = v.route[Math.min(5, v.route.length - 1)];
    put(s.players[1], t.x, t.y);
    const free = [];
    for (let y = 1; y < s.height - 1; y++)
      for (let x = 1; x < s.width - 1; x++)
        if (s.tiles[y * s.width + x] === 0 && !near(x, y)) free.push([x, y]);
    s.players
      .slice(2)
      .forEach(
        (p, i) => free.length && put(p, ...free[Math.floor((free.length * (i + 1)) / s.players.length)]),
      );
    if (free.length) put(s.players[0], ...free[0]);
    return { w: s.width, h: s.height, kind: v.kind, route: v.route.length };
  });
  if (!planned) {
    console.log(JSON.stringify({ arena: id, skipped: 'no legal route' }));
    await context.close();
    return;
  }
  const look = async (name, zoom) => {
    // close-up on the carrier (world position from its tile), frozen
    await page.evaluate(
      ([zoom]) => {
        const w = window.__WAHALA__;
        const s = w.getState();
        const v = s.vehicles[0];
        const t = v ? v.route[Math.max(0, v.index)] : s.players[1];
        w.renderer().debugInspect({ x: t.x - s.width / 2 + 0.5, z: t.y - s.height / 2 + 0.5, zoom });
        w.advance(2);
      },
      [zoom],
    );
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `${dir}/${label}-${id}-${name}.jpg`,
      quality: 85,
      type: 'jpeg',
      timeout: 240000,
    });
  };
  const until = (pred, max = 1500) =>
    page.evaluate(
      ([src, max]) => {
        const w = window.__WAHALA__;
        const f = new Function('s', `return ${src}`);
        for (let i = 0; i < max; i++) {
          if (f(w.getState())) return i;
          w.stepTicks(1);
        }
        return -1;
      },
      [pred, max],
    );
  const approach = await until(
    `s.vehicles[0] && s.vehicles[0].phase === 'driving' && s.vehicles[0].index >= ${MINI}`,
  );
  if (approach >= 0) await look('1-approach', 2.4);
  const fuse = await until(
    "s.vehicles[0] && s.vehicles[0].payload && s.vehicles[0].payload.state === 'fusing'",
  );
  if (fuse >= 0) {
    await page.evaluate(() => window.__WAHALA__.stepTicks(12));
    await look('2-warning', 2.4);
  }
  const blast = await until('s.flames.length > 0');
  if (blast >= 0) {
    await page.evaluate(() => window.__WAHALA__.stepTicks(5));
    await look('3-detonation', 2.4);
  }
  const state = await page.evaluate(() => {
    const s = window.__WAHALA__.getState();
    return { owner: s.players[0].alive, rival: s.players[1].alive, vehicles: s.vehicles.length };
  });
  console.log(
    JSON.stringify({ arena: id, ...planned, approach, fuse, blast, ...state, errors: errors.slice(0, 2) }),
  );
  await context.close();
}

async function controls(id) {
  // the phone controls with the contextual vehicle action
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await context.addInitScript(
    ([id, CHARACTER]) => {
      const key = 'wahala.settings.v1';
      const s = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(
        key,
        JSON.stringify({
          ...s,
          play: 'classic',
          arenaId: id,
          competitors: 2,
          difficulty: 'standard',
          character: CHARACTER,
        }),
      );
    },
    [id, CHARACTER],
  );
  const page = await context.newPage();
  page.setDefaultTimeout(300000);
  await page.goto(`${BASE}?debug&noattract&nobots&q=${Q}&seed=7`);
  const quick = page.getByTestId('quick-play');
  await quick.or(page.getByTestId('start-button')).first().waitFor({ timeout: 180000 });
  if ((await quick.count()) > 0) await quick.tap();
  else await page.getByTestId('start-button').tap();
  await page.getByTestId('hud').waitFor();
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const w = window.__WAHALA__;
    w.controller().frozen = true;
    w.stepTicks(300);
    w.getState().players[0].hasVoucher = true;
    w.advance(2);
  });
  await page.waitForTimeout(600);
  await page.screenshot({
    path: `${dir}/${label}-${id}-4-controls-${CHARACTER}.jpg`,
    quality: 85,
    type: 'jpeg',
  });
  const txt = await page.evaluate(() => document.querySelector('[data-testid=btn-special]')?.textContent);
  console.log(JSON.stringify({ arena: id, character: CHARACTER, controlsLabel: txt }));
  await context.close();
}

for (const id of ids) {
  await run(id).catch((e) => console.log(JSON.stringify({ arena: id, failed: String(e).slice(0, 200) })));
}
if (process.env.CONTROLS !== '0')
  for (const id of ids.slice(0, 1))
    await controls(STANDARD.includes(id) ? id : 'danfoBusPark').catch((e) =>
      console.log(JSON.stringify({ failed: String(e).slice(0, 200) })),
    );
await browser.close();
