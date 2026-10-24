import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { getState, holdKey, open, stepTicks, thumb } from './helpers';

/** The saved settings blob and the live store settings: the tutorial must leave both untouched. */
async function savedSettings(page: Page): Promise<{ stored: string | null; live: unknown }> {
  return page.evaluate(() => ({
    stored: localStorage.getItem('wahala.settings.v1'),
    live: (
      window as never as { __WAHALA__: { store: { getState(): { settings: unknown } } } }
    ).__WAHALA__.store.getState().settings,
  }));
}

async function tutorialView(
  page: Page,
): Promise<{ chapter: number; mode: string; beat: number; caption: string }> {
  return page.evaluate(
    () =>
      (
        window as never as { __WAHALA__: { store: { getState(): { tutorial: never } } } }
      ).__WAHALA__.store.getState().tutorial,
  );
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

/**
 * One more tick routed through the real frame path (renderer, HUD publish), so HUD-driven UI such as
 * the entry panel is up to date even when software WebGL renders only a few frames a second.
 */
async function syncHud(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as never as { __WAHALA__: { advance(n: number): void } }).__WAHALA__.advance(1),
  );
}

async function openTutorial(page: Page): Promise<void> {
  await page.getByTestId('help-button').click({ timeout: 120_000 });
  await expect(page.getByTestId('how-to-play')).toBeVisible();
}

async function openPractice(page: Page, chapterId: string): Promise<void> {
  await page.getByTestId('htp-chapters').click();
  await page.getByTestId(`htp-chapter-${chapterId}`).click();
  await expect(page.getByTestId('how-to-play')).toHaveAttribute('data-chapter', chapterId);
  await page.getByTestId('htp-practice').click();
  await expect(page.getByTestId('how-to-play')).toHaveAttribute('data-mode', 'practice');
}

