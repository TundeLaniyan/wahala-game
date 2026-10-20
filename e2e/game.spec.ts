import { expect, test } from '@playwright/test';
import { getState, holdKey, mutate, open, startMatch, stepTicks } from './helpers';

test.describe('menus and match flow', () => {
  test('title screen starts a match with countdown, HUD and a rendered arena', async ({ page }, info) => {
    await open(page, '&nobots');
    await page.screenshot({ path: `e2e-shots/${info.project.name}-title.png` });
    await startMatch(page, { competitors: 3, waitPlaying: false });
    await expect(page.getByTestId('countdown')).toBeVisible();
    await stepTicks(page, 170);
    await expect(page.getByTestId('hud')).toHaveAttribute('data-phase', 'playing');
    await expect(page.getByTestId('portrait-2')).toBeVisible();
    await expect(page.getByTestId('timer')).toHaveText('2:00');
    // the arena is really drawn: a flat clear colour compresses to almost nothing
    const shot = await page.getByTestId('game-canvas').screenshot();
    expect(shot.length).toBeGreaterThan(60_000);
    await page.screenshot({ path: `e2e-shots/${info.project.name}-arena.png` });
  });

  test('pause and resume, then quit back to the title', async ({ page }) => {
    await open(page, '&nobots');
    await startMatch(page);
    await page.keyboard.press('p');
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    const before = (await getState(page)).tick;
    await page.waitForTimeout(300);
    expect((await getState(page)).tick).toBe(before);
    await page.getByTestId('resume').click();
    await expect(page.getByTestId('pause-overlay')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    await page.getByTestId('quit').click();
    await expect(page.getByTestId('title-screen')).toBeVisible();
  });
});

test.describe('keyboard play', () => {
  test('moves one tile at a time, places a generator, escapes and sees the plus-shaped blast', async ({
    page,
  }, info) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 2 });
    const start = (await getState(page)).players[0]!;
    await holdKey(page, 'ArrowUp', 3);
    const moved = (await getState(page)).players[0]!;
    expect(moved.y).toBe(start.y - 1); // exactly one tile, no diagonal drift
    expect(moved.x).toBe(start.x);

    await page.keyboard.press('Space');
    await stepTicks(page, 2);
    let st = await getState(page);
    expect(st.generators).toHaveLength(1);
    const gen = st.generators[0]!;
    // step off the generator tile and out of its lane
    await holdKey(page, 'ArrowDown', 12);
    await holdKey(page, 'ArrowRight', 12);
    const escaped = (await getState(page)).players[0]!;
    expect(escaped.x).toBeGreaterThanOrEqual(1);
    // go back to the lane and try to re-enter the generator tile: blocked
    await holdKey(page, 'ArrowLeft', 15);
    await holdKey(page, 'ArrowUp', 30);
    const afterBack = (await getState(page)).players[0]!;
    expect(afterBack.x === gen.x && afterBack.y === gen.y).toBe(false);
    await holdKey(page, 'ArrowRight', 15);
    st = await getState(page);
    await stepTicks(page, st.generators[0]!.timer + 3);
    st = await getState(page);
    expect(st.generators).toHaveLength(0);
    expect(st.flames).toBeGreaterThan(0);
    await page.screenshot({ path: `e2e-shots/${info.project.name}-blast.png` });
  });

  test('an own generator can eliminate the owner, shows the spectator banner, and results appear', async ({
    page,
  }, info) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 3 });
    await page.keyboard.press('Space');
    await stepTicks(page, 200);
    const st = await getState(page);
    expect(st.players[0]!.alive).toBe(false);
    await expect(page.getByTestId('spectate')).toBeVisible();
    await page.screenshot({ path: `e2e-shots/${info.project.name}-spectate.png` });
    await page.getByTestId('skip-results').click();
    await expect(page.getByTestId('results')).toBeVisible();
    await expect(page.getByTestId('result-title')).toHaveText(/DRAW!|ELIMINATED|YOU WIN!/);
    await page.screenshot({ path: `e2e-shots/${info.project.name}-results.png` });
    await page.getByTestId('rematch').click();
    await expect(page.getByTestId('countdown')).toBeVisible();
    expect((await getState(page)).tick).toBeLessThan(5);
  });

  test('final two eliminated by one blast produce a draw screen', async ({ page }) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 2 });
    await mutate(page, `s.players[1].x = s.players[0].x; s.players[1].y = s.players[0].y;`);
    await page.keyboard.press('Space');
    await stepTicks(page, 200);
    const st = await getState(page);
    expect(st.result).toEqual({ kind: 'draw', reason: 'simultaneous' });
    await expect(page.getByTestId('results')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('result-title')).toHaveText('DRAW!');
  });

  test('picking up an item, riding an Okada and losing it to a blast', async ({ page }, info) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 2 });
    // drop an Okada one tile above the player, collect it
    await mutate(
      page,
      `const p = s.players[0]; s.pickups.push({ id: 900, x: p.x, y: p.y - 1, kind: 'okada', safeEventId: null });`,
    );
    await holdKey(page, 'ArrowUp', 3);
    expect((await getState(page)).players[0]!.mounted).toBe(true);
    await expect(page.getByTestId('inventory')).toContainText('SHIELD');
    await page.screenshot({ path: `e2e-shots/${info.project.name}-okada.png` });
    // standing on own generator when it blows: Okada absorbs, rider lives, and is on foot
    await page.keyboard.press('Space');
    await stepTicks(page, 200);
    const st = await getState(page);
    expect(st.players[0]!.alive).toBe(true);
    expect(st.players[0]!.mounted).toBe(false);
  });
});

