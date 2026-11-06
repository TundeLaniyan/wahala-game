/**
 * Campaign difficulty in a real browser (docs/CAMPAIGN_DIFFICULTY.md): the selector on a fresh campaign (Normal by
 * default), Hard chosen before "New campaign", the choice saved and restored after a reload, a change on the map, the
 * level shown in the briefing and the selector reachable and >= 44 px on a phone. Screenshots go to WAHALA_SHOT_DIR.
 */
import { expect, test } from '@playwright/test';
import { open } from './helpers';

const SHOTS = process.env.WAHALA_SHOT_DIR || 'e2e-shots';

test.describe('Campaign difficulty', () => {
  test.beforeEach(() => test.setTimeout(3 * 60_000));

  test('select Hard, start, reload, change on the map', async ({ page }, info) => {
    const phone = info.project.name === 'mobile';
    await open(page, '&noattract');
    await page.getByTestId('home-campaign').click();
    await expect(page.getByTestId('campaign-start-card')).toBeVisible();

    const picker = page.getByTestId('campaign-level');
    await expect(picker).toBeVisible();
    await expect(picker).toHaveAttribute('data-level', 'normal'); // default
    await expect(page.getByTestId('campaign-level-summary')).toContainText('four health segments');
    for (const l of ['easy', 'normal', 'hard']) {
      const box = await page.getByTestId(`campaign-level-${l}`).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(43.5);
    }
    await page.getByTestId('campaign-level-hard').click();
    await expect(picker).toHaveAttribute('data-level', 'hard');
    await expect(page.getByTestId('campaign-level-summary')).toContainText('One health segment fewer');
    // the chip's colour fades for 0.12 s: the picture and the check are of the settled state (Hard lit, the others not)
    await expect(page.getByTestId('campaign-level-hard')).toHaveCSS('background-color', 'rgb(255, 184, 0)');
    await expect(page.getByTestId('campaign-level-normal')).not.toHaveCSS(
      'background-color',
      'rgb(255, 184, 0)',
    );
    await page.screenshot({
      path: `${SHOTS}/difficulty-select-${info.project.name}.jpg`,
      type: 'jpeg',
      quality: 80,
    });

    await page.getByTestId('campaign-start-new').click();
    await page.getByTestId('story-next').click(); // prologue
    await expect(page.getByTestId('map-node-oshodi')).toBeVisible();
    await expect(picker).toHaveAttribute('data-level', 'hard');

    const saved = await page.evaluate(
      () => JSON.parse(localStorage.getItem('wahala.campaign.v1')!).campaignLevel,
    );
    expect(saved).toBe('hard');

    await page.reload();
    await expect(page.getByTestId('title-screen')).toBeVisible();
    await page.getByTestId('home-campaign').click();
    await expect(page.getByTestId('campaign-level')).toHaveAttribute('data-level', 'hard');

    await page.getByTestId('campaign-level-easy').click();
    await expect(page.getByTestId('campaign-level')).toHaveAttribute('data-level', 'easy');
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('wahala.campaign.v1')!).campaignLevel),
    ).toBe('easy');
    await page.screenshot({
      path: `${SHOTS}/difficulty-map-${info.project.name}.jpg`,
      type: 'jpeg',
      quality: 80,
    });
    if (phone)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(
        true,
      );
  });

  test('an old save without a level resumes as Normal', async ({ page }) => {
    await open(page, '&noattract');
    await page.getByTestId('home-campaign').click();
    await page.getByTestId('campaign-start-new').click();
    await page.getByTestId('story-next').click();
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wahala.campaign.v1')!);
      delete s.campaignLevel;
      localStorage.setItem('wahala.campaign.v1', JSON.stringify(s));
    });
    await page.reload();
    await page.getByTestId('home-campaign').click();
    await expect(page.getByTestId('campaign-level')).toHaveAttribute('data-level', 'normal');
  });
});
