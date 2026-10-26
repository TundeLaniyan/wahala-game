import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { getState, mutate, open as openTitle, startMatch, stepTicks, thumb, openSettings } from './helpers';

/**
 * V2 menus default to City Rumble; these specs drive Classic Battle (the 15 x 11 arenas), so the saved
 * play kind is switched to classic after the title screen loads (the menu itself is stream D's).
 */
async function open(page: Page, query = ''): Promise<void> {
  await openTitle(page, query);
  await page.evaluate(() => {
    const st = (
      window as unknown as {
        __WAHALA__: { store: { getState(): { settings: object }; setState(p: object): void } };
      }
    ).__WAHALA__.store;
    st.setState({ settings: { ...st.getState().settings, play: 'classic' } });
  });
}

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

/** The board's on-screen corners straight from the renderer (far-left, far-right, near-right, near-left). */
const board = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as {
        __WAHALA__: { renderer(): { boardScreenCorners(): { x: number; y: number }[] | null } };
      }
    ).__WAHALA__
      .renderer()
      .boardScreenCorners(),
  );

/**
 * One simulation tick routed like real play, which also publishes the HUD at once. The specs use it
 * instead of waiting for animation frames: on a loaded machine software WebGL can go many seconds
 * between frames, and the HUD (button labels, chips, alive flags) is only refreshed from a frame.
 */
const publish = (page: Page): Promise<void> =>
  page.evaluate(() =>
    (window as unknown as { __WAHALA__: { advance(n: number): void } }).__WAHALA__.advance(1),
  );

const shakeMode = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __WAHALA__: { renderer(): { shakeStatus(): { mode: string } } } }).__WAHALA__
        .renderer()
        .shakeStatus().mode,
  );

/**
 * Runs `ticks` simulation ticks with a finger (`pointerId`) still on B, then lifts it, in ONE page task. The HUD
 * is only refreshed from an animation frame, and no frame can run inside the task, so the release always reaches
 * the button that was pressed, even when those ticks knock the local player out and the next frame takes B off
 * the HUD. A separate `locator.dispatchEvent` would then wait (no action timeout) for a button that never comes
 * back: that race hung the hold test for the whole 15-minute CI timeout.
 */
const ticksThenLiftB = (page: Page, pointerId: number, ticks: number): Promise<void> =>
  page.evaluate(
    ([id, n]) => {
      const w = (
        window as unknown as { __WAHALA__: { controller(): { frozen: boolean }; stepTicks(n: number): void } }
      ).__WAHALA__;
      w.controller().frozen = true;
      w.stepTicks(n);
      const b = document.querySelector('[data-testid="btn-special"]');
      if (!b) throw new Error('B is not on screen to release');
      b.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: id,
          isPrimary: true,
          pointerType: 'touch',
        }),
      );
    },
    [pointerId, ticks] as const,
  );

/** B pressed / released like a finger (pointer id 7), with simulation ticks in between. */
async function pressB(page: Page, ticks: number): Promise<void> {
  await page
    .getByTestId('btn-special')
    .dispatchEvent('pointerdown', { pointerId: 7, isPrimary: true, pointerType: 'touch' });
  await ticksThenLiftB(page, 7, ticks);
  await stepTicks(page, 2);
}

test.describe('touch controls (landscape phone)', () => {
  // software WebGL on a shared machine: a frame (and so a screenshot) can take tens of seconds
  test.slow();
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

  test('once the player is out the combat buttons go; the sideline stick + THROW never cover the spectator buttons (regression)', async ({
    page,
  }) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 4 });
    await expect(page.getByTestId('stick-zone')).toBeVisible();
    await mutate(page, 's.players[0].alive = false; s.players[0].eliminatedTick = s.tick;');
    await stepTicks(page, 10);
    await publish(page);
    // V2 Classic: an eliminated player is a sideline spectator (stick to walk the lane, THROW = A); the two
    // combat buttons are gone and the spectator bar's Skip stays reachable
    await expect(page.getByTestId('btn-place')).toHaveCount(0);
    await expect(page.getByTestId('btn-special')).toHaveCount(0);
    const skip = (await page.getByTestId('skip-results').boundingBox())!;
    const zone = await page.getByTestId('stick-zone').boundingBox();
    if (zone) {
      const overlap =
        zone.x < skip.x + skip.width &&
        skip.x < zone.x + zone.width &&
        zone.y < skip.y + skip.height &&
        skip.y < zone.y + zone.height;
      expect(overlap).toBe(false);
    }
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
    await publish(page);
    const after = await buttonRects(page);
    expect(after).toEqual(before); // same two buttons, same places
    await expect(page.getByTestId('btn-special')).toHaveAttribute('data-special', 'vehicle');
    await expect(page.getByTestId('btn-special')).toContainText('YELLOW CAB'); // the taxi's name (VEHICLE_DEFS)
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
    await publish(page);
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
    // the blast also takes out the holder (own generator underfoot), so the next frame drops B from the HUD:
    // the finger lifts in the same page task as the ticks (see ticksThenLiftB)
    await ticksThenLiftB(page, 8, 30);
    await stepTicks(page, 2);
    st = await getState(page);
    expect(st.generators).toHaveLength(0);
    expect(st.flames).toBeGreaterThan(0);
  });

  test('a finger still on B when B leaves the HUD does not jam B once it is back (regression)', async ({
    page,
  }) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 3, character: 'streetBaller' });
    const b = page.getByTestId('btn-special');
    // a finger is on B when the player drops out of play (knocked out; a Deathmatch respawn wait): the HUD
    // takes B away, and that finger's release lands on a button React no longer listens to
    await b.dispatchEvent('pointerdown', { pointerId: 9, isPrimary: true, pointerType: 'touch' });
    await stepTicks(page, 2);
    await mutate(page, `const p = s.players[0]; globalThis.__spot = [p.x, p.y]; p.alive = false;`);
    await publish(page);
    await expect(b).toHaveCount(0);
    // back in play (as a respawn does), a rival next to us: a fresh tap of B must push
    await mutate(
      page,
      `const p = s.players[0]; const r = s.players[1]; p.alive = true; p.spectator = null; p.eliminatedTick = null;
       [p.x, p.y] = globalThis.__spot; p.stepFromX = p.x; p.stepFromY = p.y; p.stepRemaining = 0;
       r.x = r.stepFromX = p.x + 1; r.y = r.stepFromY = p.y; r.stepRemaining = 0;`,
    );
    await publish(page);
    await expect(b).toHaveCount(1);
    const rivalX = (await getState(page)).players[1]!.x;
    await pressB(page, 3);
    expect((await getState(page)).players[1]!.x).toBe(rivalX + 1);
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
    await openSettings(page, 'controls');
    await page.getByTestId('touch-on').click();
    await page.getByTestId('settings-close').click();
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
