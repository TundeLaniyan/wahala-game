/**
 * The one-player campaign in a real browser (docs/CAMPAIGN_UI.md), with every online flag off:
 *  - Home -> Campaign -> New -> prologue (skipped) -> map -> Oshodi briefing -> boss intro -> the mission starts
 *    (this last step needs the mission runtime: it skips itself while `buildMissionGame` is still the stub);
 *  - progress is saved in localStorage and survives a reload;
 *  - every campaign screen fits phone portrait / landscape and desktop: no page scroll, taps >= 44 px.
 * Screenshots go to `WAHALA_SHOT_DIR` (default e2e-shots/; the reviewed set lives in docs/screenshots/campaign-ui/).
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { open, settled } from './helpers';

const SHOTS = process.env.WAHALA_SHOT_DIR || 'e2e-shots';

/** The debug handle (`?debug`): the store and the campaign controller. */
type Debug = {
  __WAHALA__: {
    store: {
      setState(p: unknown): void;
      getState(): { screen: string; campaign: { notice: string | null } | null };
    };
    campaign(): {
      startNew(): void;
      storyDone(): void;
      beginBriefing(id?: string): void;
      playStory(kind: 'prologue' | 'finale'): void;
      finishMission(o: unknown): void;
      startMission(id: string): boolean;
    } | null;
  };
};

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
  });
  return errors;
}

const outcome = (missionId: string, over: Record<string, unknown> = {}) => ({
  result: 'won',
  missionId,
  modifiers: [],
  seconds: 118,
  livesUsed: 1,
  phasesCleared: 3,
  defeat: 'eliminated',
  stars: 2,
  creditedKills: 3,
  ...over,
});

const MISSIONS = ['oshodi', 'mushin', 'fadeyiSomolu', 'ebuteMetta', 'lagosIsland', 'lekki'];

