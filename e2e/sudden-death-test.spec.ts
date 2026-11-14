/**
 * The Sudden Death TEST match from the City Rumble mode screen, desktop and phone (decisions SD-T1-SD-T7, SD-U1-SD-U7): the
 * "Test" button is visible without scrolling; one tap starts one human plus two bots on the Ojuelegba Rumble stage straight
 * in the round; the whole stage is telegraphed and closes over about 30 s; a blast front crosses the open floor. The sim is
 * frozen and moved only by `stepTicks`, so nothing depends on the wall clock.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { inMatch, open, stepTicks } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

const sd = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__WAHALA__.getState();
    const d = s.match.suddenDeath;
    return {
      tick: s.tick,
      arena: s.arenaId,
      cameraView: (window as any).__WAHALA__.store.getState().settings.cameraView,
      players: s.players.length,
      bots: s.players.filter((p: any) => p.isBot).length,
      stage: d?.stage ?? null,
      transitionEnd: d?.transitionEndTick ?? 0,
      nextBlast: d?.nextBlastTick ?? 0,
      closed: s.tiles.filter((t: number) => t === 1).length,
      pending: s.crush?.pending.length ?? 0,
      front: d?.front ?? null,
      result: s.match.result,
    };
  });

test('Sudden Death test: visible on the mode screen, one tap, three fighters, the stage closes in, the blast crosses the floor', async ({
  page,
}, info) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await page.getByTestId('home-rumble').click();
  const entry = page.getByTestId('mode-sd-test');
  await expect(entry).toBeVisible();
  await expect(entry).toContainText('Test');
  await expect(entry).toContainText('Sudden Death Test');
  // on screen without scrolling, a finger-sized target
  const box = (await entry.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 0.5);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5);
  await page.screenshot({ path: test.info().outputPath('entry.png') });
  await info.attach('entry', { path: test.info().outputPath('entry.png'), contentType: 'image/png' });
  await entry.click();
  await inMatch(page);
  await stepTicks(page, 400); // the pre-match countdown and the title card

  let s = await sd(page);
  expect(s.players).toBe(3);
  expect(s.bots).toBe(2);
  expect(s.arena).toBe('rumbleOjuelegba');
  expect(s.stage).toBe('countdown');
  expect(s.cameraView).toBe('overview'); // the whole stage is in frame
  await expect(page.getByTestId('sudden-death-card')).toHaveCount(0);

  // the collapse: warned tiles show before any closes, and the stage is closed about 30 s in
  await stepTicks(page, 120);
  s = await sd(page);
  expect(s.pending).toBeGreaterThan(0);
  const before = s.closed;
  await stepTicks(page, 600);
  await page.screenshot({ path: test.info().outputPath('collapse.png') });
  await info.attach('collapse', { path: test.info().outputPath('collapse.png'), contentType: 'image/png' });
  s = await sd(page);
  expect(s.closed).toBeGreaterThan(before + 100);

  // the blast: the front travels, the report waits for it
  await page.evaluate(() => {
    const st = (window as any).__WAHALA__.getState();
    st.match.suddenDeath.nextBlastTick = st.tick + 3;
  });
  await stepTicks(page, 56);
  s = await sd(page);
  expect(s.front).not.toBeNull();
  await page.screenshot({ path: test.info().outputPath('front.png') });
  await info.attach('front', { path: test.info().outputPath('front.png'), contentType: 'image/png' });
  await stepTicks(page, 200);
  expect(errors).toEqual([]);
});

test('Sudden Death test: leaving it puts the saved camera view back and writes nothing', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page, '&nobots&noattract');
  const saved = await page.evaluate(() => localStorage.getItem('wahala.settings.v1'));
  await page.getByTestId('home-rumble').click();
  await page.getByTestId('mode-sd-test').click();
  await inMatch(page);
  expect(await page.evaluate(() => (window as any).__WAHALA__.store.getState().settings.cameraView)).toBe(
    'overview',
  );
  // the whole-stage view is never saved: whatever the start itself stored still has the player's own camera
  const stored = await page.evaluate(() => localStorage.getItem('wahala.settings.v1'));
  expect(JSON.parse(stored ?? '{}').cameraView ?? 'action').toBe(
    JSON.parse(saved ?? '{}').cameraView ?? 'action',
  );
  await stepTicks(page, 400); // past the countdown and the title card, where Escape opens the pause menu
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
  await page.getByTestId('quit').click();
  await expect(page.getByTestId('menu-home')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__WAHALA__.store.getState().settings.cameraView)).toBe(
    JSON.parse(saved ?? '{}').cameraView ?? 'action',
  );
});
