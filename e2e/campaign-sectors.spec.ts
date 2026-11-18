/**
 * District sectors in a real browser (docs/CAMPAIGN_SECTOR_AI.md): a field mission started through the real campaign
 * controller loads with its sector on a landscape phone (740 x 360) - the barricades are built as objects, the minimap
 * crops to the sector - and wherever the human stands in the play area (staged through the debug state, time moved only
 * with `stepTicks`) the follow camera's HUD-free band stays on the sector: its edges never pass the play area's box plus
 * the view margin (the rig may use its own slightly wider HUD margin on the sides: a tile of tolerance), or, where the
 * band is larger than that, the band is centred on it.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { open, inMatch } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
test.use({ viewport: { width: 740, height: 360 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

async function stage(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ({ x, y }) => {
      const w = (window as any).__WAHALA__;
      const s = w.getState();
      const p = s.players[0];
      p.x = p.stepFromX = x;
      p.y = p.stepFromY = y;
      p.stepRemaining = 0;
      p.protectedUntil = s.tick + 100000; // staging only
      w.stepTicks(2);
    },
    { x, y },
  );
}

/** The band edges once the follow camera has settled on the staged tile. */
async function settledView(
  page: Page,
): Promise<{ top: number; bottom: number; left: number; right: number }> {
  await page.evaluate(() => (window as any).__WAHALA__.renderer().cutCamera());
  let last = '';
  await expect
    .poll(
      async () => {
        const v = JSON.stringify(
          await page.evaluate(() => (window as any).__WAHALA__.sector()?.view ?? null),
        );
        const same = v === last;
        last = v;
        return same && v !== 'null';
      },
      { timeout: 60_000, intervals: [400] },
    )
    .toBe(true);
  return JSON.parse(last);
}

/** Along one axis: the band [a, b] stays inside [lo, hi] (+ tolerance), or is centred on it when it is wider. */
function inside(a: number, b: number, lo: number, hi: number, what: string): void {
  const tol = 1;
  if (b - a <= hi - lo + 2 * tol) {
    expect(a, `${what}: start ${a.toFixed(2)} vs ${lo}`).toBeGreaterThanOrEqual(lo - tol);
    expect(b, `${what}: end ${b.toFixed(2)} vs ${hi}`).toBeLessThanOrEqual(hi + tol);
  } else {
    expect(Math.abs((a + b) / 2 - (lo + hi) / 2), `${what}: centred`).toBeLessThan(1.5);
  }
}

test('Oshodi approach on a landscape phone: the sector loads with its barricades and the camera stays on it', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'one phone run is enough (the viewport is fixed above)');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, '&noattract');
  await page.evaluate(() => {
    const c = (window as any).__WAHALA__.campaign();
    c.load();
    c.startNew();
    c.storyDone();
    if (!c.startSectionMission('oshodi.approach')) throw new Error('mission did not start');
  });
  await inMatch(page);
  const sector = await page.evaluate(() => {
    const w = (window as any).__WAHALA__;
    w.controller().frozen = true;
    const s = w.getState();
    while (s.match.phase !== 'playing') w.stepTicks(10);
    return s.sector
      ? { id: s.sector.id, margin: s.sector.viewMargin as number, rects: s.sector.rects as number[][] }
      : null;
  });
  expect(sector?.id).toBe('oshodi.terminalApproach');
  const drawn = await page.evaluate(() => (window as any).__WAHALA__.sector());
  expect(drawn.barricades).toBeGreaterThanOrEqual(8);
  await expect(page.getByTestId('minimap')).toBeVisible();

  const [r] = sector!.rects as [number[]];
  // the box in grid coordinates of tile centres: its edges are half a tile beyond its edge tiles, plus the margin
  const m = sector!.margin + 0.5;
  const box = { x0: r[0]! - m, y0: r[1]! - m, x1: r[2]! + m, y1: r[3]! + m };
  // the four corners of the play area and its middle
  for (const [x, y] of [
    [r[0]!, r[1]!],
    [r[2]!, r[1]!],
    [r[0]!, r[3]!],
    [r[2]!, r[3]!],
    [Math.round((r[0]! + r[2]!) / 2), Math.round((r[1]! + r[3]!) / 2)],
  ] as const) {
    await stage(page, x, y);
    const v = await settledView(page);
    inside(v.top, v.bottom, box.y0, box.y1, `${x},${y} north-south`);
    inside(v.left, v.right, box.x0, box.x1, `${x},${y} east-west`);
  }
  expect(errors).toEqual([]);
});
