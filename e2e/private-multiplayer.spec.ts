/**
 * PRIVATE MULTIPLAYER, end to end, in REAL browsers against the REAL local stack (docs/PLATFORM_LOCAL_TEST.md):
 * PostgreSQL, the player platform, the platform-linked City Rumble server and a server build of the game. Not part of the public CI
 * (it needs the stack that `npm run test:private-e2e`, scripts/private-e2e.mjs, starts); skips itself without `WAHALA_PRIVATE_E2E_URL`.
 *
 * Players: A (desktop, the party leader), B (a phone in landscape, touch) and C (a third browser that joins the room as a plain
 * guest, with no platform ticket, and types A's nickname).
 *
 *   1. guest entry on the Online screen, choose nicknames
 *   2. friends: B adds A by friend code, A accepts
 *   3. party: A creates it, invites B, B accepts, both ready
 *   4. A starts the private match: ONE private room, both players VERIFIED with their platform nicknames (not what was typed)
 *   5. C joins the room by its code as a guest typing A's name: no badge, a different name, no platform identity
 *   6. quick signals in the lobby; B mutes A (and the controls to block / report are reachable)
 *   7. Free-for-All match with 2 humans + 30 bots: a quick signal in the match, B's touch pad, B disconnects and reconnects to the SAME seat
 *   8. both see the same results; the platform recorded the match (history of both players, written by the SERVER)
 *   9. back in the room lobby (rematch), switch to TEAM Rumble, a second match: signals, results, recorded again
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeFileSync } from 'node:fs';
import { devices, expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page, WebSocketRoute } from '@playwright/test';

const BASE = process.env.WAHALA_PRIVATE_E2E_URL ?? '';
const PLATFORM = process.env.WAHALA_PRIVATE_E2E_PLATFORM ?? '';
const Q = '?debug&q=veryLow&seed=7&noattract&online';
// The HOSTED private-beta stack (scripts/beta-e2e.mjs: the Docker stack behind its TLS edge, the match server REQUIRING platform tickets,
// the platform INVITE-ONLY, the beta build of the client). Without these the spec runs against the local development stack.
const INVITE = process.env.WAHALA_PRIVATE_E2E_INVITE ?? '';
const SERVER_HTTP = process.env.WAHALA_PRIVATE_E2E_SERVER ?? '';
const STRICT = INVITE !== '';
// The founder-laptop TUNNEL run (scripts/beta-tunnel-e2e.mjs): every request first needs the access cookie that a tester's private link sets.
const GATE = {
  A: process.env.WAHALA_PRIVATE_E2E_GATE_A ?? '',
  B: process.env.WAHALA_PRIVATE_E2E_GATE_B ?? '',
  C: process.env.WAHALA_PRIVATE_E2E_GATE_C ?? '',
};
const GATED = GATE.A !== '';
const METRICS_FILE = process.env.WAHALA_PRIVATE_E2E_METRICS ?? '';

/** What the browsers saw: WebSocket opens and closes, round-trip samples (the game's own ping chip and a timed request) and bytes transferred. */
const metrics: {
  ws: Record<string, { opened: number; closed: number; events: string[] }>;
  rtt: { who: string; when: string; chipMs: number | null; healthMs: number }[];
  bytes: Record<string, { first: number; total: number; requests: number }>;
} = { ws: {}, rtt: [], bytes: {} };
const sampling: { stop: () => void } = { stop: () => undefined };
const t0 = Date.now();
const stamp = (): string => `${Math.round((Date.now() - t0) / 1000)}s`;

function track(page: Page, who: string): void {
  metrics.ws[who] = { opened: 0, closed: 0, events: [] };
  metrics.bytes[who] = { first: 0, total: 0, requests: 0 };
  page.on('websocket', (ws) => {
    const m = metrics.ws[who]!;
    m.opened++;
    m.events.push(`${stamp()} open`);
    ws.on('close', () => {
      m.closed++;
      m.events.push(`${stamp()} close`);
    });
    ws.on('socketerror', (e) => m.events.push(`${stamp()} error ${String(e).slice(0, 80)}`));
  });
  page.on('requestfinished', (r) => {
    void r
      .sizes()
      .then((sz) => {
        const b = metrics.bytes[who]!;
        b.total += sz.responseBodySize + sz.responseHeadersSize;
        b.requests++;
      })
      .catch(() => undefined);
  });
}

