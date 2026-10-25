import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { getState, holdKey, open, stepTicks, thumb } from './helpers';

type Debug = {
  __WAHALA__: {
    store: { getState(): Record<string, unknown> };
    controller(): { frozen: boolean };
    advance(n: number): void;
  };
};

/** The saved settings blob and the live store settings: the Academy must leave both untouched. */
async function savedSettings(page: Page): Promise<{ stored: string | null; live: unknown }> {
  return page.evaluate(() => ({
    stored: localStorage.getItem('wahala.settings.v1'),
    live: (window as unknown as Debug).__WAHALA__.store.getState().settings,
  }));
}

const academyProgress = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('wahala.academy.v1') ?? 'null') as unknown);

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
  });
  return errors;
}

/** One tick through the real frame path (renderer, HUD publish), so HUD-driven UI is current. */
const syncHud = (page: Page) => page.evaluate(() => (window as unknown as Debug).__WAHALA__.advance(1));

const board = (page: Page) =>
  page.evaluate(
    () => (window as unknown as Debug).__WAHALA__.store.getState().board as { x: number; y: number }[] | null,
  );

/** Home -> Training Academy menu -> Continue (the first unfinished lesson, played for real). */
async function openAcademy(page: Page): Promise<void> {
  await page.getByTestId('home-academy').click({ timeout: 120_000 });
  await expect(page.getByTestId('menu-academy')).toBeVisible();
  await page.getByTestId('academy-continue').click();
  await expect(page.getByTestId('how-to-play')).toBeVisible();
}

/** Direct practice selection from the lesson list. */
async function practiseFromList(page: Page, lessonId: string): Promise<void> {
  await page.getByTestId('htp-lessons').click();
  await page.getByTestId(`htp-practise-${lessonId}`).click();
  await expect(page.getByTestId('how-to-play')).toHaveAttribute('data-lesson', lessonId);
  await expect(page.getByTestId('how-to-play')).toHaveAttribute('data-mode', 'practice');
}

