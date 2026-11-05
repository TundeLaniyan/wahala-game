/**
 * Campaign mission presentation in a real browser (docs/MISSION_PRESENTATION.md): a real Oshodi mission started through
 * the debug campaign controller shows its panel in the City Rumble right column under the minimap (never top-centre
 * over the player), the world markers exist for every objective node, and the objective compass points the way when
 * the node is off screen, at the edge of the screen and clear of every other HUD block. The simulation is the real one.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { clearOshodiSections, open } from './helpers';

type Debug = {
  __WAHALA__: {
    campaign(): {
      load(): void;
      startNew(): void;
      storyDone(): void;
      beginBriefing(id: string): void;
      startFromBriefing(): void;
      bossIntroDone(): void;
    };
    controller(): { frozen: boolean; state: { mission: { nodes: unknown[] } } };
    advance(n: number): void;
    stepTicks(n: number): void;
    missionMarkers(): { nodes: number; boss: boolean; visible: boolean } | null;
  };
};

type Rect = { left: number; right: number; top: number; bottom: number };
const rectOf = (page: Page, selector: string): Promise<Rect | null> =>
  page.evaluate((q) => {
    const el = document.querySelector(q);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  }, selector);
const hits = (a: Rect, b: Rect): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

test.describe('mission presentation', () => {
  test.setTimeout(600_000); // software WebGL

  test('the panel is in the right column, the nodes have markers and the compass sits on the screen edge', async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, '&noattract');
    await page.evaluate(() => {
      const c = (window as unknown as Debug).__WAHALA__.campaign();
      c.load();
      c.startNew();
      c.storyDone();
    });
    await clearOshodiSections(page); // the boss is gated behind the district's sections (the real rule stays on)
    await page.evaluate(() => {
      const c = (window as unknown as Debug).__WAHALA__.campaign();
      c.beginBriefing('oshodi');
      c.startFromBriefing();
      c.bossIntroDone();
    });
    await expect(page.getByTestId('hud')).toBeVisible();
    await page.evaluate(() => {
      const w = (window as unknown as Debug).__WAHALA__;
      w.controller().frozen = true;
      w.stepTicks(260); // past the countdown: the match is playing
      w.advance(30);
    });
    await expect(page.getByTestId('mission-panel')).toBeVisible();
    const vp = page.viewportSize()!;

    // the panel: in the City Rumble right column, not in the rail, not over the middle of the screen
    await expect(
      page.locator('[data-testid="rumble-right"] [data-testid="mission-dock"] [data-testid="mission-panel"]'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="hud-rail"] [data-testid="mission-panel"]')).toHaveCount(0);
    const panel = (await rectOf(page, '[data-testid="mission-panel"]'))!;
    expect(panel.left, 'the panel reaches the middle of the screen').toBeGreaterThan(vp.width * 0.5);
    expect(panel.right).toBeLessThanOrEqual(vp.width);
    expect(panel.bottom, 'the panel reaches the bottom of the screen').toBeLessThan(vp.height * 0.8);
    for (const q of [
      '[data-testid="minimap"]',
      '.timer',
      '.top-buttons',
      '[data-testid="inventory"]',
      '.abtn',
      '[data-testid="stick-pad"]',
      '[data-testid="rumble-hud"]',
    ]) {
      const o = await rectOf(page, q);
      if (o) expect(hits(panel, o), `the panel covers ${q}`).toBe(false);
    }

    // world markers: one per node of the phase
    const marks = await page.evaluate(() => {
      const w = (window as unknown as Debug).__WAHALA__;
      return { markers: w.missionMarkers(), nodes: w.controller().state.mission.nodes.length };
    });
    expect(marks.markers).not.toBeNull();
    expect(marks.markers!.nodes).toBe(marks.nodes);
    expect(marks.markers!.boss).toBe(true);

    // the compass: the relays are not on screen at the spawn, so it points the way, at the edge
    const compass = page.getByTestId('mission-compass');
    await expect(compass).toHaveAttribute('data-shown', 'yes');
    expect(Number(await compass.getAttribute('data-tiles'))).toBeGreaterThan(0);
    const c = (await rectOf(page, '[data-testid="mission-compass"]'))!;
    const cx = (c.left + c.right) / 2;
    const cy = (c.top + c.bottom) / 2;
    const centre = {
      left: vp.width * 0.25,
      right: vp.width * 0.75,
      top: vp.height * 0.2,
      bottom: vp.height * 0.8,
    };
    expect(
      hits({ left: cx, right: cx + 1, top: cy, bottom: cy + 1 }, centre),
      'the compass is over the middle of the screen',
    ).toBe(false);
    for (const q of [
      '[data-testid="mission-dock"]',
      '[data-testid="minimap"]',
      '.timer',
      '.top-buttons',
      '[data-testid="inventory"]',
      '.abtn',
      '[data-testid="stick-pad"]',
      '[data-testid="rumble-hud"]',
    ]) {
      const o = await rectOf(page, q);
      if (o) expect(hits(c, o), `the compass covers ${q}`).toBe(false);
    }

    await page.screenshot({
      path: `e2e-shots/${info.project.name}-mission-presentation.png`,
      timeout: 180_000,
    });
    expect(errors).toEqual([]);
  });
});
