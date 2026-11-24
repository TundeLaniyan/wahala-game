/**
 * The local fighter's crowd silhouette in a real browser (decision PIV2): the silhouette twins of the fighter you control
 * exist in the scene when the quality rung allows them, are off on the Very Low rungs, follow the live quality switch
 * without a rebuild, and nothing throws. The pictures themselves are reviewed with scripts/crowd-silhouette-shots.mjs.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { open, startMatch, stepTicks } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

const crowd = (page: Page) =>
  page.evaluate(
    () => (window as any).__WAHALA__.renderer().debugCrowdSilhouette() as { built: number; shown: number },
  );

const setQuality = (page: Page, q: string) =>
  page.evaluate((v) => (window as any).__WAHALA__.renderer().setQuality(v), q);

test('crowd silhouette: built for the local fighter only, on from Low up, off on Very Low, live switch, no errors', async ({
  page,
}) => {
  test.setTimeout(600_000); // software WebGL on a busy shared machine
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await open(page, '&nobots');
  await startMatch(page, { game: 'rumble' });
  await stepTicks(page, 30);
  await page.evaluate(() => (window as any).__WAHALA__.advance(1)); // one routed tick: a frame draws with the twins

  // the local fighter's meshes each have one hidden-until-needed twin; a rival has none
  const on = await crowd(page);
  expect(on.built).toBeGreaterThan(0);
  expect(on.shown).toBe(on.built);
  const rivalTwins = await page.evaluate(() => {
    let n = 0;
    (window as any).__WAHALA__.renderer().scene.traverse((o: any) => o.name === 'crowdSilhouette' && n++);
    return n;
  });
  expect(rivalTwins).toBe(on.built); // exactly the local fighter's: no rival carries one

  // live: Very Low switches them off, Low brings them back, nothing is rebuilt
  await setQuality(page, 'veryLow');
  expect(await crowd(page)).toEqual({ built: on.built, shown: 0 });
  await setQuality(page, 'low');
  expect(await crowd(page)).toEqual(on);

  await stepTicks(page, 30);
  await page.evaluate(() => (window as any).__WAHALA__.advance(1));
  expect(errors).toEqual([]);
});
