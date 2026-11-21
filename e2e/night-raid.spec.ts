/**
 * The night raid in a real browser (docs/CLASSIC_LIGHTING.md, decisions NL4-NL7): the Records Vault loads dark with the
 * fighter's flashlight on, the beam follows the fighter's facing when he walks (keyboard on a desktop, the thumbstick
 * on a phone in landscape), the dark hides at least one enemy at the start, Low quality computes exactly the same lit
 * tiles as High, and no page error is raised. A lit raid builds no night.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { inMatch, open, thumb } from './helpers';

type Night = {
  litPlayer: number;
  litGuard: number;
  litLamp: number;
  enemies: number;
  concealed: number;
  beams: number;
  playerYaw: number;
  playerFacing: string | null;
  playerReach: number;
};
type Debug = {
  __WAHALA__: {
    campaign(): Record<string, ((...a: unknown[]) => unknown) | undefined>;
    controller(): { frozen: boolean };
    getState(): { arenaId: string; players: { isBot: boolean; facing: string; x: number; y: number }[] };
    renderer(): { nightStatus(): Night | null };
    advance(n: number): void;
    stepTicks(n: number): void;
  };
};

async function startRaid(page: Page, raidId: string, keepFrozen = false): Promise<void> {
  const started = await page.evaluate((id) => {
    const c = (window as unknown as Debug).__WAHALA__.campaign();
    c.load?.();
    c.startNew?.();
    c.storyDone?.();
    return c.debugStartRaid?.(id);
  }, raidId);
  expect(started).toBe(true);
  await inMatch(page);
  await page.evaluate(() => {
    const w = (window as unknown as Debug).__WAHALA__;
    w.controller().frozen = true;
    w.stepTicks(260); // past the countdown and the hall wardens' spawn warning
    w.advance(30);
  });
  if (!keepFrozen)
    await page.evaluate(() => ((window as unknown as Debug).__WAHALA__.controller().frozen = false));
}

const night = (page: Page): Promise<Night | null> =>
  page.evaluate(() => (window as unknown as Debug).__WAHALA__.renderer().nightStatus());
const fighter = (page: Page): Promise<{ facing: string; x: number; y: number }> =>
  page.evaluate(() => (window as unknown as Debug).__WAHALA__.getState().players.find((p) => !p.isBot)!);

test.describe('night raid', () => {
  test.setTimeout(600_000); // software WebGL
  // one project each: these set their own viewport, so the other project would only repeat them
  test.beforeEach(({ browserName: _b }, info) =>
    test.skip(info.project.name !== 'desktop', 'desktop project only'),
  );

  test('desktop: the vault is dark, the flashlight follows the fighter, enemies hide in the dark', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page);
    await startRaid(page, 'recordsVault');
    const start = (await night(page))!;
    expect(start).not.toBeNull();
    expect(start.beams).toBeGreaterThanOrEqual(1);
    expect(start.litPlayer).toBeGreaterThanOrEqual(9); // at least the personal radius
    expect(start.litLamp).toBeGreaterThan(0);
    expect(start.enemies).toBeGreaterThan(0);
    // walk east along the entrance hall: the beam turns to face east and lights the corridor
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await fighter(page)).facing, { timeout: 60_000 }).toBe('right');
    await page.keyboard.up('ArrowRight');
    await expect
      .poll(async () => (await night(page))!.playerYaw, { timeout: 60_000 })
      .toBeCloseTo(Math.PI / 2, 1);
    expect((await night(page))!.playerFacing).toBe('right');
    expect((await night(page))!.playerReach).toBeGreaterThan(1);
    // north: the beam swings round to face up
    await page.keyboard.down('ArrowUp');
    await expect.poll(async () => (await fighter(page)).facing, { timeout: 60_000 }).toBe('up');
    await page.keyboard.up('ArrowUp');
    await expect
      .poll(async () => (await night(page))!.playerYaw, { timeout: 60_000 })
      .toBeCloseTo(Math.PI, 1);
    expect(errors).toEqual([]);
  });

  test('Low quality lights exactly the same tiles as High', async ({ page }) => {
    const counts: Night[] = [];
    for (const q of ['high', 'low']) {
      await page.goto(`./?debug&q=${q}&seed=7`);
      await expect(page.getByTestId('title-screen')).toBeVisible();
      // frozen from the start: both runs stand on the same tick of the same seed
      await startRaid(page, 'recordsVault', true);
      await page.waitForTimeout(500); // a few frames, so the view has drawn this tick
      counts.push((await night(page))!);
    }
    const [high, low] = counts;
    expect({ ...low!, playerYaw: 0 }).toEqual({ ...high!, playerYaw: 0 });
  });

  test('a lit raid builds no night', async ({ page }) => {
    await open(page);
    await startRaid(page, 'partsStoreroom');
    expect(await night(page)).toBeNull();
  });
});

test.describe('night raid on a phone', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  test.setTimeout(600_000);
  test.beforeEach(({ browserName: _b }, info) =>
    test.skip(info.project.name !== 'mobile', 'mobile project only'),
  );

  test('landscape: the thumbstick turns the flashlight, no page errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page);
    await startRaid(page, 'recordsVault');
    expect((await night(page))!.beams).toBeGreaterThanOrEqual(1);
    await thumb(page, 'right', 40);
    await expect.poll(async () => (await fighter(page)).facing, { timeout: 60_000 }).toBe('right');
    await expect
      .poll(async () => (await night(page))!.playerYaw, { timeout: 60_000 })
      .toBeCloseTo(Math.PI / 2, 1);
    expect(errors).toEqual([]);
  });
});
