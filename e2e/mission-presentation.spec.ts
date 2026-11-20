/**
 * Campaign mission presentation in a real browser (docs/MISSION_PRESENTATION.md): a real Oshodi mission started through
 * the debug campaign controller shows its panel in the City Rumble right column under the minimap (never top-centre
 * over the player), the world markers exist for every objective node, and the objective compass points the way when
 * the node is off screen, at the edge of the screen and clear of every other HUD block. The simulation is the real one.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { clearOshodiSections, open, inMatch } from './helpers';

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
    await inMatch(page);
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

    // the compass: with the fighter where the nearest relay is farthest away (the boss plays in its bounded dispatch
    // corridor since WX9, so the relays can be on screen at the spawn), it points the way, at the edge
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the debug hook's raw state
      const w = (window as unknown as { __WAHALA__: any }).__WAHALA__;
      const s = w.getState();
      type N = { x: number; y: number; state: string };
      const all: N[] = s.mission.nodes;
      const live = all.filter((n) => n.state === 'live' || n.state === 'progress');
      const nodes = live.length ? live : all.filter((n) => n.state !== 'done');
      const blocked = new Set<number>(s.sector?.blocked ?? []);
      const rects: number[][] = s.sector?.rects ?? [[0, 0, s.width - 1, s.height - 1]];
      const inside = (x: number, y: number): boolean =>
        rects.some((r) => x >= r[0]! && x <= r[2]! && y >= r[1]! && y <= r[3]!);
      let best = { x: s.players[0].x, y: s.players[0].y, d: -1 };
      for (let y = 0; y < s.height; y++)
        for (let x = 0; x < s.width; x++) {
          const i = y * s.width + x;
          if (s.tiles[i] !== 0 || blocked.has(i) || !inside(x, y)) continue;
          const d = Math.min(...nodes.map((n) => Math.hypot(n.x - x, n.y - y)));
          if (d > best.d) best = { x, y, d };
        }
      const p = s.players[0];
      p.x = p.stepFromX = best.x;
      p.y = p.stepFromY = best.y;
      p.stepRemaining = 0;
      w.stepTicks(2);
      w.advance(30);
    });
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
