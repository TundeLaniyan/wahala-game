/**
 * Rumble sudden death in a real browser (decision SD1): a tie at time up shows the SUDDEN DEATH card with the
 * contenders and their kill totals, the blast clock runs beside the board, and the final blast leads to a
 * visible result that says how it was decided.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { getState, mutate, open, startMatch, stepTicks, toRumbleSetup } from './helpers';

/** Steps `n` ticks, then one fully routed tick so the HUD (and the renderer) publish what the sim now holds. */
async function step(page: Page, n: number): Promise<void> {
  await stepTicks(page, n);
  await page.evaluate(() =>
    (window as unknown as { __WAHALA__: { advance(n: number): void } }).__WAHALA__.advance(1),
  );
}

const shot = (page: Page, project: string, name: string) =>
  page.screenshot({ path: `e2e-shots/${project}-${name}.png` });

test.describe('City Rumble: sudden death', () => {
  test('a tied timeout shows the title card, the blast clock and a decided result', async ({
    page,
  }, info) => {
    test.setTimeout(600_000); // software WebGL on a busy shared machine
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, '&nobots');
    await toRumbleSetup(page, 'survival');
    await page.getByTestId('rumble-8').click();
    await startMatch(page, { game: 'rumble' });

    // a controlled finish: nobody else is left, the closing city is off, two fighters tied on 2 eliminations
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

    // the transition screen: title, both contenders and their kill totals
    await expect(page.getByTestId('sudden-death-card')).toBeVisible();
    await expect(page.getByTestId('sudden-death-title')).toHaveText('SUDDEN DEATH');
    const rows = page.getByTestId('sudden-death-contender');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('2 eliminations');
    await expect(rows.nth(1)).toContainText('2 eliminations');
    expect((await getState(page)).phase).toBe('playing');
    await shot(page, info.project.name, 'sudden-death-card');

    // the title card gives way to the countdown with the blast clock in the HUD rail
    await step(page, 260);
    await expect(page.getByTestId('sudden-death-card')).toHaveCount(0);
    await expect(page.getByTestId('sudden-death-clock')).toBeVisible();
    await expect(page.getByTestId('sudden-death-clock')).toContainText('Blast 1/3');
    await shot(page, info.project.name, 'sudden-death-clock');

    // the rival carries an Armour plate; the local fighter does not: the blast decides it
    await mutate(page, `s.players[1].armour = 1;`);
    await step(page, 60 * 60 + 5);
    expect((await getState(page)).phase).toBe('ended');
    await expect(page.getByTestId('results')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('result-title')).toHaveText('ELIMINATED');
    await expect(page.getByTestId('result-detail')).toContainText('sudden death');
    await shot(page, info.project.name, 'sudden-death-result');
    expect(errors).toEqual([]);
  });

  test('a genuinely exhausted sequence ends in a draw that says so', async ({ page }) => {
    test.setTimeout(600_000);
    await open(page, '&nobots');
    await toRumbleSetup(page, 'survival');
    await page.getByTestId('rumble-8').click();
    await startMatch(page, { game: 'rumble' });
    await mutate(
      page,
      `s.crush = null;
       s.endgameTraps = { waves: [], liveAt: [], warned: 0, live: 0, warnings: [] };
       s.players.forEach((p, i) => { if (i > 1) { p.alive = false; p.eliminatedTick = s.tick; p.elimination = { kind: 'crush', eventId: 0 }; } });
       s.players[0].armour = 9; s.players[1].armour = 9;
       s.players[0].protectedUntil = 0; s.players[1].protectedUntil = 0;
       s.match.playTicks = s.config.match.durationTicks - 2;`,
    );
    await step(page, 4 + 260);
    await expect(page.getByTestId('sudden-death-clock')).toBeVisible();
    await step(page, 60 * (60 + 30 + 15) + 10);
    expect((await getState(page)).result).toEqual({ kind: 'draw', reason: 'suddenDeathExhausted' });
    await expect(page.getByTestId('results')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('result-title')).toHaveText('DRAW!');
    await expect(page.getByTestId('result-detail')).toContainText('Sudden death');
  });
});
