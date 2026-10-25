import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { getState, holdKey, mutate, open as openTitle, startMatch, stepTicks } from './helpers';

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

/**
 * One simulation tick routed like real play, which also publishes the HUD at once. The specs use it
 * instead of waiting for animation frames: on a loaded machine software WebGL can go many seconds
 * between frames, and the HUD (button labels, chips, alive flags) is only refreshed from a frame.
 */
const publish = (page: Page): Promise<void> =>
  page.evaluate(() =>
    (window as unknown as { __WAHALA__: { advance(n: number): void } }).__WAHALA__.advance(1),
  );

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

test.describe('gameplay camera', () => {
  type Pose = { pitchDeg: number; distance: number; mode: string; arenaInView: boolean };
  const read = (page: Page): Promise<Pose> =>
    page.evaluate(() =>
      (window as unknown as { __WAHALA__: { renderer(): { debugCamera(): Pose } } }).__WAHALA__
        .renderer()
        .debugCamera(),
    );

  test('standard match: the whole arena stays on one shared screen for the entire match', async ({
    page,
  }, info) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 4 });
    const first = await read(page);
    expect(first.mode).toBe('arena');
    expect(first.pitchDeg).toBeGreaterThan(40);
    expect(first.pitchDeg).toBeLessThan(50);
    expect(first.arenaInView).toBe(true);
    await expect(page.getByTestId('camera-button')).toHaveCount(0);
    // move, wait, press O: nothing changes the framing
    await holdKey(page, 'ArrowUp', 6);
    await stepTicks(page, 120);
    await page.keyboard.press('o');
    await stepTicks(page, 60);
    const later = await read(page);
    expect(later.arenaInView).toBe(true);
    expect(later.distance).toBeCloseTo(first.distance, 3);
    // spectating: the local player out, the camera still frames everybody
    await mutate(page, 's.players[0].alive = false;');
    await stepTicks(page, 30);
    const spectating = await read(page);
    expect(spectating.arenaInView).toBe(true);
    expect(spectating.distance).toBeCloseTo(first.distance, 3);
    await page.screenshot({ path: `e2e-shots/${info.project.name}-camera-arena.png` });
  });

  test('stadium mode (?cam=stadium) keeps the close follow camera with the overview toggle', async ({
    page,
  }) => {
    await open(page, '&nobots&cam=stadium');
    await startMatch(page, { competitors: 2 });
    const cut = (): Promise<void> =>
      page.evaluate(() =>
        (window as unknown as { __WAHALA__: { renderer(): { cutCamera(): void } } }).__WAHALA__
          .renderer()
          .cutCamera(),
      );
    await cut();
    await expect.poll(async () => (await read(page)).distance, { timeout: 15_000 }).toBeLessThan(14);
    const action = await read(page);
    expect(action.mode).toBe('stadium');
    await expect(page.getByTestId('camera-button')).toHaveAttribute('data-view', 'action');
    await page.keyboard.press('o');
    await expect(page.getByTestId('camera-button')).toHaveAttribute('data-view', 'overview');
    await cut();
    await expect
      .poll(async () => (await read(page)).distance, { timeout: 15_000 })
      .toBeGreaterThan(action.distance * 1.5);
    await page.getByTestId('camera-button').click();
    await expect(page.getByTestId('camera-button')).toHaveAttribute('data-view', 'action');
    expect((await getState(page)).phase).toBe('playing');
  });
});

test.describe('keyboard play', () => {
  test('a 6-tick tap moves exactly one tile each time; holding repeats; releasing stops', async ({
    page,
  }) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 2 });
    const start = (await getState(page)).players[0]!;
    // 6 ticks (100 ms) is a normal human tap; it used to outlast one 10-tick step's buffer and move two tiles.
    for (let i = 0; i < 2; i++) {
      await holdKey(page, 'ArrowRight', 6);
      await stepTicks(page, 40);
    }
    const tapped = (await getState(page)).players[0]!;
    expect([tapped.x, tapped.y]).toEqual([start.x + 2, start.y]);
    await mutate(page, 'for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i] === 2) s.tiles[i] = 0;');
    await holdKey(page, 'ArrowRight', 40); // deliberate hold: first step, repeat delay, then steady steps
    await stepTicks(page, 40);
    const held = (await getState(page)).players[0]!;
    expect(held.x).toBeGreaterThanOrEqual(tapped.x + 3); // a tap would give one tile; the hold repeated
    await stepTicks(page, 120);
    expect((await getState(page)).players[0]!.x).toBe(held.x); // nothing carried over after release
  });

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
    await expect(page.getByTestId('results')).toBeVisible({ timeout: 25_000 });
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

