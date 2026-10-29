import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export interface TestState {
  tick: number;
  phase: string;
  playTicks: number;
  players: {
    x: number;
    y: number;
    alive: boolean;
    mounted: boolean;
    hasVoucher: boolean;
    entryUntil: number | null;
    characterId: string;
    dazedUntil: number;
  }[];
  generators: { id: number; ownerId: number; x: number; y: number; mode: string; timer: number }[];
  vehicles: { id: number; kind: string; phase: string; damage: number; index: number }[];
  flames: number;
  pickups: number;
  result: unknown;
}

export async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`./?debug&q=low&seed=7${query}`);
  await expect(page.getByTestId('title-screen')).toBeVisible();
}

/**
 * The menu journey: Home -> (City Rumble -> tap a mode) -> arena and settings -> fighter -> review -> play.
 * Tapping a mode moves straight on (no Continue). These helpers walk the real journey; nothing is set behind
 * the menu's back.
 */
export async function toClassicSetup(page: Page): Promise<void> {
  if ((await page.getByTestId('classic-setup').count()) > 0) return;
  await page.getByTestId('home-classic').click();
  await expect(page.getByTestId('classic-setup')).toBeVisible();
}

export async function toRumbleSetup(
  page: Page,
  mode: 'survival' | 'deathmatch' | 'team' = 'survival',
): Promise<void> {
  if ((await page.getByTestId('rumble-setup').count()) > 0) return;
  await page.getByTestId('home-rumble').click();
  await page.getByTestId(`mode-${mode}`).click();
  await expect(page.getByTestId('rumble-setup')).toBeVisible();
}

/** Classic Battle: picks arena `id` from "Select Arena" on the setup screen. */
export async function chooseArena(page: Page, id: string): Promise<void> {
  await toClassicSetup(page);
  const card = page.getByTestId(`arena-${id}`);
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
}

/** City Rumble: picks stage `id` from "Select Arena" on the setup screen. */
export async function chooseStage(page: Page, id: string): Promise<void> {
  const card = page.getByTestId(`rumble-stage-${id}`);
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
}

/** Sets a bot difficulty slider (level index 0..6) the way a player would: by value. */
export async function setDifficulty(page: Page, index: number, testId = 'diff-slider'): Promise<void> {
  await page.getByTestId(testId).fill(String(index));
}

/**
 * Starts the match from wherever the menu is: Home uses Quick play (the saved setup); a setup / fighter
 * screen continues to Ready (picking `character` on the way) and presses Start.
 */
export async function launch(page: Page, character?: string): Promise<void> {
  if (!character && (await page.getByTestId('menu-home').count()) > 0) {
    await page.getByTestId('quick-play').click();
    return;
  }
  if ((await page.getByTestId('menu-home').count()) > 0) await page.getByTestId('quick-review').click();
  if ((await page.getByTestId('menu-setup').count()) > 0) await page.getByTestId('menu-continue').click();
  if (character) {
    if ((await page.getByTestId('menu-ready').count()) > 0) await page.getByTestId('edit-fighter').click();
    await page.getByTestId(`char-${character}`).click();
  }
  if ((await page.getByTestId('menu-fighter').count()) > 0) await page.getByTestId('menu-continue').click();
  await page.getByTestId('start-button').click();
}

/** Starts a match (default: Classic Battle, the 2-4 player game most specs were written for). */
export async function startMatch(
  page: Page,
  opts: {
    bots?: boolean;
    competitors?: 2 | 3 | 4;
    character?: string;
    waitPlaying?: boolean;
    game?: 'classic' | 'rumble';
  } = {},
): Promise<void> {
  if ((opts.game ?? 'classic') === 'classic') await toClassicSetup(page);
  else await toRumbleSetup(page);
  if (opts.competitors) await page.getByTestId(`players-${opts.competitors}`).click();
  await launch(page, opts.character);
  await expect(page.getByTestId('hud')).toBeVisible();
  if (opts.waitPlaying !== false) await stepTicks(page, 160);
}

