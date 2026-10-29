/**
 * The menu (decision UI1, reworked as the mobile-first flow): Home -> tap a mode -> arena and settings ->
 * fighter -> review -> play, with Back / Edit navigation, keyboard and gamepad control, saved-setup Quick
 * play, recovery from a broken save, the results actions, and the responsive layouts. Every choice is
 * checked in the match the menu actually starts.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chooseStage, mutate, open, setDifficulty, settled, stepTicks } from './helpers';

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
    // tapping a mode is enough: it opens the arena and settings at once (no Continue, no numbered steps)
    await page.getByTestId('mode-deathmatch').click();
    await expect(page.getByTestId('menu-setup')).toBeVisible();
    await expect(page.getByTestId('menu-steps')).toHaveCount(0);
    await expect(page.getByTestId('setup-arena')).toContainText('Select Arena');
    // only the Deathmatch rules: a length, no friendly fire
    await page.getByTestId('minutes-10').click();
    await expect(page.getByTestId('ff-on')).toHaveCount(0);
    await page.getByTestId('rumble-8').click();
    await chooseStage(page, 'rumbleApapa');
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
    await chooseStage(page, 'rumbleLekkiNight');
    await expect(page.getByTestId('menu-continue')).toContainText('Back to review');
    await page.getByTestId('menu-continue').click();
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
    await page.keyboard.press('Enter'); // choosing a mode opens the arena and settings
    await expect(page.getByTestId('menu-setup')).toBeVisible();
    await expect(page.getByTestId('rumble-setup')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('menu-mode')).toBeVisible();
    await expect(page.getByTestId('mode-deathmatch')).toHaveAttribute('aria-current', 'true');
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
      await page.evaluate(
        (b) =>
          ((window as never as { __pad: { buttons: { pressed: boolean }[] } }).__pad.buttons[b]!.pressed =
            true),
        button,
      );
      await page.waitForTimeout(700); // the pad is polled once per rendered frame
      await page.evaluate(
        (b) =>
          ((window as never as { __pad: { buttons: { pressed: boolean }[] } }).__pad.buttons[b]!.pressed =
            false),
        button,
      );
      await page.waitForTimeout(700);
    };
    await press(13); // D-pad down: focus lands on City Rumble
    await expect(page.getByTestId('home-rumble')).toBeFocused();
    await press(0); // A
    await expect(page.getByTestId('menu-mode')).toBeVisible();
    await press(1); // B
    await expect(page.getByTestId('menu-home')).toBeVisible();
  });

  test('a broken or outdated save is repaired, and Quick play still starts a valid match', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(
        'wahala.settings.v1',
        JSON.stringify({
          play: 'classic',
          arenaId: 'demolishedArena',
          character: 'ghost',
          competitors: 9,
          mode: 'timer',
        }),
      );
    });
    const errors = watchErrors(page);
    await open(page, '&nobots&noattract');
    await expect(page.getByTestId('setup-summary')).toContainText(
      'Classic Battle · 4 players · Danfo Bus Park',
    );
    await page.getByTestId('quick-play').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await stepTicks(page, 30);
    expect(await live(page)).toMatchObject({
      arenaId: 'danfoBusPark',
      game: 'classic',
      players: 4,
      me: 'streetBaller',
    });
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
      (window as never as { __WAHALA__: { controller(): { finishSkip(): void } } }).__WAHALA__
        .controller()
        .finishSkip(),
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
      (window as never as { __WAHALA__: { controller(): { finishSkip(): void } } }).__WAHALA__
        .controller()
        .finishSkip(),
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
      ['mode', 'menu-mode', 'mode-survival'],
      ['setup', 'menu-setup', 'menu-continue'],
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
              ...[...document.querySelectorAll<HTMLElement>('.mn-screen')].map(
                (s) => s.getBoundingClientRect().left,
              ),
            ),
          };
        }, action);
        const where = `${screen} at ${vp.width}x${vp.height}`;
        expect(m.wide, `${where}: page scrolls sideways`).toBeLessThanOrEqual(0);
        expect(m.tall, `${where}: page scrolls`).toBeLessThanOrEqual(0);
        expect(m.action.bottom, `${where}: main action below the screen`).toBeLessThanOrEqual(
          vp.height + 0.5,
        );
        expect(m.action.right, `${where}: main action off the side`).toBeLessThanOrEqual(vp.width + 0.5);
        expect(m.action.h, `${where}: main action too small to tap`).toBeGreaterThanOrEqual(44);
        expect(m.small, `${where}: buttons smaller than a finger`).toEqual([]);
        expect(m.gutter, `${where}: content touches the screen edge`).toBeGreaterThanOrEqual(12);
      }
      await page.screenshot({ path: `e2e-shots/${info.project.name}-menu-${vp.width}x${vp.height}.png` });
    }
  });

  test('bot difficulty is one slider with plain levels; the mixed roster says what it means; it persists', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'one viewport is enough; touch is covered below');
    await open(page, '&nobots&noattract');
    await page.getByTestId('home-rumble').click();
    await page.getByTestId('mode-survival').click();
    // the seven boxes are gone: one slider, every level named and explained as it is chosen
    await expect(page.locator('[data-testid^="diff-"]:not([data-testid^="diff-slider"])')).toHaveCount(0);
    const slider = page.getByRole('slider', { name: 'Difficulty of all bots' });
    await expect(slider).toBeVisible();
    await expect(page.getByTestId('diff-slider-name')).toHaveText('Rookie'); // the default
    await setDifficulty(page, 4);
    await expect(page.getByTestId('diff-slider-name')).toHaveText('Skilled');
    await expect(slider).toHaveAttribute('aria-valuetext', /^Skilled: /);
    await expect(page.getByTestId('level-hint')).toHaveText('Every opponent plays at Skilled.');
    // keyboard: one arrow press is exactly one level (the menu navigation must not double-step)
    await slider.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('diff-slider-name')).toHaveText('Standard');
    await setDifficulty(page, 3);
    // mixed roster, in plain language
    await page.getByTestId('mixed-roster').click();
    await expect(page.getByTestId('mixed-roster')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('level-hint')).toContainText('Mixed bot difficulty');
    await expect(page.getByTestId('level-hint')).toContainText(
      'each opponent uses a different difficulty level',
    );
    await expect(page.getByTestId('level-hint')).toContainText('from Beginner to Expert');
    await page.getByTestId('bots-same').click();
    await expect(page.getByTestId('level-hint')).toHaveText('Every opponent plays at Standard.');
    // saved, and shown again after a reload
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wahala.settings.v1')!));
    expect(saved).toMatchObject({ difficulty: 'standard', rumbleMixed: false });
    await page.reload();
    await page.getByTestId('title-screen').waitFor();
    await page.getByTestId('home-rumble').click();
    await page.getByTestId('mode-survival').click();
    await expect(page.getByTestId('diff-slider-name')).toHaveText('Standard');
    // the review states whether it is every bot or a mixed roster
    await page.getByTestId('menu-continue').click();
    await page.getByTestId('menu-continue').click();
    await expect(page.getByTestId('ready-difficulty')).toContainText('Standard (all bots)');
  });

  test('Classic Battle: one level for all bots, or a level for each bot', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one viewport is enough');
    await open(page, '&nobots&noattract');
    await page.getByTestId('home-classic').click();
    await page.getByTestId('players-4').click();
    await setDifficulty(page, 5);
    await expect(page.getByTestId('level-hint')).toHaveText('Every opponent plays at Expert.');
    await page.getByTestId('mixed-roster').click(); // "Set each bot"
    await expect(page.getByTestId('diff-each')).toBeVisible();
    for (const n of [1, 2, 3]) await expect(page.getByTestId(`diff-bot-${n}`)).toBeVisible();
    await expect(page.getByTestId('diff-bot-2-name')).toHaveText('Expert');
    await setDifficulty(page, 1, 'diff-bot-2');
    await expect(page.getByTestId('diff-bot-2-name')).toHaveText('Beginner');
    await expect(page.getByTestId('diff-bot-1-name')).toHaveText('Expert');
    await expect(page.getByTestId('level-hint')).toContainText('Bot 1 Expert, Bot 2 Beginner, Bot 3 Expert');
    await page.getByTestId('players-2').click();
    await expect(page.getByTestId('diff-bot-2')).toHaveCount(0);
    await page.getByTestId('menu-continue').click();
    await page.getByTestId('menu-continue').click();
    await expect(page.getByTestId('ready-difficulty')).toContainText('Expert');
    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('wahala.settings.v1')!));
    expect(settings.botDifficulties).toEqual(['expert', 'beginner', 'expert']);
  });

  test('screen-reader and keyboard structure of the setup flow', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'structure is the same on every device');
    await open(page, '&nobots&noattract');
    await page.getByTestId('home-rumble').click();
    await expect(page.getByRole('heading', { name: 'Select game mode', level: 2 })).toBeVisible();
    await expect(page.getByRole('group', { name: /Game mode/ })).toBeVisible();
    await page.getByTestId('mode-team').click();
    await expect(page.getByRole('heading', { name: 'Arena & settings', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Select Arena', level: 3 })).toBeVisible();
    await expect(page.getByRole('group', { name: 'City Rumble stages' })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Difficulty of all bots' })).toBeVisible();
    // every control is a real button / input with a name
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.mn button, .mn input')]
        .filter((e) => e.offsetParent)
        .filter((e) => !(e.getAttribute('aria-label') || e.textContent?.trim()))
        .map((e) => e.outerHTML.slice(0, 80)),
    );
    expect(unnamed).toEqual([]);
    // Tab reaches the arena cards, and Enter on one selects it
    await page.getByTestId('rumble-stage-rumbleOshodi').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('rumble-stage-rumbleOshodi')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('arena-selected')).toHaveText('Oshodi Rush Hour');
  });

  test('the selected fighter is understood in one screen at every size, and the roster stays easy to scan', async ({
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
            { width: 360, height: 740 },
            { width: 375, height: 667 },
            { width: 844, height: 390 },
            { width: 667, height: 375 },
            { width: 915, height: 412 },
          ];
    await open(page, '&nobots&noattract');
    await page.getByTestId('home-classic').click();
    await page.getByTestId('menu-continue').click();
    await expect(page.getByTestId('menu-fighter')).toBeVisible();
    for (const vp of sizes) {
      await page.setViewportSize(vp);
      for (const id of ['streetBaller', 'lekkiBoy', 'campusQueen']) {
        if (info.project.name === 'mobile') await page.getByTestId(`char-${id}`).tap();
        else await page.getByTestId(`char-${id}`).click();
        await settled(page);
        const where = `${id} at ${vp.width}x${vp.height}`;
        // nothing of the selected fighter's card is cut off or needs scrolling to
        for (const t of [
          'fighter-detail',
          'fighter-name',
          'fighter-tagline',
          'fighter-stats',
          'fighter-skill',
          'fighter-vehicle',
          'roster',
          'menu-continue',
        ])
          await expect(page.getByTestId(t), `${where}: ${t}`).toBeInViewport({ ratio: 1 });
        const m = await page.evaluate(() => {
          const body = document.querySelector<HTMLElement>('.mn-screen-fighter .mn-body')!;
          const pic = document
            .querySelector<HTMLElement>('[data-testid="fighter-detail"] img')!
            .getBoundingClientRect();
          return {
            scroll: body.scrollHeight - body.clientHeight,
            picW: pic.width,
            picH: pic.height,
            cards: [...document.querySelectorAll<HTMLElement>('[data-testid^="char-"]')].map((c) => {
              const r = c.getBoundingClientRect();
              return { w: r.width, h: r.height };
            }),
          };
        });
        expect(m.scroll, `${where}: the fighter screen scrolls`).toBeLessThanOrEqual(1);
        expect(m.picW, `${where}: portrait too small`).toBeGreaterThanOrEqual(80);
        expect(m.picH, `${where}: portrait too small`).toBeGreaterThanOrEqual(110);
        for (const c of m.cards) {
          expect(c.h, `${where}: roster card too short to tap`).toBeGreaterThanOrEqual(44);
          expect(c.w, `${where}: roster card too narrow`).toBeGreaterThanOrEqual(80);
        }
        await expect(page.getByTestId('fighter-name')).toHaveText(
          { streetBaller: 'Street Baller', lekkiBoy: 'Lekki Boy', campusQueen: 'Campus Queen' }[id]!,
        );
      }
    }
  });

  test('phone: arena cards, slider and fighters work by touch; Select Arena is on the setup screen', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'mobile', 'touch');
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '&nobots&noattract');
    await page.getByTestId('home-rumble').tap();
    await page.getByTestId('mode-survival').tap();
    await expect(page.getByRole('heading', { name: 'Select Arena' })).toBeInViewport();
    await page.getByTestId('rumble-stage-rumbleApapa').tap();
    await expect(page.getByTestId('arena-selected')).toHaveText('Apapa Docks');
    // the slider is dragged / set by touch-sized control (44 px high)
    const box = (await page.getByTestId('diff-slider').boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(40);
    await page.getByTestId('diff-slider').scrollIntoViewIfNeeded();
    await page.touchscreen.tap(box.x + box.width * 0.99, box.y + box.height / 2);
    await expect(page.getByTestId('diff-slider-name')).toHaveText('Nightmare');
    await page.getByTestId('menu-continue').tap();
    await page.getByTestId('char-lekkiBoy').tap();
    await expect(page.getByTestId('fighter-name')).toHaveText('Lekki Boy');
    await page.getByTestId('menu-continue').tap();
    await expect(page.getByTestId('ready-arena')).toContainText('Apapa');
    await expect(page.getByTestId('ready-difficulty')).toContainText('Nightmare');
    await expect(page.getByTestId('start-button')).toBeInViewport();
  });
});
