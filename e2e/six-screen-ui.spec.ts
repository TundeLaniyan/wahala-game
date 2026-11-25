/**
 * The six-screen redesign in a real browser (docs/SIX_SCREEN_UI.md): Home, Choose How to Play, Match Setup, Story
 * Campaign, Learn to Play and Pause / Exit. Real taps and keys against the real menu; what a screen promises is checked
 * in the match it starts. Phone landscape (844 x 390, 740 x 360), desktop and the portrait phone are all swept.
 * Screenshots (the review set compared with the Gemini references) go to WAHALA_SHOT_DIR (default e2e-shots/).
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  clearOshodiSections,
  exitMatch,
  getState,
  inMatch,
  startMatch,
  open,
  pauseSettings,
  settled,
  stepTicks,
} from './helpers';

const SHOTS = process.env.WAHALA_SHOT_DIR || 'e2e-shots';

type Debug = {
  __WAHALA__: {
    getState(): {
      arenaId: string;
      settings: { game: string };
      config: { match: { durationTicks: number } };
      players: { isBot: boolean; characterId: string }[];
    };
    camera(): { mode: string } | null;
    matchLoad(): { starts: number };
    quickPlan(): { arenaId: string; mode: string; fighters: number } | null;
    campaign(): { startNew(): void; storyDone(): void } | null;
  };
};

const live = (page: Page) =>
  page.evaluate(() => {
    const s = (window as never as Debug).__WAHALA__.getState();
    return {
      arenaId: s.arenaId,
      game: s.settings.game,
      players: s.players.length,
      bots: s.players.filter((p) => p.isBot).length,
      duration: s.config.match.durationTicks,
      camera: (window as never as Debug).__WAHALA__.camera()?.mode ?? null,
    };
  });

const savedSettings = (page: Page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem('wahala.settings.v1') ?? '{}') as Record<string, unknown>,
  );

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const press = (page: Page, id: string, touch: boolean) =>
  touch ? page.getByTestId(id).tap() : page.getByTestId(id).click();

/** A control is fully on screen (never behind a scroll) and big enough for a finger. */
async function expectReachable(page: Page, id: string, where: string, minHeight = 44): Promise<void> {
  const box = await page.getByTestId(id).boundingBox();
  expect(box, `${where}: ${id} is not on the page`).not.toBeNull();
  const vp = page.viewportSize()!;
  expect(box!.y, `${where}: ${id} above the screen`).toBeGreaterThanOrEqual(-0.5);
  expect(box!.y + box!.height, `${where}: ${id} below the screen`).toBeLessThanOrEqual(vp.height + 0.5);
  expect(box!.x + box!.width, `${where}: ${id} off the side`).toBeLessThanOrEqual(vp.width + 0.5);
  expect(box!.height, `${where}: ${id} too small to tap`).toBeGreaterThanOrEqual(minHeight);
}

