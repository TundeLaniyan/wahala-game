/**
 * Mission guidance in a real browser (docs/MISSION_GUIDANCE.md, decisions MG1-MG8), desktop and phone landscape:
 *
 *   1. the campaign's Continue opens the visual briefing of the first field mission: the right objective, the picture of
 *      the real target (rendered with the game's own builders), START begins it; in play the objective block has the
 *      route cue; the pause menu shows the same card, compact;
 *   2. the door of that mission hands over to the warehouse raid at a SAFE moment: the raid's instructions are up and the
 *      raid is HELD (its clock does not move) until START; then every marked cargo wears a pin, a generator placed by the
 *      human (the real `place` intent, debug-stepped) takes them down one by one, the counter and the rail notice follow,
 *      and after the last one the exit opens with its pin and the guidance points at it. No rail block covers the board's
 *      bottom row or the fighter.
 *
 * Every coordinate is read from the running state (the checkpoints, the door, the cargo): nothing here depends on where
 * a district's sector places them. Screenshots: docs/screenshots/campaign-guidance-expansion/guidance/.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { inMatch, open } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const OUT = join(process.cwd(), 'docs', 'screenshots', 'campaign-guidance-expansion', 'guidance');

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, `${name}-${info.project.name}.png`), animations: 'disabled' });
}

async function newCampaign(page: Page): Promise<void> {
  await page.evaluate(() => {
    const c = (window as any).__WAHALA__.campaign();
    c.load();
    c.startNew();
    c.storyDone();
  });
}

/** Freezes real-time stepping and skips to play: only debug steps move the sim from here. */
async function freezeToPlay(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = (window as any).__WAHALA__;
    w.controller().frozen = true;
    const s = w.getState();
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
    w.advance(2);
  });
}

type Rect = { left: number; top: number; right: number; bottom: number };
const rectsOf = (page: Page, sel: string): Promise<Rect[]> =>
  page.evaluate(
    (q) =>
      [...document.querySelectorAll(q)]
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })),
    sel,
  );

/** X of the board's left edge at screen height y (e2e/hud-combat.spec.ts). */
function leftEdgeAt(b: { x: number; y: number }[], y: number): number {
  const far = b[0]!;
  const near = b[3]!;
  const t = Math.min(1, Math.max(0, (y - far.y) / (near.y - far.y)));
  return far.x + (near.x - far.x) * t;
}

