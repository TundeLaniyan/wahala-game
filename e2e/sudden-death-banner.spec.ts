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
  await open(page, '&nobots&sdhold'); // the sim is frozen and stepped by hand: the banner's own safety nets stay off
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
  await expect(page.getByTestId('sudden-death-status')).toContainText(/BLAST 1 OF 3 · SHIELDS RESPECTED/);
  expect(await clock.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  // the announcement is a rail card beside the board, never over the middle of the screen (decision SX2)
  const ann = (await clock.boundingBox())!;
  const vpp = page.viewportSize()!;
  expect(ann.x + ann.width / 2, 'not centred over the arena').toBeLessThan(vpp.width * 0.4);
  // the main timer IS the sim's blast countdown, labelled SUDDEN DEATH (decision SX1)
  await expect(page.getByTestId('timer')).toHaveText('1:00');
  await expect(page.getByTestId('timer-sudden-label')).toContainText('SUDDEN');
  await expect(page.getByTestId('timer-sudden-sub')).toHaveAttribute('data-sub', 'BLAST 1 OF 3');

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

  // 4. a few seconds of play later the announcement is gone; the countdown stays in the main timer
  const s = await sim(page);
  await step(page, s.announceFrom + 180 - s.tick);
  await expect(clock).toHaveCount(0);
  await expect(page.getByTestId('timer')).toHaveText(/^0:5\d$/);
  await expect(page.getByTestId('timer-sudden-sub')).toHaveAttribute('data-sub', 'BLAST 1 OF 3');
  await expect(page.getByTestId('sudden-death-ranking')).toHaveCount(0);

  // 5. the fighter answers with the countdown up: keys on desktop, the touch pad on a phone
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

test('Sudden Death: the card is not over the arena and the banner times out on its own when the clock stalls (SU1)', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, '&nobots&sdcap=20000'); // a long cap: the software renderer here is slow, the check is that it ends at all
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

  // the card sits in the rail beside the board: it does not cover the middle of the screen (where the fight is)
  const card = page.getByTestId('sudden-death-card');
  await expect(card).toBeVisible();
  // measured in one go: nothing waits between the card appearing and its box being read
  const { box, vp } = await page.evaluate(() => {
    const r = document.querySelector('[data-testid="sudden-death-card"]')!.getBoundingClientRect();
    return {
      box: { x: r.x, y: r.y, width: r.width, height: r.height },
      vp: { width: window.innerWidth, height: window.innerHeight },
    };
  });
  const centre = { x: vp.width / 2, y: vp.height / 2 };
  expect(
    box.x <= centre.x && centre.x <= box.x + box.width && box.y <= centre.y && centre.y <= box.y + box.height,
    'the card is not over the arena centre',
  ).toBe(false);
  expect(box.width, 'a compact card').toBeLessThan(vp.width * 0.4);

  // the simulation clock stalls (nothing steps it): the card still goes on its own, within a few seconds
  expect((await sim(page)).stage).toBe('transition');
  await expect(card).toHaveCount(0, { timeout: 60_000 });
  expect((await sim(page)).stage, 'the sim is still holding input: only the banner went').toBe('transition');

  // the same for the blast announcement: it is gone although no tick arrives
  const end = await page.evaluate(
    () => (window as any).__WAHALA__.getState().match.suddenDeath.transitionEndTick,
  );
  await step(page, end - (await sim(page)).tick + 1);
  const clock = page.getByTestId('sudden-death-clock');
  await expect(clock).toBeVisible();
  await expect(clock).toHaveCount(0, { timeout: 60_000 });
  expect(errors).toEqual([]);
});
