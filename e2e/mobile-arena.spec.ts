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
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await stepTicks(page, 30);
  const info = await page.evaluate(() => {
    const w = (
      window as unknown as {
        __WAHALA__: { getState(): { arenaId: string }; renderer(): { boardScreenCorners(): { x: number; y: number }[] | null } };
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

test('the Mobile Test Arena gives bigger on-screen tiles than a 15 x 11 board on phones', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'phone viewports only');
  test.setTimeout(10 * 60_000);
  await page.goto('./?debug&q=low&seed=7&nobots&noattract');
  const rows: string[] = [];
  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    const got: Record<string, Tiles> = {};
    for (const [id, cols, rowsN] of ARENAS) {
      got[id] = await measure(page, id, cols, rowsN);
      const t = got[id]!;
      rows.push(`${vp.width}x${vp.height} ${id}: near ${t.near.toFixed(1)} px, far ${t.far.toFixed(1)} px, row ${t.rowAvg.toFixed(1)} px`);
    }
    expect(got.mobileTest13x9!.near).toBeGreaterThan(got.danfoBusPark!.near);
    expect(got.mobileTest15x9!.rowAvg).toBeGreaterThan(got.danfoBusPark!.rowAvg);
  }
  console.log(`TILE SIZES\n${rows.join('\n')}`);
});
