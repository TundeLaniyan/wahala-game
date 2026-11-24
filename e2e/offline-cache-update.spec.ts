/**
 * The offline cache worker across RELEASES and ROLLBACK (src/platform/sw/sw.template.js, docs/MOBILE_PERFORMANCE.md):
 * a cached build must never keep a player on an outdated release, and a rollback must not be undone by the worker.
 * A tiny local server serves the built `dist/` as three "deployments" of the same site:
 *   A  the build as shipped (worker v1)
 *   B  a NEW release: another app shell (a marker in index.html) and another worker file (so the browser sees an update)
 *   R  a ROLLBACK: the older shell again, and NO worker file at all (404), as when production reverts to a build without one
 * and checks, with the network ON, that the shell is always the newest the server has (network-first), that a new worker
 * activates and prunes what it no longer lists, that rolling back to a build without a worker keeps serving the rolled-back
 * shell, and that the offline fallback is the LAST shell seen, never an older one. Desktop project only.
 */
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { expect, test } from '@playwright/test';

const DIST = join(process.cwd(), 'dist');
const BASE = '/wahala-game/';
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

type Deployment = 'A' | 'B' | 'R';

function deploy(): { server: Server; set(d: Deployment): void; ready: Promise<number> } {
  let current: Deployment = 'A';
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith(BASE)) {
      res.writeHead(404).end();
      return;
    }
    let rel = normalize(decodeURIComponent(url.pathname.slice(BASE.length)));
    if (rel === '' || rel === '.' || rel.endsWith('/')) rel = join(rel, 'index.html');
    if (rel.startsWith('..')) {
      res.writeHead(403).end();
      return;
    }
    // a rollback to a build without a worker: the worker file is simply gone
    if (rel === 'sw.js' && current === 'R') {
      res.writeHead(404).end();
      return;
    }
    const file = join(DIST, rel);
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    let body: Buffer | string = readFileSync(file);
    if (rel === 'index.html')
      body = body.toString('utf8').replace('</head>', `<meta name="x-deploy" content="${current}"></head>`);
    // a NEW worker: any byte change makes the browser install it
    if (rel === 'sw.js' && current === 'B') body = `${body.toString('utf8')}\n// deployment B\n`;
    res.writeHead(200, {
      'content-type': TYPES[extname(rel)] ?? 'application/octet-stream',
      // GitHub Pages' fixed value: the HTTP cache alone would keep a stale shell for ten minutes
      'cache-control': 'max-age=600',
    });
    res.end(body);
  });
  const ready = new Promise<number>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port)),
  );
  return { server, set: (d) => (current = d), ready };
}

test('a new release replaces the cached shell and worker; a rollback is not undone by the old worker', async ({
  page,
  context,
}) => {
  test.skip(test.info().project.name !== 'desktop', 'one browser project is enough for the worker');
  test.skip(!existsSync(join(DIST, 'sw.js')), 'needs a production build (dist/sw.js)');
  test.setTimeout(300_000);
  const d = deploy();
  const port = await d.ready;
  const q = `http://127.0.0.1:${port}${BASE}?debug&q=low&seed=7&noattract&sw`;
  const deployMark = () =>
    page.evaluate(() => document.querySelector('meta[name="x-deploy"]')?.getAttribute('content') ?? null);
  const cacheHas = (name: string) =>
    page.evaluate(
      async (n) => (await (await caches.open('wahala-assets-v1')).keys()).some((k) => k.url.endsWith(n)),
      name,
    );
  try {
    // visit 1 and 2 on deployment A: the worker installs, takes control and fills its cache
    d.set('A');
    await page.goto(q);
    await expect(page.getByTestId('title-screen')).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.goto(q);
    await expect(page.getByTestId('title-screen')).toBeVisible();
    expect(await deployMark()).toBe('A');
    await expect
      .poll(() => page.evaluate(async () => (await (await caches.open('wahala-assets-v1')).keys()).length), {
        timeout: 60_000,
      })
      .toBeGreaterThan(5);
    // an entry no later build lists: the NEW worker must prune it when it activates (the old one already ran)
    await page.evaluate(
      (base) =>
        caches
          .open('wahala-assets-v1')
          .then((c) => c.put(new Request(`${base}assets/stale-ZZZZZZZZ.js`), new Response('stale'))),
      BASE,
    );
    expect(await cacheHas('stale-ZZZZZZZZ.js')).toBe(true);

    // a NEW release goes live: the very next visit shows ITS shell although the old shell is cached and the HTTP cache is fresh
    d.set('B');
    await page.goto(q);
    await expect(page.getByTestId('title-screen')).toBeVisible();
    expect(await deployMark(), 'the shell is network-first: never the stale cached one').toBe('B');
    // ...and the new worker took over (it pruned what its build does not list)
    await expect.poll(() => cacheHas('stale-ZZZZZZZZ.js'), { timeout: 30_000 }).toBe(false);
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

    // ROLLBACK: production reverts to the older shell and to a build with no worker file
    d.set('R');
    await page.goto(q);
    await expect(page.getByTestId('title-screen')).toBeVisible();
    expect(await deployMark(), 'the rolled-back shell wins over the cached newer one').toBe('R');

    // the offline fallback is the LAST shell the worker saw (the rolled-back one), and the game opens from it
    await context.setOffline(true);
    await page.goto(q);
    await expect(page.getByTestId('title-screen')).toBeVisible();
    expect(await deployMark()).toBe('R');
    await context.setOffline(false);

    // ?nosw is the player's escape hatch even then
    await page.goto(q.replace('&sw', '&nosw'));
    await expect
      .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), {
        timeout: 30_000,
      })
      .toBe(0);
  } finally {
    d.server.close();
  }
});
