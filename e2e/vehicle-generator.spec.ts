/**
 * The moving-vehicle generator in the real browser (decision VG1): the contextual second action names the assigned
 * vehicle with its icon, one press sends it, it stops and fuses when a rival stands in its blast, the generator goes
 * off, the owner is never hurt, the second action returns to the fighter's own ability, and there is never a third
 * button. Keyboard and gamepad on desktop, touch on the phone.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { holdKey, mutate, open, startMatch, stepTicks } from './helpers';

type W = {
  __WAHALA__: {
    getState(): never;
    advance(n: number): void;
    stepTicks(n: number): void;
    controller(): { frozen: boolean };
  };
};

const advance = (page: Page, n = 1): Promise<void> =>
  page.evaluate((k) => (window as unknown as W).__WAHALA__.advance(k), n);

/** Owner (player 0) far from the lane with a voucher, one rival standing next to the lane x = 4 on row 5. */
async function stage(page: Page): Promise<void> {
  await open(page, '&nobots&noattract');
  await page.evaluate(() => {
    const st = (
      window as unknown as {
        __WAHALA__: { store: { getState(): { settings: object }; setState(p: object): void } };
      }
    ).__WAHALA__.store;
    st.setState({ settings: { ...st.getState().settings, play: 'classic' } });
  });
  await startMatch(page, { competitors: 3, character: 'streetBaller' });
  await mutate(
    page,
    `const put = (p, x, y) => { p.x = p.stepFromX = x; p.y = p.stepFromY = y; p.stepRemaining = 0; p.protectedUntil = 0; };
     put(s.players[0], 0, 10); put(s.players[1], 4, 5); put(s.players[2], 14, 0); s.players[0].hasVoucher = true;`,
  );
  await advance(page, 2);
}

type Snap = {
  vehicles: { kind: string; phase: string; payload: string | undefined }[];
  alive: boolean[];
  generators: number;
  hasVoucher: boolean;
};
const snap = (page: Page): Promise<Snap> =>
  page.evaluate(() => {
    const s = (window as unknown as W).__WAHALA__.getState() as {
      vehicles: { kind: string; phase: string; payload?: { state: string } }[];
      players: { alive: boolean; hasVoucher: boolean }[];
      generators: unknown[];
    };
    return {
      vehicles: s.vehicles.map((v) => ({ kind: v.kind, phase: v.phase, payload: v.payload?.state })),
      alive: s.players.map((p) => p.alive),
      generators: s.generators.length,
      hasVoucher: s.players[0]!.hasVoucher,
    };
  });

/** Steps the sim in short chunks until the carrier has been seen scanning, fusing and gone (or `max` ticks). */
async function playOut(
  page: Page,
  max = 1500,
): Promise<{ states: Set<string>; kinds: Set<string>; snap: Snap }> {
  const states = new Set<string>();
  const kinds = new Set<string>();
  let last = await snap(page);
  for (let t = 0; t < max; t += 6) {
    await stepTicks(page, 6);
    last = await snap(page);
    for (const v of last.vehicles) {
      if (v.payload) states.add(v.payload);
      kinds.add(v.kind);
    }
    if (last.vehicles.length === 0 && states.size > 0) break;
  }
  return { states, kinds, snap: last };
}

async function expectResolved(page: Page, played: Awaited<ReturnType<typeof playOut>>): Promise<void> {
  expect([...played.kinds]).toEqual(['danfo']); // Street Baller's own vehicle and no other
  expect(played.states.has('fusing')).toBe(true); // the late warning
  expect(played.snap.vehicles).toHaveLength(0); // nothing left on the board
  expect(played.snap.generators).toBe(0);
  expect(played.snap.alive).toEqual([true, false, true]); // the rival is out, the owner is never hurt
  expect(await page.locator('.abtn').count()).toBeLessThanOrEqual(2); // never a third action button (none on desktop)
}

test.describe('vehicle generator: desktop', () => {
  test.slow();
  test.skip(({ isMobile }) => isMobile === true, 'desktop project only');

  test('keyboard: the second action names the vehicle; one press sends it; fuse, blast, owner safe, ability returns', async ({
    page,
  }, info) => {
    await stage(page);
    await advance(page, 2);
    await expect(page.getByTestId('btn-special')).toHaveCount(0); // the desktop HUD has no touch buttons
    await holdKey(page, 'KeyK', 3);
    const played = await playOut(page);
    await expectResolved(page, played);
    await page.screenshot({ path: `e2e-shots/${info.project.name}-vehicle-generator-resolved.png` });
  });

  test('gamepad: X / B sends the carrier the same way', async ({ page }) => {
    await page.addInitScript(() => {
      const pad = {
        id: 'test pad',
        index: 0,
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
        timestamp: 0,
      };
      (window as never as { __pad: typeof pad }).__pad = pad;
      Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
    });
    await stage(page);
    const press = (down: boolean) =>
      page.evaluate(
        (d) =>
          ((window as never as { __pad: { buttons: { pressed: boolean }[] } }).__pad.buttons[2]!.pressed = d),
        down,
      );
    // the pad is polled once per rendered frame (a frame can take seconds on a loaded software-GL runner): keep the
    // button down until the carrier is on the board, then let go
    await press(true);
    await expect.poll(async () => (await snap(page)).vehicles.length, { timeout: 30_000 }).toBeGreaterThan(0);
    await press(false);
    const played = await playOut(page);
    await expectResolved(page, played);
  });
});

test.describe('vehicle generator: phone', () => {
  test.slow();
  test.skip(({ isMobile }) => !isMobile, 'mobile project only');

  test('touch: the second action shows DANFO with its icon, one tap sends it, then it returns to PUSH; two buttons, clear of the HUD', async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await stage(page);
    const b = page.getByTestId('btn-special');
    await expect(b).toHaveText(/DANFO/);
    await expect(b.locator('img')).toHaveCount(1);
    await expect(page.getByTestId('btn-place')).toHaveText(/GENERATOR/);
    expect(await page.locator('.abtn-key').count()).toBe(0); // no generic A / B letters
    await b.tap();
    await stepTicks(page, 2);
    const played = await playOut(page);
    await expectResolved(page, played);
    await advance(page, 2);
    expect(await page.locator('.abtn').count()).toBe(2); // exactly two action buttons throughout
    await expect(b).toHaveText(/PUSH/); // back to the fighter's own ability
    await expect(b.locator('img')).toHaveCount(0);
    // the cluster stays inside the viewport and clear of the top HUD
    const box = await b.boundingBox();
    const place = await page.getByTestId('btn-place').boundingBox();
    const vp = page.viewportSize()!;
    for (const r of [box!, place!]) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(vp.width);
      expect(r.y + r.height).toBeLessThanOrEqual(vp.height);
      expect(r.y).toBeGreaterThan(vp.height * 0.3);
    }
    await page.screenshot({ path: `e2e-shots/${info.project.name}-vehicle-generator-controls.png` });
  });
});
