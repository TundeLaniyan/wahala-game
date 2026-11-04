// Mission presentation screenshots (world markers, compass, minimap, panel): staged through the real runtime.
//   SHOT_URL=http://localhost:<port>/wahala-game/ WAHALA_CHROMIUM=/opt/pw-browsers/chromium WAHALA_MULTIPROCESS=1 \
//   node scripts/mission-presentation-shots.mjs <out-dir> <desktop|mobile|portrait> <mission:scenario,...> [--stats]
// Scenarios (staging only: the state is nudged through `__WAHALA__.controller().state`, then the real sim ticks on):
//   start     spawn position, 4 s in (compass + panel, nodes usually off screen)
//   warn      step until a strike / convoy / rail lane is telegraphed, stand next to its lane, shoot with 1.4 s left
//   node      stand beside the nearest node, its channel 45 % done
//   done      the first node is done (green tick), the player is beside it
//   p2 / p3   clear the earlier phases through the node `done` flags and let the runtime advance
//   shielded  boss shielded, the player beside him
//   exposed   all phases cleared: boss exposed, the player beside him (gold / red ring, countdown arc)
//   far       the player far from every node, only the compass points the way
// --stats prints renderer.stats() (draw calls, triangles) of the shot, for docs/MISSION_PRESENTATION.md;
// --nomarkers adds ?nomarkers (the world markers are left out: the "before" of the cost comparison).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const [outDir = 'docs/screenshots/mission-presentation', device = 'desktop', list = 'oshodi:start', ...flags] =
  process.argv.slice(2);
