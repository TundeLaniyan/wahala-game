/**
 * Data Saver (docs/MOBILE_PERFORMANCE.md "Data Saver"): which music file a match streams.
 *  - Settings > Audio > Data Saver: Auto (default) / On / Off, saved with the other settings;
 *  - On plays `music/lite/<track>.mp3`; Off plays the full file; Auto follows the browser's own Data Saver.
 * The assertion is on the real request the page makes for the track, not on a setting.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openSettings, open, startMatch } from './helpers';

async function musicRequestFor(page: Page, setting: 'on' | 'off' | 'auto'): Promise<string> {
  const seen: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'GET' && /\/audio\/music\/[^/]*\.mp3$|\/audio\/music\/lite\/[^/]*\.mp3$/.test(r.url()))
      seen.push(new URL(r.url()).pathname);
  });
  await open(page, '&noattract');
  await openSettings(page, 'audio');
  await page.getByTestId(`datasaver-${setting}`).click();
  await expect(page.getByTestId(`datasaver-${setting}`)).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('menu-back').click();
  await startMatch(page, { game: 'classic' });
  await expect.poll(() => seen.length, { timeout: 60_000 }).toBeGreaterThan(0);
  const first = seen[0]!;
  // stop this match drawing before the caller opens another page: two live software-rendered matches at once starve each
  // other (the second one then never starts on a CI runner)
  await page.goto('about:blank');
  return first;
}

test('Data Saver On streams the lite file; Off streams the full file', async ({ page, browser }) => {
  test.skip(test.info().project.name !== 'desktop');
  test.setTimeout(240_000);
  expect(await musicRequestFor(page, 'on')).toMatch(/\/audio\/music\/lite\/pixabay_\d+\.mp3$/);
  const ctx = await browser.newContext(test.info().project.use as never);
  const second = await ctx.newPage();
  expect(await musicRequestFor(second, 'off')).toMatch(/\/audio\/music\/pixabay_\d+\.mp3$/);
  await ctx.close();
});

test("Auto follows the browser's own Data Saver (navigator.connection.saveData)", async ({
  page,
  browser,
}) => {
  test.skip(test.info().project.name !== 'desktop');
  test.setTimeout(240_000);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true }),
  );
  expect(await musicRequestFor(page, 'auto')).toMatch(/\/audio\/music\/lite\//);
  const ctx = await browser.newContext(test.info().project.use as never);
  const plain = await ctx.newPage();
  expect(await musicRequestFor(plain, 'auto')).toMatch(/\/audio\/music\/pixabay_\d+\.mp3$/);
  await ctx.close();
});

test('the setting defaults to Auto and survives a reload', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop');
  await open(page, '&noattract');
  await openSettings(page, 'audio');
  await expect(page.getByTestId('datasaver-auto')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('datasaver-on').click();
  await page.reload();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await openSettings(page, 'audio');
  await expect(page.getByTestId('datasaver-on')).toHaveAttribute('aria-pressed', 'true');
});
