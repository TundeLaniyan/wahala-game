/**
 * The City Rumble combat test lab in a real browser (docs/COMBAT_TEST_LAB.md): a local City Rumble started from the
 * real menu, paused with the real pause button (a tap on a phone), a level picked in the pause menu, resumed; the HUD
 * chip names the level, the rules in force are that level's, and another level is picked mid-match with no restart.
 * The sim is moved only by `stepTicks` (no wall-clock drift).
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { open, startMatch, stepTicks } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const lab = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__WAHALA__;
    const s = w.getState();
    return {
      tick: s.tick as number,
      seed: s.seed as number,
      phase: s.match.phase as string,
      level: (s.config.combatLab?.level ?? 0) as number,
      pushStartup: s.config.skills.attacks.push.startupTicks as number,
      stats: (w.combatLab()?.stats?.[0] ?? null) as Record<string, number> | null,
    };
  });

/**
 * Presses a real button of the HUD or the pause menu: its own click handler runs, without Playwright's wait for the
 * page to settle (a frame of the 16-fighter Rumble behind the pause card takes seconds on CI's software WebGL).
 */
async function press(page: Page, testId: string): Promise<void> {
  const button = page.getByTestId(testId);
  await expect(button).toBeVisible();
  await button.dispatchEvent('click');
}

async function pause(page: Page): Promise<void> {
  await press(page, 'pause-button');
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
}

async function resume(page: Page): Promise<void> {
  await press(page, 'resume');
  await expect(page.getByTestId('pause-overlay')).toHaveCount(0);
}

test('combat lab: pause, pick a level, resume, switch again without restarting', async ({ page }) => {
  test.setTimeout(240_000); // a 16-fighter Rumble on software WebGL
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, '&noattract');
  await startMatch(page, { game: 'rumble' });
  const before = await lab(page);
  expect(before.level).toBe(0); // the lab is off until the founder picks a level
  await expect(page.getByTestId('combat-lab-chip')).toHaveCount(0);

  await pause(page);
  await expect(page.getByTestId('combat-lab')).toBeVisible();
  for (const l of [0, 1, 2, 3, 4]) {
    const box = (await page.getByTestId(`combat-lab-${l}`).boundingBox())!;
    expect(box.height, `level ${l} button is a comfortable tap target`).toBeGreaterThanOrEqual(44);
  }
  await press(page, 'combat-lab-3');
  await expect(page.getByTestId('combat-lab-3')).toHaveAttribute('aria-checked', 'true');
  await resume(page);
  await stepTicks(page, 30);
  const l3 = await lab(page);
  expect(l3.level).toBe(3);
  expect(l3.pushStartup).toBe(2);
  expect(l3.seed).toBe(before.seed);
  expect(l3.tick).toBeGreaterThan(before.tick); // the same match went on
  await expect(page.getByTestId('combat-lab-chip')).toContainText('LAB 3');

  // a B press is recorded by the lab diagnostics (a swing at the air or a punch)
  if (test.info().project.name === 'mobile') {
    await page.evaluate(() => {
      const b = document.querySelector('[data-testid="btn-special"]')!;
      const ev = (type: string) =>
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 7,
          isPrimary: true,
          pointerType: 'touch',
        });
      b.dispatchEvent(ev('pointerdown'));
      (window as any).__WAHALA__.stepTicks(2);
      b.dispatchEvent(ev('pointerup'));
    });
  } else {
    await page.keyboard.down('KeyK');
    await stepTicks(page, 2);
    await page.keyboard.up('KeyK');
  }
  await stepTicks(page, 20);
  const pressed = await lab(page);
  expect(pressed.stats?.presses ?? 0).toBeGreaterThanOrEqual(1);
  expect(
    (pressed.stats?.started ?? 0) + (pressed.stats?.airSwings ?? 0) + (pressed.stats?.kept ?? 0),
  ).toBeGreaterThanOrEqual(1);

  await pause(page);
  await press(page, 'combat-lab-1');
  await resume(page);
  await stepTicks(page, 10);
  const l1 = await lab(page);
  expect(l1.level).toBe(1);
  expect(l1.pushStartup).toBe(4);
  expect(l1.tick).toBeGreaterThan(pressed.tick);
  expect(l1.seed).toBe(before.seed);
  await expect(page.getByTestId('combat-lab-chip')).toContainText('LAB 1');
  // (Off restores the match's own numbers: tests/combat-lab.test.ts)
  expect(errors).toEqual([]);
});

test('combat lab: never offered in a Classic match', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the pause menu is the same component on every device');
  await open(page, '&noattract');
  await startMatch(page);
  await press(page, 'pause-button');
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
  await expect(page.getByTestId('combat-lab')).toHaveCount(0);
});

test('classic battle: the open-field close-combat feel is on (decision CC-F1), with no lab chip or switch', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, '&noattract');
  await startMatch(page);
  await stepTicks(page, 10);
  const l = await lab(page);
  expect(l.pushStartup).toBe(3); // Level 2's Punch (Off is 4)
  const reach = await page.evaluate(
    () => (window as any).__WAHALA__.getState().config.combatLab.forwardDiagonals as boolean,
  );
  expect(reach).toBe(false); // cardinal neighbours only
  await expect(page.getByTestId('combat-lab-chip')).toHaveCount(0);
  expect(errors).toEqual([]);
});