test.describe('Six-screen UI', () => {
  test.beforeEach(() => test.setTimeout(6 * 60_000));

  test('Home: Quick Start, Play, Break the Ring, Learn to Play and small utilities (no Music Data Saver button); each leads where it says', async ({
    page,
  }, info) => {
    const touch = info.project.name === 'mobile';
    await open(page, '&noattract');
    await settled(page);
    await expect(page.getByTestId('menu-home')).toBeVisible();
    for (const id of [
      'home-quick',
      'home-play',
      'home-campaign',
      'home-academy',
      'home-settings-icon',
      'home-mute',
    ])
      await expectReachable(page, id, 'home');
    // the old competing rows and the Music Data Saver shortcut are gone from Home (the switch is Settings > Audio)
    for (const id of ['home-rumble', 'home-classic', 'quick-play', 'home-settings', 'home-datasaver'])
      await expect(page.getByTestId(id)).toHaveCount(0);
    // the order is fixed: Quick Start, Play, Break the Ring, Learn to Play; QUICK START is the biggest thing on the screen
    const boxOf = async (id: string) => (await page.getByTestId(id).boundingBox())!;
    const [bq, bp, bc, ba] = [
      await boxOf('home-quick'),
      await boxOf('home-play'),
      await boxOf('home-campaign'),
      await boxOf('home-academy'),
    ];
    expect(bq.y < bp.y && bp.y < bc.y && bc.y < ba.y, 'order: Quick Start, Play, Break the Ring, Learn').toBe(
      true,
    );
    for (const [id, b] of [
      ['home-play', bp],
      ['home-campaign', bc],
      ['home-academy', ba],
    ] as const)
      expect(bq.height, `QUICK START taller than ${id}`).toBeGreaterThan(b.height);
    await expect(page.getByTestId('home-quick')).toContainText('QUICK START');
    await expect(page.getByTestId('home-campaign')).toContainText('BREAK THE RING');
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-six-01-home.png` });

    await press(page, 'home-academy', touch);
    await expect(page.getByTestId('menu-academy')).toBeVisible();
    await press(page, 'menu-back', touch);
    await press(page, 'home-campaign', touch);
    await expect(page.getByTestId('menu-campaign')).toBeVisible();
    await press(page, 'menu-back', touch);
    await press(page, 'home-settings-icon', touch);
    await expect(page.getByTestId('menu-settings')).toBeVisible();
    await press(page, 'menu-back', touch);
    await press(page, 'home-play', touch);
    await expect(page.getByTestId('menu-play')).toBeVisible();
    // Back from Choose How to Play returns Home
    await press(page, 'menu-back', touch);
    await expect(page.getByTestId('menu-home')).toBeVisible();
  });

  test('Choose How to Play: City Rumble first, then Junction Blast, both visible at once, no Quick Start, no Story Campaign', async ({
    page,
  }, info) => {
    const touch = info.project.name === 'mobile';
    const errors = watchErrors(page);
    await open(page, '&noattract');
    await press(page, 'home-play', touch);
    await settled(page);
    const sizes =
      info.project.name === 'mobile'
        ? [
            [844, 390],
            [740, 360],
            [915, 412],
          ]
        : [
            [1280, 720],
            [1920, 1080],
          ];
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width: width!, height: height! });
      await settled(page);
      const where = `play at ${width}x${height}`;
      for (const id of ['home-classic', 'home-rumble']) await expectReachable(page, id, where);
      // no sideways scrolling to find a core mode, no page scroll
      const scroll = await page.evaluate(() => ({
        w: document.scrollingElement!.scrollWidth - innerWidth,
        h: document.scrollingElement!.scrollHeight - innerHeight,
      }));
      expect(scroll.w, `${where}: sideways scroll`).toBeLessThanOrEqual(0);
      expect(scroll.h, `${where}: page scroll`).toBeLessThanOrEqual(0);
    }
    await expect(page.getByTestId('menu-play')).toContainText('Junction Blast');
    await expect(page.getByTestId('menu-play')).not.toContainText('Classic Blast');
    await expect(page.getByTestId('menu-play')).not.toContainText('Quick Start');
    await expect(page.getByTestId('play-quick')).toHaveCount(0);
    // the hierarchy (decisions FU2-4, QS1): City Rumble is first and the widest card; Junction Blast is second
    const box = async (id: string) => (await page.getByTestId(id).boundingBox())!;
    const [rb, cb] = [await box('home-rumble'), await box('home-classic')];
    const inOrder = (a: typeof rb, b: typeof rb) => (a.x === b.x ? a.y < b.y : a.x < b.x);
    expect(inOrder(rb, cb), 'order: City Rumble, Junction Blast').toBe(true);
    expect(rb.width * rb.height, 'City Rumble is the biggest card').toBeGreaterThan(cb.width * cb.height);
    await expect(page.getByTestId('menu-play')).toContainText(
      'Grid battles. Cross-shaped explosions. Tactical generator action.',
    );
    await expect(page.getByTestId('menu-play')).toContainText(
      'Open 3D arenas. Generators, special attacks and rival fighters.',
    );
    await expect(page.getByTestId('menu-play')).not.toContainText(/story campaign/i);
    await expect(page.getByTestId('home-campaign')).toHaveCount(0);
    await page.setViewportSize(
      info.project.name === 'mobile' ? { width: 844, height: 390 } : { width: 1280, height: 720 },
    );
    await settled(page);
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-six-02-play.png` });
    expect(errors).toEqual([]);
  });

  test('Quick Start is an offline City Rumble drawn at random (24 or 32 fighters, Standard bots, 3 minutes), saved preferences untouched', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'the match itself is the same on every device');
    const errors = watchErrors(page);
    await open(page, '&noattract');
    // a saved Classic setup, a 32-fighter Team Rumble and non-default audio / controls must not leak into, or be overwritten by, the quick match
    const mine = {
      play: 'classic',
      competitors: 4,
      arenaId: 'balogunMarket',
      rumbleMode: 'team',
      rumbleCompetitors: 32,
      rumbleMinutes: 5,
      rumbleArenaId: 'rumbleOshodi',
      character: 'campusQueen',
      difficulty: 'casual',
      muted: true,
      musicVolume: 0.25,
      moveStyle: 'beginner',
      controlSize: 'large',
      dataSaver: 'on',
      quality: 'low',
    };
    await page.evaluate((m) => localStorage.setItem('wahala.settings.v1', JSON.stringify(m)), mine);
    await page.reload();
    await page.getByTestId('title-screen').waitFor();
    await page.getByTestId('home-quick').click();
    await expect(page.getByTestId('match-loading-quick')).toBeVisible(); // the one draw, named on the loading screen
    await inMatch(page);
    await stepTicks(page, 30);
    // a genuine City Rumble match: a Rumble stage, a respawn ruleset, 24 or 32 fighters, 3:00, the stadium camera
    const plan = (await page.evaluate(() => (window as never as Debug).__WAHALA__.quickPlan()))!;
    expect([24, 32]).toContain(plan.fighters);
    expect(['deathmatch', 'team']).toContain(plan.mode);
    expect(await live(page)).toEqual({
      arenaId: plan.arenaId,
      game: plan.mode,
      players: plan.fighters,
      bots: plan.fighters - 1,
      duration: 180 * 60,
      camera: 'stadium',
    });
    // the player's own fighter and preferences are the ones playing (and the quick values are not saved)
    const inGame = await page.evaluate(() => {
      const w = window as never as {
        __WAHALA__: { store: { getState(): { settings: Record<string, unknown> } } };
      };
      return w.__WAHALA__.store.getState().settings;
    });
    expect(inGame).toMatchObject({
      character: 'campusQueen',
      muted: true,
      musicVolume: 0.25,
      moveStyle: 'beginner',
      controlSize: 'large',
      dataSaver: 'on',
      quality: 'low',
      difficulty: 'standard',
      rumbleCompetitors: plan.fighters,
      rumbleMinutes: 3,
    });
    // decision SX11 / FU2-1: the quick values are temporary; the saved match setup and every preference are untouched
    expect(await savedSettings(page)).toMatchObject(mine);
    // a setting changed in the pause menu while the Quick Start runs is saved, without the match values
    await stepTicks(page, 200); // past the countdown: Esc pauses only once play is on
    await page.evaluate(() => {
      (
        window as never as { __WAHALA__: { controller(): { frozen: boolean } } }
      ).__WAHALA__.controller().frozen = false;
    });
    await pauseSettings(page, 'access');
    await page.getByTestId('shake-off').click();
    const midMatch = await savedSettings(page);
    expect(midMatch).toMatchObject({ ...mine, shake: 'off' });
    await page.getByTestId('pause-settings-close').click();
    await exitMatch(page);
    // back at the menu the player's own setup is what the game holds (the Quick Start left nothing behind)
    await page.getByTestId('title-screen').waitFor();
    const own = await page.evaluate(() => {
      const w = window as never as {
        __WAHALA__: { store: { getState(): { settings: Record<string, unknown> } } };
      };
      return w.__WAHALA__.store.getState().settings;
    });
    expect(own).toMatchObject({ ...mine, shake: 'off' });
    expect(await savedSettings(page)).toMatchObject({ ...mine, shake: 'off' });
    expect(errors).toEqual([]);
  });

  test('the public build is offline: no online host, websocket or cross-origin request from Home through Quick Start to the first playable frame', async ({
    page,
    context,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'the network behaviour is the same on every device');
    // every request the page, its workers and its frames make (Playwright reports them all on the context), and every
    // socket / peer connection the page script tries to open, from before the first script runs
    const origin = new URL(info.project.use.baseURL ?? 'http://localhost:4173/wahala-game/').origin;
    const outside: string[] = [];
    const sockets: string[] = [];
    context.on('request', (r) => {
      const u = new URL(r.url());
      if ((u.protocol === 'http:' || u.protocol === 'https:') && u.origin !== origin) outside.push(r.url());
      if (u.protocol === 'ws:' || u.protocol === 'wss:') outside.push(r.url());
    });
    page.on('websocket', (w) => sockets.push(w.url()));
    await page.addInitScript(() => {
      const w = window as never as Record<string, unknown> & { __netProbe: string[] };
      w.__netProbe = [];
      for (const name of ['WebSocket', 'EventSource', 'RTCPeerConnection', 'WebTransport']) {
        const Real = w[name] as (new (...a: unknown[]) => unknown) | undefined;
        if (!Real) continue;
        w[name] = function (...a: unknown[]) {
          w.__netProbe.push(`${name}(${String(a[0] ?? '')})`);
          return new Real(...a);
        };
      }
      const beacon = navigator.sendBeacon?.bind(navigator);
      if (beacon)
        navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
          w.__netProbe.push(`sendBeacon(${String(url)})`);
          return beacon(url, data);
        };
    });
    await open(page, '&noattract');
    // the public build has no Online entry at all (it is compiled out, not hidden)
    for (const id of ['home-rumble-online', 'home-online']) await expect(page.getByTestId(id)).toHaveCount(0);
    await page.getByTestId('home-quick').click();
    await inMatch(page);
    await stepTicks(page, 30);
    expect(['deathmatch', 'team']).toContain((await live(page)).game);
    expect(await page.evaluate(() => (window as never as { __netProbe: string[] }).__netProbe)).toEqual([]);
    expect(sockets).toEqual([]);
    expect(outside, 'requests to any other origin').toEqual([]);
  });

  test('Quick Start: rapid taps start exactly one match', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'the lifecycle is the same on every device');
    await open(page, '&noattract&loaddelay=600&quickplan=rumbleOjuelegba:deathmatch:8');
    await page.evaluate(() => {
      const b = document.querySelector('[data-testid="home-quick"]') as HTMLButtonElement;
      for (let i = 0; i < 4; i++) b.click();
    });
    await expect(page.getByTestId('match-loading')).toBeVisible();
    await inMatch(page);
    expect((await page.evaluate(() => (window as never as Debug).__WAHALA__.matchLoad())).starts).toBe(1);
  });

  test('Junction Blast opens its own Match Setup (no City Rumble choice), and starts with the rules shown', async ({
    page,
  }, info) => {
    const touch = info.project.name === 'mobile';
    await open(page, '&noattract');
    await press(page, 'home-play', touch);
    await press(page, 'home-classic', touch);
    await expect(page.getByTestId('classic-setup')).toBeVisible();
    await expect(page.getByTestId('menu-setup')).toContainText('Junction Blast');
    await expect(page.getByTestId('menu-setup')).not.toContainText('Classic');
    await expect(page.getByTestId('menu-setup')).not.toContainText('City Rumble');
    await expect(page.getByTestId('setup-style-rumble')).toHaveCount(0); // the other game is not offered here
    await expect(page.getByTestId('setup-style-classic')).toHaveCount(0);
    await expect(page.getByTestId('menu-setup')).toContainText('Grid battles. Cross-shaped explosions.');
    await expect(page.getByTestId('mode-team')).toHaveCount(0); // City Rumble rulesets are not Classic's
    await press(page, 'players-2', touch);
    await expectReachable(page, 'setup-start', 'classic setup');
    await expectReachable(page, 'menu-back', 'classic setup', 40);
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-six-03-setup-classic.png` });
    await press(page, 'setup-start', touch);
    await inMatch(page);
    await stepTicks(page, 20);
    expect(await live(page)).toMatchObject({ game: 'classic', players: 2 });
  });

  test('City Rumble opens its own Match Setup (no Junction Blast choice); the ruleset and size shown are the ones played', async ({
    page,
  }, info) => {
    const touch = info.project.name === 'mobile';
    await open(page, '&noattract');
    await press(page, 'home-play', touch);
    await press(page, 'home-rumble', touch);
    await expect(page.getByTestId('rumble-setup')).toBeVisible();
    await expect(page.getByTestId('setup-style-classic')).toHaveCount(0); // Junction Blast is not offered here
    await expect(page.getByTestId('menu-setup')).not.toContainText('Junction Blast');
    await expect(page.getByTestId('menu-setup')).toContainText(
      'Open 3D arenas. Generators, special attacks and rival fighters.',
    );
    await press(page, 'mode-survival', touch);
    await press(page, 'rumble-8', touch);
    await expect(page.getByTestId('minutes-5')).toHaveCount(0); // Last Player Standing has no clock
    await expectReachable(page, 'setup-start', 'rumble setup');
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-six-03-setup-rumble.png` });
    // Back returns to Choose How to Play and the choice made there is kept
    await press(page, 'menu-back', touch);
    await expect(page.getByTestId('menu-play')).toBeVisible();
    await press(page, 'home-rumble', touch);
    await expect(page.getByTestId('mode-survival')).toHaveAttribute('aria-pressed', 'true'); // not reset by moving about
    await press(page, 'setup-start', touch);
    await inMatch(page);
    await stepTicks(page, 20);
    expect(await live(page)).toMatchObject({ game: 'survival', players: 8 });
  });

  test('Break the Ring campaign: Continue your story, the current mission strip and saved progress', async ({
    page,
  }, info) => {
    const touch = info.project.name === 'mobile';
    const errors = watchErrors(page);
    await open(page, '&noattract');
    await expect(page.getByTestId('home-campaign')).toContainText('BREAK THE RING');
    await page.evaluate(() => {
      const c = (window as never as Debug).__WAHALA__.campaign()!;
      c.startNew();
      c.storyDone();
    });
    await page.evaluate(() => {
      (
        window as never as { __WAHALA__: { store: { setState(p: unknown): void } } }
      ).__WAHALA__.store.setState({
        menu: { stack: ['home'] },
      });
    });
    await clearOshodiSections(page);
    await page.evaluate(() => {
      (
        window as never as { __WAHALA__: { store: { setState(p: unknown): void } } }
      ).__WAHALA__.store.setState({
        menu: { stack: ['home'] },
      });
    });
    await expect(page.getByTestId('menu-home')).toBeVisible();
    // returning player: the button says so and shows the saved progress
    await expect(page.getByTestId('home-campaign')).toContainText('Continue your story');
    await press(page, 'home-campaign', touch);
    await expect(page.getByTestId('menu-campaign')).toBeVisible();
    await settled(page);
    await expect(page.getByTestId('campaign-current')).toBeVisible();
    await expect(page.getByTestId('campaign-current-district')).toContainText('Oshodi');
    await expect(page.getByTestId('campaign-current-mission')).not.toBeEmpty();
    await expect(page.getByTestId('campaign-current-objective')).not.toBeEmpty();
    await expect(page.getByTestId('campaign-progress-text')).toContainText('of 6 districts cleared');
    await expectReachable(page, 'campaign-continue', 'campaign');
    await expect(page.getByTestId('campaign-continue')).toContainText('Continue story');
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-six-04-campaign.png` });
    // the save is the campaign's own (one store), and survives a reload
    const before = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('campaign')));
    expect(before.length).toBeGreaterThan(0);
    await page.reload();
    await page.getByTestId('title-screen').waitFor();
    await expect(page.getByTestId('home-campaign')).toContainText('Continue your story');
    await press(page, 'home-campaign', touch);
    // Continue opens the next mission (here the Oshodi keeper's briefing)
    await press(page, 'campaign-continue', touch);
    await expect(page.getByTestId('menu-briefing')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Learn to Play: the seven sections, quick lessons, progress, and the testing tools kept apart', async ({
    page,
  }, info) => {
    const touch = info.project.name === 'mobile';
    await open(page, '&noattract');
    await press(page, 'home-academy', touch);
    await settled(page);
    for (const sec of ['quick', 'generators', 'classic', 'rumble', 'combat', 'advanced'])
      await expectReachable(page, `academy-section-${sec}`, 'academy');
    await expectReachable(page, 'academy-continue', 'academy');
    await expect(page.getByTestId('academy-progress-text')).toContainText('lessons completed');
    await expect(page.getByTestId('academy-lesson-move')).toBeVisible();
    await expect(page.getByTestId('mode-sd-test')).toHaveCount(0); // not mixed in with the beginner lessons
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-six-05-learn.png` });
    await press(page, 'academy-section-rumble', touch);
    await expect(page.getByTestId('academy-lesson-survival')).toBeVisible();
    await press(page, 'academy-section-advanced', touch);
    await expect(page.getByTestId('academy-lesson-trap-agbero')).toBeVisible();
    await expect(page.getByTestId('academy-testing')).toContainText('Combat Test Lab');
    await expect(page.getByTestId('mode-sd-test')).toBeVisible(); // still reachable, as an advanced tool
    // a short beginner lesson opens at once
    await press(page, 'academy-section-quick', touch);
    await press(page, 'academy-lesson-move', touch);
    await expect(page.getByTestId('how-to-play')).toBeVisible({ timeout: 60_000 });
  });

  test('Pause: Resume, Controls, and EXIT MATCH asks first; the match stays paused until answered', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'keyboard pause; the phone pause button has its own specs');
    const errors = watchErrors(page);
    await open(page, '&noattract');
    // a small Classic match, not Quick Start: Quick Start is a 16-fighter City Rumble now (decision FU2-1), and behind the
    // pause menu that scene still draws, a frame every few seconds on a CI runner's software renderer, so the menu's
    // transitions never settle and a click waits for the button to be "stable" until the test times out. The Quick Start
    // match itself is covered by the other tests of this file.
    await startMatch(page, { competitors: 2, waitPlaying: false });
    await stepTicks(page, 200); // past the countdown: Esc pauses only once play is on
    await page.evaluate(() => {
      (
        window as never as { __WAHALA__: { controller(): { frozen: boolean } } }
      ).__WAHALA__.controller().frozen = false;
    });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    for (const id of ['resume', 'restart', 'pause-controls-open', 'pause-settings-open', 'quit'])
      await expectReachable(page, id, 'pause');
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-six-06-pause.png` });
    const tick = (await getState(page)).tick;
    await page.waitForTimeout(600);
    expect((await getState(page)).tick, 'the match runs behind the pause menu').toBe(tick);

    // Controls opens the real controls settings, and Back returns to the pause menu, still paused
    await page.getByTestId('pause-controls-open').click();
    await expect(page.getByTestId('settings-tab-controls')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('pause-settings-close').click();
    await expect(page.getByTestId('resume')).toBeVisible();

    // EXIT MATCH: a confirmation, the match still paused behind it, Esc closes it without leaving
    await page.getByTestId('quit').click();
    await expect(page.getByTestId('exit-confirm')).toBeVisible();
    await expect(page.getByTestId('exit-confirm')).toContainText('Leave this match?');
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-six-06-exit-confirm.png` });
    await page.waitForTimeout(400);
    expect((await getState(page)).tick, 'paused behind the confirmation').toBe(tick);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('exit-confirm')).toHaveCount(0);
    await expect(page.getByTestId('pause-overlay')).toBeVisible();

    // KEEP PLAYING resumes the same match; nothing is left over the game
    await page.getByTestId('quit').click();
    await page.getByTestId('exit-confirm-stay').click();
    await expect(page.getByTestId('pause-overlay')).toHaveCount(0);
    await expect(page.getByTestId('exit-confirm')).toHaveCount(0);
    await expect.poll(async () => (await getState(page)).tick).toBeGreaterThan(tick);

    // Resume works the same way, and EXIT MATCH finally leaves for the main menu
    await page.keyboard.press('Escape');
    await page.getByTestId('resume').click();
    await expect(page.getByTestId('pause-overlay')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByTestId('quit').click();
    await page.getByTestId('exit-confirm-leave').click();
    await expect(page.getByTestId('menu-home')).toBeVisible();
    await expect(page.getByTestId('exit-confirm')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('portrait phone: every menu screen still reaches its main action; the rotate notice is for matches', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'mobile', 'phones only');
    await open(page, '&noattract');
    await page.setViewportSize({ width: 390, height: 844 });
    await settled(page);
    const screens: [string, string][] = [
      ['home', 'home-quick'],
      ['play', 'home-rumble'],
      ['setup', 'setup-start'],
      ['academy', 'academy-continue'],
    ];
    for (const [screen, action] of screens) {
      await page.evaluate(
        (s) =>
          (
            window as never as { __WAHALA__: { store: { setState(p: unknown): void } } }
          ).__WAHALA__.store.setState({
            menu: { stack: s === 'home' ? ['home'] : ['home', s] },
          }),
        screen,
      );
      await settled(page);
      await expectReachable(page, action, `portrait ${screen}`);
      const wide = await page.evaluate(() => document.scrollingElement!.scrollWidth - innerWidth);
      expect(wide, `portrait ${screen}: sideways scroll`).toBeLessThanOrEqual(0);
    }
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-six-portrait.png` });
  });
});
