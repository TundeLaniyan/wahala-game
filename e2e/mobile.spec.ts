import { expect, test } from '@playwright/test';
import { getState, mutate, open, startMatch, stepTicks, thumb } from './helpers';

test.describe('touch controls (landscape phone)', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile project only');

  test('shows contextual on-screen controls, moves with the floating thumbstick and places a generator', async ({
    page,
  }, info) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 2 });
    await expect(page.getByTestId('stick-zone')).toBeVisible();
    await expect(page.getByTestId('btn-place')).toBeVisible();
    await expect(page.getByTestId('btn-action')).toBeHidden(); // only offered when usable
    await expect(page.getByTestId('btn-vehicle')).toBeHidden();
    await page.screenshot({ path: `e2e-shots/${info.project.name}-touch-hud.png` });

    const start = (await getState(page)).players[0]!;
    await thumb(page, 'up', 3);
    const after = (await getState(page)).players[0]!;
    expect(after.y).toBe(start.y - 1);

    await page.getByTestId('btn-place').dispatchEvent('pointerdown');
    await stepTicks(page, 2);
    expect((await getState(page)).generators).toHaveLength(1);
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            (
              window as never as { __WAHALA__: { store: { getState(): { device: string } } } }
            ).__WAHALA__.store.getState().device,
        ),
      )
      .toBe('touch');
  });

  test('a 6-tick thumb flick moves exactly one tile, from anywhere in the zone, and a lifted thumb leaves nothing queued', async ({
    page,
  }) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 2 });
    const start = (await getState(page)).players[0]!;
    // two flicks landing in different places of the activation zone
    await thumb(page, 'up', 6, { at: [0.2, 0.85], settle: 60 });
    await thumb(page, 'up', 6, { at: [0.7, 0.35], settle: 60 });
    const after = (await getState(page)).players[0]!;
    expect([after.x, after.y]).toEqual([start.x, start.y - 2]);
  });

  test('holding the thumbstick walks tile by tile; releasing stops; the zone never scrolls the page', async ({
    page,
  }) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 2 });
    // the bottom-left spawn: walk right along the open bottom lane
    const start = (await getState(page)).players[0]!;
    await thumb(page, 'right', 40);
    const held = (await getState(page)).players[0]!;
    expect(held.y).toBe(start.y);
    expect(held.x - start.x).toBeGreaterThanOrEqual(2);
    await stepTicks(page, 60);
    const later = (await getState(page)).players[0]!;
    expect(later.x - held.x).toBeLessThanOrEqual(1); // only the step already under way when the thumb lifted
    expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
    const zone = (await page.getByTestId('stick-zone').boundingBox())!;
    const place = (await page.getByTestId('btn-place').boundingBox())!;
    expect(zone.x + zone.width).toBeLessThanOrEqual(place.x); // the zone never reaches the action buttons
  });

  test('once the player is out the thumbstick goes away so the spectator buttons are free (regression)', async ({
    page,
  }) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 4 });
    await expect(page.getByTestId('stick-zone')).toBeVisible();
    await mutate(page, 's.players[0].alive = false; s.players[0].eliminatedTick = s.tick;');
    await stepTicks(page, 10);
    await expect(page.getByTestId('stick-zone')).toHaveCount(0);
    await expect(page.getByTestId('btn-place')).toHaveCount(0);
    await page.getByTestId('skip-results').click(); // reachable: nothing on top of it
  });

  test('contextual buttons appear with abilities and the vehicle button launches entry selection', async ({
    page,
  }, info) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 2, character: 'lekkiBoy' });
    await mutate(
      page,
      `const p = s.players[0]; p.hasVoucher = true; p.grip = true; p.remote = true; p.killSwitchCharges = 2;`,
    );
    await stepTicks(page, 12);
    await expect(page.getByTestId('btn-action')).toBeVisible();
    await expect(page.getByTestId('btn-detonate')).toBeVisible();
    await expect(page.getByTestId('btn-disarm')).toBeVisible();
    await expect(page.getByTestId('btn-vehicle')).toBeVisible();
    await page.screenshot({ path: `e2e-shots/${info.project.name}-touch-full.png` });
    await page.getByTestId('btn-vehicle').dispatchEvent('pointerdown');
    await stepTicks(page, 3);
    await expect(page.getByTestId('entry-panel')).toBeVisible();
    await page.screenshot({ path: `e2e-shots/${info.project.name}-touch-entry.png` });
    await page.getByTestId('entry-confirm').click();
    await stepTicks(page, 3);
    expect((await getState(page)).vehicles[0]?.kind).toBe('taxi');
  });

  test('whole arena and HUD fit the phone viewport without page scroll', async ({ page }) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 4 });
    const overflow = await page.evaluate(() => ({
      w: document.documentElement.scrollWidth - innerWidth,
      h: document.documentElement.scrollHeight - innerHeight,
    }));
    expect(overflow.w).toBeLessThanOrEqual(0);
    expect(overflow.h).toBeLessThanOrEqual(0);
  });
});

test.describe('input device switching', () => {
  test.skip(({ isMobile }) => isMobile === true, 'desktop only');
  test('keyboard then on-screen controls both drive the same player', async ({ page }) => {
    await open(page, '&nobots');
    await page.getByTestId('touch-on').click();
    await startMatch(page, { competitors: 2 });
    await expect(page.getByTestId('stick-zone')).toBeVisible();
    const s0 = (await getState(page)).players[0]!;
    await page.keyboard.down('ArrowUp');
    await stepTicks(page, 3);
    await page.keyboard.up('ArrowUp');
    const s1 = (await getState(page)).players[0]!;
    expect(s1.y).toBe(s0.y - 1);
    await thumb(page, 'down', 8);
    expect((await getState(page)).players[0]!.y).toBe(s1.y + 1);
  });
});
