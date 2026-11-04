/**
 * Online scaffold in a real browser (docs/ONLINE_ARCHITECTURE.md):
 *  - DEFAULT build: no Online entry anywhere, the voice UI is absent, Settings says Online off / Voice off, no
 *    socket, WebRTC or microphone API is ever touched (the page throws if they are), and both the campaign and a
 *    normal match start fine;
 *  - `?mockonline`: the Online preview is on Home; guest sign-in -> Quick Match -> lobby -> countdown -> a match
 *    the mock server plays -> reconnect demo -> results with XP and a leaderboard; a party with a scripted friend
 *    and team assignment; a locally played match handed back to the mock server.
 * Screenshots go to `WAHALA_SHOT_DIR` (default e2e-shots/; the reviewed set is docs/screenshots/online-preview/).
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { open, openSettings, startMatch, stepTicks } from './helpers';

const SHOTS = process.env.WAHALA_SHOT_DIR || 'e2e-shots';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
  });
  return errors;
}

/** Makes any attempt to open a socket, a peer connection or the microphone fail loudly and be recorded. */
async function trapNetworkApis(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown> & { __netAttempts: string[] };
    w.__netAttempts = [];
    const trap = (name: string) =>
      function () {
        w.__netAttempts.push(name);
        throw new Error(`${name} must not be used in this build`);
      };
    w.WebSocket = trap('WebSocket');
    w.RTCPeerConnection = trap('RTCPeerConnection');
    w.XMLHttpRequest = trap('XMLHttpRequest');
    w.EventSource = trap('EventSource');
    const md = navigator.mediaDevices as unknown as Record<string, unknown> | undefined;
    if (md) md['get' + 'UserMedia'] = trap('microphone');
  });
}

const netAttempts = (page: Page) =>
  page.evaluate(() => (window as unknown as { __netAttempts: string[] }).__netAttempts);

