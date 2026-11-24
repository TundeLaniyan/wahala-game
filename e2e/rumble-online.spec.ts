/**
 * Online City Rumble in TWO REAL BROWSERS against the REAL local server, through the real game UI (docs/ONLINE_INTEGRATION.md).
 * NOT part of the public CI: CI builds the public bundle, which contains no online code (and `online-public-offline.spec.ts`
 * proves that). This spec needs a SERVER build (`npm run build:online`) served by `vite preview` and a running server, which
 * `npm run test:online-e2e` (scripts/online-e2e.mjs) starts; it skips itself unless `WAHALA_ONLINE_E2E_URL` names the page.
 *
 *  1. full flow: A creates a private room, B (a phone in landscape with touch) joins by the invite code from `?room=`, A starts,
 *     the 32-fighter match loads in both (2 humans + 30 bots), B's touch pad moves B's fighter, B loses its connection for a few
 *     seconds mid-match (a bot plays the seat meanwhile) and comes back to the SAME seat, the match ends and both show the
 *     SAME results;
 *  2. the server is unreachable: a plain error, no endless spinner, the game itself still works;
 *  3. the connection drops while the match is loading: the player is told, never left on a spinner, and gets back in.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { devices, expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

const BASE = process.env.WAHALA_ONLINE_E2E_URL ?? '';
const Q = '?debug&q=low&seed=7&noattract&online';

test.skip(!BASE, 'needs the online server build and server: npm run test:online-e2e');
test.describe.configure({ mode: 'serial' });

const W = (page: Page) => ({
  state: () =>
    page.evaluate(() => {
      const w = (window as any).__WAHALA__;
      const s = w.getState();
      return {
        tick: s.tick as number,
        players: s.players.length as number,
        humans: s.players.filter((p: any) => !p.isBot).length as number,
        seat: w.controller().localSeat as number,
        me: (() => {
          const p = s.players[w.controller().localSeat];
          return p
            ? {
                x: p.x as number,
                y: p.y as number,
                alive: p.alive as boolean,
                deaths: p.stats.deaths as number,
              }
            : null;
        })(),
        phase: s.match.phase as string,
      };
    }),
});

async function newPhone(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    ...devices['Pixel 7'],
    viewport: { width: 832, height: 384 },
    isMobile: true,
    hasTouch: true,
  });
}

async function openOnline(page: Page, extra = ''): Promise<void> {
  await page.goto(`${BASE}${Q}${extra}`);
  await expect(page.getByTestId('home-rumble-online')).toBeVisible({ timeout: 180_000 });
}

async function createRoom(page: Page, name: string): Promise<string> {
  await openOnline(page);
  await page.getByTestId('home-rumble-online').click();
  await page.getByTestId('ro-name').fill(name);
  await page.getByTestId('ro-create').click();
  await expect(page.getByTestId('ro-room-code')).toBeVisible({ timeout: 60_000 });
  const code = (await page.getByTestId('ro-room-code').textContent())!.replace(/[^A-Z0-9]/g, '');
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  return code;
}

async function joinRoom(page: Page, code: string, name: string): Promise<void> {
  await page.goto(`${BASE}${Q}&room=${code}`);
  await expect(page.getByTestId('home-rumble-online')).toBeVisible({ timeout: 180_000 });
  await page.getByTestId('home-rumble-online').click();
  // the invite link only pre-fills the code; the player taps Join
  await expect(page.getByTestId('ro-code')).toHaveValue(code);
  await page.getByTestId('ro-name').fill(name);
  await page.getByTestId('ro-join').click();
  await expect(page.getByTestId('ro-room-code')).toBeVisible({ timeout: 60_000 });
}

async function inMatch(page: Page): Promise<void> {
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 240_000 });
  await expect(page.getByTestId('match-loading')).toHaveCount(0, { timeout: 240_000 });
  await expect.poll(async () => (await W(page).state()).phase, { timeout: 120_000 }).toBe('playing');
}

test('two real browsers: room by invite code, a 32-fighter match with bots, touch, reconnect, identical results', async ({
  page,
  browser,
}) => {
  test.setTimeout(900_000);
  const code = await createRoom(page, 'Host Ada');
  const ctxB = await newPhone(browser);
  const guest = await ctxB.newPage();
  try {
    await joinRoom(guest, code, 'Guest Tunde');
    // both rooms list two humans; the filler bots are one labelled row, never counted as people
    await expect(page.getByTestId('ro-member')).toHaveCount(2, { timeout: 30_000 });
    await expect(guest.getByTestId('ro-member')).toHaveCount(2);
    await expect(page.getByTestId('ro-bots-row')).toBeVisible();
    await page.getByTestId('ro-ready').click();
    await guest.getByTestId('ro-ready').click();
    await expect(page.getByTestId('ro-start')).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId('ro-start').click();
    await Promise.all([inMatch(page), inMatch(guest)]);

    const a = await W(page).state();
    const b = await W(guest).state();
    expect(a.players).toBe(32);
    expect(a.humans).toBe(2);
    expect(b.humans).toBe(2);
    expect(a.seat).not.toBe(b.seat); // two people, two fighters
    await expect(page.getByTestId('net-chip')).toBeVisible();

    // the phone's touch pad moves the phone's fighter (the move assist and the server both run): a drag on the stick
    const before = (await W(guest).state()).me!;
    const zone = (await guest.getByTestId('stick-zone').boundingBox())!;
    const cx = zone.x + zone.width * 0.4;
    const cy = zone.y + zone.height * 0.6;
    await guest.mouse.move(cx, cy);
    await guest.mouse.down();
    for (const [dx, dy] of [
      [40, 0],
      [40, 0],
      [0, 40],
      [0, 40],
      [-40, 0],
    ]) {
      await guest.mouse.move(cx + dx, cy + dy, { steps: 4 });
      await guest.waitForTimeout(1500);
    }
    await guest.mouse.up();
    await expect
      .poll(
        async () => {
          const m = (await W(guest).state()).me!;
          return Math.abs(m.x - before.x) + Math.abs(m.y - before.y);
        },
        { timeout: 60_000 },
      )
      .toBeGreaterThan(0);

    // B loses its connection mid-match: told so, then back in the SAME seat (the server kept the fighter; a bot played it)
    const seat = b.seat;
    await ctxB.setOffline(true);
    await expect(guest.getByTestId('net-banner')).toBeVisible({ timeout: 60_000 });
    await guest.waitForTimeout(8000);
    await ctxB.setOffline(false);
    await expect(guest.getByTestId('net-banner')).toHaveCount(0, { timeout: 120_000 });
    const after = await W(guest).state();
    expect(after.seat).toBe(seat);
    expect(after.humans).toBe(2);
    expect(after.me!.deaths).toBeGreaterThanOrEqual(before.deaths); // no reset, no extra life

    // the match ends on the server (3 minutes): both players see the SAME results
    await Promise.all([
      expect(page.getByTestId('ro-results')).toBeVisible({ timeout: 420_000 }),
      expect(guest.getByTestId('ro-results')).toBeVisible({ timeout: 420_000 }),
    ]);
    const rowsOf = (p: Page) => p.getByTestId('ro-result-row').allInnerTexts();
    const [ra, rb] = await Promise.all([rowsOf(page), rowsOf(guest)]);
    expect(ra.length).toBeGreaterThanOrEqual(2);
    expect(ra.map((t) => t.replace(/\s+/g, ' '))).toEqual(rb.map((t) => t.replace(/\s+/g, ' ')));
    expect(ra.some((t) => /BOT/i.test(t))).toBe(false); // results list the people; bots are summarised, never named as players
  } finally {
    await ctxB.close();
  }
});

test('the server is unreachable: a plain message, no endless spinner, the offline game still works', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.route('**/matchmake/**', (r) => r.abort());
  await openOnline(page);
  await page.getByTestId('home-rumble-online').click();
  await page.getByTestId('ro-name').fill('Nobody');
  await page.getByTestId('ro-create').click();
  await expect(page.getByTestId('ro-error')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('ro-error')).toHaveAttribute('data-reason', 'unreachable');
  await expect(page.getByTestId('ro-connecting')).toHaveCount(0);
  // back out: the offline game is untouched
  await page.getByTestId('ro-error-back').click();
  await page.goto(`${BASE}?debug&q=low&seed=7&noattract`);
  await expect(page.getByTestId('home-rumble-online')).toHaveCount(0); // no `?online`: the public face of the same build
  await expect(page.getByTestId('home-play')).toBeVisible({ timeout: 120_000 });
});

test('the connection drops while the match is loading: told, never an endless spinner, and back in', async ({
  page,
  browser,
}) => {
  test.setTimeout(600_000);
  const code = await createRoom(page, 'Host Bisi');
  const ctxB = await newPhone(browser);
  const guest = await ctxB.newPage();
  try {
    await joinRoom(guest, code, 'Guest Chidi');
    await page.getByTestId('ro-ready').click();
    await guest.getByTestId('ro-ready').click();
    await expect(page.getByTestId('ro-start')).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId('ro-start').click();
    // the guest loses the network the moment the countdown starts (its arena is still loading)
    await expect(guest.getByTestId('ro-countdown').or(guest.getByTestId('ro-loading'))).toBeVisible({
      timeout: 60_000,
    });
    await ctxB.setOffline(true);
    await guest.waitForTimeout(6000);
    // told in plain words: a reconnect banner / status, or the loading card's stalled note
    await expect(
      guest
        .getByTestId('net-banner')
        .or(guest.getByTestId('ro-loading-stalled'))
        .or(guest.getByTestId('ro-conn-note')),
    ).toBeVisible({ timeout: 60_000 });
    await ctxB.setOffline(false);
    // and it gets into the match (the server re-sends a keyframe to the same seat)
    await Promise.all([inMatch(page), inMatch(guest)]);
    expect((await W(guest).state()).humans).toBe(2);
  } finally {
    await ctxB.close();
  }
});