test.describe('signature vehicles: one press of B', () => {
  test.slow();
  for (const [character, vehicle] of [
    ['streetBaller', 'danfo'],
    ['lekkiBoy', 'taxi'],
    ['campusQueen', 'keke'],
  ] as const) {
    test(`${vehicle}: voucher, ONE press of B picks a route through the rival, warns, and drives in`, async ({
      page,
    }, info) => {
      await open(page, '&nobots');
      await startMatch(page, { competitors: 2, character });
      // the rival walled in between two crates on row 6 (pillars above and below): a lane worth taking
      await mutate(
        page,
        `const p = s.players[0]; p.hasVoucher = true; p.x = p.stepFromX = 0; p.y = p.stepFromY = 10;
         const r = s.players[1]; r.x = r.stepFromX = 9; r.y = r.stepFromY = 6; r.stepRemaining = 0;
         for (const x of [8, 10]) s.tiles[6 * s.width + x] = 2;
         for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i] === 2 && !(Math.floor(i / s.width) === 6 && (i % s.width === 8 || i % s.width === 10))) s.tiles[i] = 0;`,
      );
      await stepTicks(page, 2);
      await page.keyboard.press('k');
      await stepTicks(page, 2);
      await expect(page.getByTestId('entry-panel')).toHaveCount(0);
      let st = await getState(page);
      expect(st.vehicles).toHaveLength(1);
      expect(st.vehicles[0]!.kind).toBe(vehicle);
      expect(st.vehicles[0]!.phase).toBe('warning');
      expect(st.players[0]!.hasVoucher).toBe(false);
      const route = await page.evaluate(
        () =>
          (
            window as unknown as {
              __WAHALA__: { getState(): { vehicles: { route: { x: number; y: number }[] }[] } };
            }
          ).__WAHALA__.getState().vehicles[0]!.route,
      );
      expect(route.some((t) => t.x === 9 && t.y === 6)).toBe(true);
      await publish(page);
      await page.screenshot({ path: `e2e-shots/${info.project.name}-vehicle-warning-${vehicle}.png` });
      await stepTicks(page, 300);
      st = await getState(page);
      expect(st.players[1]!.alive).toBe(false);
      expect(st.players[0]!.alive).toBe(true);
    });
  }

  test('there is no selector any more: V does nothing, B keeps the voucher when a rival is next to you', async ({
    page,
  }) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 2 });
    await mutate(
      page,
      `const p = s.players[0]; p.hasVoucher = true; const r = s.players[1];
       r.x = r.stepFromX = p.x; r.y = r.stepFromY = p.y - 1; r.stepRemaining = 0; p.skillReadyTick = s.tick + 600;`,
    );
    await page.keyboard.press('v');
    await stepTicks(page, 3);
    await expect(page.getByTestId('entry-panel')).toHaveCount(0);
    expect((await getState(page)).players[0]!.entryUntil).toBeNull();
    // a rival adjacent makes B a melee press (cooling down here): never a surprise vehicle
    await page.keyboard.press('k');
    await stepTicks(page, 3);
    const st = await getState(page);
    expect(st.vehicles).toHaveLength(0);
    expect(st.players[0]!.hasVoucher).toBe(true);
  });
});

