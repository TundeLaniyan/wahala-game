// Repeat-visit cost AFTER GitHub's 10-minute cache window (serve with `pages-server.mjs --max-age 0`) with and without
// the offline-cache worker, plus whether the game still opens with the network switched off.
//   node scripts/perf/revisit.mjs --url http://localhost:4183/wahala-game/ [--sw] [--out file.json]
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const URL_ = opt('url', 'http://localhost:4183/wahala-game/');
const SW = argv.includes('--sw');
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
const ctx = await browser.newContext({
  viewport: { width: 560, height: 260 },
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
let reqs = new Map();
cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url }));
cdp.on('Network.responseReceived', (e) => {
  const r = reqs.get(e.requestId);
  if (r) r.status = e.response.status;
});
cdp.on('Network.loadingFinished', (e) => {
  const r = reqs.get(e.requestId);
  if (r) r.bytes = e.encodedDataLength;
});
const tally = () => {
  const rows = [...reqs.values()].filter(
    (r) => r.url.startsWith('http://localhost') && r.bytes !== undefined,
  );
  const wire = rows.filter((r) => r.bytes > 0);
  return {
    requestsOnWire: wire.length,
    bytes: wire.reduce((a, r) => a + r.bytes, 0),
    status304: wire.filter((r) => r.status === 304).length,
    status200: wire.filter((r) => r.status === 200).length,
  };
};
const qs = `?debug&noattract&seed=7${SW ? '&sw' : ''}`;
const load = async () => {
  reqs = new Map();
  await page.goto(`${URL_}${qs}`, { waitUntil: 'load' });
  await page.getByTestId('title-screen').waitFor({ timeout: 120000 });
  // let the boot preload finish
  await page
    .waitForFunction(() => window.__WAHALA__?.store.getState().loading === null, null, { timeout: 120000 })
    .catch(() => undefined);
  await page.waitForTimeout(2500);
};
const out = { sw: SW };
await load();
out.visit1 = tally();
if (SW) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.waitForTimeout(500);
}
await load(); // visit 2: fills the worker cache from the (revalidated) network/HTTP cache
out.visit2 = tally();
await load(); // visit 3: steady state
out.visit3 = tally();
out.controlled = await page.evaluate(() => !!navigator.serviceWorker?.controller);
// offline launch
await ctx.setOffline(true);
try {
  await page.goto(`${URL_}${qs}`, { waitUntil: 'load', timeout: 20000 });
  await page.getByTestId('title-screen').waitFor({ timeout: 20000 });
  out.offlineLaunch = true;
} catch {
  out.offlineLaunch = false;
}
console.log(JSON.stringify(out, null, 1));
if (opt('out', '')) fs.writeFileSync(opt('out', ''), JSON.stringify(out, null, 1));
await browser.close();
