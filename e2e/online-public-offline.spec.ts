/**
 * The public build is a fully offline game, whatever the URL says (docs/ONLINE_INTEGRATION.md section 2, decisions ON1 / ON11).
 * Runs against the normal DEFAULT production preview (no WAHALA_* build variables), on desktop and mobile:
 *  - `?online`, `?online&mockonline=0` and a URL that tries to name a server (`?server=` / `?endpoint=`) behave exactly like the
 *    plain URL: Home has no Online City Rumble entry (`home-rumble-online`) and no preview entry (`home-online`);
 *  - the page never constructs a WebSocket or an EventSource (both are replaced by recorders that throw), never calls
 *    `sendBeacon`, and every request the browser makes is a same-origin GET (or HEAD: the audio loader probes its own files) for the app's own files (also checked on the
 *    network, not only through the page's APIs);
 *  - an OFFLINE City Rumble can be started and plays; and once the page is loaded, taking the network away does not stop the
 *    menu or a new match (nothing needs the network at start-up; the service worker is not relied upon).
 * The built output is scanned separately (tests/online/public-bundle.test.ts, `npm run check:static`).
 */
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page, Request } from '@playwright/test';
import { exitMatch, getState, open, settled, startMatch } from './helpers';

const BASE = '?debug&q=low&seed=7&noattract';

/** The URLs under test: [label, query]. The last ones try to smuggle in a server; they must change nothing. */
const VARIANTS: [string, string][] = [
  ['plain', ''],
  ['?online', '&online'],
  ['?online&mockonline=0', '&online&mockonline=0'],
  [
    '?online&server=...&endpoint=...',
    '&online&server=ws://127.0.0.1:1&endpoint=ws://10.0.0.5:2567&url=wss://tunnel.trycloudflare.com',
  ],
];

interface NetLog {
  webSockets: string[];
  eventSources: string[];
  beacons: string[];
  fetches: string[];
  xhrs: string[];
}

/** Replaces WebSocket / EventSource with recorders that throw, and records fetch / XHR / sendBeacon targets. */
async function recordNetwork(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log = { webSockets: [], eventSources: [], beacons: [], fetches: [], xhrs: [] } as {
      webSockets: string[];
      eventSources: string[];
      beacons: string[];
      fetches: string[];
      xhrs: string[];
    };
    (window as unknown as { __netLog: unknown }).__netLog = log;
    const w = window as unknown as Record<string, unknown>;
    w.WebSocket = function (url: unknown) {
      log.webSockets.push(String(url));
      throw new Error('WebSocket must not be constructed in the public build');
    };
    w.EventSource = function (url: unknown) {
      log.eventSources.push(String(url));
      throw new Error('EventSource must not be constructed in the public build');
    };
    const realFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      log.fetches.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      return realFetch(input, init);
    };
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
      log.xhrs.push(`${String(args[0])} ${String(args[1])}`);
      return Reflect.apply(open, this, args);
    } as typeof XMLHttpRequest.prototype.open;
    const beacon = navigator.sendBeacon?.bind(navigator);
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
      log.beacons.push(String(url));
      return beacon ? beacon(url, data) : false;
    };
  });
}

const netLog = (page: Page): Promise<NetLog> =>
  page.evaluate(() => (window as unknown as { __netLog: NetLog }).__netLog);

/** Everything the browser requested, from the network layer (documents, scripts, models, fonts, workers, fetches ...). */
function watchRequests(page: Page): { requests: Request[]; sockets: string[] } {
  const requests: Request[] = [];
  const sockets: string[] = [];
  page.on('request', (r) => requests.push(r));
  page.on('websocket', (ws) => sockets.push(ws.url()));
  return { requests, sockets };
}

function expectOnlySameOriginGets(page: Page, requests: Request[]): void {
  const origin = new URL(page.url()).origin;
  const bad = requests
    .filter((r) => !/^(?:data|blob|about):/.test(r.url()))
    .filter((r) => new URL(r.url()).origin !== origin || !['GET', 'HEAD'].includes(r.method()))
    .map((r) => `${r.method()} ${r.url()}`);
  expect(bad).toEqual([]);
}

