/**
 * Checkpoint clarity in a real browser (docs/CHECKPOINT_CLARITY.md): Oshodi Terminal Approach started through the real
 * campaign controller. The human is staged on checkpoint A (debug state, then `stepTicks`), the HUD must say it was
 * reached and name the next checkpoint at once; then on the depot door the hold bar must fill ("HOLD x / 1.0 s") and
 * the warehouse raid must start. The sim is frozen while staging so only `stepTicks` moves it (no real-time drift).
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { open, inMatch } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
async function stage(page: Page, x: number, y: number, ticks: number): Promise<void> {
  await page.evaluate(
    ({ x, y, ticks }) => {
      const w = (window as any).__WAHALA__;
      const s = w.getState();
      const p = s.players[0];
      p.x = p.stepFromX = x;
      p.y = p.stepFromY = y;
      p.stepRemaining = 0;
      p.protectedUntil = s.tick + 100000; // staging only: the wardens must not end the run
      w.stepTicks(ticks);
    },
    { x, y, ticks },
  );
}

const markers = (page: Page) => page.evaluate(() => (window as any).__WAHALA__.missionMarkers());

test('Oshodi approach: the current checkpoint is marked, reaching it says so at once, the door hold fills and starts the raid', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, '&noattract');
  await page.evaluate(() => {
    const c = (window as any).__WAHALA__.campaign();
    c.load();
    c.startNew();
    c.storyDone();
    if (!c.startSectionMission('oshodi.approach')) throw new Error('mission did not start');
  });
  await inMatch(page);
  await page.evaluate(() => {
    const w = (window as any).__WAHALA__;
    w.controller().frozen = true;
    const s = w.getState();
    while (s.match.phase !== 'playing') w.stepTicks(10);
    w.stepTicks(2);
  });

  // the objective block: GO TO CHECKPOINT A, 1 OF 3, in the right column (never over the board's centre)
  const goal = page.getByTestId('field-goal');
  await expect(goal).toBeVisible();
  await expect(goal).toHaveAttribute('data-verb', 'goTo');
  await expect(page.getByTestId('field-goal-target')).toHaveText('CHECKPOINT A');
  await expect(page.getByTestId('field-goal-step')).toHaveText('1 OF 3');
  const vp = page.viewportSize()!;
  const box = (await goal.boundingBox())!;
  expect(box.x, 'the objective block sits in the right column').toBeGreaterThan(vp.width * 0.55);
  expect(box.y + box.height, 'never over the bottom row').toBeLessThan(vp.height * 0.8);
  // the world: one current beacon, two later ones; no door pad yet
  await expect.poll(async () => (await markers(page))?.beaconsLive).toBe(1);
  expect(await markers(page)).toMatchObject({ beacons: 3, beaconsLocked: 2, holds: 0 });

  // checkpoint A: walked through, the notice and the next objective at once
  await stage(page, 9, 39, 2);
  await expect(page.getByTestId('toast').filter({ hasText: 'CHECKPOINT A ✓' })).toContainText(
    'NEXT: CHECKPOINT B',
  );
  await expect(page.getByTestId('field-goal-target')).toHaveText('CHECKPOINT B');
  await expect(page.getByTestId('field-goal-step')).toHaveText('2 OF 3');
  await expect.poll(async () => (await markers(page))?.beaconsDone).toBe(1);
  const compass = page.getByTestId('mission-compass');
  if ((await compass.getAttribute('data-shown')) === 'yes')
    await expect(compass).toHaveAttribute('data-target', 'mk1');

  // B and C, then the door: HOLD, the bar fills while standing on it
  await stage(page, 19, 39, 1);
  await stage(page, 26, 40, 1);
  await expect(page.getByTestId('field-goal')).toHaveAttribute('data-verb', 'hold');
  await expect(page.getByTestId('field-goal-target')).toHaveText('DISPATCH DEPOT DOOR');
  await expect(page.getByTestId('field-hold')).toHaveAttribute('data-state', 'idle');
  await expect.poll(async () => (await markers(page))?.holds).toBe(1);
  await stage(page, 25, 44, 24);
  const hold = page.getByTestId('field-hold');
  await expect(hold).toHaveAttribute('data-state', 'filling');
  await expect(page.getByTestId('field-hold-label')).toHaveText('HOLD 0.4 / 1.0 s');
  const holdBox = (await hold.boundingBox())!;
  expect(holdBox.x).toBeGreaterThan(vp.width * 0.55);
  // a step off drains it
  await stage(page, 25, 43, 6);
  await expect(hold).toHaveAttribute('data-state', 'draining');
  await expect(page.getByTestId('field-hold-label')).toHaveText('HOLD 0.2 / 1.0 s');
  // back on for the full second: the raid request goes up and the app starts the warehouse raid
  await stage(page, 25, 44, 62);
  // the raid is built behind the loading screen now (docs/MATCH_LOADING.md), so the wait covers a whole start
  await expect
    .poll(() => page.evaluate(() => !!(window as any).__WAHALA__.getState()?.raid), { timeout: 120_000 })
    .toBe(true);
  await expect(page.getByTestId('match-loading')).toHaveCount(0, { timeout: 30_000 });
  expect(errors).toEqual([]);
});
