/**
 * Classic raid presentation in a real browser (docs/RAID_PRESENTATION.md): the whole board is visible on a desktop and a
 * phone, the cargo / conveyor / door / extraction markers are drawn, and on a touch device the movement control is the
 * floating thumbstick (the same as every other match, decision TN1; clear of the two action buttons) and moves the player
 * one cardinal tile per press, and the rail says what to do next (decision TN4). Runs ONLY when raid-sim's `warehouseDispatchDepot` is present in the build; otherwise it is skipped with the
 * reason. Screenshots go to docs/screenshots/raid-render/ (the art-review pictures).
 *
 * How a raid is started is raid-sim's / field-sections' API; `startRaid` below tries the campaign controller's raid entry
 * points and says plainly which one is missing, so the integrator adjusts one function.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { open, inMatch, thumb } from './helpers';

const ARENAS_DIR = join(process.cwd(), 'src', 'sim', 'arenas');
const HAS_RAID =
  existsSync(ARENAS_DIR) &&
  readdirSync(ARENAS_DIR).some(
    (f) => f.endsWith('.ts') && readFileSync(join(ARENAS_DIR, f), 'utf8').includes('warehouseDispatchDepot'),
  );
const OUT = join(process.cwd(), 'docs', 'screenshots', 'raid-render');

type Rect = { left: number; right: number; top: number; bottom: number };
type Debug = {
  __WAHALA__: {
    campaign(): Record<string, ((...a: unknown[]) => unknown) | undefined>;
    controller(): {
      frozen: boolean;
      state: { settings: { game: string }; players: { x: number; y: number }[] };
    };
    renderer(): {
      raidStats(): { cargo: number; marked: number; belts: number; doors: number; locked: number } | null;
      debugCamera(): { arenaInView: boolean; mode: string };
      boardScreenCorners(): { x: number; y: number }[] | null;
    };
    advance(n: number): void;
    stepTicks(n: number): void;
  };
};

async function startRaid(page: Page): Promise<void> {
  // the standalone raid entry of the debug handle (reached only through `?debug`): it plays a classic raid on its own,
  // exactly like a standalone raid mission, without touching the campaign's unlock rules
  const started = await page.evaluate(() => {
    const c = (window as unknown as Debug).__WAHALA__.campaign();
    c.load?.();
    c.startNew?.();
    c.storyDone?.();
    return typeof c.debugStartRaid === 'function' ? c.debugStartRaid('warehouseDispatchDepot') : null;
  });
  expect(started, 'the debug handle must offer debugStartRaid (app/campaign.ts)').toBe(true);
  await inMatch(page);
  await page.evaluate(() => {
    const w = (window as unknown as Debug).__WAHALA__;
    w.controller().frozen = true;
    w.stepTicks(260); // past the countdown
    w.advance(30);
  });
}

const rectOf = (page: Page, selector: string): Promise<Rect | null> =>
  page.evaluate((q) => {
    const el = document.querySelector(q);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  }, selector);
const hits = (a: Rect, b: Rect): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

test.describe('raid presentation', () => {
  test.skip(!HAS_RAID, 'raid-sim not in this base: no warehouseDispatchDepot arena to render yet');
  test.setTimeout(600_000); // software WebGL

  test('desktop: the whole board is visible, the fixed camera, cargo / belts / doors are drawn, no cross', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, '&noattract');
    await startRaid(page);
    const dbg = await page.evaluate(() => {
      const r = (window as unknown as Debug).__WAHALA__.renderer();
      return {
        cam: r.debugCamera(),
        stats: r.raidStats(),
        game: (window as unknown as Debug).__WAHALA__.controller().state.settings.game,
      };
    });
    expect(dbg.game).toBe('raid');
    expect(dbg.cam.mode, 'raids use the fixed whole-arena camera').toBe('arena');
    expect(dbg.cam.arenaInView, 'the whole board is visible').toBe(true);
    expect(dbg.stats, 'the raid markers exist').not.toBeNull();
    expect(dbg.stats!.cargo).toBeGreaterThan(0);
    expect(dbg.stats!.marked).toBeGreaterThan(0);
    // the four-arrow cross is gone (decision TN1): a raid uses the same stick as every match
    await expect(page.getByTestId('cross-control')).toHaveCount(0);
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: join(OUT, 'raid-desktop.jpg'), quality: 85, timeout: 180_000 });
    expect(errors).toEqual([]);
  });

  test.describe('phone landscape', () => {
    test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

    test('the stick drives the raid: clear of A / B, the rail names the objective, one cardinal tile per flick', async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await open(page, '&noattract');
      await startRaid(page);
      await expect(page.getByTestId('cross-control')).toHaveCount(0);
      await expect(page.getByTestId('stick-zone')).toBeVisible();
      const pad = (await rectOf(page, '[data-testid="stick-pad"]'))!;
      // exactly two action buttons, on the right, untouched by the pad
      await expect(page.locator('.abtn')).toHaveCount(2);
      for (const id of ['btn-place', 'btn-special']) {
        const b = (await rectOf(page, `[data-testid="${id}"]`))!;
        expect(hits(pad, b), `${id} overlaps the pad`).toBe(false);
      }
      // the objective block is in the rail, beside the board and clear of the pad and the buttons
      await expect(page.getByTestId('raid-goal')).toBeVisible();
      await expect(page.getByTestId('raid-goal-tag')).toHaveText('DESTROY');
      await expect(page.getByTestId('raid-goal-cue')).toContainText('TILE');
      const goal = (await rectOf(page, '[data-testid="raid-goal"]'))!;
      const corners = await page.evaluate(() =>
        (window as unknown as Debug).__WAHALA__.renderer().boardScreenCorners(),
      );
      expect(corners).not.toBeNull();
      // the board's left edge slants (narrower rows near the bottom): the block must stay left of the edge at ITS OWN
      // lowest row, which is what the rail is sized for (not of the near corner, which is far below it)
      const [far, near] = [corners![0]!, corners![3]!];
      const edgeAtBottom = far.x + ((near.x - far.x) * (goal.bottom - far.y)) / (near.y - far.y);
      expect(goal.right, 'the objective block reaches into the board').toBeLessThanOrEqual(edgeAtBottom + 2);
      expect(hits(goal, pad), 'the objective block overlaps the pad').toBe(false);
      for (const id of ['btn-place', 'btn-special'])
        expect(hits(goal, (await rectOf(page, `[data-testid="${id}"]`))!)).toBe(false);
      // a press moves exactly one tile. Only `stepTicks` advances time while the thumb is down: on a software renderer the
      // real loop would tick many times between the pointer events and walk several tiles (a held stick walks)
      await page.evaluate(() => ((window as unknown as Debug).__WAHALA__.controller().frozen = true));
      const before = await page.evaluate(() => {
        const p = (window as unknown as Debug).__WAHALA__.controller().state.players[0]!;
        return { x: p.x, y: p.y };
      });
      await thumb(page, 'right', 4, { dist: 40 });
      await page.evaluate(() => (window as unknown as Debug).__WAHALA__.stepTicks(40));
      const after = await page.evaluate(() => {
        const p = (window as unknown as Debug).__WAHALA__.controller().state.players[0]!;
        return { x: p.x, y: p.y };
      });
      expect(
        Math.abs(after.x - before.x) + Math.abs(after.y - before.y),
        'one cardinal tile at most',
      ).toBeLessThanOrEqual(1);
      mkdirSync(OUT, { recursive: true });
      await page.evaluate(() => ((window as unknown as Debug).__WAHALA__.controller().frozen = true));
      await page.screenshot({ path: join(OUT, 'raid-phone.jpg'), quality: 85, timeout: 180_000 });
      expect(errors).toEqual([]);
    });
  });
});
