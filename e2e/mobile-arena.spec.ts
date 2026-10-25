import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { stepTicks } from './helpers';

/**
 * Mobile Test Arena (decision WB10): measures the real on-screen tile size of the experimental 13 x 9 and
 * 15 x 9 boards against a 15 x 11 standard arena on phone landscape viewports, with the fixed whole-arena
 * camera. The numbers are printed (recorded in docs/DECISIONS.md) and the smaller board must give bigger
 * tiles.
 */
const ARENAS: [string, number, number][] = [
  ['danfoBusPark', 15, 11],
  ['mobileTest15x9', 15, 9],
  ['mobileTest13x9', 13, 9],
];
const VIEWPORTS = [
  { width: 640, height: 360 },
  { width: 844, height: 390 },
];

interface Tiles {
  near: number;
  far: number;
  rowAvg: number;
}

async function measure(page: Page, arenaId: string, cols: number, rows: number): Promise<Tiles> {
  await page.evaluate((id) => {
    const key = 'wahala.settings.v1';
    const s = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(key, JSON.stringify({ ...s, play: 'classic', arenaId: id, competitors: 4 }));
  }, arenaId);
  await page.goto('./?debug&q=low&seed=7&nobots&noattract');
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.getByTestId('quick-play').click(); // the saved setup, as a returning player starts it
  await expect(page.getByTestId('hud')).toBeVisible();
  await stepTicks(page, 30);
  const info = await page.evaluate(() => {
    const w = (
      window as unknown as {
        __WAHALA__: {
          getState(): { arenaId: string };
          renderer(): { boardScreenCorners(): { x: number; y: number }[] | null };
        };
      }
    ).__WAHALA__;
    return { arenaId: w.getState().arenaId, corners: w.renderer().boardScreenCorners() };
  });
  expect(info.arenaId).toBe(arenaId);
  const c = [...info.corners!].sort((a, b) => a.y - b.y);
  const top = c.slice(0, 2);
  const bottom = c.slice(2);
  const width = (pts: { x: number }[]): number => Math.abs(pts[0]!.x - pts[1]!.x);
  const avgY = (pts: { y: number }[]): number => (pts[0]!.y + pts[1]!.y) / 2;
  return {
    near: width(bottom) / cols,
    far: width(top) / cols,
    rowAvg: (avgY(bottom) - avgY(top)) / rows,
  };
}

test('the Mobile Test Arena gives bigger on-screen tiles than a 15 x 11 board on phones', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'phone viewports only');
  test.setTimeout(10 * 60_000);
  const rows: string[] = [];
  for (const vp of VIEWPORTS) {
    // a fresh phone context per viewport: Play asks a touch device for fullscreen, and a fullscreen window
    // cannot be resized (Browser.setWindowBounds fails on CI runners)
    const context = await browser.newContext({ ...info.project.use, viewport: vp });
    const page = await context.newPage();
    await page.goto('./?debug&q=low&seed=7&nobots&noattract');
    const got: Record<string, Tiles> = {};
    for (const [id, cols, rowsN] of ARENAS) {
      got[id] = await measure(page, id, cols, rowsN);
      const t = got[id]!;
      rows.push(
        `${vp.width}x${vp.height} ${id}: near ${t.near.toFixed(1)} px, far ${t.far.toFixed(1)} px, row ${t.rowAvg.toFixed(1)} px`,
      );
    }
    await context.close();
    expect(got.mobileTest13x9!.near).toBeGreaterThan(got.danfoBusPark!.near);
    expect(got.mobileTest15x9!.rowAvg).toBeGreaterThan(got.danfoBusPark!.rowAvg);
  }
  console.log(`TILE SIZES\n${rows.join('\n')}`);
});

type Hook = {
  getState(): {
    tick: number;
    width: number;
    tiles: number[];
    players: Record<string, unknown>[];
    generators: { fromSpectator: boolean }[];
  };
  advance(n: number): void;
};

test('an eliminated player throws from the sideline with the THROW button (Mobile Test Arena)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'touch controls');
  test.setTimeout(6 * 60_000);
  await page.goto('./?debug&q=low&seed=7&nobots&noattract');
  await page.evaluate(() => {
    const key = 'wahala.settings.v1';
    const s = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(
      key,
      JSON.stringify({ ...s, play: 'classic', arenaId: 'mobileTest13x9', competitors: 3 }),
    );
  });
  await page.goto('./?debug&q=low&seed=7&nobots&noattract');
  await page.getByTestId('quick-play').click(); // the saved setup, as a returning player starts it
  await expect(page.getByTestId('hud')).toBeVisible();
  await stepTicks(page, 200);
  // knock the local player out in the middle of the board with a one-tick generator
  await page.evaluate(`(() => {
    const s = window.__WAHALA__.getState();
    const p = s.players[0];
    p.x = p.stepFromX = 6;
    p.y = p.stepFromY = 4;
    s.tiles[4 * s.width + 6] = 0;
    s.generators.push({ id: 9999, ownerId: 0, x: 6, y: 4, stepFromX: 6, stepFromY: 4, range: 1, pierce: false,
      square: 0, fromSpectator: false, mode: 'timed', timer: 1, carriedBy: null, carryBonusUsed: false,
      slide: null, flight: null, triggered: false, placedTick: s.tick });
  })()`);
  // simulation only (fast), then a couple of real frames so the HUD snapshot is published
  await stepTicks(page, 600);
  await page.evaluate(() => (window as unknown as { __WAHALA__: Hook }).__WAHALA__.advance(2));
  await expect(page.getByTestId('sideline')).toBeVisible();
  await expect(page.getByTestId('btn-throw')).toBeVisible();
  await page.screenshot({ path: `e2e-shots/${info.project.name}-sideline-13x9.png` });
  const count = (): Promise<number> =>
    page.evaluate(
      () =>
        (window as unknown as { __WAHALA__: Hook }).__WAHALA__
          .getState()
          .generators.filter((g) => g.fromSpectator).length,
    );
  expect(await count()).toBe(0);
  await page.getByTestId('btn-throw').dispatchEvent('pointerdown');
  await page.evaluate(() => (window as unknown as { __WAHALA__: Hook }).__WAHALA__.advance(2));
  expect(await count()).toBe(1);
  await stepTicks(page, 40);
  await page.evaluate(() => (window as unknown as { __WAHALA__: Hook }).__WAHALA__.advance(2));
  await page.screenshot({ path: `e2e-shots/${info.project.name}-sideline-throw-13x9.png` });
});
