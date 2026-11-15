/**
 * Generator Parts in a real browser (decisions PR1-PR8): Oshodi results show the Parts they paid and a "Ring weakened"
 * line, the map's Workshop shows the Parts and buys both upgrades, the purchase survives a reload, and the cleared
 * district's card shows its consequence (driven by the existing `oshodi.dispatchBroken` flag).
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { open } from './helpers';

type Campaign = {
  startNew(): void;
  storyDone(): void;
  finishMission(o: unknown): void;
  toMap(): void;
};
const outcome = (missionId: string, over: Record<string, unknown> = {}) => ({
  result: 'won',
  missionId,
  modifiers: [],
  seconds: 118,
  livesUsed: 0,
  phasesCleared: 3,
  defeat: null,
  stars: 2,
  creditedKills: 3,
  ...over,
});
const section = (id: string) => outcome('oshodi', { sectionMissionId: id, raidBonus: 0 });

async function finish(page: Page, o: unknown): Promise<void> {
  await page.evaluate((x) => {
    const c = (window as never as { __WAHALA__: { campaign(): Campaign } }).__WAHALA__.campaign();
    c.finishMission(x);
  }, o);
}

test('Oshodi pays Generator Parts, the Workshop spends them and the purchase is saved', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, '&noattract');
  await page.evaluate(() => {
    const c = (window as never as { __WAHALA__: { campaign(): Campaign } }).__WAHALA__.campaign();
    c.startNew();
    c.storyDone();
  });

  await finish(page, section('oshodi.approach'));
  await expect(page.getByTestId('menu-campaignResult')).toBeVisible();
  await expect(page.getByTestId('result-parts')).toHaveText('+4 Generator Parts');
  await expect(page.getByTestId('section-result')).toContainText('Ring weakened');
  await expect(page.getByTestId('section-opened')).toContainText('Rail Edge');

  await finish(page, section('oshodi.railEdge'));
  await expect(page.getByTestId('result-parts')).toHaveText('+4 Generator Parts');
  await finish(page, outcome('oshodi'));
  await expect(page.getByTestId('result-parts')).toContainText('+4 Generator Parts');
  await expect(page.getByTestId('result-unlocked-districts')).toContainText('Mushin');

  await page.evaluate(() =>
    (window as never as { __WAHALA__: { campaign(): Campaign } }).__WAHALA__.campaign().toMap(),
  );
  await page.getByTestId('map-node-oshodi').click();
  const shop = page.getByTestId('campaign-workshop');
  await expect(shop).toBeVisible();
  await expect(page.getByTestId('workshop-parts')).toHaveText('12');
  await expect(page.getByTestId('district-consequence')).toContainText('radio net goes quiet');
  for (const kind of ['capacity', 'range']) {
    const buy = page.getByTestId(`workshop-buy-${kind}`);
    const box = (await buy.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(43.5);
    await buy.click();
    await expect(page.getByTestId(`workshop-${kind}`)).toHaveAttribute('data-level', '1');
  }
  await expect(page.getByTestId('workshop-parts')).toHaveText('0');
  await expect(page.getByTestId('workshop-buy-capacity')).toBeDisabled();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('wahala.campaign.v1')!).upgrades as unknown),
  ).toEqual({ capacity: 1, range: 1 });

  await page.reload();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.getByTestId('home-campaign').click();
  await page.getByTestId('map-node-oshodi').click();
  await expect(page.getByTestId('workshop-capacity')).toHaveAttribute('data-level', '1');
  await expect(page.getByTestId('workshop-range')).toHaveAttribute('data-level', '1');
  // Mushin is outside the slice: no Workshop there
  await page.getByTestId('map-node-mushin').click();
  await expect(page.getByTestId('campaign-workshop')).toHaveCount(0);
  expect(errors).toEqual([]);
});
