/**
 * Short campaign text, narration fallback and the campaign health HUD in a real browser
 * (docs/CAMPAIGN_TEXT_NARRATION.md). Every briefing and story scene shows a one or two sentence summary and one
 * objective line; Read more reveals the rest; Listen is disabled with "Narration not recorded yet" (no clip exists)
 * and pressing it does nothing bad; Continue always works. In a mission the health meter and the protection chips sit
 * in the HUD column beside the board, never over the play area. The simulation is the real one; the health values are
 * written into the live state (the rules are covered by the unit tests), everything after that is the real HUD.
 * Screenshots go to `WAHALA_SHOT_DIR` (default e2e-shots/; the reviewed set is docs/screenshots/campaign-text-hud/).
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { open } from './helpers';

const SHOTS = process.env.WAHALA_SHOT_DIR || 'e2e-shots';

type Debug = {
  __WAHALA__: {
    store: { getState(): Record<string, unknown>; setState(p: Record<string, unknown>): void };
    campaign(): {
      load(): void;
      startNew(): void;
      storyDone(): void;
      beginBriefing(id: string): void;
      playStory(kind: 'prologue' | 'finale'): void;
      startFromBriefing(): void;
      bossIntroDone(): void;
    };
    controller(): { frozen: boolean };
    getState(): unknown;
    advance(n: number): void;
    stepTicks(n: number): void;
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

const sentences = (t: string): number => (t.trim().match(/[.!?…]+["”’')]*(\s+|$)/g) ?? []).length;

type Rect = { left: number; right: number; top: number; bottom: number };
const rectOf = (page: Page, selector: string): Promise<Rect | null> =>
  page.evaluate((q) => {
    const el = document.querySelector(q);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  }, selector);
const hits = (a: Rect, b: Rect): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

test.describe('short campaign text', () => {
  test.beforeEach(() => test.setTimeout(3 * 60_000));

  test('a briefing shows a short summary and one objective line; Read more reveals the rest; Listen is disabled and harmless', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await open(page, '&noattract');
    await page.evaluate(() => {
      const c = (window as unknown as Debug).__WAHALA__.campaign();
      c.startNew();
      c.storyDone();
      c.beginBriefing('oshodi');
    });
    const card = page.getByTestId('briefing-text');
    await expect(card).toBeVisible();
    const summary = (await card.getByTestId('card-summary').textContent()) ?? '';
    const objective = (await card.getByTestId('card-objective').locator('strong').textContent()) ?? '';
    expect(sentences(summary), `summary: ${summary}`).toBeLessThanOrEqual(2);
    expect(summary.length).toBeLessThanOrEqual(240);
    expect(objective.trim().split(/\s+/).length, `objective: ${objective}`).toBeLessThanOrEqual(12);
    // collapsed by default
    await expect(page.getByTestId('card-readmore-body')).toHaveCount(0);
    await expect(page.getByTestId('boss-crew')).toHaveCount(0);

    // Read more reveals the objectives, intel, warnings and the unseen broker's message; and collapses again
    const toggle = card.getByTestId('card-readmore');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const body = page.getByTestId('card-readmore-body');
    await expect(body).toBeVisible();
    await expect(body).toContainText('Jam relay masts');
    await expect(body.getByTestId('story-broker')).toContainText('UNKNOWN NUMBER');
    await expect(body.locator('img, svg, canvas')).toHaveCount(0); // the broker never gets a face
    await toggle.click();
    await expect(page.getByTestId('card-readmore-body')).toHaveCount(0);

    // Listen: shown, disabled, says why; pressing it does nothing and the text stays
    const listen = card.getByTestId('card-listen');
    await expect(listen).toBeVisible();
    await expect(listen).toBeDisabled();
    await expect(card.getByTestId('card-listen-note')).toHaveText('Narration not recorded yet');
    await listen.evaluate((b) => (b as HTMLButtonElement).click());
    await expect(card.getByTestId('card-summary')).toHaveText(summary);

    // the setting can hide the button
    await page.evaluate(() => {
      const st = (window as unknown as Debug).__WAHALA__.store;
      const settings = st.getState().settings as Record<string, unknown>;
      st.setState({ settings: { ...settings, campaignListen: false } });
    });
    await expect(card.getByTestId('card-listen')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('a story scene is one short card; Enter, Space and the button all continue; the scene text is behind Read more', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'keyboard');
    const errors = watchErrors(page);
    await open(page, '&noattract');
    await page.evaluate(() => {
      const c = (window as unknown as Debug).__WAHALA__.campaign();
      c.startNew();
    });
    const card = page.getByTestId('prologue-player');
    await expect(card).toBeVisible();
    await expect(card.getByTestId('card-objective')).toContainText('Oshodi');
    await expect(page.getByTestId('story-broker')).toHaveCount(0);
    await card.getByTestId('card-readmore').click();
    await expect(page.getByTestId('story-broker')).toBeVisible();
    // Space on the focused Continue button, Enter anywhere: both end the scene
    await page.getByTestId('story-next').focus();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('menu-campaign')).toBeVisible();
    await page.getByTestId('campaign-prologue').click();
    await expect(page.getByTestId('prologue-player')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('menu-campaign')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('campaign health HUD', () => {
  test.setTimeout(600_000); // software WebGL

  test('the health meter and the protection chips sit in the HUD column, clear of the play area and the controls', async ({
    page,
  }, info) => {
    const errors = watchErrors(page);
    await open(page, '&noattract');
    await page.evaluate(() => {
      const c = (window as unknown as Debug).__WAHALA__.campaign();
      c.load();
      c.startNew();
      c.storyDone();
      c.beginBriefing('oshodi');
      c.startFromBriefing();
      c.bossIntroDone();
    });
    await expect(page.getByTestId('hud')).toBeVisible();
    await page.evaluate(() => {
      const w = (window as unknown as Debug).__WAHALA__;
      w.controller().frozen = true;
      w.stepTicks(260);
      // a campaign player: 4 health segments, a plate of Armour and an Okada under them
      const s = w.getState() as {
        tick: number;
        players: { armour: number; mounted: boolean; vitals?: unknown }[];
      };
      const me = s.players[0]!;
      me.armour = 1;
      me.mounted = true;
      me.vitals = { hp: 4, maxHp: 4, invulnUntil: 0, lastHitTick: -1, lastHitBy: null, lastHitSource: null };
      w.advance(30);
    });
    const meter = page.getByTestId('campaign-health');
    await expect(meter).toBeVisible();
    await expect(page.getByTestId('health-seg')).toHaveCount(4);
    await expect(page.locator('[data-testid="health-seg"][data-state="full"]')).toHaveCount(4);
    await expect(page.getByTestId('campaign-chip-armour')).toHaveAttribute('data-state', 'ready');
    await expect(page.getByTestId('campaign-chip-okada')).toHaveAttribute('data-state', 'ready');
    // in the City Rumble right column, with the mission panel, not over the play area
    await expect(page.locator('[data-testid="rumble-right"] [data-testid="campaign-health"]')).toBeVisible();
    const clean = async (): Promise<void> => {
      const m = (await rectOf(page, '[data-testid="campaign-health"]'))!;
      for (const q of [
        '[data-testid="minimap"]',
        '.timer',
        '.top-buttons',
        '[data-testid="inventory"]',
        '.abtn',
        '[data-testid="stick-pad"]',
        '[data-testid="rumble-hud"]',
      ]) {
        const o = await rectOf(page, q);
        if (o) expect(hits(m, o), `the meter covers ${q}`).toBe(false);
      }
      const vp = page.viewportSize()!;
      expect(m.right).toBeLessThanOrEqual(vp.width);
      expect(m.bottom).toBeLessThanOrEqual(vp.height);
    };
    await clean();
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-health-full.png`, timeout: 180_000 });

    // a bottle takes a segment and the Armour: the segment flashes, the chip is consumed, the cause is named
    await page.evaluate(() => {
      const w = (window as unknown as Debug).__WAHALA__;
      const s = w.getState() as {
        tick: number;
        players: { armour: number; mounted: boolean; vitals: Record<string, unknown> }[];
      };
      const me = s.players[0]!;
      me.armour = 0;
      me.vitals = {
        hp: 2,
        maxHp: 4,
        invulnUntil: s.tick + 90,
        lastHitTick: s.tick,
        lastHitBy: null,
        lastHitSource: 'bottle',
      };
      w.advance(1);
    });
    await expect(page.locator('[data-testid="health-seg"][data-state="full"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="health-seg"][data-state="lost"]')).toHaveCount(1);
    await expect(page.getByTestId('campaign-chip-armour')).toHaveAttribute('data-state', 'used');
    await expect(page.getByTestId('campaign-chip-invulnerable')).toBeVisible();
    await expect(page.getByTestId('campaign-cause')).toHaveText('HIT BY BOTTLE');
    // the rail notice for the same hit (worded by the app from the sim's campaignHit event; unit-tested)
    await page.evaluate(() => {
      const st = (window as unknown as Debug).__WAHALA__.store;
      st.setState({
        toasts: [
          { id: 9001, text: 'HIT BY BOTTLE · 2/4 LEFT', tone: 'bad', expires: Number.MAX_SAFE_INTEGER },
          { id: 9002, text: 'ARMOUR USED', tone: 'good', expires: Number.MAX_SAFE_INTEGER },
        ],
      });
    });
    await clean();
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-health-hit.png`, timeout: 180_000 });
    expect(errors).toEqual([]);
  });
});