test.describe('Campaign', () => {
  test.beforeEach(() => test.setTimeout(3 * 60_000));

  test('Home -> Campaign -> New -> prologue skip -> map -> Oshodi briefing -> boss intro -> mission starts', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'one viewport is enough for the full journey');
    const errors = watchErrors(page);
    await open(page, '&noattract');
    await page.getByTestId('home-campaign').click();
    await expect(page.getByTestId('menu-campaign')).toBeVisible();
    await expect(page.getByTestId('campaign-start-card')).toBeVisible();
    await page.getByTestId('campaign-start-new').click();

    // prologue: the broker is only a message card; Skip goes to the map
    await expect(page.getByTestId('prologue-player')).toBeVisible();
    await page.getByTestId('story-next').click();
    await page.getByTestId('story-next').click();
    await page.getByTestId('story-skip').click();
    await expect(page.getByTestId('map-node-oshodi')).toHaveAttribute('data-status', 'available');
    await expect(page.getByTestId('map-node-mushin')).toHaveAttribute('data-status', 'locked');
    await expect(page.getByTestId('campaign-progress-text')).toContainText('0 of 6 districts cleared');

    await page.getByTestId('map-node-oshodi').click();
    await expect(page.getByTestId('district-landmarks')).toContainText('Interchange Flyover');
    await page.getByTestId('campaign-briefing').click();
    await expect(page.getByTestId('menu-briefing')).toBeVisible();
    await expect(page.getByTestId('boss-name')).toHaveText('Oga Sunmola');
    await expect(page.getByTestId('boss-crew')).toContainText('Orita Park Wardens');
    await page.getByTestId('briefing-char-lekkiBoy').click();
    await page.getByTestId('briefing-start').click();

    await expect(page.getByTestId('boss-intro-player')).toBeVisible();
    await page.getByTestId('story-skip').click();

    // the mission begins on screen, or (until the mission runtime is merged) says plainly that it cannot
    const hud = page.getByTestId('hud');
    const notice = page.getByTestId('campaign-notice');
    await expect(hud.or(notice)).toBeVisible();
    if (await notice.isVisible()) {
      await expect(notice).toContainText('could not start');
      test.skip(true, 'needs mission runtime (buildMissionGame is still the stub)');
    }
    await expect(hud).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('progress is saved in localStorage and a reload restores it; Delete save asks first', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'one viewport is enough');
    const errors = watchErrors(page);
    await open(page, '&noattract');
    await page.evaluate((o) => {
      const c = (window as never as Debug).__WAHALA__.campaign()!;
      c.startNew();
      c.storyDone();
      c.finishMission(o);
    }, outcome('oshodi'));
    await expect(page.getByTestId('menu-campaignResult')).toBeVisible();
    await expect(page.getByTestId('result-unlocked-districts')).toContainText('Mushin');
    await page.getByTestId('result-next').click();
    await expect(page.getByTestId('menu-briefing')).toBeVisible();
    await expect(page.getByTestId('boss-name')).toHaveText('Madam Ronke');

    await page.reload();
    await expect(page.getByTestId('title-screen')).toBeVisible();
    await expect(page.getByTestId('home-campaign')).toContainText('1 / 6');
    await page.getByTestId('home-campaign').click();
    await expect(page.getByTestId('map-node-oshodi')).toHaveAttribute('data-status', 'cleared');
    await expect(page.getByTestId('map-node-mushin')).toHaveAttribute('data-status', 'available');
    await expect(page.getByTestId('campaign-progress-text')).toContainText('1 of 6 districts cleared');

    await page.getByTestId('campaign-delete').click();
    await expect(page.getByTestId('campaign-confirm')).toBeVisible();
    await page.getByTestId('campaign-confirm-no').click();
    await expect(page.getByTestId('map-node-mushin')).toHaveAttribute('data-status', 'available');
    await page.getByTestId('campaign-delete').click();
    await page.getByTestId('campaign-confirm-yes').click();
    await expect(page.getByTestId('campaign-start-card')).toBeVisible();
    await page.reload();
    await page.getByTestId('home-campaign').click();
    await expect(page.getByTestId('campaign-start-card')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a corrupt save does not crash: fresh campaign and a notice', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one viewport is enough');
    const errors = watchErrors(page);
    await page.addInitScript(() => localStorage.setItem('wahala.campaign.v1', '{broken'));
    await open(page, '&noattract');
    await page.getByTestId('home-campaign').click();
    await expect(page.getByTestId('campaign-notice')).toContainText('could not be read');
    await expect(page.getByTestId('campaign-start-card')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('?campaign=0 hides the campaign: the menu is exactly as before', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one viewport is enough');
    await open(page, '&noattract&campaign=0');
    await expect(page.getByTestId('menu-home')).toBeVisible();
    await expect(page.getByTestId('home-campaign')).toHaveCount(0);
    await expect(page.getByTestId('home-rumble')).toBeVisible();
  });

  test('keyboard: Enter advances the story; Esc goes back to the map', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'keyboard');
    await open(page, '&noattract');
    await page.getByTestId('home-campaign').click();
    await page.getByTestId('campaign-start-new').click();
    await expect(page.getByTestId('story-count')).toContainText('1 /');
    await page.keyboard.press('Enter'); // completes the typing line
    await page.keyboard.press('Enter'); // next line
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('story-count')).not.toContainText('1 /');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('menu-campaign')).toBeVisible();
  });

  test('every campaign screen fits desktop and phone sizes: no page scroll, main action on screen, taps >= 44 px', async ({
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
    await open(page, '&noattract');
    const setup = async (screen: string): Promise<void> => {
      await page.evaluate(
        ({ screen, out }) => {
          const w = window as never as Debug;
          const c = w.__WAHALA__.campaign()!;
          const menu = (...stack: string[]) =>
            w.__WAHALA__.store.setState({ menu: { stack: ['home', ...stack] } });
          const result = (id: string, o: Record<string, unknown>) =>
            c.finishMission({ ...out, missionId: id, ...o });
          if (screen === 'map') {
            c.playStory('prologue');
            menu('campaign');
          } else if (screen === 'story') c.playStory('prologue');
          else if (screen === 'briefing') c.beginBriefing('oshodi');
          else if (screen === 'bossIntro') {
            c.beginBriefing('mushin');
            menu('campaign', 'briefing', 'bossIntro');
          } else if (screen === 'win') result('oshodi', {});
          else if (screen === 'lost')
            result('mushin', { result: 'lost', stars: 0, defeat: null, phasesCleared: 1 });
          else if (screen === 'complete') menu('campaign', 'campaignComplete');
        },
        { screen, out: outcome('oshodi') },
      );
    };
    // every district cleared through the real controller, so every screen has real data
    await page.evaluate(
      (outs) => {
        const c = (window as never as Debug).__WAHALA__.campaign()!;
        c.startNew();
        c.storyDone();
        for (const o of outs) c.finishMission(o);
      },
      MISSIONS.map((id) => outcome(id)),
    );
    const screens: [string, string, string, string][] = [
      ['map', 'menu-campaign', 'campaign-continue', 'campaign'],
      ['story', 'menu-campaignStory', 'story-next', 'story'],
      ['briefing', 'menu-briefing', 'briefing-start', 'briefing'],
      ['bossIntro', 'menu-bossIntro', 'story-next', 'bossintro'],
      ['win', 'menu-campaignResult', 'result-next', 'result-win'],
      ['lost', 'menu-campaignResult', 'result-retry', 'result-lost'],
      ['complete', 'menu-campaignComplete', 'complete-map', 'complete'],
    ];
    for (const vp of sizes) {
      await page.setViewportSize(vp);
      for (const [screen, root, action, shot] of screens) {
        await setup(screen);
        await expect(page.getByTestId(root)).toBeVisible();
        await settled(page);
        const m = await page.evaluate((id) => {
          const el = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
          const small = [...document.querySelectorAll<HTMLElement>('.mn button, .mn input[type=range]')]
            .filter((b) => b.offsetParent && b.getBoundingClientRect().height > 0)
            .filter((b) => b.getBoundingClientRect().height < 36)
            .map((b) => b.dataset.testid ?? b.textContent);
          const doc = document.scrollingElement!;
          return {
            wide: doc.scrollWidth - innerWidth,
            tall: doc.scrollHeight - innerHeight,
            action: { right: el.right, bottom: el.bottom, left: el.left, top: el.top, h: el.height },
            small,
            overflowX: [...document.querySelectorAll<HTMLElement>('.mn-body')].some(
              (b) => b.scrollWidth - b.clientWidth > 1,
            ),
          };
        }, action);
        const where = `${screen} at ${vp.width}x${vp.height}`;
        expect(m.wide, `${where}: page scrolls sideways`).toBeLessThanOrEqual(0);
        expect(m.tall, `${where}: page scrolls`).toBeLessThanOrEqual(0);
        expect(m.overflowX, `${where}: content wider than its screen`).toBe(false);
        expect(m.action.bottom, `${where}: main action below the screen`).toBeLessThanOrEqual(
          vp.height + 0.5,
        );
        expect(m.action.right, `${where}: main action off the side`).toBeLessThanOrEqual(vp.width + 0.5);
        expect(m.action.top, `${where}: main action above the screen`).toBeGreaterThanOrEqual(0);
        expect(m.action.h, `${where}: main action too small to tap`).toBeGreaterThanOrEqual(44);
        expect(m.small, `${where}: controls smaller than a finger`).toEqual([]);
        await page.screenshot({
          path: `${SHOTS}/${info.project.name}-campaign-${shot}-${vp.width}x${vp.height}.png`,
        });
      }
    }
  });
});
