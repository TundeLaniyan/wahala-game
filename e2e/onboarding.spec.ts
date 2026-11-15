/**
 * First-visit onboarding (decisions OB1-OB5): the static startup display is in the served page, a first visit is offered
 * START TUTORIAL / SKIP TO MENU over Home, the choice is remembered (a returning player lands on Home), START TUTORIAL
 * opens the Academy's first lesson, and Learn to Play stays on Home. `?onboarding` forces the card under automation.
 */
import { expect, test } from '@playwright/test';
import { open } from './helpers';

test('the startup display is in the served page before any script runs', async ({ request }) => {
  const html = await (await request.get('./')).text();
  expect(html).toContain('id="boot-splash"');
  expect(html).toContain('WAHALA!');
});

test('first visit: skip to menu, remembered on the next visit', async ({ page }) => {
  await open(page, '&onboarding');
  const card = page.getByTestId('first-visit');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('boot-splash')).toHaveCount(0);
  await expect(page.getByTestId('first-visit-tutorial')).toBeVisible();
  await expect(page.getByTestId('first-visit-runtime')).toBeVisible();
  // both choices are full-size tap targets
  for (const id of ['first-visit-tutorial', 'first-visit-skip']) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByTestId('first-visit-skip').click();
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId('home-academy')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('wahala.onboarding.v1'))).toBe('skipped');

  // returning player: straight to Home even when the card is forced
  await open(page, '&onboarding');
  await expect(page.getByTestId('home-academy')).toBeVisible();
  await expect(page.getByTestId('first-visit')).toHaveCount(0);
});

test('first visit: START TUTORIAL opens the first Academy lesson', async ({ page }) => {
  await open(page, '&onboarding');
  await page.getByTestId('first-visit-tutorial').click();
  await expect(page.getByTestId('how-to-play')).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => localStorage.getItem('wahala.onboarding.v1'))).toBe('tutorial');
});

test('automation without the flag starts on Home as before', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('home-academy')).toBeVisible();
  await expect(page.getByTestId('first-visit')).toHaveCount(0);
});
