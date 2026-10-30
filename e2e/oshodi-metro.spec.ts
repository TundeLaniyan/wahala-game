import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chooseStage, open, stepTicks, toRumbleSetup } from './helpers';

/**
 * Lagos arenas, build 1 (docs/OSHODI_METROPOLIS.md): Oshodi Transport Metropolis in the real game on the desktop
 * and the phone project. It starts from the menu, plays its 45 x 33 board with no page errors, the railcar is
 * telegraphed in the HUD before it runs (3.5 s, a track-specific alert) and the review flag `?tod=night` swaps
 * only the look.
 */

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(e.message));
});

/** Home -> City Rumble Survival -> 8 fighters on Oshodi Transport Metropolis -> play, past the countdown. */
async function startOshodi(page: Page): Promise<void> {
  await toRumbleSetup(page, 'survival');
  await page.getByTestId('rumble-8').click();
  await chooseStage(page, 'rumbleOshodiMetro');
  await expect(page.getByTestId('setup-arena')).toContainText('Oshodi Transport Metropolis');
  await page.getByTestId('menu-continue').click();
  await page.getByTestId('menu-continue').click();
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await stepTicks(page, 170);
}

test('the stage starts from the menu on a 45 x 33 board and plays without page errors', async ({ page }) => {
  await open(page);
  await startOshodi(page);
  const live = await page.evaluate(() => {
    const s = (window as never as { __WAHALA__: { getState(): never } }).__WAHALA__.getState() as {
      arenaId: string;
      width: number;
      height: number;
      players: unknown[];
    };
    return { arenaId: s.arenaId, width: s.width, height: s.height, players: s.players.length };
  });
  expect(live).toEqual({ arenaId: 'rumbleOshodiMetro', width: 45, height: 33, players: 8 });
  await page.evaluate(() =>
    (window as never as { __WAHALA__: { advance(n: number): void } }).__WAHALA__.advance(4),
  );
  expect(errors).toEqual([]);
});

test('the railcar is announced in the HUD with its warning time, and the track tiles are a lane', async ({
  page,
}) => {
  await open(page);
  await startOshodi(page);
  // fast-forward (staging only: the human keeps spawn protection) to the first railcar warning
  const warn = await page.evaluate(() => {
    const w = (window as never as { __WAHALA__: { getState(): never; stepTicks(n: number): void } })
      .__WAHALA__;
    type Ev = { style: string; warnTick: number; startTick: number; tiles: number[]; kind: string };
    const st = (): {
      tick: number;
      width: number;
      players: { protectedUntil: number }[];
      stage: { events: Ev[] };
    } => w.getState() as never;
    st().players[0]!.protectedUntil = 1e9;
    for (let i = 0; i < 150 * 60; i++) {
      w.stepTicks(1);
      const ev = st().stage.events.find((e) => e.style === 'train');
      if (ev) {
        const s = st();
        const p = s.players[0] as unknown as { x: number; y: number; stepFromX: number; stepFromY: number };
        // stand the human on a lane tile off the main road so the danger text can be read
        const tile = ev.tiles.find((t) => Math.floor(t / s.width) < 14 && Math.floor(t / s.width) > 11)!;
        p.x = p.stepFromX = tile % s.width;
        p.y = p.stepFromY = Math.floor(tile / s.width);
        return {
          kind: ev.kind,
          warnTicks: ev.startTick - ev.warnTick,
          cols: [...new Set(ev.tiles.map((t) => t % s.width))],
        };
      }
    }
    return null;
  });
  expect(warn).not.toBeNull();
  expect(warn!.kind).toBe('sweep');
  expect(warn!.warnTicks).toBeGreaterThanOrEqual(210);
  expect(warn!.cols).toHaveLength(1);
  expect([36, 37]).toContain(warn!.cols[0]);
  await page.evaluate(() =>
    (window as never as { __WAHALA__: { advance(n: number): void } }).__WAHALA__.advance(3),
  );
  const alert = page.getByTestId('stage-alert').first();
  await expect(alert).toBeVisible();
  await expect(alert).toHaveAttribute('data-style', 'train');
  await expect(alert).toContainText('TRAIN COMING - GET OFF THE TRACK!');
  // readable on a phone: inside the viewport and in the top half, clear of the board's bottom row
  const box = (await alert.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height).toBeLessThan(vp.height * 0.55);
  expect(errors).toEqual([]);
});

test('the night look changes the light only: same board, same hazards, a dark sky', async ({ page }) => {
  await open(page, '&tod=night');
  await startOshodi(page);
  const look = await page.evaluate(() => {
    const w = (
      window as never as {
        __WAHALA__: { getState(): never; renderer(): { scene: { background: { getHex(): number } } } };
      }
    ).__WAHALA__;
    const s = w.getState() as { arenaId: string; width: number; height: number };
    return { arenaId: s.arenaId, size: [s.width, s.height], sky: w.renderer().scene.background.getHex() };
  });
  expect(look.arenaId).toBe('rumbleOshodiMetro');
  expect(look.size).toEqual([45, 33]);
  expect(look.sky).toBe(0x0e1626);
  expect(errors).toEqual([]);
});
