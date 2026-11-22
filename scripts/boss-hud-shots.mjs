// Rendered evidence of the boss HUD and fight feedback (decisions BH1-BH6, docs/DECISIONS.md): the real Oshodi boss
// mission in a browser, phone landscape. The simulation is the live one; the ONLY staging is the cause of each beat:
//   - a phase's objective nodes are marked done (as scripts/mission-presentation-shots.mjs does) so the boss is exposed;
//   - a flame is laid on the boss's tile (the blast that a generator would make) so the REAL lethality / mission runtime
//     decides: a shielded boss ignores it (BLOCKED), an exposed one loses a hit (bossHit) or falls (bossDefeated);
//   - the human is moved beside the boss for the picture.
// Nothing sets a boss health number. Shots (per device, `<out>/<name>-<w>x<h>.png`):
//   1-full        shielded, 3/3        2-blocked   a blast bounces off the shield (no damage)
//   3-exposed     shield down, window  4-hit       the exposed boss takes a blast: 2/3, HIT -1
//   5-near        one hit left (the 2nd hit landed, 3rd phase exposed)   6-defeated  the last hit: DEFEATED
//
//   SHOT_URL=http://localhost:<port>/wahala-game/ WAHALA_CHROMIUM=/opt/pw-browsers/chromium \
//   node scripts/boss-hud-shots.mjs docs/screenshots/boss-hud [844x390,740x360]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [outDir = 'docs/screenshots/boss-hud', sizes = '844x390,740x360'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const BASE = process.env.SHOT_URL ?? 'http://localhost:4653/wahala-game/';
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

for (const size of sizes.split(',')) {
  const [width, height] = size.split('x').map(Number);
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(300_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on(
    'console',
    (m) =>
      m.type() === 'error' && !/proxy|ERR_|Failed to load resource/.test(m.text()) && errors.push(m.text()),
  );
  await page.goto(`${BASE}?debug&noattract&q=low&seed=7`);
  await page.getByTestId('title-screen').waitFor();
  await page.evaluate(() => {
    const c = window.__WAHALA__.campaign();
    c.load();
    c.startNew();
    c.storyDone();
    // the boss is gated behind the district's sections: clear them through the public result path (as the e2e helper does)
    for (const section of ['oshodi.approach', 'oshodi.railEdge'])
      c.finishMission({
        result: 'won',
        missionId: 'oshodi',
        modifiers: [],
        seconds: 120,
        livesUsed: 0,
        phasesCleared: 3,
        defeat: null,
        stars: 2,
        creditedKills: 0,
        sectionMissionId: section,
        raidBonus: 0,
      });
    c.beginBriefing('oshodi');
    c.startFromBriefing();
    c.bossIntroDone();
  });
  await page.getByTestId('hud').waitFor({ timeout: 240_000 });
  await page.getByTestId('match-loading').waitFor({ state: 'detached', timeout: 300_000 });
  await page.evaluate(() => {
    const w = window.__WAHALA__;
    w.controller().frozen = true;
    w.stepTicks(260); // past the countdown
    w.advance(30);
  });
  const tag = (name) => `${outDir}/${name}-${width}x${height}.png`;
  const shot = async (name) => {
    await page.screenshot({ path: tag(name), timeout: 180_000 });
    const read = await page.evaluate(() => {
      const q = (s) => document.querySelector(s)?.textContent ?? null;
      const bar = document.querySelector('[data-testid="boss-bar"]');
      const rect = (s) => {
        const r = document.querySelector(s)?.getBoundingClientRect();
        return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] : null;
      };
      return {
        bar: bar ? { state: bar.dataset.state, hp: bar.dataset.hp, max: bar.dataset.max } : null,
        health: q('[data-testid="boss-health"]'),
        status: q('[data-testid="boss-status"]'),
        hit: q('[data-testid="boss-hit"]'),
        barRect: rect('[data-testid="boss-bar"]'),
        buttons: [...document.querySelectorAll('.abtn')].map((b) => {
          const r = b.getBoundingClientRect();
          return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)];
        }),
      };
    });
    console.log(name, `${width}x${height}`, JSON.stringify(read));
  };
  // run `fn` in the page (state `s`, mission `m`), then draw `n` ticks with their events as in play
  const stage = (fn, n) =>
    page.evaluate(
      ({ src, n }) => {
        const w = window.__WAHALA__;
        const s = w.getState();
        const m = s.mission;
        const boss = s.players[m.bossId];
        // the human stands two tiles from the boss, on a floor tile, for the picture
        const put = (id, x, y) => {
          const p = s.players[id];
          p.x = p.stepFromX = x;
          p.y = p.stepFromY = y;
          p.stepRemaining = 0;
        };
        const near = () => {
          for (const [dx, dy] of [
            [2, 0],
            [-2, 0],
            [0, 2],
            [0, -2],
            [3, 0],
            [-3, 0],
            [0, 3],
            [0, -3],
          ]) {
            const x = boss.x + dx;
            const y = boss.y + dy;
            if (x >= 0 && y >= 0 && x < s.width && y < s.height && s.tiles[y * s.width + x] === 0)
              return put(0, x, y);
          }
        };
        // a blast's flames on the boss's tile, from the human (the live runtime decides what they do)
        const blast = () =>
          s.flames.push({
            x: boss.x,
            y: boss.y,
            eventId: 900000 + s.tick,
            genId: -1,
            ownerId: 0,
            dir: null,
            tip: false,
            startTick: s.tick,
            endTick: s.tick + 40,
          });
        // the objective's nodes of this phase marked done: the runtime breaks the phase and exposes the boss
        const breakPhase = () => {
          const goal = m.tuning.phases[m.phase].goal;
          m.nodes.slice(0, goal).forEach((n) => (n.done = true));
          w.stepTicks(3);
        };
        new Function('ctx', `(${src})(ctx)`)({ w, s, m, boss, near, blast, breakPhase });
        near();
        w.advance(n);
      },
      { src: fn.toString(), n },
    );

  // 1 full health, shielded
  await stage(() => undefined, 30);
  await shot('1-full');
  // 2 a blast on the shielded boss: bounces off
  await stage(({ blast }) => blast(), 4);
  await shot('2-blocked');
  await stage(() => undefined, 60);
  // 3 the objective is broken: shield down, window running
  await stage(({ breakPhase }) => breakPhase(), 40);
  await shot('3-exposed');
  // 4 a real blast on the exposed boss
  await stage(({ blast }) => blast(), 4);
  await shot('4-hit');
  // second hit, then the third phase's window: one hit left
  await stage(({ breakPhase }) => breakPhase(), 40);
  await stage(({ blast }) => blast(), 60);
  await stage(({ breakPhase }) => breakPhase(), 40);
  await shot('5-near');
  // 6 the last hit. Staging: hold the result screen back (the game shows it 1.6 s after the win, which a slow software
  // renderer would outrun), so the DEFEATED bar can be photographed
  await page.evaluate(() => (window.__WAHALA__.controller().endedAtMs = 1e15));
  await stage(({ blast }) => blast(), 6);
  await shot('6-defeated');
  console.log(size, 'errors:', errors.length ? errors.slice(0, 3).join(' | ') : 'none');
  await context.close();
}
await browser.close();
