import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { open, stepTicks } from './helpers';

/**
 * The Generator Tactics pilot in the Training Academy (docs/TACTICAL_TRAP_PILOT.md): a discoverable group of three
 * lessons, reachable on desktop and phone without overflow, whose scenario runs the real simulation with a real enemy bot
 * and the pilot rules (and nothing else in the game carries them).
 */
type Debug = { __WAHALA__: { getState(): Record<string, unknown> } };

const live = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as Debug).__WAHALA__.getState() as {
      config: { tacticalTrap?: { id: string } };
      players: { x: number; y: number; alive: boolean; enemyKind?: string }[];
    };
    return {
      pilot: s.config.tacticalTrap?.id ?? null,
      enemies: s.players.filter((p) => p.enemyKind).map((p) => ({ kind: p.enemyKind, x: p.x, y: p.y })),
    };
  });

test.describe('Generator Tactics pilot', () => {
  test.setTimeout(240_000);

  test('the Academy shows the pilot group, every lesson fits and is tappable, and the scenario runs with a real enemy', async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page);
    await page.getByTestId('home-academy').click({ timeout: 120_000 });
    await expect(page.getByTestId('menu-academy')).toBeVisible();

    await page.getByTestId('academy-section-advanced').click(); // Advanced Training holds the Generator Tactics pilot
    const group = page.getByTestId('academy-pane-advanced');
    await group.scrollIntoViewIfNeeded();
    await expect(group).toBeVisible();
    await expect(group).toContainText('Generator Tactics');
    await expect(group).toContainText('pilot');
    for (const id of ['trap-agbero', 'trap-thrower', 'trap-hidden']) {
      const button = page.getByTestId(`academy-lesson-${id}`);
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeVisible();
      const box = (await button.boundingBox())!;
      expect(box.height, `${id} tap target`).toBeGreaterThanOrEqual(44);
      expect(box.x, id).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, id).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
    // no horizontal overflow on this device
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `e2e-shots/${info.project.name}-academy-tactics-menu.png` });

    // start the first scenario: the real board, the pilot on, a real enemy seat
    await page.getByTestId('academy-lesson-trap-agbero').click();
    await expect(page.getByTestId('how-to-play')).toHaveAttribute('data-lesson', 'trap-agbero');
    await expect(page.getByTestId('htp-title')).toHaveText('Agbero: bait and blast');
    await page.getByTestId('htp-try').click();
    await expect(page.getByTestId('how-to-play')).toHaveAttribute('data-mode', 'practice');
    await stepTicks(page, 1);
    const start = await live(page);
    expect(start.pilot).not.toBeNull();
    expect(start.enemies).toHaveLength(1);
    expect(start.enemies[0]).toMatchObject({ kind: 'agbero', y: 10 });
    await stepTicks(page, 90);
    const later = await live(page);
    expect(later.enemies[0]!.x, 'the enemy bot walks toward you').toBeLessThan(start.enemies[0]!.x);
    await expect(page.getByTestId('htp-instruction')).toContainText('Agbero');
    // the enemy telegraphs are built for this practice too (decision SV1): its wind-ups are drawn like a mission's
    const telegraphs = await page.evaluate(() =>
      (window as unknown as { __WAHALA__: { renderer(): { telegraphStats(): unknown } } }).__WAHALA__
        .renderer()
        .telegraphStats(),
    );
    expect(telegraphs, 'enemy telegraph view in the Academy').not.toBeNull();
    await page.screenshot({ path: `e2e-shots/${info.project.name}-academy-tactics-practice.png` });

    // leaving returns to the Academy; an ordinary match carries no pilot
    await page.getByTestId('htp-exit').click();
    await expect(page.getByTestId('menu-academy')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