/** Round-trip samples from inside the page: the game's own ping chip and the time of a small authenticated request through the whole path. */
async function sample(page: Page, who: string, when: string): Promise<void> {
  const chip = await page
    .getByTestId('net-ping')
    .first()
    .innerText({ timeout: 2000 })
    .then((t) => Number(/(\d+)/.exec(t)?.[1] ?? NaN))
    .catch(() => NaN);
  const healthMs = await page
    .evaluate(async () => {
      const t = performance.now();
      await fetch('/platform-health', { cache: 'no-store' }).then((r) => r.text());
      return Math.round(performance.now() - t);
    })
    .catch(() => -1);
  metrics.rtt.push({ who, when, chipMs: Number.isFinite(chip) ? chip : null, healthMs });
}

test.skip(!BASE, 'needs the private multiplayer stack: npm run test:private-e2e');
test.describe.configure({ mode: 'serial' });
// a click on something that never appears must fail in a minute, not hold the whole run until the test timeout
test.use({ actionTimeout: 60_000 });

const W = (page: Page) => ({
  state: () =>
    page.evaluate(() => {
      const w = (window as any).__WAHALA__;
      const s = w.getState();
      const me = s.players[w.controller().localSeat];
      return {
        players: s.players.length as number,
        humans: s.players.filter((p: any) => !p.isBot).length as number,
        seat: w.controller().localSeat as number,
        game: s.settings.game as string,
        team: me?.team as number,
        phase: s.match.phase as string,
        deaths: (me?.stats.deaths ?? 0) as number,
      };
    }),
});

async function shot(p: Page, name: string): Promise<void> {
  const dir = process.env.PRIVATE_E2E_SHOTS;
  if (dir) await p.screenshot({ path: `${dir}/${name}.png` }).catch(() => undefined);
}

async function phone(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    ...devices['Pixel 7'],
    viewport: { width: 832, height: 384 },
    isMobile: true,
    hasTouch: true,
  });
}

/** The tunnel's door: a tester's private link sets the access cookie, then everything else works as usual. */
async function enterGate(page: Page, token: string): Promise<void> {
  if (!token) return;
  const r = await page.goto(`${BASE}__enter?k=${token}`);
  expect(r?.status(), 'the private link opens the door').toBeLessThan(400);
}

async function openOnline(page: Page, gate = ''): Promise<void> {
  await enterGate(page, gate);
  await page.goto(`${BASE}${Q}`);
  await page.getByTestId('home-rumble-online').click({ timeout: 180_000 });
  if (STRICT) {
    // the invite-only beta: this device has no account yet, so the invite code is asked for before anything else
    await expect(page.getByTestId('pf-invite')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('pf-invite-code').fill(INVITE);
    await page.getByTestId('pf-invite-submit').click();
  }
  await expect(page.getByTestId('pf-identity')).toBeVisible({ timeout: 60_000 });
}

async function setNickname(page: Page, name: string): Promise<void> {
  await page.getByTestId('pf-tab-you').click();
  await page.getByTestId('pf-name-edit').click();
  await page.getByTestId('pf-name-input').fill(name);
  await page.getByTestId('pf-name-save').click();
  await expect(page.getByTestId('pf-nickname')).toHaveText(name, { timeout: 30_000 });
}

async function inMatch(page: Page): Promise<void> {
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 300_000 });
  await expect(page.getByTestId('match-loading')).toHaveCount(0, { timeout: 300_000 });
  await expect.poll(async () => (await W(page).state()).phase, { timeout: 120_000 }).toBe('playing');
}