test.describe('mission guidance', () => {
  test.setTimeout(600_000); // software WebGL

  test('the briefing comes before the field mission with its objective and picture; START begins it; pause shows it', async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, '&noattract');
    await newCampaign(page);
    await expect(page.getByTestId('menu-campaign')).toBeVisible();
    await page.getByTestId('campaign-continue').click();

    // the briefing: the mission, ONE objective from the data, the picture of the real target, START and Back
    await expect(page.getByTestId('menu-missionBrief')).toBeVisible();
    await expect(page.getByTestId('menu-missionBrief')).toContainText('Terminal Approach');
    await expect(page.getByTestId('mission-brief-objective')).toHaveText('RAID THE DISPATCH DEPOT');
    await expect(page.getByTestId('mission-brief-action')).toContainText('Inside: destroy 3 marked cargo');
    await expect(page.getByTestId('mission-brief-blast')).toHaveAttribute('data-rule', 'radial');
    const pic = page.getByTestId('mission-brief-picture');
    await expect(pic).toHaveAttribute('data-glyph', 'door');
    // the picture is the game's own door rendered offscreen (software WebGL renders it too)
    await expect(pic).toHaveAttribute('data-preview', 'live', { timeout: 60_000 });
    await expect(page.getByTestId('menu-back')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'no horizontal scroll').toBeLessThanOrEqual(1);
    await shot(page, info, 'brief-field');

    await page.getByTestId('mission-brief-start').click();
    await inMatch(page);
    await freezeToPlay(page);
    // in play: the objective block with its glyph and the way along the route
    const goal = page.getByTestId('field-goal');
    await expect(goal).toBeVisible();
    await expect(goal.locator('[data-glyph="checkpoint"]')).toHaveCount(1);
    await expect(page.getByTestId('field-goal-cue')).toBeVisible();
    await expect(page.getByTestId('field-goal-cue')).toHaveAttribute('data-via', /walk|blast/);

    // pause: the same briefing, compact
    await page.evaluate(() => (window as any).__WAHALA__.controller().setPaused(true));
    const review = page.getByTestId('pause-mission-brief');
    await expect(review).toBeVisible();
    await expect(review).toHaveAttribute('data-compact', 'yes');
    await expect(review.getByTestId('mission-brief-objective')).toHaveText('RAID THE DISPATCH DEPOT');
    await shot(page, info, 'pause-review');
    await page.evaluate(() => (window as any).__WAHALA__.controller().setPaused(false));
    await expect(page.getByTestId('pause-overlay')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('the raid: instructions at the door with the raid held, cargo pins, the counter per real blast, then the exit', async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, '&noattract');
    await newCampaign(page);
    expect(
      await page.evaluate(() => (window as any).__WAHALA__.campaign().startSectionMission('oshodi.approach')),
    ).toBe(true);
    await inMatch(page);
    await freezeToPlay(page);

    // walk the checkpoints and stand on the door (staged from the state's own nodes): the raid request goes up
    await page.evaluate(() => {
      const w = (window as any).__WAHALA__;
      const s = w.getState();
      const p = s.players[0];
      const at = (x: number, y: number, ticks: number): void => {
        p.x = p.stepFromX = x;
        p.y = p.stepFromY = y;
        p.stepRemaining = 0;
        p.protectedUntil = s.tick + 100000; // staging only
        w.stepTicks(ticks);
      };
      for (const n of s.mission.nodes.filter((o: any) => /^mk\d+$/.test(o.id))) at(n.x, n.y, 2);
      const door = s.mission.field.doors.find((d: any) => d.required);
      at(door.x, door.y, 70);
    });
    await expect
      .poll(() => page.evaluate(() => !!(window as any).__WAHALA__.getState()?.raid), { timeout: 120_000 })
      .toBe(true);
    await expect(page.getByTestId('match-loading')).toHaveCount(0, { timeout: 240_000 });

    // the raid's instructions, over the HELD raid
    const brief = page.getByTestId('raid-brief');
    await expect(brief).toBeVisible();
    await expect(brief.getByTestId('mission-brief-objective')).toHaveText('DESTROY 3 MARKED CARGO');
    await expect(brief.getByTestId('mission-brief-blast')).toContainText(
      'CROSS-SHAPED BLASTS: a generator blasts along its row and column, walls stop it.',
    );
    await expect(brief.getByTestId('mission-brief-blast')).not.toContainText(/round|radial|disc/i);
    await expect(brief.getByTestId('mission-brief-legend')).toContainText('TARGET');
    await expect(brief.getByTestId('mission-brief-legend')).toContainText('OBSTACLE');
    await expect(brief.getByTestId('mission-brief-exit')).toContainText('exit opens');
    await expect(brief.getByTestId('mission-brief-picture')).toHaveAttribute('data-glyph', 'cargo');
    await expect(brief.getByTestId('mission-brief-picture')).toHaveAttribute('data-preview', 'live', {
      timeout: 60_000,
    });
    // real frames pass under it, the raid's clock does not move
    await page.evaluate(() => {
      (window as any).__WAHALA__.controller().frozen = false;
    });
    const t0 = await page.evaluate(() => (window as any).__WAHALA__.getState().tick);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => (window as any).__WAHALA__.getState().tick)).toBe(t0);
    expect(await page.evaluate(() => (window as any).__WAHALA__.controller().briefHeld)).toBe(true);
    await shot(page, info, 'brief-raid');
    await page.getByTestId('raid-brief-start').click();
    await expect(brief).toHaveCount(0);
    await freezeToPlay(page);

    // every marked cargo wears a pin; the rail counts 0/3 with the way there along the corridors
    await expect
      .poll(() => page.evaluate(() => (window as any).__WAHALA__.objectivePins()?.byGlyph?.cargo ?? 0))
      .toBe(3);
    await expect(page.getByTestId('raid-goal-step')).toHaveText('0/3');
    await expect(page.getByTestId('raid-goal')).toHaveAttribute('data-verb', 'destroy');
    await expect(page.getByTestId('raid-goal-cue')).toBeVisible();

    // nothing in the rail covers the board's bottom row or the fighter
    const board = (await page.evaluate(() => (window as any).__WAHALA__.store.getState().board)) as {
      x: number;
      y: number;
    }[];
    expect(board).not.toBeNull();
    const nearY = board[3]!.y;
    const [rail] = await rectsOf(page, '[data-testid="hud-rail"]');
    for (const block of await rectsOf(page, '[data-testid="rail-combat"] > *')) {
      const r = { ...block, bottom: Math.min(block.bottom, rail!.bottom) };
      expect(r.right, 'a rail block overlaps the board').toBeLessThanOrEqual(
        leftEdgeAt(board, r.bottom) + 0.5,
      );
      expect(r.bottom, 'a rail block reaches the bottom row').toBeLessThan(nearY);
    }
    const fighter = (await page.evaluate(() => {
      const w = (window as any).__WAHALA__;
      const me = w.getState().players[0];
      return w.renderer().projectTiles([{ x: me.x, y: me.y }])[0];
    })) as { x: number; y: number };
    for (const r of await rectsOf(page, '[data-testid="hud-rail"] *'))
      expect(
        fighter.x >= r.left && fighter.x <= r.right && fighter.y >= r.top && fighter.y <= r.bottom,
        'a rail element covers the fighter',
      ).toBe(false);
    await shot(page, info, 'raid-pins');

    // a generator laid by the human (the real place intent) beside each marked crate, until it is down
    const destroyOne = async (): Promise<void> => {
      const ok = await page.evaluate(() => {
        const w = (window as any).__WAHALA__;
        const s = w.getState();
        const width = s.width;
        const free = (x: number, y: number): boolean =>
          x >= 0 && y >= 0 && x < width && y < s.height && s.tiles[y * width + x] === 0;
        const c = s.raid.cargo.find((k: any) => k.marked && !k.destroyed);
        if (!c) return false;
        const me = s.players[0];
        for (let attempt = 0; attempt < 4 && !c.destroyed; attempt++) {
          const spot = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]
            .map(([dx, dy]) => ({ x: c.x + dx!, y: c.y + dy! }))
            .find((a) => free(a.x, a.y) && !s.generators.some((g: any) => g.x === a.x && g.y === a.y));
          if (!spot) return false;
          const stand = (x: number, y: number): void => {
            me.x = me.stepFromX = x;
            me.y = me.stepFromY = y;
            me.stepRemaining = 0;
            me.protectedUntil = s.tick + 100000; // staging only: the human must not fall to its own blast
            if (me.vitals) me.vitals.invulnUntil = s.tick + 100000;
          };
          stand(spot.x, spot.y);
          w.controller().forceIntent(0, { place: true });
          w.advance(1);
          stand(s.raid.entrance.x, s.raid.entrance.y);
          // the fuse without drawing each tick, then the blast routed like real play (HUD, notices, pins), then the flames
          const g = s.generators.find((o: any) => o.ownerId === 0);
          w.stepTicks(Math.max(0, (g?.timer ?? 0) - 3));
          w.advance(30);
          w.stepTicks(60);
        }
        return c.destroyed;
      });
      expect(ok, 'a marked crate went down to the human’s generators').toBe(true);
    };

    await destroyOne();
    await expect(page.getByTestId('raid-goal-step')).toHaveText('1/3');
    await expect(page.getByTestId('toast').filter({ hasText: 'MARKED CARGO DOWN 1/3 ✓' })).toContainText(
      'NEXT: MARKED CARGO',
    );
    await expect
      .poll(() => page.evaluate(() => (window as any).__WAHALA__.objectivePins()?.byGlyph?.cargo ?? 0))
      .toBe(2);
    await destroyOne();
    await expect(page.getByTestId('raid-goal-step')).toHaveText('2/3');
    await destroyOne();

    // the last one: the exit opens with its pin, the guidance points at it
    await expect(page.getByTestId('raid-goal')).toHaveAttribute('data-verb', 'exit');
    await expect(page.getByTestId('raid-goal-target')).toHaveText('REACH THE EXIT');
    await expect(page.getByTestId('raid-goal-cue')).toBeVisible();
    await expect(page.getByTestId('toast').filter({ hasText: 'MARKED CARGO DOWN 3/3 ✓' })).toContainText(
      'NEXT: REACH THE EXIT',
    );
    await expect
      .poll(() => page.evaluate(() => (window as any).__WAHALA__.objectivePins()?.byGlyph?.exit ?? 0))
      .toBe(1);
    expect(await page.evaluate(() => (window as any).__WAHALA__.raidMarkers()?.extraction)).toBe(true);
    await shot(page, info, 'raid-exit');
    expect(errors).toEqual([]);
  });
});
