// Controlled comparison for the reported lag in a 32-fighter match with Music Data Saver on (decision FU2-8,
// docs/measurements/fu2/README.md). Three conditions, one build, one seed, one saved configuration (32-fighter City Rumble
// Free-for-All on one stage, Rookie bots, FIXED graphics preset so Auto cannot react differently), measured INTERLEAVED
// (round r runs every condition once, the order rotating each round) in a fresh browser context each:
//   on     Music Data Saver ON   (the 96 kbps `lite` track)
//   off    Music Data Saver OFF  (the full track)
//   muted  sound muted           (no music stream at all)
// Per run: frame intervals (requestAnimationFrame, in the page) over `--seconds` after a warm-up (p50 / p95 / p99, frames
// over 2x and 4x the median), main-thread long tasks (PerformanceObserver), the page's main-thread busy time (CDP
// Performance.getMetrics TaskDuration / ScriptDuration), the sim + AI ms per frame the game itself reports (`timings()`),
// ticks advanced, the loading phases and what the music stream fetched, and `waiting` / `stalled` events of any media element.
// This is a software-WebGL container, so absolute frame times are not a phone's: only the comparison between conditions is.
//
//   node scripts/perf/pages-server.mjs dist --port 4181 &
//   WAHALA_CHROMIUM=/opt/pw-browsers/chromium node scripts/data-saver-lag-compare.mjs --url http://localhost:4181/wahala-game/ \
//        --runs 6 --seconds 45 --size 32 --arena rumbleOshodi --quality low --out docs/measurements/fu2/data-saver-lag.json
//   --viewport 320x180 and --quality veryLow make the software renderer fast enough for hundreds of frames per run
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const URL_ = opt('url', 'http://localhost:4181/wahala-game/');
const RUNS = Number(opt('runs', '6'));
const SECONDS = Number(opt('seconds', '45'));
const WARMUP = Number(opt('warmup', '8'));
const SIZE = Number(opt('size', '32'));
const ARENA = opt('arena', 'rumbleOshodi');
const QUALITY = opt('quality', 'low');
const CPU = Number(opt('cpu', '1'));
const PROFILE = argv.includes('--profile');
const [VW, VH] = opt('viewport', '844x390').split('x').map(Number);
const OUT = opt('out', '');
const CONDITIONS = opt('conditions', 'on,off,muted').split(',');

const SETTINGS = {
  play: 'rumble',
  rumbleMode: 'deathmatch',
  rumbleCompetitors: SIZE,
  rumbleMinutes: 5,
  rumbleMixed: false,
  difficulty: 'rookie',
  rumbleArenaId: ARENA,
  character: 'streetBaller',
  quality: QUALITY,
};
const CONDITION_SETTINGS = {
  on: { dataSaver: 'on', muted: false },
  off: { dataSaver: 'off', muted: false },
  muted: { dataSaver: 'off', muted: true },
};

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length
    ? s.length % 2
      ? s[(s.length - 1) / 2]
      : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
    : NaN;
};
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

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

