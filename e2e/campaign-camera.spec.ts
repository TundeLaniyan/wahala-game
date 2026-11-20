/**
 * The campaign camera and asset lifecycle in a real browser (docs/CAMPAIGN_CAMERA.md, decisions CF1-CF7):
 *
 * - a campaign mission opens framed on the fighter: the floor the HUD-free band shows (`__WAHALA__.camera().view`) is a
 *   small part of the district and holds the fighter, from the first frame of the countdown;
 * - walking (real movement: forced intents through the match controller's own tick) moves the camera with the fighter;
 * - a 17 x 13 raid follows on a 740 x 360 phone; a 13 x 9 raid keeps the fixed whole-board framing (desktop and 844 x 390
 *   keep every raid fixed: tests/render/campaign-camera.test.ts);
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

/**
 * Polls until the camera pose stops changing across rendered frames (software WebGL can take seconds a frame, so two
 * reads between the same two frames prove nothing): at least 3 frames after the call, then two reads with a new frame
 * between them and the same pose.
 */
async function settled(page: Page): Promise<CameraStatus> {
  const frames = (): Promise<number> => page.evaluate(() => (window as any).__WAHALA__.matchLoad().frames);
  const start = await frames();
  let last = '';
  let lastFrame = -1;
  let status: CameraStatus | null = null;
  await expect
    .poll(
      async () => {
        status = await camera(page);
        const frame = await frames();
        if (frame < start + 3 || frame === lastFrame) return false;
        const key = status
          ? `${status.framing}:${status.pose.x.toFixed(2)}:${status.pose.z.toFixed(2)}:${status.pose.distance.toFixed(2)}`
          : 'null';
        const same = key === last && key !== 'null';
        last = key;
        lastFrame = frame;
        return same;
      },
      { timeout: 120_000, intervals: [500] },
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

/**
 * Walks (forced intents, real movement rules) along a shortest open path to a floor tile 6 steps away (a campaign area's
 * start can sit in a short bay, so a straight line is not enough); returns the tiles moved from the start.
 */
async function walk(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = (window as any).__WAHALA__;
    const s = w.getState();
    const me = s.players[0];
    const blocked = new Set<number>(s.sector?.blocked ?? []);
    const open = (x: number, y: number): boolean =>
      x >= 0 &&
      y >= 0 &&
      x < s.width &&
      y < s.height &&
      s.tiles[y * s.width + x] === 0 &&
      !blocked.has(y * s.width + x);
    const dirs = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] } as const;
    // breadth-first from the human: the first tile 6 steps out, and the way back to it
    const from = { x: me.x, y: me.y };
    const prev = new Map<number, number>([[from.y * s.width + from.x, -1]]);
    let frontier = [from.y * s.width + from.x];
    for (let d = 0; d < 6 && frontier.length; d++) {
      const next: number[] = [];
      for (const i of frontier)
        for (const [dx, dy] of Object.values(dirs)) {
          const x = (i % s.width) + dx;
          const y = Math.floor(i / s.width) + dy;
          const j = y * s.width + x;
          if (open(x, y) && !prev.has(j)) {
            prev.set(j, i);
            next.push(j);
          }
        }
      frontier = next;
    }
    // the tile 6 steps out that lies farthest in a straight line (a winding path may end next to the start)
    const far = (i: number): number =>
      Math.abs((i % s.width) - from.x) + Math.abs(Math.floor(i / s.width) - from.y);
    const goal = [...frontier].sort((a, b) => far(b) - far(a))[0] ?? [...prev.keys()].at(-1)!;
    const path: number[] = [];
    for (let i = goal; i !== -1; i = prev.get(i)!) path.unshift(i);
    let k = 1;
    for (let t = 0; t < 600 && k < path.length; t++) {
      const here = me.y * s.width + me.x;
      if (here === path[k] && me.stepRemaining === 0) k++;
      if (k >= path.length) break;
      const tx = path[k]! % s.width;
      const ty = Math.floor(path[k]! / s.width);
      const move = tx > me.x ? 'right' : tx < me.x ? 'left' : ty > me.y ? 'down' : 'up';
      w.controller().forceIntent(0, { move });
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
  test('restarting a mission keeps the GPU resources flat; A -> B -> A too', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop run only');
    test.setTimeout(900_000); // six match loads on software WebGL
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, '&noattract');
    // the same field mission twice, then another district's map and back, twice (A, A, B, A, B, A)
    const counts: { geometries: number; textures: number }[] = [];
    for (const id of [
      'oshodi.approach',
      'oshodi.approach',
      'mushin.approach',
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
    const [a1, a2, , a3, , a4] = counts as { geometries: number; textures: number }[];
    // before the fix every start left about 42 textures and 4 geometries (CF6). A restart is flat; a district seen once
    // leaves its shared, cached assets (models and enemy looks the asset library keeps for the next map that uses them:
    // 19 textures measured for Mushin's map, 39 after all 13 campaign maps, then flat: docs/CAMPAIGN_CAMERA.md CF10);
    // a second B -> A cycle adds nothing (the old leak added about 84 textures per cycle)
    expect(Math.abs(a2!.textures - a1!.textures), 'textures, restart').toBeLessThanOrEqual(3);
    expect(Math.abs(a2!.geometries - a1!.geometries), 'geometries, restart').toBeLessThanOrEqual(3);
    expect(a3!.textures - a2!.textures, 'textures cached by the first visit to B').toBeLessThanOrEqual(30);
    expect(Math.abs(a3!.geometries - a2!.geometries), 'geometries, A -> B -> A').toBeLessThanOrEqual(20);
    expect(Math.abs(a4!.textures - a3!.textures), 'textures, a second B -> A cycle').toBeLessThanOrEqual(3);
    expect(
      Math.abs(a4!.geometries - a3!.geometries),
      'geometries, a second B -> A cycle',
    ).toBeLessThanOrEqual(3);
    expect(errors).toEqual([]);
  });
});
