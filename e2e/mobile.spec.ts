import { expect, test } from '@playwright/test';
import { getState, mutate, open, startMatch, stepTicks } from './helpers';

test.describe('touch controls (landscape phone)', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile project only');

  test('shows contextual on-screen controls, moves with the D-pad and places a generator', async ({
    page,
  }, info) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 2 });
    await expect(page.getByTestId('dpad')).toBeVisible();
    await expect(page.getByTestId('btn-place')).toBeVisible();
    await expect(page.getByTestId('btn-action')).toBeHidden(); // only offered when usable
    await expect(page.getByTestId('btn-vehicle')).toBeHidden();
    await page.screenshot({ path: `e2e-shots/${info.project.name}-touch-hud.png` });

    const start = (await getState(page)).players[0]!;
    const box = (await page.getByTestId('dpad').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.12);
    await page.mouse.down();
    await stepTicks(page, 3);
    await page.mouse.up();
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

  test('a 6-tick D-pad tap moves exactly one tile and a lifted finger leaves nothing queued', async ({
    page,
  }) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 2 });
    const box = (await page.getByTestId('dpad').boundingBox())!;
    const start = (await getState(page)).players[0]!;
    for (let i = 0; i < 2; i++) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.12);
      await page.mouse.down();
      await stepTicks(page, 6);
      await page.mouse.up();
      await stepTicks(page, 60);
    }
    const after = (await getState(page)).players[0]!;
    expect([after.x, after.y]).toEqual([start.x, start.y - 2]);
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
    await expect(page.getByTestId('dpad')).toBeVisible();
    const s0 = (await getState(page)).players[0]!;
    await page.keyboard.down('ArrowUp');
    await stepTicks(page, 3);
    await page.keyboard.up('ArrowUp');
    const s1 = (await getState(page)).players[0]!;
    expect(s1.y).toBe(s0.y - 1);
    const box = (await page.getByTestId('dpad').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.9);
    await page.mouse.down();
    await stepTicks(page, 12);
    await page.mouse.up();
    expect((await getState(page)).players[0]!.y).toBe(s1.y + 1);
  });
});
