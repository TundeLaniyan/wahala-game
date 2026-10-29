/**
 * Adaptive graphics in a real page: Auto is the default, the capability probe recognises the software
 * renderer of the test browser, Auto lowers and raises quality from frame times (synthetic frames on a
 * virtual clock through the debug handle, so the thresholds are exercised without a slow machine), a manual
 * level is never touched, the quiet notice appears beside the board without covering it, and none of it
 * changes the simulation.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openSettings, pauseSettings, startMatch, stepTicks } from './helpers';

interface Status {
  setting: string;
  auto: boolean;
  rung: number;
  name: string;
  level: string;
  estimate: { rung: number; ceiling: number; reasons: string[] };
  controller: { pinned: boolean; changes: number };
}
type Debug = {
  __WAHALA__: {
    quality(): Status;
    stats(): { qualityName: string; auto: boolean; pixelRatio: number };
    feedFrames(
      ms: number,
      count: number,
      opts?: { busy?: boolean },
    ): { from: number; to: number; direction: string; reason: string }[];
    getState(): unknown;
    store: { getState(): { board: { x: number; y: number }[] | null } };
  };
};

const quality = (page: Page) => page.evaluate(() => (window as never as Debug).__WAHALA__.quality());
const feed = (page: Page, ms: number, count: number, busy = false) =>
  page.evaluate(
    ([m, c, b]) =>
      (window as never as Debug).__WAHALA__.feedFrames(m as number, c as number, { busy: b as boolean }),
    [ms, count, busy] as const,
  );

/** Like `feed`, but also returns the notice texts in the UI store at the moment the frames were fed
 * (toasts live a few seconds of real time and a software-rendered frame can take longer than that). */
const feedWithNotices = (page: Page, ms: number, count: number) =>
  page.evaluate(
    ([m, c]) => {
      const w = (
        window as never as {
          __WAHALA__: {
            feedFrames(
              ms: number,
              count: number,
            ): { from: number; to: number; direction: string; reason: string }[];
            store: { getState(): { toasts: { text: string }[] } };
          };
        }
      ).__WAHALA__;
      const changes = w.feedFrames(m as number, c as number);
      return { changes, notices: w.store.getState().toasts.map((t) => t.text) };
    },
    [ms, count] as const,
  );

async function openAuto(page: Page, extra = ''): Promise<void> {
  await page.goto(`./?debug&q=auto&seed=7&noattract${extra}`);
  await expect(page.getByTestId('title-screen')).toBeVisible();
}

