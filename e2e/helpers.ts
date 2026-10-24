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

export async function startMatch(
  page: Page,
  opts: { bots?: boolean; competitors?: 2 | 3 | 4; character?: string; waitPlaying?: boolean } = {},
): Promise<void> {
  if (opts.competitors) await page.getByTestId(`players-${opts.competitors}`).click();
  if (opts.character) await page.getByTestId(`char-${opts.character}`).click();
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  if (opts.waitPlaying !== false) await stepTicks(page, 160);
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
