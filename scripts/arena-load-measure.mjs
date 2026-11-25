// Time to the first PLAYABLE frame of a match (not menu appearance), on a throttled profile (decision FU2-7,
// docs/measurements/fu2/README.md). Drives the real menu in Chromium, throttles the network (CDP) and the CPU (CDP) only
// AFTER the menu is up (the menu's own load is not what this measures), walks to a match start the way a player does,
// waits `--dwell` ms on the arena / ready screens (the time a player really spends choosing: the window an early prefetch
// can use), taps Start and times the tap -> "HUD up, loading screen gone" (the loader releases its screen after two drawn
// frames of the new match). Also splits the wait into the loader's phases and the model bytes fetched before and after the tap.
//
//   node scripts/perf/pages-server.mjs dist --port 4181 &          # GitHub-Pages-like delivery (max-age=600, gzip)
//   WAHALA_CHROMIUM=/opt/pw-browsers/chromium node scripts/arena-load-measure.mjs \
//       --url http://localhost:4181/wahala-game/ --label after --journey rumble --net 4g --cpu 4 --runs 5 --dwell 6000
//
// Options
//   --journey rumble|quick|campaign   rumble: Home > Play > City Rumble > Free-for-All > <arena> > fighter > Ready > Start
//                                     quick: Home > Play > (dwell) > Quick Start
//                                     campaign: Home > Story Campaign > New > map > Oshodi > Terminal Approach > brief > Start
//   --arena ID          the Rumble stage for the rumble journey (default rumbleOshodi: not the default of any other path)
//   --net fast3g|4g|none   --cpu N (CPU slowdown factor, default 4)   --runs N   --dwell ms (default 6000, split between the
//                       arena screen and the Ready screen for the rumble journey)
//   --targets a=URL1,b=URL2|&noprefetch   several builds / flag sets measured INTERLEAVED (round r runs every target once, the
//                       order alternating each round), so machine drift hits them all alike; a target's `|` part is extra URL flags.
//                       Default: one target, `--url` / `--label`.
//   --query "&x=1"      extra URL flags (all targets) (e.g. "&noprefetch" for the A/B on one build, "&sw" to let the worker run)
//   --label NAME --out FILE.json
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const URL_ = opt('url', 'http://localhost:4181/wahala-game/');
const LABEL = opt('label', 'run');
const TARGETS = opt('targets', '')
  ? opt('targets', '')
      .split(',')
      .map((t) => {
        const [label, rest] = [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)];
        const [url, extra = ''] = rest.split('|');
        return { label, url, extra };
      })
  : [{ label: LABEL, url: URL_, extra: '' }];
const JOURNEY = opt('journey', 'rumble');
const ARENA = opt('arena', 'rumbleOshodi');
const NET = opt('net', '4g');
const CPU = Number(opt('cpu', '4'));
const RUNS = Number(opt('runs', '5'));
const DWELL = Number(opt('dwell', '6000'));
const QUERY = opt('query', '');
const OUT = opt('out', '');

// Chrome DevTools' own "Fast 3G" preset (1.6 Mbit/s * 0.9, 562.5 ms) and WebPageTest's "4G" (9 Mbit/s, 170 ms RTT).
const NETS = {
  fast3g: {
    latency: 562.5,
    downloadThroughput: (1.6 * 1024 * 1024 * 0.9) / 8,
    uploadThroughput: (750 * 1024 * 0.9) / 8,
  },
  '4g': { latency: 170, downloadThroughput: (9 * 1000 * 1000) / 8, uploadThroughput: (9 * 1000 * 1000) / 8 },
  none: null,
};

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length
    ? s.length % 2
      ? s[(s.length - 1) / 2]
      : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
    : NaN;
};
const stats = (a) => ({
  n: a.length,
  median: Math.round(median(a)),
  min: Math.round(Math.min(...a)),
  max: Math.round(Math.max(...a)),
  all: a.map(Math.round),
});

const browser = await chromium.launch({
  executablePath: process.env.WAHALA_CHROMIUM,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

/** One page of the journey. Returns the timings of one start. */
async function oneRun(target) {
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    serviceWorkers: (QUERY + target.extra).includes('sw') ? 'allow' : 'block',
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  /** requestId -> { url, start, end, bytes } with `performance.now`-compatible wall times (ms since epoch). */
  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', (e) =>
    reqs.set(e.requestId, { url: e.request.url, start: e.wallTime * 1000 }),
  );
  cdp.on('Network.loadingFinished', (e) => {
    const r = reqs.get(e.requestId);
    if (r) {
      r.end = Date.now();
      r.bytes = e.encodedDataLength;
    }
  });

  await page.goto(`${target.url}?debug&q=low&seed=7&noattract${QUERY}${target.extra}`);
  await page.getByTestId('title-screen').waitFor({ timeout: 120_000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid=menu-loading]'), null, {
    timeout: 120_000,
  });
  await page.waitForTimeout(1500); // boot assets settled
  // from here on the player is "on a slow phone"
  if (NETS[NET]) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...NETS[NET] });
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

  const click = (id) => page.getByTestId(id).click({ timeout: 120_000 });
  let startTestId;
  if (JOURNEY === 'rumble') {
    await click('home-play');
    await click('home-rumble');
    await click('mode-deathmatch');
    const card = page.getByTestId(`rumble-stage-${ARENA}`);
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await page.waitForTimeout(DWELL / 2); // choosing the arena / looking at the setup
    await click('menu-continue'); // fighter
    await click('menu-continue'); // ready
    await page.waitForTimeout(DWELL / 2); // reading the review
    startTestId = 'start-button';
  } else if (JOURNEY === 'quick') {
    await page.waitForTimeout(DWELL); // Quick Start is on Home (decision QS1): dwell there, then tap it
    startTestId = 'home-quick';
  } else if (JOURNEY === 'campaign') {
    await click('home-campaign');
    await click('campaign-start-new');
    await click('story-next');
    await click('map-node-oshodi');
    await click('section-start-oshodi.approach');
    await page.getByTestId('mission-brief-start').waitFor({ timeout: 120_000 });
    await page.waitForTimeout(DWELL);
    startTestId = 'mission-brief-start';
  } else throw new Error(`unknown journey ${JOURNEY}`);

  const result = await startAndTime(page, startTestId, reqs);
  result.errors = errors;
  await ctx.close();
  return result;
}