test.describe('Training Academy', () => {
  // every lesson loads a fresh 3D scene; on software WebGL in a shared container that takes a while
  test.setTimeout(420_000);

  test('lesson 1: objective, a real demo, then the human plays it with the real controls; skip moves on', async ({
    page,
  }, info) => {
    const errors = collectErrors(page);
    await open(page);
    const before = await savedSettings(page);
    await openAcademy(page);
    await expect(page.getByTestId('htp-title')).toHaveText('Moving & turning');
    await expect(page.getByTestId('htp-objective')).toContainText('glowing markers');
    await expect(page.getByTestId('htp-caption')).toContainText('anywhere in the lower-left');

    // step 2: the demonstration is the real simulation: the scripted hero walks
    await stepTicks(page, 1);
    const start = (await getState(page)).players[0]!;
    await stepTicks(page, 120);
    const moved = (await getState(page)).players[0]!;
    expect([moved.x, moved.y]).not.toEqual([start.x, start.y]);
    await page.screenshot({ path: `e2e-shots/${info.project.name}-academy-demo.png` });

    // step 3: the human's turn, with the normal HUD (and, on touch, the real stick)
    await page.getByTestId('htp-try').click();
    await expect(page.getByTestId('how-to-play')).toHaveAttribute('data-mode', 'practice');
    await stepTicks(page, 1); // hold real time still again: only the test's ticks move the world
    await expect(page.getByTestId('htp-instruction')).toContainText('Walk to the glowing marker');
    await expect(page.getByTestId('hud')).toBeVisible();
    if (info.project.use.isMobile) {
      await expect(page.getByTestId('stick-zone')).toBeVisible();
      await expect(page.getByTestId('htp-instruction')).toContainText(
        'thumb down anywhere in the lower-left',
      );
      for (let i = 0; i < 4; i++) await thumb(page, 'right', 4, { settle: 12 });
    } else {
      await expect(page.getByTestId('htp-instruction')).toContainText('WASD');
      for (let i = 0; i < 4; i++) {
        await holdKey(page, 'ArrowRight', 4);
        await stepTicks(page, 12);
      }
    }
    // step 4: completion comes from the simulation (the player really stands on the marker)
    expect((await getState(page)).players[0]!.x).toBe(4);
    await expect(page.getByTestId('htp-task-0')).toHaveAttribute('data-done', 'true');
    await expect(page.getByTestId('htp-task-1')).toHaveAttribute('data-done', 'false');
    await page.screenshot({ path: `e2e-shots/${info.project.name}-academy-practice-move.png` });

    // step 7: not complete yet -> no "next", only an explicit skip
    await expect(page.getByTestId('htp-next')).toHaveCount(0);
    await page.getByTestId('htp-skip').click();
    await expect(page.getByTestId('htp-title')).toHaveText('Button A: place a generator');
    expect(await academyProgress(page)).toEqual({ completed: [], skipped: ['move'] });

    // the lesson list: grouped courses, the skipped lesson marked, any lesson practisable directly
    await page.getByTestId('htp-lessons').click();
    await expect(page.getByTestId('htp-list')).toBeVisible();
    await expect(page.getByTestId('htp-lesson-move').locator('.htp-mark')).toHaveText('↷');
    await page.screenshot({ path: `e2e-shots/${info.project.name}-academy-lessons.png` });
    await page.getByTestId('htp-list-close').click();

    // leaving returns to the Academy menu, which shows the progress just made; any lesson replays from there
    await page.getByTestId('htp-exit').click();
    await expect(page.getByTestId('menu-academy')).toBeVisible();
    await expect(page.getByTestId('academy-lesson-move')).toHaveAttribute('data-status', 'skipped');
    await expect(page.getByTestId('academy-lesson-place')).toHaveAttribute('data-status', 'next');
    await page.getByTestId('academy-lesson-move').click();
    await expect(page.getByTestId('how-to-play')).toHaveAttribute('data-lesson', 'move');
    await page.getByTestId('htp-exit').click();
    await expect(page.getByTestId('menu-academy')).toBeVisible();
    await page.getByTestId('menu-back').click();
    await expect(page.getByTestId('menu-home')).toBeVisible();
    expect(await savedSettings(page)).toEqual(before);
    expect(errors).toEqual([]);
  });

  for (const vp of [
    { width: 844, height: 390 },
    { width: 667, height: 375 },
  ]) {
    test(`phone ${vp.width}x${vp.height}: Academy text never covers the board, its bottom row or the lower-left spawn`, async ({
      page,
    }, info) => {
      test.skip(!info.project.use.isMobile, 'mobile project only');
      const errors = collectErrors(page);
      await page.setViewportSize(vp);
      await open(page, '&noattract');
      await openAcademy(page);
      await practiseFromList(page, 'place');
      await expect(page.getByTestId('stick-zone')).toBeVisible();
      await stepTicks(page, 2);
      await syncHud(page);
      await expect.poll(() => board(page), { timeout: 30_000 }).not.toBeNull();

      // walk to the marker with the real floating stick, so the next instruction (button A) is up
      for (let i = 0; i < 4; i++) await thumb(page, 'right', 4, { settle: 12 });
      await expect(page.getByTestId('htp-task-0')).toHaveAttribute('data-done', 'true');
      await expect(page.getByTestId('htp-instruction')).toHaveText(
        /Press the A button to place a generator on the marker\./,
      );
      await page.waitForTimeout(400); // let the board position settle after the layout change
      await syncHud(page);

      const b = (await board(page))!;
      const nearY = b[3]!.y;
      const rowTop = nearY - (nearY - b[0]!.y) / 11;
      const minLeft = Math.min(b[0]!.x, b[3]!.x);
      // the lesson column sits entirely left of the board
      const panel = (await page.getByTestId('how-to-play').boundingBox())!;
      expect(panel.x + panel.width).toBeLessThanOrEqual(minLeft + 0.5);
      // no Academy text anywhere on the board's bottom row (which holds the lower-left spawn)
      const covering = await page.evaluate(
        ({ left, right, top, bottom }) =>
          [...document.querySelectorAll('[data-testid^="htp-"], .htp-panel *')]
            .filter((e) => (e.textContent ?? '').trim().length > 0)
            .filter((e) => {
              const r = e.getBoundingClientRect();
              const style = getComputedStyle(e);
              if (style.visibility === 'hidden' || style.display === 'none' || r.width === 0) return false;
              return r.left < right && r.right > left && r.top < bottom && r.bottom > top;
            })
            .map((e) => `${(e as HTMLElement).className}: ${e.textContent}`),
        { left: b[3]!.x, right: b[2]!.x, top: rowTop, bottom: nearY },
      );
      expect(covering).toEqual([]);
      // and nothing of the Academy is over the board at all
      const overBoard = await page.evaluate(
        ({ left, right, top, bottom }) =>
          [...document.querySelectorAll('[data-testid^="htp-"]')]
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return r.width > 0 && r.left < right && r.right > left && r.top < bottom && r.bottom > top;
            })
            .map((e) => (e as HTMLElement).dataset.testid),
        { left: minLeft, right: Math.max(b[1]!.x, b[2]!.x), top: b[0]!.y, bottom: nearY },
      );
      expect(overBoard).toEqual([]);
      await page.screenshot({ path: `e2e-shots/mobile-${vp.width}x${vp.height}-academy-practice.png` });

      // press A on the real touch control: a real generator goes down and the task ticks
      await page.getByTestId('btn-place').dispatchEvent('pointerdown');
      await stepTicks(page, 3);
      await expect(page.getByTestId('htp-task-1')).toHaveAttribute('data-done', 'true');
      expect((await getState(page)).generators.map((g) => [g.x, g.y])).toEqual([[4, 10]]);
      expect(errors).toEqual([]);
    });
  }
});
