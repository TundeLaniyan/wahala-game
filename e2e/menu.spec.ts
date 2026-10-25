/**
 * The Stitch menu (decision UI1): the multi-screen journey, its Back / Edit / Confirm navigation,
 * keyboard and gamepad control, saved-setup Quick play, recovery from a broken save, the results
 * actions, and the responsive layouts. Every choice is checked in the match the menu actually starts.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mutate, open, settled, stepTicks } from './helpers';

type Debug = {
  __WAHALA__: {
    getState(): {
      arenaId: string;
      settings: { game: string };
      config: { match: { durationTicks: number } };
      players: { characterId: string; isBot: boolean }[];
    };
    controller(): { frozen: boolean };
  };
};

const live = (page: Page) =>
  page.evaluate(() => {
    const s = (window as never as Debug).__WAHALA__.getState();
    return {
      arenaId: s.arenaId,
      game: s.settings.game,
      duration: s.config.match.durationTicks,
      players: s.players.length,
      me: s.players[0]!.characterId,
    };
  });

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
  });
  return errors;
}

test.describe('Stitch main menu', () => {
  test.beforeEach(() => test.setTimeout(6 * 60_000));

  test('Home -> mode -> setup -> fighter -> ready -> play; Edit changes one choice and returns to Ready', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'one viewport is enough for the full journey');
    const errors = watchErrors(page);
    await open(page, '&nobots&noattract');
    await expect(page.getByTestId('menu-home')).toBeVisible();
    await page.getByTestId('home-rumble').click();
    await page.getByTestId('mode-deathmatch').click();
    await expect(page.getByTestId('mode-chosen')).toContainText('Deathmatch');
    await page.getByTestId('menu-continue').click();
    // only the Deathmatch rules: a length, no friendly fire
    await page.getByTestId('minutes-10').click();
    await expect(page.getByTestId('ff-on')).toHaveCount(0);
    await page.getByTestId('rumble-8').click();
    await page.getByTestId('setup-arena').click();
    await page.getByTestId('rumble-stage-rumbleApapa').click();
    await page.getByTestId('arena-confirm').click();
    await expect(page.getByTestId('setup-arena')).toContainText('Apapa');
    await page.getByTestId('menu-continue').click();
    await page.getByTestId('char-campusQueen').click();
    await expect(page.getByTestId('fighter-name')).toHaveText('Campus Queen');
    await page.getByTestId('menu-continue').click();
    await expect(page.getByTestId('ready-mode')).toContainText('Deathmatch');
    await expect(page.getByTestId('ready-fighter')).toContainText('Campus Queen');
    await expect(page.getByTestId('ready-arena')).toContainText('Apapa');
    await expect(page.getByTestId('ready-opponents')).toContainText('7 AI bots');

    // Edit: one choice, straight back to Ready (no walking the whole setup again)
    await page.getByTestId('edit-fighter').click();
    await page.getByTestId('char-lekkiBoy').click();
    await page.getByTestId('menu-continue').click();
    await expect(page.getByTestId('menu-ready')).toBeVisible();
    await expect(page.getByTestId('ready-fighter')).toContainText('Lekki Boy');
    await page.getByTestId('edit-arena').click();
    await page.getByTestId('rumble-stage-rumbleLekkiNight').click();
    await page.getByTestId('arena-confirm').click();
    await expect(page.getByTestId('ready-arena')).toContainText('Lekki');
    await page.getByTestId('edit-setup').first().click();
    await page.getByTestId('menu-back').click(); // Back from an edit also returns to Ready
    await expect(page.getByTestId('menu-ready')).toBeVisible();
    await page.screenshot({ path: `e2e-shots/${info.project.name}-menu-ready.png` });

    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await stepTicks(page, 170); // past the countdown (Esc pauses only once play is on)
    expect(await live(page)).toEqual({
      arenaId: 'rumbleLekkiNight',
      game: 'deathmatch',
      duration: 600 * 60,
      players: 8,
      me: 'lekkiBoy',
    });

    // Main menu, then Quick play starts the saved setup in one press
    await page.keyboard.press('Escape');
    await page.getByTestId('quit').click();
    await expect(page.getByTestId('menu-home')).toBeVisible();
    await expect(page.getByTestId('setup-summary')).toContainText('Deathmatch · 8 fighters · 10 min');
    await page.getByTestId('quick-play').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await stepTicks(page, 30);
    expect((await live(page)).arenaId).toBe('rumbleLekkiNight');
    expect(errors).toEqual([]);
  });

  test('keyboard: arrows move focus, Enter selects, Esc goes back', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'keyboard');
    await open(page, '&nobots&noattract');
    await page.keyboard.press('ArrowDown'); // lands on the flagship entry first
    await expect(page.getByTestId('home-rumble')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('home-classic')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('menu-mode')).toBeVisible();
    await page.keyboard.press('ArrowRight'); // the saved mode first, then the next card
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('mode-deathmatch')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('mode-deathmatch')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('menu-home')).toBeVisible();
    // Esc on Home does nothing harmful
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('menu-home')).toBeVisible();
  });

  test('gamepad: D-pad moves focus, A selects, B goes back', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'gamepad');
    await page.addInitScript(() => {
      const pad = {
        id: 'test pad',
        index: 0,
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
        timestamp: 0,
      };
      (window as never as { __pad: typeof pad }).__pad = pad;
      Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
    });
    await open(page, '&nobots&noattract');
    const press = async (button: number) => {
      await page.evaluate((b) => ((window as never as { __pad: { buttons: { pressed: boolean }[] } }).__pad.buttons[b]!.pressed = true), button);
      await page.waitForTimeout(700); // the pad is polled once per rendered frame
      await page.evaluate((b) => ((window as never as { __pad: { buttons: { pressed: boolean }[] } }).__pad.buttons[b]!.pressed = false), button);
      await page.waitForTimeout(700);
    };
    await press(13); // D-pad down: focus lands on City Rumble
    await expect(page.getByTestId('home-rumble')).toBeFocused();
    await press(0); // A
    await expect(page.getByTestId('menu-mode')).toBeVisible();
    await press(1); // B
    await expect(page.getByTestId('menu-home')).toBeVisible();
  });

  test('a broken or outdated save is repaired, and Quick play still starts a valid match', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(
        'wahala.settings.v1',
        JSON.stringify({ play: 'classic', arenaId: 'demolishedArena', character: 'ghost', competitors: 9, mode: 'timer' }),
      );
    });
    const errors = watchErrors(page);
    await open(page, '&nobots&noattract');
    await expect(page.getByTestId('setup-summary')).toContainText('Classic Battle · 4 players · Danfo Bus Park');
    await page.getByTestId('quick-play').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await stepTicks(page, 30);
    expect(await live(page)).toMatchObject({ arenaId: 'danfoBusPark', game: 'classic', players: 4, me: 'streetBaller' });
    expect(errors).toEqual([]);
  });

  test('results: Change setup opens Ready, Main menu goes home, Rematch replays', async ({ page }) => {
    await open(page, '&nobots&noattract');
    await page.getByTestId('home-classic').click();
    await page.getByTestId('players-2').click();
    await page.getByTestId('menu-continue').click();
    await page.getByTestId('menu-continue').click();
    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await stepTicks(page, 170);
    // the only rival is caught by a blast: a real result
    await mutate(page, 'const r = s.players[1]; r.alive = false;');
    await stepTicks(page, 10);
    await page.evaluate(() =>
      (window as never as { __WAHALA__: { controller(): { finishSkip(): void } } }).__WAHALA__.controller().finishSkip(),
    );
    await expect(page.getByTestId('results')).toBeVisible();
    await expect(page.getByTestId('standings')).toBeVisible();
    await page.getByTestId('to-title').click();
    await expect(page.getByTestId('menu-ready')).toBeVisible();
    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await stepTicks(page, 170);
    await mutate(page, 'const r = s.players[1]; r.alive = false;');
    await stepTicks(page, 10);
    await page.evaluate(() =>
      (window as never as { __WAHALA__: { controller(): { finishSkip(): void } } }).__WAHALA__.controller().finishSkip(),
    );
    await page.getByTestId('results-home').click();
    await expect(page.getByTestId('menu-home')).toBeVisible();
  });

  test('every menu screen fits desktop, laptop and phone sizes: no page scroll, main action on screen', async ({
    page,
  }, info) => {
    const sizes =
      info.project.name === 'desktop'
        ? [
            { width: 1440, height: 900 },
            { width: 1280, height: 720 },
          ]
        : [
            { width: 390, height: 844 },
            { width: 844, height: 390 },
            { width: 667, height: 375 },
            { width: 915, height: 412 },
          ];
    await open(page, '&nobots&noattract');
    const screens: [string, string, string][] = [
      ['home', 'menu-home', 'quick-play'],
      ['mode', 'menu-mode', 'menu-continue'],
      ['setup', 'menu-setup', 'menu-continue'],
      ['arena', 'menu-arena', 'arena-confirm'],
      ['fighter', 'menu-fighter', 'menu-continue'],
      ['ready', 'menu-ready', 'start-button'],
      ['settings', 'menu-settings', 'settings-close'],
      ['academy', 'menu-academy', 'academy-continue'],
    ];
    for (const vp of sizes) {
      await page.setViewportSize(vp);
      for (const [screen, root, action] of screens) {
        await page.evaluate(
          (s) =>
            (
              window as never as { __WAHALA__: { store: { setState(p: unknown): void } } }
            ).__WAHALA__.store.setState({ menu: { stack: s === 'home' ? ['home'] : ['home', s] } }),
          screen,
        );
        await expect(page.getByTestId(root)).toBeVisible();
        await settled(page); // measure the layout after the screen's short entrance slide
        const m = await page.evaluate((id) => {
          const el = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
          const small = [...document.querySelectorAll<HTMLElement>('.mn button')]
            .filter((b) => b.offsetParent && b.getBoundingClientRect().height > 0)
            .filter((b) => b.getBoundingClientRect().height < 36)
            .map((b) => b.dataset.testid ?? b.textContent);
          return {
            wide: document.scrollingElement!.scrollWidth - innerWidth,
            tall: document.scrollingElement!.scrollHeight - innerHeight,
            action: { left: el.left, top: el.top, right: el.right, bottom: el.bottom, h: el.height },
            small,
            gutter: Math.min(
              ...[...document.querySelectorAll<HTMLElement>('.mn-screen')].map((s) => s.getBoundingClientRect().left),
            ),
          };
        }, action);
        const where = `${screen} at ${vp.width}x${vp.height}`;
        expect(m.wide, `${where}: page scrolls sideways`).toBeLessThanOrEqual(0);
        expect(m.tall, `${where}: page scrolls`).toBeLessThanOrEqual(0);
        expect(m.action.bottom, `${where}: main action below the screen`).toBeLessThanOrEqual(vp.height + 0.5);
        expect(m.action.right, `${where}: main action off the side`).toBeLessThanOrEqual(vp.width + 0.5);
        expect(m.action.h, `${where}: main action too small to tap`).toBeGreaterThanOrEqual(44);
        expect(m.small, `${where}: buttons smaller than a finger`).toEqual([]);
        expect(m.gutter, `${where}: content touches the screen edge`).toBeGreaterThanOrEqual(12);
      }
      await page.screenshot({ path: `e2e-shots/${info.project.name}-menu-${vp.width}x${vp.height}.png` });
    }
  });
});
