/**
 * View clear in a real City Rumble match (decision VF-B): at phone size, on Auto quality (which a phone often runs
 * on its lowest rungs), scenery that stands between the follow camera and the fighter - or the floor around it -
 * dissolves, and goes solid again once the fighter steps out from behind it. Time is driven with stepTicks; the
 * fade state is read from the debug handle (`__WAHALA__.viewClear()`), never from pixels.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { inMatch, stepTicks } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const status = (page: Page) =>
  page.evaluate(
    () =>
      (window as any).__WAHALA__.viewClear() as {
        stride: number;
        groups: number;
        tiles: number;
        points: number;
        fading: number;
      },
  );

async function place(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ([px, py]) => {
      const w = (window as any).__WAHALA__;
      const p = w.getState().players[0];
      p.x = p.stepFromX = px;
      p.y = p.stepFromY = py;
      p.stepRemaining = 0;
      w.renderer().cutCamera();
    },
    [x, y],
  );
}

for (const [name, width, height] of [
  ['phone landscape', 844, 390],
  ['phone portrait', 390, 844],
] as const) {
  test(`Lekki: a building over the fighter fades on Auto quality at ${name}, and is solid again in the open`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'mobile', 'the viewport is set here; one project is enough');
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => {
      const key = 'wahala.settings.v1';
      const s = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(
        key,
        JSON.stringify({
          ...s,
          play: 'rumble',
          rumbleArenaId: 'rumbleLekki',
          rumbleCompetitors: 8,
          rumbleMode: 'deathmatch',
        }),
      );
    });
    await page.goto('./?debug&noattract&nobots&seed=7'); // no ?q=: Auto, as a phone runs it
    await page.getByTestId('title-screen').waitFor();
    await page.getByTestId('quick-play').click();
    await inMatch(page);
    await stepTicks(page, 400);
    await page.evaluate(() => {
      for (const p of (window as any).__WAHALA__.getState().players) p.protectedUntil = 1e9;
    });

    // Auto on the software renderer of the test browser sits on a low rung; the fade must be on there too
    const q = await page.evaluate(() => (window as any).__WAHALA__.quality());
    expect(q.auto).toBe(true);
    expect(q.rung).toBeLessThanOrEqual(2);
    expect((await status(page)).stride).toBeGreaterThanOrEqual(1);

    // a lane north of a big roof: nothing between the camera and the fighter at (14, 26)
    await place(page, 14, 26);
    await expect.poll(async () => (await status(page)).tiles, { timeout: 30_000 }).toBe(0);

    // under the roof of the Ikate block: the camera looks straight over it at the fighter
    await place(page, 26, 34);
    await expect.poll(async () => (await status(page)).tiles, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect.poll(async () => (await status(page)).fading, { timeout: 30_000 }).toBeGreaterThan(0);

    // step out into the open: the dissolve is released
    await place(page, 14, 26);
    await expect.poll(async () => (await status(page)).tiles, { timeout: 30_000 }).toBe(0);
  });
}
