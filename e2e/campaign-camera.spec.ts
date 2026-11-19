/**
 * The campaign camera and asset lifecycle in a real browser (docs/CAMPAIGN_CAMERA.md, decisions CF1-CF7):
 *
 * - a campaign mission opens framed on the fighter: the floor the HUD-free band shows (`__WAHALA__.camera().view`) is a
 *   small part of the district and holds the fighter, from the first frame of the countdown;
 * - walking (real movement: forced intents through the match controller's own tick) moves the camera with the fighter;
 * - a 17 x 13 raid follows on a 740 x 360 phone and keeps the fixed whole-board framing on desktop; a 13 x 9 raid is
 *   fixed everywhere;
 * - starting the same mission again, and A -> B -> A, keeps the live GPU geometries and textures flat (before the fix
 *   every start left about 42 bone textures and 4 geometries behind);
 * - no page errors.
 *
 * Time is moved with `stepTicks` (software WebGL renders a frame in hundreds of ms); the camera is read once it settles.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { inMatch, open } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface CameraStatus {
  mode: string;
  framing: 'fixed' | 'follow' | 'overview';
  view: { x0: number; y0: number; x1: number; y1: number } | null;
  board: { w: number; h: number };
  pose: { x: number; z: number; distance: number };
}

const camera = (page: Page): Promise<CameraStatus | null> =>
  page.evaluate(() => (window as any).__WAHALA__.camera());

/** Polls until two reads of the camera pose agree (the smoothed camera has arrived). */
async function settled(page: Page): Promise<CameraStatus> {
  let last = '';
  let status: CameraStatus | null = null;
  await expect
    .poll(
      async () => {
        status = await camera(page);
        const key = status
          ? `${status.framing}:${status.pose.x.toFixed(2)}:${status.pose.z.toFixed(2)}:${status.pose.distance.toFixed(2)}`
          : 'null';
        const same = key === last && key !== 'null';
        last = key;
        return same;
      },
      { timeout: 90_000, intervals: [500] },
    )
    .toBe(true);
  return status!;
}

/** The human's tile and whether it is inside the camera's view. */
async function human(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const p = (window as any).__WAHALA__.getState().players[0];
    return { x: p.x, y: p.y };
  });
}

function holds(v: NonNullable<CameraStatus['view']>, t: { x: number; y: number }): boolean {
  return t.x >= v.x0 && t.x <= v.x1 && t.y >= v.y0 && t.y <= v.y1;
}

/** Holds the match in place (frozen) and protects the human while the test moves it. */
async function freeze(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = (window as any).__WAHALA__;
    w.controller().frozen = true;
    const s = w.getState();
    s.players[0].protectedUntil = s.tick + 1_000_000; // staging only: enemies may not end the walk
  });
}

/** Plays the countdown out with ticks. */
async function toPlay(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = (window as any).__WAHALA__;
    while (w.getState().match.phase === 'countdown') w.stepTicks(10);
  });
}

/** Walks (forced intents, real movement rules) along the longest open straight line from the human; returns tiles. */
async function walk(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = (window as any).__WAHALA__;
    const s = w.getState();
    const me = s.players[0];
    const dirs = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] } as const;
    const run = (d: keyof typeof dirs): number => {
      let n = 0;
      const [dx, dy] = dirs[d];
      while (s.tiles[(me.y + dy * (n + 1)) * s.width + me.x + dx * (n + 1)] === 0 && n < 8) n++;
      return n;
    };
    const best = (Object.keys(dirs) as (keyof typeof dirs)[]).sort((a, b) => run(b) - run(a))[0]!;
    const from = { x: me.x, y: me.y };
    for (let t = 0; t < 240; t++) {
      w.controller().forceIntent(0, { move: best });
      w.stepTicks(1);
    }
    return Math.abs(me.x - from.x) + Math.abs(me.y - from.y);
  });
}

async function gpu(page: Page): Promise<{ geometries: number; textures: number }> {
  return page.evaluate(() => {
    const s = (window as any).__WAHALA__.stats();
    return { geometries: s.geometries, textures: s.textures };
  });
}

async function startField(page: Page, id: string): Promise<void> {
  await page.evaluate((id) => {
    if (!(window as any).__WAHALA__.startFieldMission(id)) throw new Error(`${id} did not start`);
  }, id);
  await inMatch(page);
}

async function startRaid(page: Page, id: string): Promise<void> {
  await page.evaluate((id) => {
    const c = (window as any).__WAHALA__.campaign();
    c.load();
    if (!c.debugStartRaid(id)) throw new Error(`${id} did not start`);
  }, id);
  await inMatch(page);
}

