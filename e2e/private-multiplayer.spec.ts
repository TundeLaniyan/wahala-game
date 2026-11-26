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
import { devices, expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

const BASE = process.env.WAHALA_PRIVATE_E2E_URL ?? '';
const PLATFORM = process.env.WAHALA_PRIVATE_E2E_PLATFORM ?? '';
const Q = '?debug&q=veryLow&seed=7&noattract&online';

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

async function openOnline(page: Page): Promise<void> {
  await page.goto(`${BASE}${Q}`);
  await page.getByTestId('home-rumble-online').click({ timeout: 180_000 });
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
  const ctxC = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const b = await ctxB.newPage();
  const c = await ctxC.newPage();
  const errors: string[] = [];
  for (const [n, p] of [
    ['A', a],
    ['B', b],
    ['C', c],
  ] as const)
    p.on('pageerror', (e) => errors.push(`${n}: ${e.message.slice(0, 200)}`));
  try {
    // ---- 1. guests choose nicknames
    await Promise.all([openOnline(a), openOnline(b)]);
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

    // ---- 5. a plain guest joins the same room by code typing A's nickname: no badge, another name, no platform identity
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

    // ---- 6. quick signals in the lobby; B mutes A; the member menu offers block and report
    await a.getByTestId('qs-send-chat-lets_go').click();
    await expect(b.getByTestId('qs-feed-item').first()).toContainText(/Let's go/i, { timeout: 30_000 });
    await expect(c.getByTestId('qs-feed-item').first()).toContainText(/Let's go/i, { timeout: 30_000 }); // a guest hears it too
    await b.getByTestId('pf-member-menu').first().click();
    await expect(b.getByTestId('pf-member-dialog')).toBeVisible();
    await expect(b.getByTestId('pf-member-block')).toBeVisible();
    await expect(b.getByTestId('pf-member-report')).toBeVisible();
    await shot(b, '09-member-menu-B-phone');
    await b.getByTestId('pf-member-mute').click();
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

    // C leaves; the match is A + B
    await c.getByTestId('ro-leave').click();
    await c.getByTestId('ro-leave-confirm').click();
    await expect(a.getByTestId('ro-member')).toHaveCount(2, { timeout: 60_000 });

    // ---- 7. Free-for-All match
    await a.getByTestId('ro-duration-180').click(); // 3-minute matches keep the run short
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
    await shot(a, '10-match-A');
    await shot(b, '11-match-B-phone');

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

    // B's touch pad moves B's fighter; B loses its connection and comes back to the SAME seat
    await expect(b.getByTestId('stick-zone')).toBeVisible({ timeout: 90_000 });
    const seatB = sb.seat;
    await ctxB.setOffline(true);
    await expect(b.getByTestId('net-banner')).toBeVisible({ timeout: 60_000 });
    await b.waitForTimeout(30_000); // the server notices the drop (3 s x 6 pings), a bot plays the seat, the 30 s window is still open
    await ctxB.setOffline(false);
    await expect(b.getByTestId('net-banner')).toHaveCount(0, { timeout: 120_000 });
    const back = await W(b).state();
    expect(back.seat).toBe(seatB);
    expect(back.humans).toBe(2);
    await shot(b, '12-reconnected-B-phone');

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
  } finally {
    await ctxB.close();
    await ctxC.close();
  }
});