const ORDER = ['oshodi', 'mushin', 'fadeyiSomolu', 'ebuteMetta', 'lagosIsland', 'lekki'];
const VP = {
  desktop: { viewport: { width: 1280, height: 720 } },
  mobile: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  portrait: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.WAHALA_CHROMIUM,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
for (const item of list.split(',')) {
  const [id, scenario = 'start'] = item.split(':');
  const page = await (await browser.newContext(VP[device])).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${process.env.SHOT_URL ?? 'http://localhost:5199/wahala-game/'}?debug&noattract&seed=7${flags.includes('--nomarkers') ? '&nomarkers' : ''}`);
  await page.getByTestId('title-screen').waitFor();
  await page.evaluate(
    ({ id, order }) => {
      const c = window.__WAHALA__.campaign();
      c.load();
      c.startNew();
      c.storyDone();
      for (const earlier of order.slice(0, order.indexOf(id))) {
        c.finishMission({ result: 'won', missionId: earlier, modifiers: [], seconds: 100, livesUsed: 0, phasesCleared: 3, defeat: 'eliminated', stars: 3, creditedKills: 1 });
      }
      c.beginBriefing(id);
      c.startFromBriefing();
      c.bossIntroDone();
    },
    { id, order: ORDER },
  );
  await page.getByTestId('hud').waitFor();
  await page.waitForTimeout(1500);
  const info = await page.evaluate((scenario) => {
    const w = window.__WAHALA__;
    const c = w.controller();
    c.frozen = true;
    const s = c.state;
    const m = s.mission;
    const put = (pid, x, y) => {
      const p = s.players[pid];
      p.x = p.stepFromX = x;
      p.y = p.stepFromY = y;
      p.stepRemaining = 0;
    };
    // a walkable tile next to (x, y), not in `avoid`
    const beside = (x, y, avoid = new Set()) => {
      for (let r = 1; r <= 3; r++)
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const tx = x + dx;
            const ty = y + dy;
            if (tx < 0 || ty < 0 || tx >= s.width || ty >= s.height) continue;
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || avoid.has(ty * s.width + tx)) continue;
            if (s.tiles[ty * s.width + tx] === 0) return { x: tx, y: ty };
          }
      return { x, y };
    };
    const pending = () => m.strikes.filter((k) => !k.landed);
    const clearPhase = () => {
      const goal = m.tuning.phases[m.phase].goal;
      m.nodes.slice(0, goal).forEach((n) => (n.done = true));
      c.stepOnce();
      c.stepOnce();
    };
    // let the countdown pass and the match start
    w.stepTicks(260);
    const log = [];
    if (scenario === 'start') w.stepTicks(120);
    else if (scenario === 'far') {
      w.stepTicks(60);
    } else if (scenario === 'warn') {
      let guard = 0;
      while (guard++ < 5000 && !(pending().length > 0 || (m.rail && m.rail.trainAt > s.tick))) w.stepTicks(5);
      const k = pending()[0];
      const tiles = k ? new Set(k.tiles) : new Set();
      const lane = k ? k.tiles : [];
      const mid = lane.length ? lane[Math.floor(lane.length / 2)] : null;
      if (mid !== null) {
        const q = beside(mid % s.width, Math.floor(mid / s.width), tiles);
        put(0, q.x, q.y);
      } else if (m.rail) {
        // rail window: stand beside the first switch
        const n = m.nodes[0];
        put(0, ...Object.values(beside(n.x, n.y)));
      }
      // let the countdown run to about 1.4 s left
      guard = 0;
      while (guard++ < 600 && pending().length > 0 && pending()[0].landTick - s.tick > 84) w.stepTicks(2);
      log.push(`pending=${pending().length} trainIn=${m.rail ? m.rail.trainAt - s.tick : 'n/a'} phase=${m.phase}`);
    } else if (scenario === 'node' || scenario === 'done') {
      const n = m.nodes[0];
      const q = beside(n.x, n.y);
      put(0, q.x, q.y);
      if (scenario === 'node') {
        // the 30 ticks rendered after staging drain 2 per tick: start high so about half is left
        n.progress = Math.round(m.tuning.phases[m.phase].holdTicks * 0.95);
      } else n.done = true;
      w.stepTicks(1);
    } else if (scenario === 'p2' || scenario === 'p3') {
      clearPhase();
      if (scenario === 'p3') {
        w.stepTicks(30);
        clearPhase();
      }
      w.stepTicks(90);
      const n = m.nodes[0];
      const q = beside(n.x, n.y);
      put(0, q.x, q.y);
      m.nodes[1] && (m.nodes[1].progress = Math.round(m.tuning.phases[m.phase].holdTicks * 0.95));
      w.stepTicks(1);
    } else if (scenario === 'shielded' || scenario === 'exposed') {
      if (scenario === 'exposed') {
        for (let i = 0; i < 3; i++) {
          clearPhase();
          w.stepTicks(20);
        }
      }
      const b = s.players[m.bossId];
      const q = beside(b.x, b.y);
      put(0, q.x, q.y);
      w.stepTicks(2);
      log.push(`boss shielded=${m.boss.shielded} phase=${m.phase} state=${m.phaseState}`);
    }
    // render the staged state with its events, as in play
    c.debugAdvance?.(0);
    return { log, phase: m.phase, phaseState: m.phaseState, tick: s.tick, me: { x: s.players[0].x, y: s.players[0].y } };
  }, scenario);
  await page.evaluate(() => window.__WAHALA__.advance(30));
  await page.waitForTimeout(1200);
  const file = `${outDir}/${id}-${scenario}-${device}${flags.includes('--nomarkers') ? '-nomarkers' : ''}.png`;
  await page.screenshot({ path: file, timeout: 180000 });
  let stats = '';
  if (flags.includes('--stats')) {
    stats = JSON.stringify(await page.evaluate(() => ({ stats: window.__WAHALA__.stats(), timings: window.__WAHALA__.timings() })));
  }
  const compass = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="mission-compass"]');
    return el ? { shown: el.getAttribute('data-shown'), tiles: el.getAttribute('data-tiles'), target: el.getAttribute('data-target') } : null;
  });
  console.log(id, scenario, device, JSON.stringify(info), JSON.stringify(compass), stats, errors.length ? `ERRORS: ${errors.slice(0, 3).join(' | ')}` : 'ok');
  await page.close();
}
await browser.close();