test.describe('signature vehicles', () => {
  for (const [character, vehicle] of [
    ['streetBaller', 'danfo'],
    ['lekkiBoy', 'taxi'],
    ['campusQueen', 'keke'],
  ] as const) {
    test(`${vehicle}: voucher, border entry selection by keyboard, warning, and the vehicle drives in`, async ({
      page,
    }, info) => {
      await open(page, '&nobots');
      await startMatch(page, { competitors: 2, character });
      await mutate(
        page,
        `s.players[0].hasVoucher = true; s.players[0].x = 6; s.players[0].y = 5; s.players[0].stepFromX = 6; s.players[0].stepFromY = 5;`,
      );
      await stepTicks(page, 2);
      await page.keyboard.press('v');
      await stepTicks(page, 2);
      await expect(page.getByTestId('entry-panel')).toBeVisible();
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowRight');
      await stepTicks(page, 2);
      await page.screenshot({ path: `e2e-shots/${info.project.name}-entry-${vehicle}.png` });
      await page.keyboard.press('Enter');
      if (vehicle === 'keke') {
        await expect(page.getByTestId('entry-panel')).toHaveAttribute('data-stage', 'turn');
        await stepTicks(page, 2);
        await page.screenshot({ path: `e2e-shots/${info.project.name}-entry-keke-turn.png` });
        await page.keyboard.press('Enter');
      }
      await stepTicks(page, 3);
      let st = await getState(page);
      expect(st.vehicles).toHaveLength(1);
      expect(st.vehicles[0]!.kind).toBe(vehicle);
      expect(st.vehicles[0]!.phase).toBe('warning');
      expect(st.players[0]!.hasVoucher).toBe(false);
      await stepTicks(page, 120);
      st = await getState(page);
      expect(st.vehicles.length === 0 || st.vehicles[0]!.phase !== 'warning').toBe(true);
      await page.screenshot({ path: `e2e-shots/${info.project.name}-vehicle-${vehicle}.png` });
    });
  }

  test('entry mode can be cancelled with Escape and times out on its own', async ({ page }) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 2 });
    await mutate(page, `s.players[0].hasVoucher = true;`);
    await page.keyboard.press('v');
    await stepTicks(page, 2);
    await expect(page.getByTestId('entry-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await stepTicks(page, 2);
    await expect(page.getByTestId('entry-panel')).toBeHidden();
    expect((await getState(page)).players[0]!.hasVoucher).toBe(true);
    await page.keyboard.press('v');
    await stepTicks(page, 500);
    await expect(page.getByTestId('entry-panel')).toBeHidden();
    expect((await getState(page)).players[0]!.hasVoucher).toBe(true);
  });

  test('a mouse click on a border arrow selects the entrance and a second click launches', async ({
    page,
  }) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 2 });
    await mutate(page, `s.players[0].hasVoucher = true;`);
    await page.keyboard.press('v');
    await stepTicks(page, 2);
    await page.getByTestId('entry-confirm').click();
    await stepTicks(page, 3);
    expect((await getState(page)).vehicles).toHaveLength(1);
  });
});