/** Waits until the menu's entrance animations have finished (software WebGL renders a few frames a second). */
export async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
  );
}

/** Main menu -> Settings on `tab` (audio / graphics / controls / access). */
export async function openSettings(
  page: Page,
  tab: 'audio' | 'graphics' | 'controls' | 'access' = 'audio',
): Promise<void> {
  await page.getByTestId('home-settings').click();
  await page.getByTestId(`settings-tab-${tab}`).click();
}

/** In a match: pause and open the pause menu's Settings on `tab`. */
export async function pauseSettings(
  page: Page,
  tab: 'audio' | 'graphics' | 'controls' | 'access' = 'audio',
): Promise<void> {
  if ((await page.getByTestId('pause-overlay').count()) === 0) await page.keyboard.press('Escape');
  await page.getByTestId('pause-settings-open').click();
  await page.getByTestId(`settings-tab-${tab}`).click();
}

export async function stepTicks(page: Page, n: number): Promise<void> {
  await page.evaluate((count) => {
    const w = (
      window as unknown as { __WAHALA__: { controller(): { frozen: boolean }; stepTicks(n: number): void } }
    ).__WAHALA__;
    w.controller().frozen = true;
    w.stepTicks(count);
  }, n);
}

export async function getState(page: Page): Promise<TestState> {
  return page.evaluate(() => {
    const w = (window as unknown as { __WAHALA__: { getState(): never } }).__WAHALA__;
    const s = w.getState() as {
      tick: number;
      match: { phase: string; playTicks: number; result: unknown };
      players: TestState['players'];
      generators: TestState['generators'];
      vehicles: TestState['vehicles'];
      flames: unknown[];
      pickups: unknown[];
    };
    return {
      tick: s.tick,
      phase: s.match.phase,
      playTicks: s.match.playTicks,
      players: s.players.map((p) => ({
        x: p.x,
        y: p.y,
        alive: p.alive,
        mounted: p.mounted,
        hasVoucher: p.hasVoucher,
        entryUntil: p.entryUntil,
        characterId: p.characterId,
        dazedUntil: p.dazedUntil,
      })),
      generators: s.generators.map((g) => ({
        id: g.id,
        ownerId: g.ownerId,
        x: g.x,
        y: g.y,
        mode: g.mode,
        timer: g.timer,
      })),
      vehicles: s.vehicles.map((v) => ({
        id: v.id,
        kind: v.kind,
        phase: v.phase,
        damage: v.damage,
        index: v.index,
      })),
      flames: s.flames.length,
      pickups: s.pickups.length,
      result: s.match.result,
    };
  });
}

/** Runs arbitrary code against the live GameState (test setup only). */
export async function mutate(page: Page, fn: string): Promise<void> {
  await page.evaluate((code) => {
    const w = (window as unknown as { __WAHALA__: { getState(): unknown } }).__WAHALA__;
    new Function('s', code)(w.getState());
  }, fn);
}

export async function holdKey(page: Page, key: string, ticks: number): Promise<void> {
  await page.keyboard.down(key);
  await stepTicks(page, ticks);
  await page.keyboard.up(key);
}

/**
 * Drives the floating thumbstick like a thumb: lands somewhere in the lower-left activation zone, slides
 * `dist` px towards `dir`, holds for `ticks` simulation ticks, lifts. `at` picks the landing point as a
 * fraction of the zone (the stick appears wherever the thumb lands).
 */
export async function thumb(
  page: Page,
  dir: 'up' | 'down' | 'left' | 'right',
  ticks: number,
  opts: { at?: [number, number]; dist?: number; settle?: number } = {},
): Promise<void> {
  const box = (await page.getByTestId('stick-zone').boundingBox())!;
  const [fx, fy] = opts.at ?? [0.4, 0.65];
  const x = box.x + box.width * fx;
  const y = box.y + box.height * fy;
  const d = opts.dist ?? 46;
  const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + v[0]! * d, y + v[1]! * d, { steps: 4 });
  await stepTicks(page, ticks);
  await page.mouse.up();
  if (opts.settle) await stepTicks(page, opts.settle);
}