test.describe('two buttons and contact abilities (keyboard)', () => {
  test.slow();
  test('walking into a generator with Football Boots kicks it; the HUD shows KICK as a chip, not a button', async ({
    page,
  }) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 2 });
    await mutate(
      page,
      `const p = s.players[0]; p.contact = 'kick'; p.x = p.stepFromX = 2; p.y = p.stepFromY = 4;
       for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i] === 2) s.tiles[i] = 0;
       s.generators.push({ id: 990, ownerId: 1, x: 3, y: 4, stepFromX: 3, stepFromY: 4, range: 2, pierce: false, square: 0,
         fromSpectator: false, mode: 'timed', timer: 9999, carriedBy: null, carryBonusUsed: false, slide: null,
         flight: null, triggered: false, placedTick: s.tick });`,
    );
    await stepTicks(page, 2);
    await publish(page);
    await expect(page.getByTestId('contact-indicator')).toContainText('KICK');
    await holdKey(page, 'ArrowRight', 3);
    await stepTicks(page, 120);
    const g = (await getState(page)).generators.find((o) => o.id === 990)!;
    expect(g.x).toBeGreaterThan(5);
    expect(g.y).toBe(4);
  });

  test('B (K): a tap with a remote generator down still does the special; holding K sets the remote off', async ({
    page,
  }) => {
    await open(page, '&nobots');
    await startMatch(page, { competitors: 2 });
    await mutate(page, `s.players[0].remote = true;`);
    await page.keyboard.press('Space');
    await stepTicks(page, 2);
    await holdKey(page, 'ArrowUp', 3);
    await stepTicks(page, 12);
    expect((await getState(page)).generators[0]!.mode).toBe('remote');
    await holdKey(page, 'k', 4); // a tap: nothing to melee, no voucher -> nothing, and NOT the remote
    expect((await getState(page)).generators).toHaveLength(1);
    await holdKey(page, 'k', 30); // a hold: boom
    await stepTicks(page, 2);
    expect((await getState(page)).generators).toHaveLength(0);
  });

  test('pause menu: the screen-shake setting cycles auto / off / subtle and reaches the renderer', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop default is subtle');
    await open(page, '&nobots');
    await startMatch(page, { competitors: 2 });
    const mode = () =>
      page.evaluate(
        () =>
          (
            window as unknown as { __WAHALA__: { renderer(): { shakeStatus(): { mode: string } } } }
          ).__WAHALA__
            .renderer()
            .shakeStatus().mode,
      );
    expect(await mode()).toBe('subtle'); // auto with a mouse
    await page.keyboard.press('p');
    const chip = page.getByTestId('toggle-shake');
    await expect(chip).toHaveAttribute('data-value', 'auto');
    await chip.click();
    await expect(chip).toHaveAttribute('data-value', 'off');
    expect(await mode()).toBe('off');
    await chip.click();
    await expect(chip).toHaveAttribute('data-value', 'subtle');
    expect(await mode()).toBe('subtle');
    await chip.click();
    await expect(chip).toHaveAttribute('data-value', 'auto');
  });
});

test.describe('whole-match robustness', () => {
  test('a full match against real bots runs to a result with audio, captions and effects, without errors', async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await open(page);
    await page.getByTestId('diff-hard').click();
    await startMatch(page, { competitors: 4, waitPlaying: false });
    for (let i = 0; i < 12; i++) {
      await stepTicks(page, 300);
      await page.waitForTimeout(60); // let frames render, events reach audio/captions
    }
    await page.screenshot({ path: `e2e-shots/${info.project.name}-bots-midgame.png` });
    const st = await getState(page);
    expect(st.phase === 'playing' || st.phase === 'ended').toBe(true);
    await page.evaluate(() =>
      (window as never as { __WAHALA__: { controller(): { skipToResults(): void } } }).__WAHALA__
        .controller()
        .skipToResults(),
    );
    await expect(page.getByTestId('results')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('optional modes', () => {
  test('Wahala Crush, the trap arena and crowd throws run together without errors and telegraph first', async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await open(page, '&nobots');
    await page.getByTestId('mode-crush').click();
    await page.getByTestId('arena-lekkiRoadworks').click();
    await page.getByTestId('toggle-crowd').click();
    await startMatch(page, { competitors: 4, waitPlaying: false });
    await stepTicks(page, 160);
    // jump to the point where the crush has begun and a spectator throw is imminent
    await mutate(
      page,
      `s.match.playTicks = s.crush.warnAt[0] - 5; s.crowd.nextThrowTick = s.match.playTicks + 3;`,
    );
    await stepTicks(page, 30);
    const warned = await page.evaluate(() => {
      const w = (
        window as never as {
          __WAHALA__: { getState(): { crush: { pending: unknown[] }; crowd: { throws: unknown[] } } };
        }
      ).__WAHALA__;
      const s = w.getState();
      return { crush: s.crush.pending.length, crowd: s.crowd.throws.length };
    });
    expect(warned.crush).toBeGreaterThan(0);
    expect(warned.crowd).toBeGreaterThan(0);
    await page.screenshot({ path: `e2e-shots/${info.project.name}-modes-warning.png` });
    await stepTicks(page, 400);
    await page.waitForTimeout(100);
    await page.screenshot({ path: `e2e-shots/${info.project.name}-modes-later.png` });
    const hard = await page.evaluate(
      () =>
        (window as never as { __WAHALA__: { getState(): { tiles: number[] } } }).__WAHALA__
          .getState()
          .tiles.filter((t) => t === 1).length,
    );
    expect(hard === 35 || hard > 35).toBe(true);
    expect(errors).toEqual([]);
  });
});