test.describe('How to Play', () => {
  // every lesson loads a fresh 3D scene; on software WebGL in a shared container that takes a while
  test.setTimeout(420_000);

  test('plays a real in-engine demo with captions, pause, replay, next chapter, and exits with settings unchanged', async ({
    page,
  }, info) => {
    const errors = collectErrors(page);
    await open(page);
    const before = await savedSettings(page);
    await openTutorial(page);
    await expect(page.getByTestId('htp-title')).toHaveText('Moving around');
    await expect(page.getByTestId('htp-caption')).toContainText('one tile at a time');

    // the demo is the real simulation: the scripted hero walks
    await stepTicks(page, 1);
    const start = (await getState(page)).players[0]!;
    await stepTicks(page, 120);
    const moved = (await getState(page)).players[0]!;
    expect([moved.x, moved.y]).not.toEqual([start.x, start.y]);
    await page.screenshot({ path: `e2e-shots/${info.project.name}-tutorial-demo.png` });

    // pause holds the world still in real time; play resumes it
    await page.evaluate(
      () =>
        ((
          window as never as { __WAHALA__: { controller(): { frozen: boolean } } }
        ).__WAHALA__.controller().frozen = false),
    );
    await page.getByTestId('htp-pause').click();
    await expect(page.getByTestId('htp-pause')).toHaveAttribute('data-paused', 'true');
    const pausedTick = (await getState(page)).tick;
    await page.waitForTimeout(1200);
    expect((await getState(page)).tick).toBe(pausedTick);
    await page.getByTestId('htp-pause').click();
    await expect
      .poll(async () => (await getState(page)).tick, { timeout: 30_000 })
      .toBeGreaterThan(pausedTick);

    // let the captions move on, then replay starts the demo from the top
    await stepTicks(page, 500);
    expect((await tutorialView(page)).beat).toBeGreaterThan(0);
    await page.getByTestId('htp-replay').click();
    await expect.poll(async () => (await tutorialView(page)).beat).toBe(0);
    expect((await getState(page)).tick).toBeLessThan(200);
    await expect(page.getByTestId('htp-caption')).toContainText('one tile at a time');

    // next chapter
    await page.getByTestId('htp-next').click();
    await expect(page.getByTestId('htp-title')).toHaveText('Generators & the plus blast');
    await stepTicks(page, 400);
    expect((await getState(page)).players[1]!.alive).toBe(false); // caught in the plus

    // controls legend is there for every device
    for (const d of ['keyboard', 'gamepad', 'touch']) {
      await page.getByTestId(`htp-device-${d}`).click();
      await expect(page.getByTestId('htp-legend')).toHaveAttribute('data-device', d);
    }
    await expect(page.getByTestId('htp-touchmap')).toBeVisible();

    await page.getByTestId('htp-exit').click();
    await expect(page.getByTestId('title-screen')).toBeVisible();
    expect(await savedSettings(page)).toEqual(before);
    expect(errors).toEqual([]);
  });

  test('vehicle practice: voucher, VEHICLE key, entrance, Keke turn and launch with the keyboard', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'keyboard flow on desktop');
    const errors = collectErrors(page);
    await open(page);
    const before = await savedSettings(page);
    await openTutorial(page);
    await openPractice(page, 'vehicle');
    await page.getByTestId('htp-char-campusQueen').click();
    await expect(page.getByTestId('htp-char-campusQueen')).toHaveAttribute('aria-pressed', 'true');
    await stepTicks(page, 2);
    expect((await getState(page)).players[0]!.characterId).toBe('campusQueen');

    // walk two tiles right onto the voucher
    for (let i = 0; i < 2; i++) {
      await holdKey(page, 'ArrowRight', 4);
      await stepTicks(page, 14);
    }
    await expect(page.getByTestId('htp-check-0')).toHaveAttribute('data-done', 'true');
    expect((await getState(page)).players[0]!.hasVoucher).toBe(true);

    await page.keyboard.press('v');
    await stepTicks(page, 3);
    await syncHud(page);
    await expect(page.getByTestId('entry-panel')).toHaveAttribute('data-stage', 'entry', { timeout: 60_000 });
    await expect(page.getByTestId('htp-check-1')).toHaveAttribute('data-done', 'true');
    await page.keyboard.press('ArrowLeft');
    await stepTicks(page, 2);
    await page.keyboard.press('Enter');
    await stepTicks(page, 2);
    await syncHud(page);
    await expect(page.getByTestId('entry-panel')).toHaveAttribute('data-stage', 'turn', { timeout: 60_000 });
    await page.screenshot({ path: `e2e-shots/${info.project.name}-tutorial-keke-turn.png` });
    await page.keyboard.press('Enter');
    await stepTicks(page, 3);
    await expect(page.getByTestId('htp-complete')).toBeVisible();
    await expect(page.getByTestId('htp-check-2')).toHaveAttribute('data-done', 'true');
    const s = await getState(page);
    expect(s.vehicles[0]!.kind).toBe('keke');

    await page.getByTestId('htp-exit').click();
    await expect(page.getByTestId('title-screen')).toBeVisible();
    expect(await savedSettings(page)).toEqual(before);
    expect(errors).toEqual([]);
  });

  test('vehicle practice with touch: thumbstick, vehicle button, NEXT and LAUNCH', async ({ page }, info) => {
    test.skip(!info.project.use.isMobile, 'mobile project only');
    const errors = collectErrors(page);
    await open(page);
    const before = await savedSettings(page);
    await openTutorial(page);
    // demos play by themselves: no on-screen controls; the legend opens on the touch layout
    await expect(page.getByTestId('stick-zone')).toBeHidden();
    await expect(page.getByTestId('htp-stick')).toBeVisible();
    await expect(page.getByTestId('htp-legend')).toHaveAttribute('data-device', 'touch');

    await openPractice(page, 'vehicle');
    // on a short landscape phone the practice starts with the lesson panel folded away
    await expect(page.getByTestId('how-to-play')).toHaveAttribute('data-collapsed', 'true');
    await page.getByTestId('htp-expand').click();
    await page.getByTestId('htp-char-campusQueen').click();
    await page.getByTestId('htp-collapse').click();
    await expect(page.getByTestId('how-to-play')).toHaveAttribute('data-collapsed', 'true');
    await stepTicks(page, 2);
    expect((await getState(page)).players[0]!.characterId).toBe('campusQueen');
    await expect(page.getByTestId('stick-zone')).toBeVisible();
    for (let i = 0; i < 2; i++) await thumb(page, 'right', 4, { settle: 14 });
    await expect(page.getByTestId('htp-check-0')).toHaveAttribute('data-done', 'true');
    await expect(page.getByTestId('btn-vehicle')).toBeVisible();
    await page.getByTestId('btn-vehicle').dispatchEvent('pointerdown');
    await stepTicks(page, 3);
    await syncHud(page);
    await expect(page.getByTestId('entry-panel')).toHaveAttribute('data-stage', 'entry', { timeout: 60_000 });
    await page.getByTestId('entry-confirm').click(); // NEXT (the Keke still needs its turn)
    await stepTicks(page, 2);
    await syncHud(page);
    await expect(page.getByTestId('entry-panel')).toHaveAttribute('data-stage', 'turn', { timeout: 60_000 });
    await page.screenshot({ path: `e2e-shots/${info.project.name}-tutorial-touch-turn.png` });
    await page.getByTestId('entry-confirm').click(); // LAUNCH
    await stepTicks(page, 3);
    await expect(page.getByTestId('htp-complete')).toBeVisible();
    expect((await getState(page)).vehicles[0]!.kind).toBe('keke');

    await page.getByTestId('htp-exit').click();
    await expect(page.getByTestId('title-screen')).toBeVisible();
    expect(await savedSettings(page)).toEqual(before);
    expect(errors).toEqual([]);
  });
});
