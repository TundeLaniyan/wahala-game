/**
 * The offline cache worker (src/platform/sw/sw.template.js, docs/MOBILE_PERFORMANCE.md "Offline cache"):
 * browsers under automation skip it unless `?sw` asks, so every other spec keeps the plain network path.
 *  - with `?sw` it takes control, fills its cache from the first visits, and a revisit with the network OFF opens the menu;
 *  - revisits fetch no hashed build file from the network at all (the worker answers from its cache);
 *  - `?nosw` removes the worker and its cache again;
 *  - the arena warmed on the setup screen (decision FU2-7) lands in the worker's cache, and pressing Start fetches none of
 *    its models from the network again.
 */
import { expect, test } from '@playwright/test';
import { chooseArena, inMatch, launch } from './helpers';

test('the worker keeps hashed build files for offline and repeat visits', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'desktop', 'one browser project is enough for the worker');
  test.setTimeout(240_000);
  const q = './?debug&q=low&seed=7&noattract&sw';
  await page.goto(q);
  await expect(page.getByTestId('title-screen')).toBeVisible();
  // the registration happens after load; wait until a worker is active and controls the page
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  // visit 2 (the worker is now in control): its cache fills from the HTTP cache / network
  await page.goto(q);
  await expect(page.getByTestId('title-screen')).toBeVisible();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect
    .poll(() => page.evaluate(async () => (await (await caches.open('wahala-assets-v1')).keys()).length), {
      timeout: 60_000,
    })
    .toBeGreaterThan(5);

  // visit 3 hits the network only for the app shell (index.html is network-first), never for a hashed build file
  const fetched: string[] = [];
  page.on('requestfinished', async (r) => {
    const resp = await r.response();
    if (resp && !resp.fromServiceWorker()) fetched.push(new URL(r.url()).pathname);
  });
  await page.goto(q);
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(fetched.filter((p) => /\/assets\/.+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/.test(p))).toEqual([]);

  // the menu opens with the network off
  await context.setOffline(true);
  await page.goto(q);
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await expect(page.getByTestId('home-play')).toBeVisible();
  await context.setOffline(false);

  // ?nosw removes the worker and clears its cache
  await page.goto('./?debug&q=low&seed=7&noattract&nosw');
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), {
      timeout: 30_000,
    })
    .toBe(0);
  expect(await page.evaluate(() => caches.has('wahala-assets-v1'))).toBe(false);
});

test('without ?sw an automated browser registers no worker', async ({ page }) => {
  await page.goto('./?debug&q=low&seed=7&noattract');
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
});

test('the arena warmed on the setup screen is in the worker cache, and Start does not fetch its models again', async ({
  page,
  context,
}) => {
  test.skip(test.info().project.name !== 'desktop', 'one browser project is enough for the worker');
  test.setTimeout(360_000);
  const q = './?debug&q=low&seed=7&noattract&sw';
  await page.goto(q);
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.goto(q); // the worker is in control from this visit on
  await expect(page.getByTestId('title-screen')).toBeVisible();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // every glb the worker itself takes from the NETWORK (a page request the worker answers from its cache is not one), with when
  const glb: { path: string; at: number }[] = [];
  context.on('requestfinished', (r) => {
    if (r.serviceWorker() && /\/assets\/.+-[A-Za-z0-9_-]{8}\.glb$/.test(new URL(r.url()).pathname))
      glb.push({ path: new URL(r.url()).pathname, at: Date.now() });
  });
  await page.getByTestId('home-play').click();
  await page.getByTestId('home-classic').click();
  await chooseArena(page, 'balogunMarket');
  const cached = () =>
    page.evaluate(async () => {
      const keys = await (await caches.open('wahala-assets-v1')).keys();
      return keys.map((k) => new URL(k.url).pathname).filter((p) => /\.glb$/.test(p)).length;
    });
  // Balogun's 28 models: the warm-up fills the worker's cache while the player is still on the setup screen
  await expect.poll(cached, { timeout: 120_000 }).toBeGreaterThanOrEqual(26);
  await page.waitForTimeout(1000);
  const before = glb.length;
  expect(before, "the capture sees the worker's own network fetches").toBeGreaterThanOrEqual(26);
  await launch(page);
  await inMatch(page);
  // nothing of the arena came from the network again after the tap: every model the match loaded was a cache hit
  const lateNetwork = glb.slice(before).filter((g) => /env_building_|veh_|gen_generator/.test(g.path));
  expect(lateNetwork.map((g) => g.path)).toEqual([]);
});