/** No horizontal page scroll and every visible control at least 44 px (WCAG target size on phones). */
async function assertFits(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  const small = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('.ol-screen .ol-step button:not(:disabled)')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 43.5 || r.width < 43.5)
        out.push(`${el.dataset.testid ?? el.textContent} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
  expect(small).toEqual([]);
}

test.describe('Online scaffold: default build (online off)', () => {
  test.beforeEach(() => test.setTimeout(3 * 60_000));

  test('no Online entry, no voice UI, flags read off/off/on, and no socket / WebRTC / microphone is touched', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await trapNetworkApis(page);
    await open(page, '&nobots&noattract');
    await expect(page.getByTestId('menu-home')).toBeVisible();
    await expect(page.getByTestId('home-online')).toHaveCount(0);
    await expect(page.getByTestId('menu-home')).not.toContainText(
      /\bonline\b|multiplayer|mock server|preview/i,
    );
    await expect(page.getByTestId('home-campaign')).toBeVisible();

    await openSettings(page, 'access');
    await expect(page.getByTestId('build-flags')).toBeVisible();
    await expect(page.getByTestId('flag-online')).toHaveAttribute('data-value', 'off');
    await expect(page.getByTestId('flag-voice')).toHaveAttribute('data-value', 'off');
    await expect(page.getByTestId('flag-campaign')).toHaveAttribute('data-value', 'on');
    await expect(page.getByTestId('voice-status')).toHaveCount(0);

    // a stale menu state that names the online screen goes home instead of showing anything
    await page.evaluate(() => {
      const w = window as unknown as { __WAHALA__: { store: { setState(p: unknown): void } } };
      w.__WAHALA__.store.setState({ menu: { stack: ['home', 'online'] } });
    });
    await expect(page.getByTestId('menu-home')).toBeVisible();
    await expect(page.getByTestId('menu-online')).toHaveCount(0);
    expect(await netAttempts(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('the campaign screen and a normal match start fine with the traps armed', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one viewport is enough');
    const errors = watchErrors(page);
    await trapNetworkApis(page);
    await open(page, '&noattract');
    await page.getByTestId('home-campaign').click();
    await expect(page.getByTestId('menu-campaign')).toBeVisible();
    await page.getByTestId('menu-back').click();
    await expect(page.getByTestId('menu-home')).toBeVisible();
    await startMatch(page, { competitors: 2 });
    await stepTicks(page, 120);
    const tick = await page.evaluate(
      () =>
        (window as unknown as { __WAHALA__: { getState(): { tick: number } } }).__WAHALA__.getState().tick,
    );
    expect(tick).toBeGreaterThan(200);
    expect(await netAttempts(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('?online, ?server and ?voice in the URL do nothing: only ?mockonline enables the local mock', async ({
    page,
  }) => {
    await trapNetworkApis(page);
    await open(page, '&nobots&noattract&online=1&server=1&voice=1&WAHALA_ONLINE_ENABLED=true');
    await expect(page.getByTestId('home-online')).toHaveCount(0);
    expect(await netAttempts(page)).toEqual([]);
  });
});

/** Quick Match all the way to the results, with the mock server playing the match. */
async function quickMatchToResults(page: Page, tag: string): Promise<void> {
  await page.getByTestId('home-online').click();
  await expect(page.getByTestId('online-banner')).toHaveText('Preview · mock server · no real players');
  await expect(page.getByTestId('online-step-signIn')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/${tag}-1-signin.png` });
  await page.getByTestId('online-guest').click();
  await expect(page.getByTestId('online-step-hub')).toBeVisible();
  await expect(page.getByTestId('online-level')).toContainText('Level 1');
  await assertFits(page);
  await page.screenshot({ path: `${SHOTS}/${tag}-2-hub.png` });

  await page.getByTestId('online-quick').click();
  await expect(page.getByTestId('online-step-queue')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/${tag}-3-queue.png` });
  await expect(page.getByTestId('online-step-lobby')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('online-room-state')).toHaveAttribute('data-state', 'readyCheck');
  await expect(page.getByTestId('online-lobby-members').locator('li')).toHaveCount(4);
  await assertFits(page);
  await page.screenshot({ path: `${SHOTS}/${tag}-4-lobby.png` });

  await page.getByTestId('online-ready').click();
  await expect(page.getByTestId('online-room-state')).toHaveAttribute('data-state', /starting|inProgress/, {
    timeout: 20_000,
  });
  await expect(page.getByTestId('online-step-match')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('online-match-choice')).toBeVisible();
  await assertFits(page);
  await page.screenshot({ path: `${SHOTS}/${tag}-5-match.png` });

  await page.getByTestId('online-play-server').click();
  await expect(page.getByTestId('online-live')).toBeVisible();
  await expect(page.getByTestId('online-live-status')).toContainText('tick', { timeout: 15_000 });
  // reconnect demo: the connection drops, the server holds the seat, the client resumes from snapshot + input log
  await page.getByTestId('online-drop').click();
  await expect(page.getByTestId('online-dropped')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/${tag}-6-dropped.png` });
  await page.getByTestId('online-reconnect').click();
  await expect(page.getByTestId('online-resync')).toContainText('Resynced from the server snapshot at tick');
  await expect(page.getByTestId('online-live')).toHaveAttribute('data-connection', 'connected');

  await expect(page.getByTestId('online-step-results')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('online-xp-total')).toHaveText(/^\+[1-9]\d* XP$/);
  await expect(page.getByTestId('online-rank-change')).toContainText(/Bronze|Silver/);
  await expect(page.getByTestId('online-leaderboard').locator('li[data-you="true"]')).toHaveCount(1);
  await assertFits(page);
  await page.screenshot({ path: `${SHOTS}/${tag}-7-results.png` });
}

