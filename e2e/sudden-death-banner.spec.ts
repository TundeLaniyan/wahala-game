/**
 * The SUDDEN DEATH banner lifecycle in a real browser, desktop and phone (decisions SD-B1-SD-B4,
 * docs/integrated-release/task1-sudden-death.md). In City Rumble the HUD rail hangs top-centre over the arena, and the
 * blast clock used to show its whole announcement there (title, status, your shield, the ranking) for the entire round.
 * Now:
 *  - the title card is up only while the simulation holds input, and never takes a touch;
 *  - when the countdown begins the clock shows the full announcement for a few seconds of game time, then folds into a
 *    one-line chip that keeps the blast number and the countdown (pause holds it; resume carries on);
 *  - with the chip up the fighter moves and the touch controls answer.
 * The sim is frozen and moved only by `stepTicks` / `advance`, so nothing depends on the wall clock.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mutate, open, startMatch, stepTicks, toRumbleSetup } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Steps `n` ticks, then one fully routed tick so the HUD publishes what the sim now holds. */
async function step(page: Page, n: number): Promise<void> {
  if (n > 0) await stepTicks(page, n);
  await page.evaluate(() => (window as any).__WAHALA__.advance(1));
}

const sim = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__WAHALA__.getState();
    return {
      tick: s.tick,
      stage: s.match.suddenDeath?.stage ?? null,
      x: s.players[0].x,
      y: s.players[0].y,
      announceFrom: Math.max(
        s.match.suddenDeath?.transitionEndTick ?? 0,
        s.match.suddenDeath?.lastBlastTick ?? 0,
      ),
    };
  });

test('Sudden Death: the card goes when play resumes, the clock announces then folds out of the way', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(600_000); // software WebGL on a busy shared machine
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, '&nobots');
  await toRumbleSetup(page, 'survival');
  await page.getByTestId('rumble-8').click();
  await startMatch(page, { game: 'rumble' });
  await mutate(
    page,
    `s.crush = null;
     s.endgameTraps = { waves: [], liveAt: [], warned: 0, live: 0, warnings: [] };
     s.players.forEach((p, i) => { if (i > 1) { p.alive = false; p.eliminatedTick = s.tick; p.elimination = { kind: 'crush', eventId: 0 }; } });
     s.players[0].stats.kills = 2; s.players[1].stats.kills = 2;
     s.players[0].protectedUntil = 0; s.players[1].protectedUntil = 0;
     s.match.playTicks = s.config.match.durationTicks - 2;`,
  );
  await step(page, 4);

  // 1. the title card, while the sim holds input: it never takes a touch
  const card = page.getByTestId('sudden-death-card');
  await expect(card).toBeVisible();
  expect(await card.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  expect((await sim(page)).stage).toBe('transition');

  // 2. the first tick of play: the card is gone and the clock announces the round in full
  const end = await page.evaluate(
    () => (window as any).__WAHALA__.getState().match.suddenDeath.transitionEndTick,
  );
  const now = (await sim(page)).tick;
  await step(page, end - now - 1);
  expect((await sim(page)).stage).toBe('countdown');
  await expect(card).toHaveCount(0);
  const clock = page.getByTestId('sudden-death-clock');
  await expect(clock).toHaveAttribute('data-mode', 'full');
  await expect(page.getByTestId('sudden-death-status')).toContainText(
    /BLAST 1 OF 3 · SHIELDS RESPECTED · 1:00/,
  );
  expect(await clock.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');

  // 3. pause holds the announcement exactly as it is; resume carries on
  await page.getByTestId('pause-button').click();
  await expect(page.getByTestId('resume')).toBeVisible();
  const paused = await sim(page);
  await page.waitForTimeout(600);
  expect((await sim(page)).tick).toBe(paused.tick);
  await expect(clock).toHaveAttribute('data-mode', 'full');
  await page.getByTestId('resume').click();
  await expect(page.getByTestId('resume')).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).__WAHALA__.controller().frozen = true;
  });

  // 4. a few seconds of play later it is a one-line chip: blast and countdown kept, nothing over the fight
  const s = await sim(page);
  await step(page, s.announceFrom + 180 - s.tick);
  await expect(clock).toHaveAttribute('data-mode', 'compact');
  await expect(page.getByTestId('sudden-death-status')).toContainText(/BLAST 1 OF 3 · 0:5\d/);
  await expect(page.getByTestId('sudden-death-ranking')).toHaveCount(0);
  const box = (await clock.boundingBox())!;
  expect(box.height, 'one short line').toBeLessThanOrEqual(32);
  const vp = page.viewportSize()!;
  expect(box.width, 'not a wide panel across the arena').toBeLessThan(vp.width * 0.45);
  // a tap where the chip is reaches the game, not the chip
  const hit = await page.evaluate(
    ([x, y]) =>
      (document.elementFromPoint(x!, y!) as HTMLElement | null)?.closest(
        '[data-testid="sudden-death-clock"]',
      ) !== null,
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  expect(hit).toBe(false);

  // 5. the fighter answers with the chip up: keys on desktop, the touch pad on a phone
  const before = await sim(page);
  if (isMobile) {
    const zone = (await page.getByTestId('stick-zone').boundingBox())!;
    const x = zone.x + zone.width * 0.4;
    const y = zone.y + zone.height * 0.65;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (const dx of [-46, 46, 0]) {
      await page.mouse.move(x + dx, y, { steps: 4 });
      await stepTicks(page, 24);
    }
    await page.mouse.up();
    await expect(page.getByTestId('btn-special')).toBeVisible();
    await expect(page.getByTestId('btn-place')).toBeVisible();
  } else {
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      await page.keyboard.down(key);
      await stepTicks(page, 24);
      await page.keyboard.up(key);
    }
  }
  await step(page, 1);
  const after = await sim(page);
  expect(after.x !== before.x || after.y !== before.y, 'the fighter moved with the chip up').toBe(true);
  expect(errors).toEqual([]);
});
