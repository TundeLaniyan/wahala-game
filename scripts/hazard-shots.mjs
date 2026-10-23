// Real frames of every stage hazard, telegraphed and active (art review of StageHazardViews):
//   node scripts/hazard-shots.mjs --url http://localhost:5173/ --out docs/screenshots/nine-arenas/hazards \
//        [--only danfo-warning,yaba-live] [--devices desktop,mobile] [--mobile-only oshodi-warning,yaba-warning]
// Needs a running dev/preview server. Steps the seeded simulation through the `?debug` hook up to the
// moment of interest, playing the last ticks through the real event path so effects are live.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
    return acc;
  }, []),
);
const url = args.url ?? 'http://localhost:5173/';
const out = args.out ?? 'docs/screenshots/nine-arenas/hazards';
const only = args.only ? new Set(args.only.split(',')) : null;
const devices = (args.devices ?? 'desktop').split(',');
const mobileOnly = new Set((args['mobile-only'] ?? 'oshodi-warning,yaba-warning').split(','));
mkdirSync(out, { recursive: true });

const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 720 } },
  mobile: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

/** Warning progress condition (k = 0..1 through the telegraph) for an event matching `filter`. */
const warnAt = (filter, k) =>
  `s.stage.events.some((e) => (${filter}) && s.tick < e.startTick && s.tick >= e.warnTick + (e.startTick - e.warnTick) * ${k})`;
const sweepAt = (style, frac) =>
  `s.stage.events.some((e) => e.style === '${style}' && e.index >= Math.floor(e.tiles.length * ${frac}))`;

// name -> [arena, steps]. A step is { until: condition } (stepped without rendering, fast),
// { ticks: n } (played through the real event path: effects, toasts) or { run: page-side helper }.
const W = (style, k) => ({ until: warnAt(`e.style === '${style}'`, k) });
const PLAY = (n) => ({ ticks: n });
const SHOTS = {
  'danfo-warning': ['danfoBusPark', [W('danfo', 0.68), PLAY(2)]],
  'danfo-active': ['danfoBusPark', [{ until: sweepAt('danfo', 0.3) }, PLAY(4)]],
  'oshodi-warning': ['oshodiInterchange', [W('traffic', 0.62), PLAY(2)]],
  'oshodi-active': ['oshodiInterchange', [{ until: sweepAt('traffic', 0.4) }, PLAY(3)]],
  'lekki-warning': ['lekkiRoadworks', [W('debris', 0.78), PLAY(2)]],
  'lekki-impact': ['lekkiRoadworks', [W('debris', 0.97), PLAY(9)]],
  'yaba-warning': ['yabaAfterDark', [W('power', 0.72), PLAY(2)]],
  'yaba-live': ['yabaAfterDark', [W('power', 0.97), PLAY(14)]],
  'bridge-gust': ['thirdMainland', [W('gust', 0.72), PLAY(2)]],
  'bridge-gust-burst': ['thirdMainland', [W('gust', 0.97), PLAY(8)]],
  'bridge-checkpoint': ['thirdMainland', [{ until: sweepAt('checkpoint', 0.4) }, PLAY(3)]],
  'jetty-warning': ['lagoonJetty', [W('wash', 0.05), { run: 'washGenerator' }, W('wash', 0.72), PLAY(2)]],
  'jetty-surge': ['lagoonJetty', [W('wash', 0.05), { run: 'washGenerator' }, W('wash', 0.97), PLAY(14)]],
  'market-drop': ['balogunMarket', [W('merch', 0.7), PLAY(2)]],
  'ajegunle-manholes': ['ajegunleBackstreets', [{ run: 'manhole' }]],
};

const PAGE_RUNS = {
  // put the human on the wave's edge row with a fresh generator at its feet (to show the douse steam)
  washGenerator: () => {
    const w = window.__WAHALA__;
    const s = w.getState();
    const ev = s.stage.events.find((e) => e.style === 'wash');
    const row = Math.floor(ev.tiles[0] / s.width);
    const p = s.players[0];
    for (const x of [3, 4]) s.tiles[row * s.width + x] = 0;
    p.x = p.stepFromX = 3;
    p.y = p.stepFromY = row;
    p.stepRemaining = 0;
    w.controller().forceIntent(0, { place: true });
    w.advance(2);
  },
  // walk the human onto manhole 1 so the pop plays at both ends
  manhole: () => {
    const w = window.__WAHALA__;
    const s = w.getState();
    const p = s.players[0];
    s.tiles[5 * s.width + 2] = 0;
    p.x = p.stepFromX = 2;
    p.y = p.stepFromY = 5;
    p.stepRemaining = 0;
    for (let i = 0; i < 60 && !(p.x === 12 && p.y === 6); i++) {
      w.controller().forceIntent(0, { move: 'up' });
      // only the tick that completes the step onto the manhole needs the full event path
      if (p.teleportPending || p.stepRemaining <= 2) w.advance(1);
      else w.stepTicks(1);
    }
    w.advance(5);
  },
};

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

for (const device of devices) {
  for (const [name, [arena, steps]] of Object.entries(SHOTS)) {
    if (only && !only.has(name)) continue;
    if (device === 'mobile' && !only && !mobileOnly.has(name)) continue;
    const page = await (await browser.newContext(VIEWPORTS[device])).newPage();
    page.setDefaultTimeout(300000); // software WebGL on a busy machine can take seconds per frame
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(
      `${url}?debug&noattract&nobots&q=${process.env.Q ?? 'high'}&seed=${process.env.SEED ?? 7}`,
    );
    await page.getByTestId('title-screen').waitFor();
    await page.getByTestId(`arena-${arena}`).click();
    await page.getByTestId('players-4').click();
    await page.getByTestId('start-button').click();
    await page.getByTestId('hud').waitFor();
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const w = window.__WAHALA__;
      w.controller().frozen = true;
      w.stepTicks(200); // through the countdown
    });
    let ok = true;
    for (const step of steps) {
      if (step.run) {
        await page.evaluate(PAGE_RUNS[step.run]);
        continue;
      }
      if (step.ticks) {
        await page.evaluate(
          ({ n, mode }) => {
            const w = window.__WAHALA__;
            if (mode === 'step') w.stepTicks(n);
            else w.advance(n);
          },
          { n: step.ticks, mode: 'advance' },
        );
        continue;
      }
      const took = await page.evaluate(
        ({ cond, mode }) => {
          const w = window.__WAHALA__;
          const f = new Function('s', `return (${cond});`);
          for (let i = 0; i < 60 * 60; i++) {
            if (f(w.getState())) return i;
            if (mode === 'advance') w.advance(1);
            else w.stepTicks(1);
          }
          return -1;
        },
        { cond: step.until, mode: 'step' },
      );
      if (took < 0) ok = false;
    }
    await page.evaluate(() => window.__WAHALA__.renderer().cutCamera());
    await page.waitForTimeout(1500);
    const file = join(out, `${name}-${device}.jpg`);
    await page.screenshot({ path: file, quality: 85, timeout: 600000, animations: 'disabled' });
    console.log(JSON.stringify({ shot: file, reached: ok, errors: errors.slice(0, 3) }));
    await page.close();
  }
}
await browser.close();