test.describe('landscape phone 740 x 360', () => {
  test.use({ viewport: { width: 740, height: 360 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test('a field mission opens on the fighter and the camera follows a walk', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'the phone viewport is set above: one run');
    test.setTimeout(300_000); // software WebGL
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, '&noattract');
    await startField(page, 'oshodi.railEdge');
    await freeze(page);
    // the countdown's first tick, held (software frames are slow: the real countdown may already have run on)
    await page.evaluate(() => {
      const w = (window as any).__WAHALA__;
      const s = w.getState();
      s.match.phase = 'countdown';
      s.match.countdownRemaining = s.config.match.countdownTicks;
      w.renderer().cutCamera();
    });
    // the opening shot: the follow camera on the fighter, a small part of the 63 x 47 district
    const first = await settled(page);
    expect(first.mode).toBe('campaign');
    expect(first.framing).toBe('follow');
    const v = first.view!;
    const share = ((v.x1 - v.x0) * (v.y1 - v.y0)) / (first.board.w * first.board.h);
    expect(share, 'share of the district on screen at the start').toBeLessThan(0.4);
    expect(holds(v, await human(page))).toBe(true);

    await toPlay(page);
    const before = await settled(page);
    const tiles = await walk(page);
    expect(tiles, 'the fighter walked').toBeGreaterThanOrEqual(3);
    const after = await settled(page);
    const moved = Math.hypot(after.pose.x - before.pose.x, after.pose.z - before.pose.z);
    expect(moved, 'the camera moved with the fighter').toBeGreaterThan(1.5);
    expect(holds(after.view!, await human(page))).toBe(true);
    await expect(page.getByTestId('minimap')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a 17 x 13 raid scrolls with the fighter; a 13 x 9 raid keeps the fixed framing', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'mobile', 'the phone viewport is set above: one run');
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, '&noattract');
    await startRaid(page, 'warehouseDispatchDepot');
    await freeze(page);
    await toPlay(page);
    const before = await settled(page);
    expect(before.mode).toBe('campaign');
    expect(before.framing).toBe('follow');
    expect(before.view!.y1 - before.view!.y0, 'the view is shorter than the board').toBeLessThan(
      before.board.h + 2,
    );
    expect(await walk(page)).toBeGreaterThanOrEqual(2);
    const after = await settled(page);
    expect(Math.hypot(after.pose.x - before.pose.x, after.pose.z - before.pose.z)).toBeGreaterThan(0.5);
    expect(holds(after.view!, await human(page))).toBe(true);

    await page.evaluate(() => (window as any).__WAHALA__.controller().stop());
    await startRaid(page, 'junctionToolShed');
    await freeze(page);
    await toPlay(page);
    const small = await settled(page);
    expect(small.framing).toBe('fixed');
    // the whole 13 x 9 board is in view
    expect(small.view!.x0).toBeLessThan(0);
    expect(small.view!.x1).toBeGreaterThan(small.board.w - 1);
    expect(errors).toEqual([]);
  });
});

test.describe('desktop', () => {
  test('raids keep the fixed framing; restarts keep the GPU resources flat', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop run only');
    test.setTimeout(600_000); // five match loads on software WebGL
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, '&noattract');
    await startRaid(page, 'warehouseDispatchDepot');
    await freeze(page);
    await toPlay(page);
    expect((await settled(page)).framing).toBe('fixed');

    // the same field mission three times, then another mission and back (A, A, A, B, A)
    const counts: { geometries: number; textures: number }[] = [];
    for (const id of [
      'oshodi.approach',
      'oshodi.approach',
      'oshodi.approach',
      'mushin.approach',
      'oshodi.approach',
    ]) {
      await startField(page, id);
      await freeze(page);
      await settled(page);
      counts.push(await gpu(page));
    }
    console.log(`GPU after each start: ${JSON.stringify(counts)}`);
    const [a1, a2, a3, , a4] = counts as [
      (typeof counts)[0],
      (typeof counts)[0],
      (typeof counts)[0],
      unknown,
      (typeof counts)[0],
    ];
    // a few lazily made resources (an effect's first texture) may come on the second start; never 40 a start
    expect(Math.abs(a3.textures - a2.textures), 'textures, restart').toBeLessThanOrEqual(3);
    expect(Math.abs(a3.geometries - a2.geometries), 'geometries, restart').toBeLessThanOrEqual(3);
    expect(Math.abs(a4.textures - a3.textures), 'textures, A -> B -> A').toBeLessThanOrEqual(3);
    expect(Math.abs(a4.geometries - a3.geometries), 'geometries, A -> B -> A').toBeLessThanOrEqual(6);
    expect(a2.textures - a1.textures).toBeLessThan(10);
    expect(errors).toEqual([]);
  });
});
