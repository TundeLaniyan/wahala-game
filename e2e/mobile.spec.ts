import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { getState, mutate, open, startMatch, stepTicks, thumb } from './helpers';

type Rect = { left: number; right: number; top: number; bottom: number };

/** Every on-screen action button (there must be exactly two: A = GENERATOR, B = SPECIAL). */
const buttonRects = (page: Page): Promise<(Rect & { id: string })[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('.abtn')].map((b) => {
      const r = b.getBoundingClientRect();
      return {
        id: b.getAttribute('data-testid') ?? '',
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
      };
    }),
  );

const board = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __WAHALA__: { store: { getState(): { board: { x: number; y: number }[] | null } } };
        }
      ).__WAHALA__.store.getState().board,
  );

const shakeMode = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __WAHALA__: { renderer(): { shakeStatus(): { mode: string } } } }).__WAHALA__
        .renderer()
        .shakeStatus().mode,
  );

/** B pressed / released like a finger (pointer id 7), with simulation ticks in between. */
async function pressB(page: Page, ticks: number): Promise<void> {
  const b = page.getByTestId('btn-special');
  await b.dispatchEvent('pointerdown', { pointerId: 7, isPrimary: true, pointerType: 'touch' });
  await stepTicks(page, ticks);
  await b.dispatchEvent('pointerup', { pointerId: 7, isPrimary: true, pointerType: 'touch' });
  await stepTicks(page, 2);
}

test.describe('touch controls (landscape phone)', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile project only');

  test('exactly two action buttons, a floating thumbstick that moves one tile, A places a generator', async ({
    page,
  }, info) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 2 });
    await expect(page.getByTestId('stick-zone')).toBeVisible();
    await expect(page.getByTestId('btn-place')).toBeVisible();
    await expect(page.getByTestId('btn-special')).toBeVisible();
    expect((await buttonRects(page)).map((r) => r.id)).toEqual(['btn-place', 'btn-special']);
    await expect(page.locator('.stick-hint')).toContainText('MOVE');
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
    for (const id of ['btn-place', 'btn-special']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(zone.x + zone.width).toBeLessThanOrEqual(b.x); // the zone never reaches the action buttons
    }
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

  test('new abilities never add or move buttons; B shows the vehicle and ONE press launches it (no selector)', async ({
    page,
  }, info) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 2, character: 'lekkiBoy' });
    const before = await buttonRects(page);
    await mutate(
      page,
      `const p = s.players[0]; p.hasVoucher = true; p.grip = true; p.remote = true; p.contact = 'disarm'; p.killSwitchCharges = 2;`,
    );
    await stepTicks(page, 12);
    const after = await buttonRects(page);
    expect(after).toEqual(before); // same two buttons, same places
    await expect(page.getByTestId('btn-special')).toHaveAttribute('data-special', 'vehicle');
    await expect(page.getByTestId('btn-special')).toContainText('TAXI');
    await expect(page.getByTestId('contact-indicator')).toContainText('DISARM x2'); // HUD chip, not a button
    await page.screenshot({ path: `e2e-shots/${info.project.name}-touch-full.png` });
    await pressB(page, 1);
    await expect(page.getByTestId('entry-panel')).toHaveCount(0);
    const st = await getState(page);
    expect(st.vehicles[0]?.kind).toBe('taxi');
    expect(st.vehicles[0]?.phase).toBe('warning'); // the route is shown on the board before it drives
    expect(st.players[0]!.hasVoucher).toBe(false);
    await page.screenshot({ path: `e2e-shots/${info.project.name}-touch-vehicle-warning.png` });
  });

  test('B: a tap next to a rival pushes; holding B with a remote generator down sets it off (ring fills)', async ({
    page,
  }, info) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 2, character: 'streetBaller' });
    await mutate(
      page,
      `const p = s.players[0]; const r = s.players[1]; p.remote = true;
       r.x = r.stepFromX = p.x + 1; r.y = r.stepFromY = p.y; r.stepRemaining = 0;`,
    );
    // a remote generator down: B now waits to tell a tap from a hold
    await page.getByTestId('btn-place').dispatchEvent('pointerdown');
    await stepTicks(page, 4);
    await expect(page.getByTestId('btn-special-hold')).toHaveText('HOLD: BOOM!');
    const rivalX = (await getState(page)).players[1]!.x;
    await pressB(page, 3); // a short tap: the push, not the remote
    let st = await getState(page);
    expect(st.players[1]!.x).toBe(rivalX + 1);
    expect(st.generators).toHaveLength(1);
    // hold: the ring fills, then the remote goes off (the release does nothing more)
    const b = page.getByTestId('btn-special');
    await b.dispatchEvent('pointerdown', { pointerId: 8, isPrimary: true, pointerType: 'touch' });
    await expect(b).toHaveClass(/holding/);
    await page.screenshot({ path: `e2e-shots/${info.project.name}-touch-hold-remote.png` });
    await stepTicks(page, 30);
    await b.dispatchEvent('pointerup', { pointerId: 8, isPrimary: true, pointerType: 'touch' });
    await stepTicks(page, 2);
    st = await getState(page);
    expect(st.generators).toHaveLength(0);
    expect(st.flames).toBeGreaterThan(0);
  });

  test('camera shake is off on a touch screen by default', async ({ page }) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 2 });
    expect(await shakeMode(page)).toBe('off');
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

  for (const [w, h] of [
    [640, 360],
    [667, 375],
    [740, 360],
    [844, 390],
  ] as const) {
    test(`${w}x${h}: neither button nor the stick ring covers the board's bottom row`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: w, height: h });
      await open(page, '&nobots');
      await startMatch(page, { competitors: 4 });
      await expect.poll(() => board(page)).not.toBeNull();
      await page.waitForTimeout(400); // the board corners are republished a few times a second
      const b = (await board(page))!;
      const nearY = b[3]!.y;
      const row = { left: b[3]!.x, right: b[2]!.x, top: nearY - (nearY - b[0]!.y) / 11, bottom: nearY };
      const rects = await buttonRects(page);
      expect(rects).toHaveLength(2);
      const hint = await page.locator('.stick-hint').evaluate((e) => {
        const r = e.getBoundingClientRect();
        return { id: 'stick-hint', left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });
      for (const r of [...rects, hint]) {
        const overlaps = r.left < row.right && r.right > row.left && r.top < row.bottom && r.bottom > row.top;
        expect(overlaps, `${r.id} covers the bottom row`).toBe(false);
      }
      // generous targets: at least 44 CSS px for B, more for A
      const size = (id: string) => rects.find((r) => r.id === id)!;
      expect(size('btn-special').right - size('btn-special').left).toBeGreaterThanOrEqual(44);
      expect(size('btn-place').right - size('btn-place').left).toBeGreaterThanOrEqual(
        size('btn-special').right - size('btn-special').left,
      );
      await page.screenshot({ path: `e2e-shots/${info.project.name}-two-buttons-${w}x${h}.png` });
    });
  }
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