/** Taps `testId`, then polls (in the page, on its own clock) until the match is on screen, and sums what the network did. */
async function startAndTime(page, testId, reqs) {
  const tapWall = await page.evaluate((id) => {
    const wall = Date.now();
    window.__t0 = performance.now();
    window.__phase = [];
    window.__done = 0;
    let last = '';
    const poll = () => {
      const w = window.__WAHALA__;
      const st = w.matchLoad?.().state?.phase ?? '';
      if (st !== last) {
        window.__phase.push([st, Math.round(performance.now() - window.__t0)]);
        last = st;
      }
      const hud = document.querySelector('[data-testid=hud]');
      const loading = document.querySelector('[data-testid=match-loading]');
      if (hud && !loading) {
        window.__done = performance.now();
        return;
      }
      setTimeout(poll, 25);
    };
    poll();
    document.querySelector(`[data-testid="${id}"]`).click();
    return wall;
  }, testId);
  await page.waitForFunction(() => window.__done > 0, null, { timeout: 600_000, polling: 100 });
  const m = await page.evaluate(() => ({ ttfp: window.__done - window.__t0, phases: window.__phase }));
  const models = [...reqs.values()].filter((r) => /\.glb(\?|$)/.test(r.url) && r.bytes);
  const before = models.filter((r) => r.end <= tapWall);
  const after = models.filter((r) => r.end > tapWall);
  const sum = (a) => a.reduce((s, r) => s + r.bytes, 0);
  // the part of the post-tap wait that was the models still downloading: the loader's `assets` phase
  const at = (name) => m.phases.find((p) => p[0] === name)?.[1];
  const arenaAt = at('arena');
  // `assets` = the models still downloading when the tap came; `build` = arena + scene (the synchronous set-up and the first drawn frames)
  return {
    ttfp: Math.round(m.ttfp),
    assetsWait: at('assets') === undefined ? 0 : (arenaAt ?? Math.round(m.ttfp)) - at('assets'),
    build: arenaAt === undefined ? 0 : Math.round(m.ttfp) - arenaAt,
    phases: m.phases,
    modelBytesBeforeTap: sum(before),
    modelBytesAfterTap: sum(after),
    modelFilesBeforeTap: before.length,
    modelFilesAfterTap: after.length,
  };
}

const runsBy = new Map(TARGETS.map((t) => [t.label, []]));
for (let i = 0; i < RUNS; i++) {
  const order = i % 2 ? [...TARGETS].reverse() : TARGETS;
  for (const t of order) {
    const r = await oneRun(t);
    runsBy.get(t.label).push(r);
    console.log(
      `[${t.label}] run ${i + 1}/${RUNS}: first playable frame ${(r.ttfp / 1000).toFixed(1)} s ` +
        `(waiting for models after the tap ${(r.assetsWait / 1000).toFixed(1)} s, build + first frames ${(r.build / 1000).toFixed(1)} s; ` +
        `model MB before tap ${(r.modelBytesBeforeTap / 1e6).toFixed(2)}, after ${(r.modelBytesAfterTap / 1e6).toFixed(2)})` +
        (r.errors.length ? ` ERRORS ${r.errors.join(' | ')}` : ''),
    );
  }
}
const summaries = TARGETS.map((t) => {
  const runs = runsBy.get(t.label);
  return {
    label: t.label,
    url: t.url,
    query: QUERY + t.extra,
    journey: JOURNEY,
    arena: JOURNEY === 'rumble' ? ARENA : undefined,
    net: NET,
    cpu: CPU,
    dwellMs: DWELL,
    ttfpMs: stats(runs.map((r) => r.ttfp)),
    assetsWaitMs: stats(runs.map((r) => r.assetsWait)),
    buildMs: stats(runs.map((r) => r.build)),
    modelMBBeforeTap: Number((median(runs.map((r) => r.modelBytesBeforeTap)) / 1e6).toFixed(2)),
    modelMBAfterTap: Number((median(runs.map((r) => r.modelBytesAfterTap)) / 1e6).toFixed(2)),
    runs,
  };
});
for (const m of summaries)
  console.log(
    `${m.label}: ttfp median ${m.ttfpMs.median} ms (min ${m.ttfpMs.min}, max ${m.ttfpMs.max}) | models wait median ${m.assetsWaitMs.median} ms | build median ${m.buildMs.median} ms | model MB before/after tap ${m.modelMBBeforeTap}/${m.modelMBAfterTap}`,
  );
if (OUT) fs.writeFileSync(OUT, JSON.stringify(summaries, null, 1));
await browser.close();
