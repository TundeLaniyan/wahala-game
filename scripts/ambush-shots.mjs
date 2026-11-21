// Rendered evidence of a Classic raid generator ambush (docs/CLASSIC_RAID_COMBAT.md, decisions AM1-AM6): the real game
// in a browser, the Dispatch Depot at the save's level (Normal), its real enemy bots. Guard A walks clockwise round the
// pillar at (8,4); its lap is clockwork (AM1), so the player times a generator on (7,7) to blow as the guard reaches the
// corner (7,5). The only staging is the drop itself (the human is moved to (7,7), the generator laid, the human moved back
// to the entrance, out of the guard's sight): everything else is the live simulation. Shots, phone landscape:
//   1 the guard on its rounds, the generator ticking where it will walk;  2 the blast catches it at the corner;
//   3 after: the guard is down, nobody chases;  4 a punch wind-up telegraph (a second run, the human next to a guard).
//
//   SHOT_URL=http://localhost:<port>/wahala-game/ WAHALA_CHROMIUM=/opt/pw-browsers/chromium \
//   node scripts/ambush-shots.mjs <outDir> [low|high]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [outDir = 'docs/screenshots/classic-raid-combat', q = 'low'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const base = process.env.SHOT_URL ?? 'http://localhost:4490/wahala-game/';
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
const phone = { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

async function openRaid(page) {
  await page.goto(`${base}?debug&noattract&seed=1&q=${q}`);
  await page.getByTestId('title-screen').waitFor({ timeout: 240_000 });
  await page.waitForFunction(() => window.__WAHALA__?.store.getState().loading === null, null, {
    timeout: 300_000,
  });
  await page.evaluate(() => {
    const c = window.__WAHALA__.campaign();
    c.load();
    if (!c.debugStartRaid('warehouseDispatchDepot')) throw new Error('raid did not start');
  });
  await page.waitForFunction(
    () => window.__WAHALA__.matchLoad().state === null && !!window.__WAHALA__.getState(),
    null,
    {
      timeout: 300_000,
    },
  );
  await page.evaluate(() => {
    const w = window.__WAHALA__;
    const s = w.getState();
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
    w.controller().frozen = true;
  });
}

/** Steps the live simulation (bots included) one tick at a time until `pred` holds, at most `max` ticks. */
async function stepUntil(page, pred, max = 3000) {
  return page.evaluate(
    ({ src, max }) => {
      const w = window.__WAHALA__;
      const f = new Function('s', `return (${src})(s)`);
      for (let i = 0; i < max; i++) {
        if (f(w.getState())) return true;
        w.stepTicks(1);
      }
      return false;
    },
    { src: pred.toString(), max },
  );
}
const advance = (page, n) => page.evaluate((n) => window.__WAHALA__.advance(n), n);
const shot = async (page, name) => {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({
    path: join(outDir, `${name}-${q}-phone.jpg`),
    type: 'jpeg',
    quality: 75,
    timeout: 180_000,
  });
};

// ---------------------------------------------------------------- the ambush
{
  const page = await (await browser.newContext(phone)).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openRaid(page);
  // the first wave on its rounds, the human waiting at the entrance
  await stepUntil(page, (s) => s.tick > 600);
  // the guard arrives at the corner (7,3); its lap then reaches the corner (7,5) 3 corners and 4 edges later
  await stepUntil(page, (s) => {
    const g = s.players[1];
    return g.x === 7 && g.y === 3 && g.stepRemaining === 0;
  });
  const lap = await page.evaluate(() => {
    const s = window.__WAHALA__.getState();
    const t = s.config.campaignTactics;
    return {
      pause: t.territory.patrolPauseTicks,
      step: t.enemyStepTicks.guard + t.territory.patrolStepExtraTicks,
      fuse: s.config.generator.fuseTicks,
    };
  });
  // from the end of its step onto (7,3): its pause there, then 8,3 / 9,3 (+pause) / 9,4 / 9,5 (+pause) / 8,5 / onto 7,5
  // (a tile is entered as the step starts): 3 pauses and 5 steps; blow 8 ticks after it steps onto (7,5)
  const toCorner = 3 * lap.pause + 5 * lap.step;
  await advance(page, Math.max(0, toCorner + 8 - lap.fuse));
  const placed = await page.evaluate(() => {
    const s = window.__WAHALA__.getState();
    const me = s.players[0];
    const was = { x: me.x, y: me.y };
    s.generators.push({
      id: s.nextId++,
      ownerId: 0,
      x: 7,
      y: 7,
      stepFromX: 7,
      stepFromY: 7,
      range: me.range,
      pierce: false,
      square: 0,
      fromSpectator: false,
      mode: 'timed',
      timer: s.config.generator.fuseTicks,
      carriedBy: null,
      carryBonusUsed: false,
      slide: null,
      flight: null,
      triggered: false,
      placedTick: s.tick,
    });
    return was;
  });
  await advance(page, 60);
  await shot(page, '1-guard-on-its-rounds-generator-ticking');
  await stepUntil(page, (s) => s.flames.length > 0, 400);
  await advance(page, 4);
  await shot(page, '2-blast-catches-the-guard-at-the-corner');
  await advance(page, 90);
  const after = await page.evaluate(() => {
    const s = window.__WAHALA__.getState();
    return {
      guardAlive: s.players[1].alive,
      hunting: Object.values(s.territory?.minds ?? {}).filter(
        (m) => m.state === 'alert' || m.state === 'pursue',
      ).length,
    };
  });
  await shot(page, '3-after-the-ambush');
  console.log(JSON.stringify({ placed, after, errors }));
}

// ---------------------------------------------------------------- a punch telegraph
{
  const page = await (await browser.newContext(phone)).newPage();
  await openRaid(page);
  await stepUntil(page, (s) => s.tick > 400);
  // the human steps next to a guard on its rounds (staged): the guard turns and winds up its punch
  await page.evaluate(() => {
    const s = window.__WAHALA__.getState();
    const g = s.players[1];
    const spots = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].map(([dx, dy]) => ({ x: g.x + dx, y: g.y + dy }));
    const free = spots.find(
      (t) =>
        s.tiles[t.y * s.width + t.x] === 0 && !s.players.some((p) => p.alive && p.x === t.x && p.y === t.y),
    );
    s.players[0].x = free.x;
    s.players[0].y = free.y;
  });
  const wound = await stepUntil(page, (s) => s.players[1].attack !== null, 400);
  await advance(page, 18);
  await shot(page, '4-punch-wind-up-telegraph');
  console.log(JSON.stringify({ windupSeen: wound }));
}
await browser.close();
