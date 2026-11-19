// Campaign performance baseline (docs/CAMPAIGN_CAMERA.md, docs/measurements/campaign-guidance-expansion-baseline.md).
// Per mission and quality preset, in a fresh page each: the bytes fetched by the initial load (until the models are
// loaded) and by the mission start, the scene build time (`stats().loadMs`, renderer.loadGame), draw calls and
// triangles once the camera has settled in play, live GPU geometries / textures, frame time mean / p95 over a few
// seconds of real play (the human stands still, the enemies are live), and the AI cost per tick (`timings().ai`, the
// smoothed ms of one tick's bot decisions; `sim` is the whole sim step of a frame, bots included).
// `--restarts=N` instead plays the first mission N times in ONE page, then the A -> B -> A sequence of the first two,
// and prints the GPU resources after each start (flat = no leak); `--cycles=K` repeats the B -> A part K times.
// Software rendering (SwiftShader on shared cores): frame times compare builds on the same machine, never phones.
//
//   SHOT_URL=http://localhost:<port>/wahala-game/ WAHALA_CHROMIUM=/opt/pw-browsers/chromium \
//   node scripts/campaign-perf.mjs [missions|default] [low,high] [--seconds=4] [--restarts=N] [--cycles=K]
//     [--dist=dist] [--json]
//
// A mission is `field:<fieldId>` (FIELD_MISSION_DEFS, through `__WAHALA__.startFieldMission`), `boss:<districtId>` (the
// district's boss through the campaign controller, with the districts before it won) or `raid:<raidId>` (a classic
// raid on its own, `campaign().debugStartRaid`). Everything it calls exists on production `0b89d09`, so the same script
// measures the baseline and a branch.
import { chromium } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const DEFAULT = [
  'field:oshodi.approach',
  'field:oshodi.railEdge',
  'boss:oshodi',
  'field:mushin.approach',
  'field:ojuelegba.return',
  'raid:warehouseDispatchDepot',
  'raid:junctionToolShed',
];
const ORDER = ['oshodi', 'mushin', 'fadeyiSomolu', 'ebuteMetta', 'lagosIsland', 'lekki'];
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const flag = (name, d) => flags.find((f) => f.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const [list = 'default', qualities = 'low,high'] = args.filter((a) => !a.startsWith('--'));
const missions = list === 'default' ? DEFAULT : list.split(',');
const seconds = Number(flag('seconds', 4));
const restarts = Number(flag('restarts', 0));
const cycles = Number(flag('cycles', 1));
const distDir = flag('dist', 'dist');
const json = flags.includes('--json');
const base = process.env.SHOT_URL ?? 'http://localhost:5199/wahala-game/';
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

/** Gzip size of a fetched file of the built `dist` (what a gzip-serving host such as GitHub Pages sends), or null. */
function gzipOf(url) {
  const path = new URL(url).pathname.replace(/^\/wahala-game\//, '');
  const file = join(distDir, decodeURIComponent(path || 'index.html'));
  if (!existsSync(file)) return null;
  return gzipSync(readFileSync(file), { level: 9 }).length;
}

/** Counts every finished response (bytes on the wire, and the gzip size of the same dist file) until `take()`. */
async function meter(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const urls = new Map();
  let rows = [];
  cdp.on('Network.responseReceived', (e) => urls.set(e.requestId, e.response.url));
  cdp.on('Network.loadingFinished', (e) => {
    const url = urls.get(e.requestId);
    if (url && !url.startsWith('data:')) rows.push({ url, bytes: e.encodedDataLength });
  });
  return {
    take() {
      const out = rows;
      rows = [];
      const bytes = out.reduce((s, r) => s + r.bytes, 0);
      const gz = out.reduce((s, r) => s + (gzipOf(r.url) ?? r.bytes), 0);
      return { files: out.length, bytes, gzip: gz };
    },
  };
}

async function open(q) {
  const page = await (
    await browser.newContext({ viewport: { width: 740, height: 360 }, deviceScaleFactor: 1 })
  ).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const net = await meter(page);
  await page.goto(`${base}?debug&noattract&seed=7&q=${q}`);
  await page.getByTestId('title-screen').waitFor();
  // the initial load ends when every bundled model has loaded (the title screen's loading bar is gone)
  await page.waitForFunction(() => window.__WAHALA__?.store.getState().loading === null, null, {
    timeout: 180_000,
  });
  await page.waitForTimeout(300);
  return { page, errors, net, initial: net.take() };
}

/** Starts a mission (see the header) and returns once the match is loaded. */
async function start(page, mission) {
  const [kind, id] = mission.split(':');
  const ok = await page.evaluate(
    ({ kind, id, order }) => {
      const w = window.__WAHALA__;
      if (kind === 'field') return w.startFieldMission(id);
      const c = w.campaign();
      if (!c) return false;
      if (kind === 'raid') {
        c.load();
        return c.debugStartRaid(id);
      }
      if (kind === 'boss') {
        c.load();
        if (!c.ui?.active) {
          c.startNew();
          c.storyDone();
          const upTo = order.indexOf(id);
          for (const d of order.slice(0, upTo + 1))
            c.finishMission({
              result: 'won',
              missionId: d,
              modifiers: [],
              seconds: 100,
              livesUsed: 0,
              phasesCleared: 3,
              defeat: 'eliminated',
              stars: 3,
              creditedKills: 1,
            });
          c.toMap();
        }
        return c.startMission(id);
      }
      return false;
    },
    { kind, id, order: ORDER },
  );
  if (!ok) throw new Error(`${mission} did not start`);
  await page.waitForFunction(
    () => window.__WAHALA__.matchLoad().state === null && !!window.__WAHALA__.getState(),
    null,
    { timeout: 180_000 },
  );
  // past the countdown (software WebGL would take many seconds of slow frames): the play camera
  await page.evaluate(() => {
    const w = window.__WAHALA__;
    const c = w.controller();
    c.frozen = true;
    while (c.state.match.phase === 'countdown') w.stepTicks(10);
    c.frozen = false;
    w.renderer().cutCamera();
  });
  await page.waitForTimeout(1500);
}

/** Frame deltas over `seconds` of real play. */
async function frames(page) {
  return page.evaluate(
    (seconds) =>
      new Promise((resolve) => {
        const out = [];
        let last = performance.now();
        const end = last + seconds * 1000;
        const step = (now) => {
          out.push(now - last);
          last = now;
          if (now < end) requestAnimationFrame(step);
          else {
            const sorted = [...out].sort((a, b) => a - b);
            const mean = out.reduce((a, b) => a + b, 0) / out.length;
            resolve({ mean, p95: sorted[Math.floor(sorted.length * 0.95)], n: out.length });
          }
        };
        requestAnimationFrame(step);
      }),
    seconds,
  );
}

const round = (v) => Math.round(v * 10) / 10;
const kb = (b) => `${Math.round(b / 1024)}`;

if (restarts > 0) {
  const { page, errors } = await open(qualities.split(',')[0]);
  const [a, b = a] = missions;
  const seq = [...Array(restarts).fill(a), ...Array.from({ length: cycles }, () => [b, a]).flat()];
  const out = [];
  for (const [i, m] of seq.entries()) {
    await start(page, m);
    const s = await page.evaluate(() => window.__WAHALA__.stats());
    out.push({ i: i + 1, mission: m, geometries: s.geometries, textures: s.textures, loadMs: s.loadMs });
    console.log(
      `start ${i + 1} ${m}: geometries ${s.geometries} textures ${s.textures} loadMs ${round(s.loadMs)}`,
    );
  }
  await page.evaluate(() => window.__WAHALA__.controller().stop());
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.__WAHALA__.stats());
  console.log(`after stop: geometries ${after.geometries} textures ${after.textures}`);
  if (errors.length) console.log('PAGE ERRORS', errors.slice(0, 3).join(' | '));
  if (json) console.log(JSON.stringify({ restarts: out, after }));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
}

console.log(
  '| mission | quality | initial load KB (gzip KB) | mission fetch KB | build ms | draw calls | triangles | geometries | textures | frame mean ms | frame p95 ms | frames | AI ms / tick | sim ms / frame |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
const rows = [];
let failed = 0;
for (const q of qualities.split(',')) {
  for (const m of missions) {
    const { page, errors, net, initial } = await open(q);
    await start(page, m);
    const fetched = net.take();
    const f = await frames(page);
    const s = await page.evaluate(() => window.__WAHALA__.stats());
    const t = await page.evaluate(() => window.__WAHALA__.timings());
    const row = { mission: m, quality: q, initial, fetched, stats: s, frames: f, timings: t };
    rows.push(row);
    console.log(
      `| \`${m}\` | ${q} | ${kb(initial.bytes)} (${kb(initial.gzip)}) | ${kb(fetched.bytes)} | ${round(s.loadMs)} | ${s.drawCalls} | ${s.triangles} | ${s.geometries} | ${s.textures} | ${round(f.mean)} | ${round(f.p95)} | ${f.n} | ${t?.ai ?? '-'} | ${t?.sim ?? '-'} |`,
    );
    if (errors.length) {
      failed++;
      console.log(`PAGE ERRORS ${m} ${q}: ${errors.slice(0, 3).join(' | ')}`);
    }
    await page.context().close();
  }
}
if (json) console.log(JSON.stringify(rows));
await browser.close();
process.exit(failed ? 1 : 0);