async function oneRun(condition) {
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  const settings = { ...SETTINGS, ...CONDITION_SETTINGS[condition] };
  await ctx.addInitScript((j) => localStorage.setItem('wahala.settings.v1', j), JSON.stringify(settings));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Performance.enable');
  const music = [];
  cdp.on('Network.requestWillBeSent', (e) => {
    if (/\/audio\/music\//.test(e.request.url))
      music.push(`${e.request.method} ${new URL(e.request.url).pathname.split('/audio/music/')[1]}`);
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // media stalls, from before the first script runs; frames and long tasks are recorded in the page itself
  await page.addInitScript(() => {
    window.__stall = { waiting: 0, stalled: 0, suspend: 0 };
    for (const k of ['waiting', 'stalled']) window.addEventListener(k, () => window.__stall[k]++, true);
    window.__frames = [];
    window.__long = [];
    window.__recording = false;
    try {
      new PerformanceObserver((l) => {
        if (window.__recording) for (const e of l.getEntries()) window.__long.push(e.duration);
      }).observe({ entryTypes: ['longtask'] });
    } catch {
      /* longtask unsupported: the count stays empty */
    }
    let last = 0;
    const tick = (t) => {
      if (window.__recording && last) window.__frames.push(t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto(`${URL_}?debug&q=${QUALITY}&seed=7&noattract`);
  await page.getByTestId('title-screen').waitFor({ timeout: 120_000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid=menu-loading]'), null, {
    timeout: 120_000,
  });
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await page.getByTestId('home-play').click();
  await page.getByTestId('home-rumble').click();
  const t0 = Date.now();
  await page.getByTestId('setup-start').click();
  await page.getByTestId('hud').waitFor({ timeout: 600_000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid=match-loading]'), null, {
    timeout: 600_000,
  });
  const loadMs = Date.now() - t0;
  const players = await page.evaluate(() => window.__WAHALA__.getState().players.length);
  await page.waitForTimeout(WARMUP * 1000);
  const m0 = Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]),
  );
  if (PROFILE) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 2000 });
    await cdp.send('Profiler.start');
  }
  const tick0 = await page.evaluate(() => {
    window.__frames.length = 0;
    window.__long.length = 0;
    window.__recording = true;
    return window.__WAHALA__.getState().tick;
  });
  await page.waitForTimeout(SECONDS * 1000);
  const end = await page.evaluate(() => {
    window.__recording = false;
    const w = window.__WAHALA__;
    return {
      frames: window.__frames.slice(),
      long: window.__long.slice(),
      tick: w.getState().tick,
      timings: w.timings?.() ?? null,
      stall: window.__stall,
      stats: w.stats?.() ?? null,
    };
  });
  let profileTop = null;
  if (PROFILE) {
    // self time per function (microseconds between samples), the top ones: where the main thread spent the window
    const { profile } = await cdp.send('Profiler.stop');
    const self = new Map();
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    profile.samples.forEach((id, i) => {
      const n = byId.get(id);
      const f = n.callFrame;
      const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}`;
      self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0));
    });
    profileTop = [...self.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([k, v]) => [k, Math.round(v / 1000)]);
  }
  const m1 = Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]),
  );
  await ctx.close();
  const f = [...end.frames].sort((a, b) => a - b);
  const med = median(f);
  return {
    condition,
    players,
    loadMs,
    frameCount: f.length,
    frameMs: {
      p50: round(pct(f, 50)),
      p95: round(pct(f, 95)),
      p99: round(pct(f, 99)),
      max: round(f[f.length - 1] ?? 0),
      mean: round(f.reduce((s, x) => s + x, 0) / Math.max(1, f.length)),
    },
    framesOver2xMedian: f.filter((x) => x > 2 * med).length,
    framesOver4xMedian: f.filter((x) => x > 4 * med).length,
    longTasks: {
      count: end.long.length,
      totalMs: round(end.long.reduce((s, x) => s + x, 0)),
      maxMs: round(Math.max(0, ...end.long)),
    },
    mainThread: {
      taskSeconds: round(m1.TaskDuration - m0.TaskDuration, 2),
      scriptSeconds: round(m1.ScriptDuration - m0.ScriptDuration, 2),
      busyFraction: round((m1.TaskDuration - m0.TaskDuration) / SECONDS, 3),
    },
    simTicksPerSecond: round((end.tick - tick0) / SECONDS, 2),
    timings: end.timings,
    mediaStalls: end.stall,
    musicRequests: music,
    profileTop,
    errors,
  };
}

const rows = [];
for (let r = 0; r < RUNS; r++) {
  const order = [...CONDITIONS];
  for (let k = 0; k < r % CONDITIONS.length; k++) order.push(order.shift());
  for (const c of order) {
    const row = await oneRun(c);
    rows.push({ round: r + 1, ...row });
    console.log(
      `round ${r + 1} ${c.padEnd(5)} players ${row.players} frames ${row.frameCount} ` +
        `p50 ${row.frameMs.p50} p95 ${row.frameMs.p95} p99 ${row.frameMs.p99} ms | >2x ${row.framesOver2xMedian} >4x ${row.framesOver4xMedian} | ` +
        `long tasks ${row.longTasks.count} | main busy ${row.mainThread.busyFraction} | ticks/s ${row.simTicksPerSecond} | ` +
        `music GET ${row.musicRequests.filter((m) => m.startsWith('GET ') && !m.endsWith('manifest.json')).join(',') || '-'} | stalls ${JSON.stringify(row.mediaStalls)}` +
        (row.profileTop
          ? `\n    top self time ms: ${row.profileTop
              .slice(0, 8)
              .map(([k, v]) => `${k} ${v}`)
              .join(' | ')}`
          : '') +
        (row.errors.length ? ` ERRORS ${row.errors.join(' | ')}` : ''),
    );
  }
}

const summary = CONDITIONS.map((c) => {
  const rs = rows.filter((r) => r.condition === c);
  const col = (f) => rs.map(f);
  const med = (f, d = 1) => round(median(col(f)), d);
  const spread = (f, d = 1) => [round(Math.min(...col(f)), d), round(Math.max(...col(f)), d)];
  return {
    condition: c,
    runs: rs.length,
    frameP50: { median: med((r) => r.frameMs.p50), range: spread((r) => r.frameMs.p50) },
    frameP95: { median: med((r) => r.frameMs.p95), range: spread((r) => r.frameMs.p95) },
    frameP99: { median: med((r) => r.frameMs.p99), range: spread((r) => r.frameMs.p99) },
    over2x: { median: med((r) => r.framesOver2xMedian), range: spread((r) => r.framesOver2xMedian) },
    longTasks: { median: med((r) => r.longTasks.count), range: spread((r) => r.longTasks.count) },
    busyFraction: {
      median: med((r) => r.mainThread.busyFraction),
      range: spread((r) => r.mainThread.busyFraction),
    },
    ticksPerSecond: { median: med((r) => r.simTicksPerSecond), range: spread((r) => r.simTicksPerSecond) },
    loadMs: { median: med((r) => r.loadMs), range: spread((r) => r.loadMs) },
    mediaWaiting: rs.reduce((s, r) => s + r.mediaStalls.waiting, 0),
    mediaStalled: rs.reduce((s, r) => s + r.mediaStalls.stalled, 0),
    music: [
      ...new Set(
        rs.flatMap((r) =>
          r.musicRequests.filter((m) => m.startsWith('GET ') && !m.endsWith('manifest.json')),
        ),
      ),
    ],
  };
});
console.log(JSON.stringify(summary, null, 1));
if (OUT)
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        config: {
          size: SIZE,
          arena: ARENA,
          quality: QUALITY,
          seconds: SECONDS,
          warmup: WARMUP,
          cpu: CPU,
          runs: RUNS,
        },
        summary,
        rows,
      },
      null,
      1,
    ),
  );
await browser.close();
