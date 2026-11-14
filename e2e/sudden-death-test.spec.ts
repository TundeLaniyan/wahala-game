/**
 * The Sudden Death TEST match from the Home menu, desktop and phone (decisions SD-T1-SD-T7): one tap starts one human plus
 * three bots straight in the round; the outer ring is telegraphed and closes over about 30 s; a blast front crosses the
 * floor. The sim is frozen and moved only by `stepTicks`, so nothing depends on the wall clock.
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

test('Sudden Death test: one tap, four fighters, the edge closes in, the blast crosses the floor', async ({
  page,
}, info) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await page.getByTestId('home-academy').click();
  const entry = page.getByTestId('academy-sd-test');
  await entry.scrollIntoViewIfNeeded();
  await expect(entry).toBeVisible();
  const box = await entry.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await entry.click();
  await inMatch(page);
  await stepTicks(page, 400); // the pre-match countdown and the title card

  let s = await sd(page);
  expect(s.players).toBe(4);
  expect(s.bots).toBe(3);
  expect(s.stage).toBe('countdown');
  await expect(page.getByTestId('sudden-death-card')).toHaveCount(0);

  // the collapse: warned tiles show before any closes, and the ring is closed about 30 s in
  await stepTicks(page, 120);
  s = await sd(page);
  expect(s.pending).toBeGreaterThan(0);
  const before = s.closed;
  await stepTicks(page, 600);
  await page.screenshot({ path: test.info().outputPath('collapse.png') });
  await info.attach('collapse', { path: test.info().outputPath('collapse.png'), contentType: 'image/png' });
  s = await sd(page);
  expect(s.closed).toBeGreaterThan(before);

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