async function expectPublicHome(page: Page): Promise<void> {
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await expect(page.getByTestId('menu-home')).toBeVisible();
  await expect(page.getByTestId('home-rumble-online')).toHaveCount(0);
  await expect(page.getByTestId('home-online')).toHaveCount(0);
  await expect(page.getByTestId('menu-home')).not.toContainText(/\bonline\b|multiplayer/i);
  // Offline City Rumble is the same one tap away as ever
  await expect(page.getByTestId('home-play')).toBeVisible();
}

async function expectOfflineRumblePlays(page: Page): Promise<void> {
  await startMatch(page, { game: 'rumble' });
  const a = await getState(page);
  expect(a.playTicks).toBeGreaterThan(0);
  expect(a.players.length).toBeGreaterThanOrEqual(8);
  await page.evaluate(() =>
    (window as unknown as { __WAHALA__: { stepTicks(n: number): void } }).__WAHALA__.stepTicks(90),
  );
  const b = await getState(page);
  expect(b.tick).toBeGreaterThan(a.tick);
}

test.describe('public build: online is off whatever the URL says, and the game needs no network', () => {
  test.beforeEach(() => test.setTimeout(10 * 60_000));

  for (const [label, extra] of VARIANTS) {
    test(`${label}: Home has no online entry, no socket is ever opened, every request is a same-origin GET / HEAD`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await recordNetwork(page);
      const watched = watchRequests(page);
      await page.goto(`./${BASE}${extra}`);
      await expectPublicHome(page);
      await settled(page);

      // browse the menu a little: the Play screen and a City Rumble setup are offline screens too
      await page.getByTestId('home-play').click();
      await expect(page.getByTestId('menu-play')).toBeVisible();
      await expect(page.getByTestId('home-rumble-online')).toHaveCount(0);
      await expect(page.getByTestId('home-rumble')).toBeVisible();

      const log = await netLog(page);
      expect(log.webSockets).toEqual([]);
      expect(log.eventSources).toEqual([]);
      expect(log.beacons).toEqual([]);
      for (const url of [...log.fetches, ...log.xhrs.map((x) => x.split(' ')[1]!)]) {
        expect(new URL(url, page.url()).origin, url).toBe(new URL(page.url()).origin);
      }
      expect(watched.sockets).toEqual([]);
      expectOnlySameOriginGets(page, watched.requests);
      // none of the smuggled addresses was ever contacted (the page URL itself names them in its query, so compare hosts)
      expect(
        watched.requests
          .map((r) => new URL(r.url()).host)
          .filter((h) => /^(?:127\.0\.0\.1|10\.0\.0\.5|.*trycloudflare\.com)(?::\d+)?$/.test(h)),
      ).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  for (const [label, extra] of [VARIANTS[0]!, VARIANTS[3]!]) {
    test(`${label}: an offline City Rumble starts and plays, then still works with the network taken away`, async ({
      page,
      context,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await recordNetwork(page);
      const watched = watchRequests(page);
      await page.goto(`./${BASE}${extra}`);
      await expectPublicHome(page);

      await expectOfflineRumblePlays(page);

      // now the network goes: the loaded game keeps working (menu navigation, a second match) without any request
      await goOffline(context);
      const before = watched.requests.length;
      await exitMatch(page);
      await expect(page.getByTestId('menu-home')).toBeVisible();
      await expectPublicHome(page);
      await expectOfflineRumblePlays(page);

      const log = await netLog(page);
      expect(log.webSockets).toEqual([]);
      expect(log.eventSources).toEqual([]);
      expect(watched.sockets).toEqual([]);
      expectOnlySameOriginGets(page, watched.requests);
      // requests after the network went away may only be same-origin files that the game loads lazily (cache hits or
      // aborted), never anything cross-origin
      expectOnlySameOriginGets(page, watched.requests.slice(before));
      expect(errors.filter((e) => !/Failed to fetch|NetworkError|Load failed/i.test(e))).toEqual([]);
    });
  }

  test('the plain game also launches from a cold page with the default flags (title screen, then Home)', async ({
    page,
  }) => {
    await recordNetwork(page);
    await open(page, '&noattract');
    await expect(page.getByTestId('menu-home')).toBeVisible();
    expect((await netLog(page)).webSockets).toEqual([]);
  });
});

async function goOffline(context: BrowserContext): Promise<void> {
  await context.setOffline(true);
}
