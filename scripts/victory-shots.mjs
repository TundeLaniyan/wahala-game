// Sudden Death shots (decisions SU1-SU2): (1) the title card in the HUD rail beside the board, (2) the end moment of a
// match that sudden death ended with the LEAD fighter down: A earned the lead, the blast took both, A wins on score and
// is drawn standing in the victory pose (not lying dead). Phone landscape.
//   SHOT_URL=http://localhost:5432/wahala-game/ node scripts/victory-shots.mjs <out-prefix> [arena=rumbleLagosIsland]
// Needs WAHALA_CHROMIUM for an offline browser.
import { chromium } from '@playwright/test';

const [prefix = 'victory', arena = 'rumbleLagosIsland'] = process.argv.slice(2);
const BASE = process.env.SHOT_URL ?? 'http://localhost:5432/wahala-game/';
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
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
await context.addInitScript((arenaId) => {
  const key = 'wahala.settings.v1';
  const s = JSON.parse(localStorage.getItem(key) || '{}');
  localStorage.setItem(
    key,
    JSON.stringify({
      ...s,
      play: 'rumble',
      rumbleArenaId: arenaId,
      rumbleCompetitors: 8,
      rumbleMode: 'survival',
    }),
  );
}, arena);
const page = await context.newPage();
page.setDefaultTimeout(300000);
await page.goto(`${BASE}?debug&noattract&nobots&seed=7`);
await page.getByTestId('title-screen').waitFor({ timeout: 180000 });
await page.getByTestId('home-play').click();
await page.getByTestId('home-rumble').click();
await page.getByTestId('setup-start').click();
await page.getByTestId('hud').waitFor();
await page.waitForTimeout(1200);
const step = (n) =>
  page.evaluate((k) => {
    const w = window.__WAHALA__;
    w.controller().frozen = true;
    if (k > 1) w.stepTicks(k - 1);
    w.advance(1);
  }, n);
await step(300);
// a controlled finish: nobody else is left, two fighters tied on 2 eliminations, time almost up
await page.evaluate(() => {
  const s = window.__WAHALA__.getState();
  s.crush = null;
  s.endgameTraps = { waves: [], liveAt: [], warned: 0, live: 0, warnings: [] };
  s.players.forEach((p, i) => {
    if (i > 1) {
      p.alive = false;
      p.eliminatedTick = s.tick;
      p.elimination = { kind: 'crush', eventId: 0 };
    }
  });
  s.players[0].stats.kills = 2;
  s.players[1].stats.kills = 2;
  s.players[0].protectedUntil = 0;
  s.players[1].protectedUntil = 0;
  s.match.playTicks = s.config.match.durationTicks - 2;
});
await step(4);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${prefix}-card.png`, timeout: 180000 });
// through the title card, then A earns the lead and the first blast (nobody has a shield) takes both
const end = await page.evaluate(() => window.__WAHALA__.getState().match.suddenDeath.transitionEndTick);
const now = await page.evaluate(() => window.__WAHALA__.getState().tick);
await step(end - now + 5);
await page.evaluate(() => {
  const s = window.__WAHALA__.getState();
  s.players[0].stats.kills++;
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${prefix}-clock.png`, timeout: 180000 });
await page.evaluate(() => {
  const w = window.__WAHALA__;
  const s = w.getState();
  w.stepTicks(s.match.suddenDeath.nextBlastTick - s.tick - 3);
});
await step(8);
const info = await page.evaluate(() => {
  const w = window.__WAHALA__;
  const s = w.getState();
  // hold the end moment: the results card would otherwise cover the board after 2.2 s
  w.controller().endedAtMs = 1e15;
  return { phase: s.match.phase, result: s.match.result, alive: s.players.slice(0, 2).map((p) => p.alive) };
});
console.log(JSON.stringify(info));
await page.addStyleTag({ content: '.touch, .touch-controls, .rotate { display: none !important; }' });
await page.waitForTimeout(2500);
await page.evaluate(() => (window.__WAHALA__.controller().endedAtMs = 1e15));
await page.screenshot({ path: `${prefix}-end.png`, timeout: 180000 });
await browser.close();