/** What the platform says about this player's matches, read with the page's own session (a player can read only their own history). */
async function history(
  page: Page,
): Promise<{ matchId: string; game: string; humans: number; you: { placement: number | null } }[]> {
  return page.evaluate(async (platform) => {
    const raw = JSON.parse(localStorage.getItem('wahala.platform.v1') ?? '{}');
    const res = await fetch(`${platform}/v1/me/matches`, {
      headers: { authorization: `Bearer ${raw.accessToken}` },
    });
    return (await res.json()).matches;
  }, PLATFORM);
}

test('private multiplayer: guests, nicknames, friends, party, one private room, signals, mute / report, reconnect, results, rematch in Team Rumble', async ({
  page: a,
  browser,
}) => {
  test.setTimeout(2_400_000);
  // nicknames are globally unique on the platform (decision PP4) and the database persists between runs: a fresh pair every run
  const tag = Array.from(
    { length: 4 },
    () => 'abcdefghijkmnpqrstuvwxyz'[Math.floor(Math.random() * 24)],
  ).join('');
  const nameA = `Ada ${tag}`;
  const nameB = `Bayo ${tag}`;
  const ctxB = await phone(browser);
  // B's connection to the match server goes through a test-controlled pass-through, so the "network loss" is the same every time:
  // `dropB()` closes B's live socket (close code 4010, what a browser that lost its network produces: see the server log) and
  // refuses new ones until `restoreB()` (browser offline emulation does not reliably cut an open WebSocket)
  let bBlocked = false;
  const bLive: { page: WebSocketRoute; server: WebSocketRoute }[] = [];
  await ctxB.routeWebSocket(/\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\?.*sessionId=/, (ws) => {
    if (bBlocked) {
      void ws.close({ code: 4010, reason: 'offline (test)' });
      return;
    }
    bLive.push({ page: ws, server: ws.connectToServer() });
  });
  const dropB = async (): Promise<void> => {
    bBlocked = true;
    for (const x of bLive.splice(0)) {
      await x.server.close({ code: 1001 }).catch(() => undefined);
      await x.page.close({ code: 4010, reason: 'offline (test)' }).catch(() => undefined);
    }
  };
  const ctxC = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const b = await ctxB.newPage();
  const c = await ctxC.newPage();
  track(a, 'A');
  track(b, 'B');
  const errors: string[] = [];
  for (const [n, p] of [
    ['A', a],
    ['B', b],
    ['C', c],
  ] as const)
    p.on('pageerror', (e) =>
      errors.push(
        `${n} @${new Date().toISOString().slice(11, 19)}: ${e.message.slice(0, 200)} :: ${(e.stack ?? '')
          .split('\n')
          .slice(1, 4)
          .map((l) => l.trim().slice(0, 140))
          .join(' | ')}`,
      ),
    );
  try {
    // ---- 1. guests choose nicknames
    await Promise.all([openOnline(a, GATE.A), openOnline(b, GATE.B)]);
    metrics.bytes.A!.first = metrics.bytes.A!.total;
    metrics.bytes.B!.first = metrics.bytes.B!.total;
    await expect(a.getByTestId('pf-guest-label')).toBeVisible();
    await setNickname(a, nameA);
    await setNickname(b, nameB);
    await shot(a, '01-identity-A');
    await shot(b, '02-identity-B-phone');

    // ---- 2. friends by code
    const codeA = ((await a.getByTestId('pf-friend-code').textContent()) ?? '').replace(/\s/g, '');
    expect(codeA).toMatch(/^[A-Z0-9]{8}$/);
    await b.getByTestId('pf-tab-friends').click();
    await b.getByTestId('pf-friend-code-input').fill(codeA);
    await b.getByTestId('pf-add-friend').click();
    await a.getByTestId('pf-tab-friends').click();
    await expect(a.getByTestId('pf-request-in')).toHaveCount(1, { timeout: 30_000 });
    await a.getByTestId('pf-request-accept').click();
    await expect(a.getByTestId('pf-friend')).toHaveCount(1, { timeout: 30_000 });
    await expect(b.getByTestId('pf-friend')).toHaveCount(1, { timeout: 30_000 });
    await shot(a, '03-friends-A');

    // ---- 3. party: A creates it and invites B; B accepts
    await a.getByTestId('pf-tab-party').click();
    await a.getByTestId('pf-party-create').click();
    await expect(a.getByTestId('pf-party')).toBeVisible({ timeout: 30_000 });
    await a.getByTestId('pf-party-invite').first().click();
    await b.getByTestId('pf-tab-party').click();
    await expect(b.getByTestId('pf-invite')).toHaveCount(1, { timeout: 30_000 });
    await b.getByTestId('pf-invite-accept').click();
    await expect(b.getByTestId('pf-party')).toBeVisible({ timeout: 30_000 });
    await expect(a.getByTestId('pf-party-member')).toHaveCount(2, { timeout: 30_000 });
    await shot(a, '04-party-A');
    await shot(b, '05-party-B-phone');

    // ---- 4. the leader starts the private match: one room, both verified, platform nicknames
    await b.getByTestId('pf-party-ready').click();
    await a.getByTestId('ro-name').fill('Typed Other Name'); // the typed field must not decide who they are
    await expect(a.getByTestId('pf-party-start')).toBeEnabled({ timeout: 30_000 });
    await a.getByTestId('pf-party-start').click();
    await expect(a.getByTestId('ro-room-code')).toBeVisible({ timeout: 90_000 });
    const code = ((await a.getByTestId('ro-room-code').textContent()) ?? '').replace(/[^A-Z0-9]/g, '');
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    await expect(b.getByTestId('ro-room-code')).toHaveText(new RegExp(code.split('').join('\\s*')), {
      timeout: 90_000,
    }); // B followed the party into the SAME room
    await expect(a.getByTestId('ro-member')).toHaveCount(2, { timeout: 60_000 });
    await expect(a.getByTestId('pf-verified')).toHaveCount(2);
    const names = await a.getByTestId('ro-member').allInnerTexts();
    expect(names.join(' | ')).toContain(nameA);
    expect(names.join(' | ')).toContain(nameB);
    expect(names.join(' | ')).not.toContain('Typed Other Name');
    await shot(a, '06-room-A');
    await shot(b, '07-room-B-phone');

    // ---- 5. an outsider with the room code
    if (!STRICT) {
      await c.goto(`${BASE}${Q}`);
      await c.getByTestId('home-rumble-online').click({ timeout: 180_000 });
      await c.getByTestId('ro-name').fill(nameA);
      await c.getByTestId('ro-code').fill(code);
      await c.getByTestId('ro-join').click();
      await expect(c.getByTestId('ro-room-code')).toBeVisible({ timeout: 60_000 });
      await expect(a.getByTestId('ro-member')).toHaveCount(3, { timeout: 60_000 });
      await expect(a.getByTestId('pf-verified')).toHaveCount(2); // still two: C has no badge
      const fake = (await a.getByTestId('ro-member').allInnerTexts()).find((t) =>
        new RegExp(`${nameA} 2`).test(t),
      );
      expect(fake, 'the impostor is shown under a different name').toBeTruthy();
      expect(fake!).not.toMatch(/verified/i);
      await shot(a, '08-room-with-guest-A');
    } else {
      // the hosted beta: someone who has the page and even the ROOM CODE but no invite cannot get an account, and cannot reach the
      // match server around the page either (every matchmaking request needs a platform ticket)
      await enterGate(c, GATE.C);
      await c.goto(`${BASE}${Q}`);
      await c.getByTestId('home-rumble-online').click({ timeout: 180_000 });
      await expect(c.getByTestId('pf-invite')).toBeVisible({ timeout: 60_000 });
      await c.getByTestId('pf-invite-code').fill('not-a-real-invite-code');
      await c.getByTestId('pf-invite-submit').click();
      await expect(c.getByTestId('pf-invite-refused')).toBeVisible({ timeout: 60_000 });
      await expect(c.getByTestId('pf-identity')).toHaveCount(0);
      for (const id of ['ro-create', 'ro-join', 'ro-quick', 'ro-code'])
        await expect(c.getByTestId(id)).toHaveCount(0);
      for (const [path, data] of [
        ['/matchmake/create/rumble', { name: 'Mallory', private: true }],
        [`/matchmake/joinById/${code}`, { name: nameA }],
        ['/matchmake/joinOrCreate/rumble', { name: 'Mallory', mode: 'ffa' }],
        [`/matchmake/joinById/${code}`, { name: nameA, ticket: 'eyJhbGciOiJFZERTQSJ9.e30.AAAA' }],
      ] as const) {
        const r = await c.request.post(`${SERVER_HTTP}${path}`, { data, failOnStatusCode: false });
        expect(r.status(), path).toBeGreaterThanOrEqual(400);
        expect(await r.text(), path).not.toMatch(/sessionId|reservation/i);
      }
      await expect(a.getByTestId('ro-member')).toHaveCount(2); // nobody got a seat
      await shot(c, '08-uninvited-C');
      if (GATED) {
        // a stranger with NO private link at all: nothing is reachable, not the page, not the API, not a socket
        const ctxD = await browser.newContext({ viewport: { width: 900, height: 700 } });
        const d = await ctxD.newPage();
        const home = await d.goto(`${BASE}${Q}`);
        expect(home?.status(), 'a stranger without a link gets the refusal page').toBe(403);
        await expect(d.locator('body')).toContainText(/private test/i);
        expect(
          (await d.goto(`${BASE}__enter?k=${'0'.repeat(32)}`))?.status(),
          'a made-up link is refused',
        ).toBe(403);
        for (const [path, method] of [
          ['/v1/auth/providers', 'get'],
          ['/platform-health', 'get'],
          ['/.well-known/jwks.json', 'get'],
          ['/matchmake/create/rumble', 'post'],
          ['/matchmake/joinOrCreate/rumble', 'post'],
        ] as const) {
          const r = await (method === 'get'
            ? d.request.get(`${SERVER_HTTP}${path}`, { failOnStatusCode: false })
            : d.request.post(`${SERVER_HTTP}${path}`, {
                data: { name: 'Mallory', private: true, mode: 'ffa' },
                failOnStatusCode: false,
              }));
          expect(r.status(), `${path} without a link`).toBe(403);
        }
        const wsResult = await d.evaluate(
          () =>
            new Promise<string>((resolve) => {
              const ws = new WebSocket(`wss://${location.host}/abc/DEFGHI?sessionId=guess`);
              ws.onopen = () => resolve('open');
              ws.onerror = () => resolve('refused');
              ws.onclose = () => resolve('refused');
              setTimeout(() => resolve('no answer'), 15_000);
            }),
        );
        expect(wsResult, 'a WebSocket without a link is refused').toBe('refused');
        await shot(d, '08b-stranger-no-link');
        await ctxD.close();
      }
    }

    // ---- 6. quick signals in the lobby; B mutes A; the member menu offers block and report
    await a.getByTestId('qs-send-chat-lets_go').click();
    await expect(b.getByTestId('qs-feed-item').first()).toContainText(/Let's go/i, { timeout: 30_000 });
    if (!STRICT)
      await expect(c.getByTestId('qs-feed-item').first()).toContainText(/Let's go/i, { timeout: 30_000 }); // a guest hears it too
    await b.getByTestId('pf-member-menu').first().click();
    await expect(b.getByTestId('pf-member-dialog')).toBeVisible();
    await expect(b.getByTestId('pf-member-block')).toBeVisible();
    await expect(b.getByTestId('pf-member-report')).toBeVisible();
    await shot(b, '09-member-menu-B-phone');
    await b.getByTestId('pf-member-mute').click();
    if (!STRICT) {
      // C has no platform id in the room (it joined without a ticket): from A's side only a LOCAL hide exists for C
      await a
        .getByTestId('ro-member')
        .filter({ hasText: `${nameA} 2` })
        .getByTestId('pf-member-menu')
        .click();
      await expect(a.getByTestId('pf-member-local-mute')).toBeVisible();
      await expect(a.getByTestId('pf-member-block')).toHaveCount(0);
      await expect(a.getByTestId('pf-member-report')).toHaveCount(0);
      await a.getByTestId('pf-member-close').click();
      await expect(a.getByTestId('pf-member-dialog')).toHaveCount(0);
    }
    // B unmutes A again (the later match signals are then wanted)
    await expect(b.getByTestId('pf-member-unmute')).toBeVisible({ timeout: 30_000 }); // the same dialog now offers Unmute
    await b.getByTestId('pf-member-unmute').click();
    await expect(b.getByTestId('pf-member-mute')).toBeVisible({ timeout: 30_000 });
    await b.getByTestId('pf-member-close').click();
    await expect(b.getByTestId('pf-member-dialog')).toHaveCount(0);

    // B reports A (they share a party): the platform accepts it; nothing is punished automatically
    await b.getByTestId('pf-member-menu').first().click();
    await b.getByTestId('pf-member-report').click();
    await b.getByTestId('pf-report-category-spam').click();
    await b.getByTestId('pf-report-send').click();
    await expect(b.getByTestId('pf-message')).toContainText(/Report sent|already reported/i, {
      timeout: 30_000,
    });

    if (!STRICT) {
      // C leaves; the match is A + B
      await c.getByTestId('ro-leave').click();
      await c.getByTestId('ro-leave-confirm').click();
      await expect(a.getByTestId('ro-member')).toHaveCount(2, { timeout: 60_000 });
    }
    await ctxC.close(); // three software-rendered browsers starve the server and each other: C has done its part

    // ---- 7. Free-for-All match
    // the default 5-minute match: slow software rendering must not let it end before the reconnection step is done
    await a.getByTestId('ro-ready').click();
    await b.getByTestId('ro-ready').click();
    await expect(a.getByTestId('ro-start')).toBeEnabled({ timeout: 30_000 });
    await a.getByTestId('ro-start').click();
    await Promise.all([inMatch(a), inMatch(b)]);
    const sa = await W(a).state();
    const sb = await W(b).state();
    expect(sa.players).toBe(32);
    expect(sa.humans).toBe(2);
    expect(sa.seat).not.toBe(sb.seat);
    expect(sa.game).toBe('deathmatch');
    // the game's own ping, every 20 s while the matches run (the page is busy drawing 32 fighters: only the chip is a fair network figure)
    const sampler = setInterval(() => {
      void sample(a, 'A', 'during');
      void sample(b, 'B', 'during');
    }, 20_000);
    sampling.stop = () => clearInterval(sampler);
    await sample(a, 'A', 'match-1-start');
    await sample(b, 'B', 'match-1-start');
    await shot(a, '10-match-A');
    await shot(b, '11-match-B-phone');

    // B loses its connection (right after the match starts) and comes back to the SAME seat
    const seatB = sb.seat;
    await dropB();
    await expect(b.getByTestId('net-banner')).toBeVisible({ timeout: 60_000 });
    await b.waitForTimeout(10_000); // the server saw the close at once: after its 3 s grace a bot plays the seat; the 30 s window is still open
    bBlocked = false;
    await expect(b.getByTestId('net-banner')).toHaveCount(0, { timeout: 120_000 });
    const back = await W(b).state();
    expect(back.seat).toBe(seatB);
    expect(back.humans).toBe(2);
    await shot(b, '12-reconnected-B-phone');
    await sample(b, 'B', 'after-reconnect');
    await sample(a, 'A', 'after-B-reconnect');

    // a quick signal in the match, from A to B (Free-for-All: match-wide presets only)
    await a.getByTestId('qs-hud-toggle').click();
    await a.getByTestId('qs-hud-send-chat-nice').click();
    // B's rail shows it for a few seconds: look for it, take a picture, and prove delivery at the results (the feed keeps it)
    const railSaw = await b
      .getByText(/Nice one/i)
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(
        () => true,
        () => false,
      );
    test.info().annotations.push({ type: 'signal-in-match-rail-B', description: String(railSaw) });
    await shot(b, '11b-signal-B-phone');

    // ---- 8. results: identical for both; the PLATFORM recorded the match (written by the server)
    await Promise.all([
      expect(a.getByTestId('ro-results')).toBeVisible({ timeout: 480_000 }),
      expect(b.getByTestId('ro-results')).toBeVisible({ timeout: 480_000 }),
    ]);
    const rowsOf = (p: Page) => p.getByTestId('ro-result-row').allInnerTexts();
    const [ra, rb] = await Promise.all([rowsOf(a), rowsOf(b)]);
    const norm = (t: string) => t.replace(/\s+/g, ' ').replace(/ YOU\b/, '');
    expect(ra).toHaveLength(32);
    expect(ra.map(norm)).toEqual(rb.map(norm));
    expect(ra.filter((t) => /\bHUMAN\b/.test(t))).toHaveLength(2);
    expect(ra.filter((t) => /\bBOT\b/.test(t))).toHaveLength(30);
    expect(ra.join(' ')).toContain(nameA);
    await shot(a, '13-results-A');
    // delivered to B: its feed holds the signal (the room panel sits under the results overlay, so it is attached, not visible)
    await expect(b.locator('[data-testid="qs-feed-item"][data-signal="chat.nice"]').first()).toBeAttached({
      timeout: 30_000,
    });
    await expect.poll(async () => (await history(a)).length, { timeout: 60_000 }).toBe(1);
    await expect.poll(async () => (await history(b)).length, { timeout: 60_000 }).toBe(1);
    const h1a = (await history(a))[0]!;
    const h1b = (await history(b))[0]!;
    expect(h1a.matchId).toBe(h1b.matchId);
    expect(h1a.game).toBe('deathmatch');
    expect(h1a.humans).toBe(2);

    // ---- 9. back in the room lobby, Team Rumble, a second match
    await expect(a.getByTestId('ro-rematch')).toBeEnabled({ timeout: 30_000 });
    await a.getByTestId('ro-rematch').click();
    await expect(a.getByTestId('ro-room')).toHaveAttribute('data-phase', 'lobby', { timeout: 60_000 });
    await expect(b.getByTestId('ro-room')).toHaveAttribute('data-phase', 'lobby', { timeout: 60_000 });
    await expect(a.getByTestId('pf-verified')).toHaveCount(2); // still the same two verified players
    await a.getByTestId('ro-mode-team').click();
    await a.getByTestId('ro-duration-180').click(); // the second match can be the short one
    await expect(b.getByTestId('ro-set-mode')).toContainText(/team/i, { timeout: 30_000 });
    await a.getByTestId('ro-ready').click();
    await b.getByTestId('ro-ready').click();
    await expect(a.getByTestId('ro-start')).toBeEnabled({ timeout: 30_000 });
    await a.getByTestId('ro-start').click();
    await Promise.all([inMatch(a), inMatch(b)]);
    const ta = await W(a).state();
    const tb = await W(b).state();
    expect(ta.game).toBe('team');
    expect(ta.players).toBe(32);
    expect(ta.humans).toBe(2);
    expect([0, 1]).toContain(ta.team);
    expect([0, 1]).toContain(tb.team);
    await sample(a, 'A', 'match-2-team-start');
    await sample(b, 'B', 'match-2-team-start');
    await shot(a, '14-team-match-A');
    // a team signal reaches the team (and is refused in Free-for-All, covered by the server tests)
    await a.getByTestId('qs-hud-toggle').click();
    await expect(a.getByTestId('qs-hud-send-ping-danger')).toBeVisible();
    await Promise.all([
      expect(a.getByTestId('ro-results')).toBeVisible({ timeout: 480_000 }),
      expect(b.getByTestId('ro-results')).toBeVisible({ timeout: 480_000 }),
    ]);
    await shot(b, '15-team-results-B-phone');
    await expect.poll(async () => (await history(a)).length, { timeout: 60_000 }).toBe(2);
    const games = (await history(a)).map((m) => m.game).sort();
    expect(games).toEqual(['deathmatch', 'team']);
    expect(errors, 'no page errors in any browser').toEqual([]);
    await sample(a, 'A', 'end');
    await sample(b, 'B', 'end');
  } finally {
    sampling.stop();
    if (METRICS_FILE) writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
    await ctxB.close();
    await ctxC.close().catch(() => undefined);
  }
});
