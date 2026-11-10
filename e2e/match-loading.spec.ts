/**
 * The match loading screen in a real browser (app/matchLoader.ts, docs/MATCH_LOADING.md):
 *  - Quick play tapped three times: the loading screen answers at once, ONE match starts, and the screen goes once the
 *    match is drawn (HUD and controls up, nothing over the board);
 *  - a slow start (`?loaddelay`): the loading screen stays up with a real step line, the menu is gone at once;
 *  - an upright phone: the turn-sideways instruction and the loading line are both on screen, never the rotate notice
 *    stacked on top; once loaded the ordinary rotate notice takes over;
 *  - a start that fails (`?loadfail`): Retry starts it, Back returns to the menu, nothing left on screen;
 *  - every 3D model failing to download: the drawn fallbacks are used and the match still starts (no endless spinner).
 * Each case runs where it matters (desktop or phone) to keep the browser suite's time down.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
const load = (page: Page) => page.evaluate(() => (window as any).__WAHALA__.matchLoad());

async function openMenu(page: Page, query = ''): Promise<void> {
  await page.goto(`./?debug&q=low&seed=7&noattract${query}`);
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await expect(page.getByTestId('quick-play')).toBeVisible();
}

/** Three quick taps on Quick play, as fast as the page takes them (each runs the button's own handler). */
async function tapQuickPlay(page: Page, times = 3): Promise<void> {
  await page.evaluate((n) => {
    const b = document.querySelector('[data-testid="quick-play"]') as HTMLButtonElement;
    for (let i = 0; i < n; i++) b.click();
  }, times);
}

async function playable(page: Page): Promise<void> {
  await expect(page.getByTestId('match-loading')).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByTestId('hud')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__WAHALA__.getState().match.phase)).not.toBe('ended');
}

test('rapid taps: the loading screen answers at once, one match starts, then the game is playable', async ({
  page,
  isMobile,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openMenu(page, '&loaddelay=600');
  await tapQuickPlay(page);
  // the same task that took the taps already shows the loading screen (no heavy work has run yet)
  await expect(page.getByTestId('match-loading')).toBeVisible();
  await playable(page);
  expect((await load(page)).starts).toBe(1);
  if (isMobile) await expect(page.getByTestId('btn-place')).toBeVisible();
  // the loading screen never comes back over the match
  await page.waitForTimeout(500);
  await expect(page.getByTestId('match-loading')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a slow start keeps a real step on screen; the menu is gone at once', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the same lifecycle on every device');
  await openMenu(page, '&loaddelay=2500');
  await tapQuickPlay(page, 1);
  await expect(page.getByTestId('match-loading')).toBeVisible();
  await expect(page.getByTestId('match-loading-step')).toHaveText(
    /Getting ready|Loading fighters|Building|Almost/,
  );
  await expect(page.getByTestId('match-loading')).toHaveAttribute(
    'data-phase',
    /starting|assets|arena|scene/,
  );
  await playable(page);
});

test('an upright phone: the turn-sideways hint and the loading line together, then the ordinary rotate notice', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'a touch phone held upright');
  await page.setViewportSize({ width: 390, height: 844 });
  await openMenu(page, '&loaddelay=2500');
  await tapQuickPlay(page, 1);
  await expect(page.getByTestId('match-loading-rotate')).toBeVisible();
  await expect(page.getByTestId('match-loading-step')).toBeVisible();
  await expect(page.getByTestId('rotate')).toHaveCount(0); // never two overlays fighting
  // the whole start (models, build, first frames) on a slow runner: the same allowance as inMatch
  await expect(page.getByTestId('match-loading')).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByTestId('rotate')).toBeVisible();
  // turned sideways: the match is there, nothing over it
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByTestId('rotate')).toHaveCount(0);
  await expect(page.getByTestId('hud')).toBeVisible();
});

test('a failed start: Retry starts it, Back returns to the menu', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the same lifecycle on every device');
  await openMenu(page, '&loadfail=2');
  await tapQuickPlay(page, 1);
  await expect(page.getByTestId('match-loading')).toHaveAttribute('data-phase', 'failed', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('match-loading-error')).toBeVisible();
  // a Play tap behind the failure screen starts nothing
  await tapQuickPlay(page, 1);
  expect((await load(page)).starts).toBe(1);
  // Back: the menu, nothing left over it
  await page.getByTestId('match-loading-back').click();
  await expect(page.getByTestId('match-loading')).toHaveCount(0);
  await expect(page.getByTestId('menu-home')).toBeVisible();
  // the second (forced) failure, then Retry: the match starts
  await tapQuickPlay(page, 1);
  await expect(page.getByTestId('match-loading')).toHaveAttribute('data-phase', 'failed', {
    timeout: 30_000,
  });
  await page.getByTestId('match-loading-retry').click();
  await playable(page);
  expect((await load(page)).starts).toBe(3);
});

test('every 3D model failing to download: drawn fallbacks, the match still starts', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'the slow-network case is a phone one');
  await page.route('**/*.glb', (route) => route.abort());
  await openMenu(page);
  await tapQuickPlay(page, 1);
  await playable(page);
  const assets = await page.evaluate(() => (window as any).__WAHALA__.assets());
  expect(assets.failed.length).toBeGreaterThan(0);
  expect(assets.loaded.length).toBe(0);
});
