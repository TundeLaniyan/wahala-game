/**
 * Mobile campaign HUD fit (docs/CAMPAIGN_INTEGRATION.md): in the Oshodi field mission the dock under the minimap (objective,
 * health, lives, phase) is fully visible at representative phone sizes in landscape and portrait, never clipped at the
 * bottom and never over the touch controls. Staged on the depot door, the longest content (the hold bar). Regression: on a
 * phone in landscape the Lives row was cut off.
 */
import { expect, test } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
const SIZES: [string, number, number][] = [
  ['667x375', 667, 375],
  ['844x390', 844, 390],
  ['915x412', 915, 412],
  ['390x844 portrait', 390, 844],
  ['360x740 portrait', 360, 740],
];

for (const [name, width, height] of SIZES) {
  test(`dock fits on a ${name} phone`, async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'one project is enough: the viewport is set here');
    await page.setViewportSize({ width, height });
    await page.goto('./?debug&noattract&seed=7');
    await page.getByTestId('title-screen').waitFor();
    await page.evaluate(() => {
      const c = (window as any).__WAHALA__.campaign();
      c.load();
      c.startNew();
      c.storyDone();
      c.startSectionMission('oshodi.approach');
    });
    await page.getByTestId('hud').waitFor();
    await page.evaluate(() => {
      const w = (window as any).__WAHALA__;
      const c = w.controller();
      c.frozen = true;
      const s = c.state;
      while (s.match.phase !== 'playing') w.stepTicks(10);
      w.stepTicks(120);
      const p = s.players[0];
      p.protectedUntil = s.tick + 100000;
      const legs = [
        [9, 39],
        [19, 39],
        [26, 40],
      ];
      for (const [lx, ly] of legs) {
        p.x = p.stepFromX = lx;
        p.y = p.stepFromY = ly;
        p.stepRemaining = 0;
        w.stepTicks(2);
      }
      p.x = p.stepFromX = 25;
      p.y = p.stepFromY = 44;
      p.stepRemaining = 0;
      w.stepTicks(24);
    });
    const dock = page.getByTestId('mission-dock');
    await expect(dock).toBeVisible();
    await expect(page.getByTestId('mission-lives')).toBeVisible();
    await expect(page.getByTestId('field-hold')).toBeVisible();
    // measured after the dock has sized itself against the action buttons
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const d = document.querySelector('[data-testid="mission-dock"]')!;
          const box = d.getBoundingClientRect();
          const kids = [...d.children].map((k) => k.getBoundingClientRect().bottom);
          return Math.round(Math.max(...kids) - box.bottom);
        }),
      )
      .toBeLessThanOrEqual(1);
    const clear = await page.evaluate(() => {
      const d = document.querySelector('[data-testid="mission-dock"]')!.getBoundingClientRect();
      const lives = document.querySelector('[data-testid="mission-lives"]')!.getBoundingClientRect();
      const hit = [...document.querySelectorAll('.abtn')].some((el) => {
        const b = el.getBoundingClientRect();
        return d.left < b.right && d.right > b.left && d.top < b.bottom && d.bottom > b.top;
      });
      return { hit, livesInside: lives.bottom <= d.bottom + 1 && lives.right <= innerWidth };
    });
    expect(clear.hit).toBe(false);
    expect(clear.livesInside).toBe(true);
  });
}
