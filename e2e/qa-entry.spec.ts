/**
 * The TEMPORARY founder QA entry (docs/QA_ENTRY.md, decision QA1) on a landscape phone: `?qaraid=recordsVault` adds one
 * Home button that starts the Records Vault night raid on its own; the campaign save in the browser is untouched by
 * starting, playing and leaving it; without the query the button is not there.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from '@playwright/test';
import { inMatch, open } from './helpers';

const SAVE_KEY = 'wahala.campaign.v1';

test('phone: ?qaraid=recordsVault starts the night raid from Home and never writes the campaign save', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'the founder tests on a phone: one run');
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await open(page, '&noattract');
  await expect(page.getByTestId('menu-home')).toBeVisible();
  await expect(page.getByTestId('home-qa-raid')).toHaveCount(0); // not without the query

  await open(page, '&noattract&qaraid=recordsVault');
  const before = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
  const button = page.getByTestId('home-qa-raid');
  await expect(button).toBeVisible();
  await expect(button).toContainText('Records Vault');
  await button.tap();
  await inMatch(page);
  const s = await page.evaluate(() => {
    const st = (window as any).__WAHALA__.getState();
    return { arena: st.arenaId, raid: st.raid?.raidId ?? null };
  });
  expect(s.arena).toBe('raidRecordsVault');
  expect(s.raid).toBe('recordsVault');

  // pause -> leave the raid: back out of the match, nothing saved
  await page.getByTestId('pause-button').tap(); // the phone's own pause button
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
  await expect(page.getByTestId('raid-retry')).toBeVisible(); // Restart is offered, as in any campaign raid
  await page.getByTestId('raid-leave').tap();
  if ((await page.getByTestId('exit-confirm-leave').count()) > 0)
    await page.getByTestId('exit-confirm-leave').click();
  await expect(page.getByTestId('hud')).toHaveCount(0, { timeout: 60_000 });
  expect(await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY)).toBe(before);
  expect(errors).toEqual([]);
});
