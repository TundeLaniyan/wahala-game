import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { open, stepTicks } from './helpers';

const STANDARD = [
  'danfoBusPark',
  'balogunMarket',
  'lekkiRoadworks',
  'oshodiInterchange',
  'ajegunleBackstreets',
  'lagoonJetty',
  'surulerePowerYard',
  'yabaAfterDark',
  'thirdMainland',
];

/** Console errors and failed requests, except preview images that have not been generated yet. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('/previews/')) errors.push(`${r.status()} ${r.url()}`);
  });
  return errors;
}

interface StageView {
  arenaId: string;
  phase: string;
  players: number;
  events: { style: string; kind: string; warnTick: number; startTick: number }[];
  tick: number;
}

const stage = (page: Page): Promise<StageView> =>
  page.evaluate(() => {
    const s = (window as unknown as { __WAHALA__: { getState(): never } }).__WAHALA__.getState() as {
      arenaId: string;
      tick: number;
      match: { phase: string };
      players: unknown[];
      stage: { events: StageView['events'] };
    };
    return {
      arenaId: s.arenaId,
      phase: s.match.phase,
      players: s.players.length,
      tick: s.tick,
      events: s.stage.events.map((e) => ({
        style: e.style,
        kind: e.kind,
        warnTick: e.warnTick,
        startTick: e.startTick,
      })),
    };
  });

/** Steps the frozen simulation one second at a time until a stage event is warning (max `seconds`). */
async function untilStageWarning(page: Page, seconds: number): Promise<StageView> {
  for (let i = 0; i < seconds; i++) {
    const v = await stage(page);
    if (v.events.some((e) => v.tick < e.startTick)) return v;
    await stepTicks(page, 60);
  }
  return stage(page);
}

test.describe('arena picker and stage hazards', () => {
  test('every standard arena can be picked, started and reaches play without errors', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'one viewport is enough for the nine-arena sweep');
    test.setTimeout(15 * 60_000);
    const errors = watchErrors(page);
    await open(page, '&nobots&noattract');
    for (const id of STANDARD) {
      await page.getByTestId(`arena-${id}`).click();
      await expect(page.getByTestId(`arena-${id}`)).toHaveAttribute('aria-pressed', 'true');
      await page.getByTestId('players-2').click();
      await page.getByTestId('start-button').click();
      await expect(page.getByTestId('hud')).toBeVisible();
      await stepTicks(page, 200);
      await expect(page.getByTestId('hud')).toHaveAttribute('data-phase', 'playing');
      const v = await stage(page);
      expect(v.arenaId).toBe(id);
      expect(v.phase).toBe('playing');
      await page.keyboard.press('Escape');
      await page.getByTestId('quit').click();
      await expect(page.getByTestId('title-screen')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('a stage hazard warning is in the state and on screen as an alert', async ({ page }, info) => {
    const errors = watchErrors(page);
    await open(page, '&nobots&noattract');
    await page.getByTestId('arena-oshodiInterchange').click();
    await page.getByTestId('players-2').click();
    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await stepTicks(page, 200);
    const v = await untilStageWarning(page, 14);
    const warning = v.events.find((e) => v.tick < e.startTick);
    expect(warning?.style).toBe('traffic');
    expect(warning?.kind).toBe('sweep');
    const alert = page.getByTestId('stage-alert').first();
    await expect(alert).toBeVisible();
    await expect(alert).toHaveAttribute('data-style', 'traffic');
    await expect(alert).toContainText(/(BUS|KEKE) (CROSSING|COMING)/);
    await page.screenshot({ path: `e2e-shots/${info.project.name}-stage-alert.png` });
    // once it has driven through, the alert is gone
    await stepTicks(page, 60 * 6);
    await expect(page.getByTestId('stage-alert')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('Surulere Power Yard shows its rule banner during the countdown', async ({ page }, info) => {
    await open(page, '&nobots&noattract');
    const card = page.getByTestId('arena-surulerePowerYard');
    await expect(card).toContainText('POWER YARD RULE');
    await card.click();
    await page.getByTestId('start-button').click();
    const banner = page.getByTestId('rule-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/WHOLE row and column/);
    await page.screenshot({ path: `e2e-shots/${info.project.name}-power-yard-banner.png` });
    await stepTicks(page, 200);
    await expect(page.getByTestId('hud')).toHaveAttribute('data-phase', 'playing');
    await expect(page.getByTestId('rule-banner')).toHaveCount(0);
  });

  test('City Rumble card hides the 2-4 and rules choices, picks a size and starts', async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, '&nobots&noattract');
    await expect(page.getByTestId('players-2')).toBeVisible();
    await expect(page.getByTestId('traps-note')).toContainText('0:30');
    await page.getByTestId('arena-cityRumble').click();
    await expect(page.getByTestId('players-2')).toHaveCount(0);
    await expect(page.getByTestId('mode-classic')).toHaveCount(0);
    await page.getByTestId('rumble-8').click();
    await expect(page.getByTestId('rumble-8')).toHaveClass(/on/);
    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await stepTicks(page, 200);
    const v = await stage(page);
    expect(v.arenaId).toBe('cityRumble');
    expect(v.players).toBe(8);
    expect(v.phase).toBe('playing');
    expect(errors).toEqual([]);
  });

  test('the arena picker fits a landscape phone without scrolling the page', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'phone layout');
    await open(page, '&nobots&noattract');
    const scroll = await page.evaluate(() => ({
      doc: document.scrollingElement!.scrollHeight - window.innerHeight,
      wide: document.scrollingElement!.scrollWidth - window.innerWidth,
    }));
    expect(scroll.doc).toBeLessThanOrEqual(0);
    expect(scroll.wide).toBeLessThanOrEqual(0);
    await page.getByTestId('arena-thirdMainland').click();
    await expect(page.getByTestId('arena-thirdMainland')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('start-button')).toBeInViewport();
    await page.screenshot({ path: `e2e-shots/${info.project.name}-arena-picker.png` });
  });
});
