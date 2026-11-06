/**
 * The illustrated story panels in a real browser (docs/STORY_VISUALS.md): the prologue, the briefing and the boss
 * introduction show their picture (loaded, with alt text), and the objective is on screen without scrolling at 1280 x 720
 * (desktop project) and 844 x 390 (mobile project). With every picture blocked the cards still work: no broken image, the
 * objective and the main button are there and the campaign carries on.
 * Screenshots go to `WAHALA_SHOT_DIR` (default e2e-shots/; the reviewed set is docs/screenshots/story-visuals/).
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { open, settled } from './helpers';

const SHOTS = process.env.WAHALA_SHOT_DIR || 'e2e-shots';

type Debug = {
  __WAHALA__: {
    store: { setState(p: unknown): void };
    campaign(): {
      startNew(): void;
      storyDone(): void;
      beginBriefing(id?: string): void;
      playStory(kind: 'prologue' | 'finale'): void;
      finishMission(o: unknown): void;
    } | null;
  };
};

const MISSIONS = ['oshodi', 'mushin', 'fadeyiSomolu', 'ebuteMetta', 'lagosIsland', 'lekki'];
const outcome = (missionId: string) => ({
  result: 'won',
  missionId,
  modifiers: [],
  seconds: 118,
  livesUsed: 1,
  phasesCleared: 3,
  defeat: 'eliminated',
  stars: 2,
  creditedKills: 3,
});

/** A started campaign with every district cleared (so every briefing opens), through the real controller. */
async function startedCampaign(page: Page): Promise<void> {
  await open(page, '&noattract');
  await page.evaluate((outs) => {
    const c = (window as never as Debug).__WAHALA__.campaign()!;
    c.startNew();
    c.storyDone();
    for (const o of outs) c.finishMission(o);
  }, MISSIONS.map(outcome));
}

type Screen = {
  name: string;
  root: string;
  card: string;
  image: string;
  show: () => (page: Page) => Promise<void>;
};
const SCREENS: Screen[] = [
  {
    name: 'prologue',
    root: 'menu-campaignStory',
    card: 'prologue-player',
    image: 'prologue',
    show: () => (page) =>
      page.evaluate(() => (window as never as Debug).__WAHALA__.campaign()!.playStory('prologue')),
  },
  {
    name: 'briefing',
    root: 'menu-briefing',
    card: 'briefing-text',
    image: 'district.oshodi.briefing',
    show: () => (page) =>
      page.evaluate(() => (window as never as Debug).__WAHALA__.campaign()!.beginBriefing('oshodi')),
  },
  {
    name: 'boss-intro',
    root: 'menu-bossIntro',
    card: 'boss-intro-player',
    image: 'boss.madamRonke.intro',
    show: () => (page) =>
      page.evaluate(() => {
        const w = (window as never as Debug).__WAHALA__;
        w.campaign()!.beginBriefing('mushin');
        w.store.setState({ menu: { stack: ['home', 'campaign', 'briefing', 'bossIntro'] } });
      }),
  },
];

test.describe('story panels', () => {
  test.beforeEach(() => test.setTimeout(2 * 60_000));

  for (const s of SCREENS) {
    test(`${s.name}: the picture is shown with alt text and the objective is on screen`, async ({
      page,
    }, info) => {
      await startedCampaign(page);
      await s.show()(page);
      await expect(page.getByTestId(s.root)).toBeVisible();
      await settled(page);
      const hero = page.getByTestId(s.card).getByTestId('story-hero');
      await expect(hero).toBeVisible();
      expect(await hero.getAttribute('data-image')).toBe(s.image);
      const img = hero.locator('img');
      expect((await img.getAttribute('alt'))?.length ?? 0).toBeGreaterThan(20);
      await expect
        .poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0))
        .toBe(true);
      await expect(hero).toHaveAttribute('data-state', 'ready');

      const vp = page.viewportSize()!;
      const m = await page.evaluate(
        ({ card, root }) => {
          const q = (sel: string) => document.querySelector<HTMLElement>(sel)?.getBoundingClientRect();
          const scope = `[data-testid="${card}"]`;
          const hero = q(`${scope} [data-testid="story-hero"]`)!;
          const objective = q(`${scope} [data-testid="card-objective"]`)!;
          const body = q(`[data-testid="${root}"] .mn-body`)!;
          const foot = q(`[data-testid="${root}"] .mn-foot`);
          const doc = document.scrollingElement!;
          return {
            hero: { l: hero.left, r: hero.right, t: hero.top, b: hero.bottom, w: hero.width, h: hero.height },
            objective: { t: objective.top, b: objective.bottom, l: objective.left, r: objective.right },
            body: { t: body.top, b: body.bottom },
            foot: foot ? foot.top : vp.height,
            pageScrolls: doc.scrollHeight - innerHeight,
          };
        },
        { card: s.card, root: s.root },
      );
      const where = `${s.name} at ${vp.width}x${vp.height}`;
      // the picture: on screen, 16:9 or a cropped wide shape, never taller than it is wide
      expect(m.hero.w, `${where}: picture has width`).toBeGreaterThan(100);
      expect(m.hero.h, `${where}: picture is landscape`).toBeLessThan(m.hero.w);
      expect(m.hero.l).toBeGreaterThanOrEqual(0);
      expect(m.hero.r).toBeLessThanOrEqual(vp.width + 0.5);
      // the objective: fully inside the visible part of the body (not under the header, not under the footer)
      expect(m.objective.t, `${where}: objective above the visible area`).toBeGreaterThanOrEqual(
        m.body.t - 0.5,
      );
      expect(m.objective.b, `${where}: objective below the fold`).toBeLessThanOrEqual(
        Math.min(m.body.b, m.foot) + 0.5,
      );
      expect(m.objective.b).toBeLessThanOrEqual(vp.height);
      expect(m.objective.r).toBeLessThanOrEqual(vp.width + 0.5);
      expect(m.pageScrolls, `${where}: the page scrolls`).toBeLessThanOrEqual(0);
      await page.screenshot({
        path: `${SHOTS}/${info.project.name}-${s.name}.jpg`,
        type: 'jpeg',
        quality: 78,
      });
    });
  }

  test('with every picture blocked the cards still work: no broken image, objective and main button present', async ({
    page,
  }) => {
    await page.route('**/*.webp', (route) => route.abort());
    await startedCampaign(page);
    for (const s of SCREENS) {
      await s.show()(page);
      await expect(page.getByTestId(s.root)).toBeVisible();
      await settled(page);
      const card = page.getByTestId(s.card);
      await expect(card.getByTestId('card-objective')).toBeVisible();
      await expect(card.getByTestId('card-summary')).toBeVisible();
      // the picture is removed when its file fails: no figure, no image element, no leftover class
      await expect(card.getByTestId('story-hero')).toHaveCount(0);
      await expect(card.locator('img.cp-broken, figure.cp-hero')).toHaveCount(0);
      await expect(page.locator('.mn-actions button').first()).toBeVisible();
    }
  });
});