test.describe('Online preview (?mockonline)', () => {
  test.beforeEach(() => test.setTimeout(6 * 60_000));

  test('guest -> Quick Match -> lobby -> server-played match -> reconnect demo -> results with XP', async ({
    page,
  }, info) => {
    const errors = watchErrors(page);
    await trapNetworkApis(page);
    await open(page, '&nobots&noattract&mockonline');
    await expect(page.getByTestId('home-online')).toBeVisible();
    await expect(page.getByTestId('home-online')).toContainText('Preview');
    await quickMatchToResults(page, `${info.project.name}`);

    // back to the hub: the profile now counts the match
    await page.getByTestId('online-hub').click();
    await expect(page.getByTestId('online-level')).toBeVisible();
    await expect(page.getByTestId('online-profile')).toContainText(/1W · 0L · 0D|0W · 1L · 0D|0W · 0L · 1D/);
    expect(await netAttempts(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Settings shows Online mock', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one viewport is enough');
    await open(page, '&nobots&noattract&mockonline');
    await openSettings(page, 'access');
    await expect(page.getByTestId('flag-online')).toHaveAttribute('data-value', 'mock');
    await expect(page.getByTestId('flag-voice')).toHaveAttribute('data-value', 'off');
  });

  test('party: code, invite a scripted friend, team game lobby with server-assigned teams, switch team', async ({
    page,
  }, info) => {
    const errors = watchErrors(page);
    await trapNetworkApis(page);
    await open(page, '&nobots&noattract&mockonline');
    await page.getByTestId('home-online').click();
    await page.getByTestId('online-guest').click();
    await page.getByTestId('online-game-team').click();
    await page.getByTestId('online-party').click();
    await expect(page.getByTestId('online-step-party')).toBeVisible();
    await expect(page.getByTestId('online-party-code')).toHaveText(/^[A-Z2-9]{6}$/);
    await page.getByTestId('online-invite-friend-ada').click();
    await expect(page.getByTestId('online-party-members').locator('li')).toHaveCount(2, { timeout: 10_000 });
    await expect(page.getByTestId('online-party-members').locator('li[data-ready="true"]')).toHaveCount(1, {
      timeout: 10_000,
    });
    await assertFits(page);
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-8-party.png` });
    await page.getByTestId('online-open-lobby').click();
    await expect(page.getByTestId('online-step-lobby')).toBeVisible();
    const members = page.getByTestId('online-lobby-members').locator('li');
    await expect(members.first()).toHaveAttribute('data-team', 'Green');
    await expect(members.nth(1)).toHaveAttribute('data-team', 'White');
    await page.getByTestId('online-switch-team').click();
    await expect(members.first()).toHaveAttribute('data-team', 'White');
    await assertFits(page);
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-9-team-lobby.png` });
    // the host starts the ready check: the server fills the seats with bots and locks the teams
    await page.getByTestId('online-readycheck').click();
    await expect(page.getByTestId('online-lobby-members').locator('li')).toHaveCount(8);
    await expect(page.getByTestId('online-switch-team')).toBeDisabled();
    expect(await netAttempts(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a locally played match is handed to the mock server and recorded in the results', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'the full local match flow runs on desktop only');
    test.slow();
    const errors = watchErrors(page);
    await open(page, '&nobots&noattract&mockonline');
    const settingsBefore = await page.evaluate(() => window.localStorage.getItem('wahala.settings.v1'));
    await page.getByTestId('home-online').click();
    await page.getByTestId('online-guest').click();
    await page.getByTestId('online-quick').click();
    await expect(page.getByTestId('online-step-lobby')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('online-ready').click();
    await expect(page.getByTestId('online-play-local')).toBeVisible({ timeout: 40_000 });
    await page.getByTestId('online-play-local').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await stepTicks(page, 160);
    const players = await page.evaluate(
      () =>
        (window as unknown as { __WAHALA__: { getState(): { players: unknown[] } } }).__WAHALA__.getState()
          .players.length,
    );
    expect(players).toBe(4);
    await page.keyboard.press('Space'); // a generator on your own tile: you are out
    await stepTicks(page, 200);
    await page.getByTestId('skip-results').click();
    await expect(page.getByTestId('results')).toBeVisible();
    await page.getByTestId('results-home').click();
    // back on the Online screen, the result is already recorded through the services
    await expect(page.getByTestId('online-step-results')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('online-xp-total')).toHaveText(/^\+[1-9]\d* XP$/);
    // the saved menu settings were never written by the preview
    expect(await page.evaluate(() => window.localStorage.getItem('wahala.settings.v1'))).toBe(settingsBefore);
    expect(errors).toEqual([]);
  });

  test('phone portrait: the screens fit and keep 44 px targets', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'phone only');
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '&nobots&noattract&mockonline');
    await quickMatchToResults(page, 'phone-portrait');
  });
});