test.describe('adaptive graphics', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test('Auto is the default, every level is offered, and the status is shown in Settings', async ({
    page,
  }) => {
    await page.goto('./?debug&seed=7&noattract');
    await expect(page.getByTestId('title-screen')).toBeVisible();
    expect((await quality(page)).setting).toBe('auto');
    await openSettings(page, 'graphics');
    await expect(page.getByTestId('quality-auto')).toHaveAttribute('aria-pressed', 'true');
    for (const q of ['veryLow', 'low', 'mediumLow', 'medium', 'mediumHigh', 'high'])
      await expect(page.getByTestId(`quality-${q}`)).toBeVisible();
    await expect(page.getByTestId('quality-status')).toContainText('Now using');
    await expect(page.getByTestId('quality-status')).toContainText('Auto');
  });

  test('the capability probe recognises the software renderer and starts on the lowest rungs', async ({
    page,
  }) => {
    await openAuto(page);
    const q = await quality(page);
    expect(q.estimate.reasons.join(' ')).toMatch(/software renderer/);
    expect(q.estimate.rung).toBe(0);
    expect(q.estimate.ceiling).toBeLessThanOrEqual(2); // Auto never climbs to heavy rungs on a software renderer
    expect(q.rung).toBe(0);
    expect(q.name).toBe('Very Low');
  });

  test('manual choices persist, are labelled "set by you" and survive a reload', async ({ page }) => {
    await openAuto(page);
    await openSettings(page, 'graphics');
    await page.getByTestId('quality-mediumLow').click();
    await expect(page.getByTestId('quality-status')).toContainText('Medium-Low');
    await expect(page.getByTestId('quality-status')).toContainText('set by you');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wahala.settings.v1')!).quality)).toBe(
      'mediumLow',
    );
    await page.goto('./?debug&seed=7&noattract'); // no ?q: the saved choice applies
    await expect(page.getByTestId('title-screen')).toBeVisible();
    const q = await quality(page);
    expect(q).toMatchObject({ setting: 'mediumLow', auto: false, name: 'Medium-Low' });
    await openSettings(page, 'graphics');
    await expect(page.getByTestId('quality-mediumLow')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('quality-auto').click();
    await expect(page.getByTestId('quality-status')).toContainText('Auto');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wahala.settings.v1')!).quality)).toBe(
      'auto',
    );
  });

  test('Auto lowers quality when frames stay slow and raises it when there is headroom, with a quiet notice', async ({
    page,
  }, info) => {
    await openAuto(page);
    // start from a mid rung so there is room both ways (the test browser itself is a software renderer)
    await startMatch(page, { competitors: 2, waitPlaying: false });
    await expect(page.getByTestId('hud')).toBeVisible();
    const before = await quality(page);
    expect(before.auto).toBe(true);
    // 1) comfortable 60 fps for a minute: it climbs, one rung at a time, to the ceiling for this device
    const { changes: up, notices: upNotices } = await feedWithNotices(page, 1000 / 60, 60 * 120);
    expect(up.length).toBeGreaterThanOrEqual(1);
    expect(upNotices.some((t) => /^Graphics increased · /.test(t))).toBe(true);
    expect(up.every((c) => c.direction === 'up' && c.to === c.from + 1)).toBe(true);
    const mid = await quality(page);
    expect(mid.rung).toBeGreaterThan(before.rung);
    expect(mid.rung).toBeLessThanOrEqual(before.estimate.ceiling);
    // 2) a sustained 25 fps: it drops one rung (not straight to the floor), and says so
    const { changes: down, notices: downNotices } = await feedWithNotices(page, 40, 25 * 15);
    expect(down).toHaveLength(1);
    expect(down[0]).toMatchObject({ direction: 'down', from: mid.rung, to: mid.rung - 1 });
    const low = await quality(page);
    expect(low.rung).toBe(mid.rung - 1);
    expect(downNotices.some((t) => /Graphics reduced · /.test(t))).toBe(true);
    await page.screenshot({ path: `e2e-shots/${info.project.name}-quality-notice.png` });
    // Settings shows the level now in use
    await stepTicks(page, 170); // past the countdown: Esc pauses only once play is on
    await pauseSettings(page, 'graphics');
    await expect(page.getByTestId('quality-current')).toHaveText(low.name);
  });

  test('a few slow frames in an otherwise steady stream do not change quality', async ({ page }) => {
    await openAuto(page);
    await startMatch(page, { competitors: 2, waitPlaying: false });
    const before = await quality(page);
    // 50 fps sits between the drop line (45) and the raise line (55): nothing should ever change here
    expect(await feed(page, 20, 50 * 20)).toEqual([]);
    // a 400 ms hiccup every ten seconds in the same stream
    for (let i = 0; i < 6; i++) {
      expect(await feed(page, 400, 1)).toEqual([]);
      expect(await feed(page, 20, 50 * 9)).toEqual([]);
    }
    expect((await quality(page)).rung).toBe(before.rung);
  });

  test('a manual level is never changed by performance', async ({ page }) => {
    await openAuto(page);
    await openSettings(page, 'graphics');
    await page.getByTestId('quality-medium').click();
    await page.getByTestId('settings-close').click();
    await startMatch(page, { competitors: 2, waitPlaying: false });
    const before = await quality(page);
    expect(before).toMatchObject({ setting: 'medium', auto: false, name: 'Medium' });
    expect(await feed(page, 80, 12 * 120)).toEqual([]); // 12 fps for two minutes
    expect(await feed(page, 1000 / 144, 144 * 120)).toEqual([]);
    expect(await quality(page)).toMatchObject({ rung: before.rung, name: 'Medium' });
    await expect(page.getByTestId('toast').filter({ hasText: /Graphics/ })).toHaveCount(0);
  });

  test('notices go to the HUD rail: top-left, clear of the board', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one geometry check is enough');
    await openAuto(page);
    await startMatch(page, { competitors: 2, waitPlaying: false });
    // the notice is a toast in this rail (toasts only live a few seconds, so the rail itself is measured)
    const rail = page.getByTestId('hud-rail');
    await expect(rail).toBeAttached();
    const t = (await rail.boundingBox())!;
    const board = await page.evaluate(() => (window as never as Debug).__WAHALA__.store.getState().board);
    expect(board).not.toBeNull();
    const far = board![0]!;
    const near = board![3]!;
    const k = Math.min(1, Math.max(0, (t.y + t.height - far.y) / (near.y - far.y)));
    const leftEdge = far.x + (near.x - far.x) * k;
    expect(t.x + t.width).toBeLessThanOrEqual(leftEdge + 1);
    expect(t.x).toBeLessThan(200); // top-left of the screen
    // and a real notice lands inside it
    const { notices } = await feedWithNotices(page, 1000 / 60, 60 * 60);
    expect(notices.some((t) => /^Graphics increased · /.test(t))).toBe(true);
  });

  test('quality never touches the simulation: the same seed plays out identically at any quality', async ({
    page,
  }, info) => {
    test.skip(
      info.project.name !== 'desktop',
      'software rendering makes the render passes slow; one project is enough',
    );
    test.setTimeout(8 * 60_000);
    type Ctl = { frozen: boolean; debugAdvance(n: number): void };
    const run = async (url: string, midMatch?: () => Promise<void>): Promise<string> => {
      await page.goto(url);
      await expect(page.getByTestId('title-screen')).toBeVisible();
      await startMatch(page, { competitors: 4, waitPlaying: false });
      // to tick 700 on the simulation alone, quality change in the middle, then a few ticks through the renderer
      await page.evaluate(() => {
        const w = (
          window as never as {
            __WAHALA__: { controller(): Ctl; getState(): { tick: number }; stepTicks(n: number): void };
          }
        ).__WAHALA__;
        w.controller().frozen = true;
        w.stepTicks(Math.max(0, 350 - w.getState().tick));
      });
      await midMatch?.();
      return page.evaluate(() => {
        const w = (
          window as never as {
            __WAHALA__: {
              controller(): Ctl;
              getState(): {
                tick: number;
                players: { x: number; y: number; alive: boolean }[];
                generators: unknown[];
                flames: unknown[];
                tiles: number[];
              };
              stepTicks(n: number): void;
            };
          }
        ).__WAHALA__;
        w.stepTicks(700 - w.getState().tick - 12);
        w.controller().debugAdvance(12); // events and frames through the renderer, as in real play
        const s = w.getState();
        return JSON.stringify({
          tick: s.tick,
          p: s.players.map((p) => [p.x, p.y, p.alive]),
          g: s.generators.length,
          f: s.flames.length,
          tiles: s.tiles.join(''),
        });
      });
    };
    const high = await run('./?debug&q=high&seed=11&noattract');
    const veryLow = await run('./?debug&q=veryLow&seed=11&noattract');
    const auto = await run('./?debug&q=auto&seed=11&noattract', async () => {
      await feed(page, 1000 / 60, 60 * 90);
      await feed(page, 40, 25 * 15);
    });
    expect(JSON.parse(high).tick).toBe(700);
    expect(veryLow).toBe(high);
    expect(auto).toBe(high);
  });

  test('the stats overlay names the level and shows where the frame goes', async ({ page }) => {
    await openAuto(page, '&fps');
    await startMatch(page, { competitors: 2, waitPlaying: false });
    await stepTicks(page, 5);
    await expect(page.locator('.fps')).toContainText('Auto Very Low');
    await expect(page.locator('.fps')).toContainText('render');
  });
});
