/**
 * On-demand 3D models (src/render/assets/modelNeeds.ts, docs/MOBILE_PERFORMANCE.md "On-demand models"):
 *  - the menu fetches only the hero cast, never an arena's models;
 *  - Home, Choose How to Play, Settings and the Academy fetch nothing; the arena / fighter screens WARM the files of the ONE
 *    selected arena at low priority (no decoding), follow the choice and stop when the player leaves (decision FU2-7);
 *    Save-Data, Data Saver On and `?noprefetch` switch that off;
 *  - the Ready screen prefetches the chosen arena's models (and only that arena's);
 *  - a started match has every model its renderer asked for (the recorder's `missed` list is empty) for Classic and
 *    City Rumble, with fewer models than the fully preloaded build and the same static scene (`?preloadall` is the
 *    reference: the old boot that loaded everything);
 *  - the old boot is still there behind `?preloadall`.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chooseArena, chooseStage, inMatch, launch, open, toRumbleSetup } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const W = (page: Page) => ({
  loaded: (): Promise<string[]> => page.evaluate(() => (window as any).__WAHALA__.assets().loaded),
  access: (): Promise<{ touched: string[]; missed: string[] }> =>
    page.evaluate(() => (window as any).__WAHALA__.assetAccess()),
  scene: (): Promise<{ geometries: number; textures: number }> =>
    page.evaluate(() => {
      const s = (window as any).__WAHALA__.stats();
      return { geometries: s.geometries, textures: s.textures };
    }),
});
const HEROES = ['char_areaBoss', 'char_campusQueen', 'char_lekkiBoy', 'char_streetBaller'];
const glbRequests = (page: Page): string[] => {
  const urls: string[] = [];
  page.on('request', (r) => {
    const m = /\/assets\/([A-Za-z0-9_]+?)-[A-Za-z0-9_-]{8}\.glb$/.exec(new URL(r.url()).pathname);
    if (m) urls.push(m[1]!);
  });
  return urls;
};

test.describe('on-demand models', () => {
  test('the menu loads only the hero cast', async ({ page }) => {
    const requested = glbRequests(page);
    await open(page, '&noattract');
    await expect.poll(async () => (await W(page).loaded()).length).toBeGreaterThanOrEqual(HEROES.length);
    await page.waitForTimeout(1500);
    expect((await W(page).loaded()).sort()).toEqual(HEROES);
    expect([...new Set(requested)].sort()).toEqual(HEROES);
  });

  test('the Ready screen prefetches the chosen arena and a Classic match then has everything it asked for', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const requested = glbRequests(page);
    await open(page, '&noattract');
    await page.evaluate(() => (window as any).__WAHALA__.assetRecorder(true));
    // browsing arenas decodes nothing (the early warm-up only fills the browser cache, decision FU2-7)
    await chooseArena(page, 'surulerePowerYard');
    await chooseArena(page, 'balogunMarket');
    await page.waitForTimeout(800);
    expect((await W(page).loaded()).sort()).toEqual(HEROES);
    // Continue to Fighter, then Ready: the chosen arena's models start downloading before Start is pressed
    await page.getByTestId('menu-continue').click();
    await page.getByTestId('menu-continue').click();
    await expect(page.getByTestId('menu-ready')).toBeVisible();
    await expect.poll(() => new Set(requested).has('env_building_a'), { timeout: 60_000 }).toBe(true);
    await launch(page);
    await inMatch(page);
    await page.waitForTimeout(3000);
    const { missed } = await W(page).access();
    expect(missed).toEqual([]);
    const loaded = await W(page).loaded();
    expect(loaded.length).toBeGreaterThan(HEROES.length);
    // not the whole library: nothing only another arena uses (the roster's on-demand characters stay unloaded)
    expect(loaded.some((id) => id.startsWith('char_') && !HEROES.includes(id))).toBe(false);
    expect(loaded.length).toBeLessThan(51);
  });

  test('the arena screens warm only the selected arena, follow the choice, stop when the player leaves, and Home / Play fetch nothing', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const requested = glbRequests(page);
    const warming = () => page.evaluate(() => (window as any).__WAHALA__.warming() as string | null);
    await open(page, '&noattract');
    await page.getByTestId('home-play').click();
    await page.waitForTimeout(1200);
    expect(await warming()).toBeNull();
    expect([...new Set(requested)].sort()).toEqual(HEROES); // Home and Choose How to Play: only the hero cast
    // Classic setup: the saved arena is the one warmed, then the one the player picks
    await page.getByTestId('home-classic').click();
    await expect.poll(warming).not.toBeNull();
    await chooseArena(page, 'balogunMarket');
    await expect.poll(warming).toBe('balogunMarket');
    await expect.poll(() => new Set(requested).has('env_building_a'), { timeout: 60_000 }).toBe(true);
    expect((await W(page).loaded()).sort()).toEqual(HEROES); // fetched into the cache, never decoded
    // changing the arena replaces the warm-up
    await chooseArena(page, 'surulerePowerYard');
    await expect.poll(warming).toBe('surulerePowerYard');
    // leaving the flow stops it
    await page.getByTestId('menu-back').click();
    await expect(page.getByTestId('menu-play')).toBeVisible();
    await expect.poll(warming).toBeNull();
  });

  for (const [name, query, init] of [
    ['?noprefetch', '&noprefetch', ''],
    [
      "the browser's own Save-Data",
      '',
      "Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true })",
    ],
    [
      'Data Saver set to On',
      '',
      "localStorage.setItem('wahala.settings.v1', JSON.stringify({ dataSaver: 'on' }))",
    ],
  ] as const)
    test(`no arena is warmed ahead of Start with ${name}`, async ({ page }) => {
      const requested = glbRequests(page);
      if (init) await page.addInitScript(init);
      await open(page, `&noattract${query}`);
      await page.getByTestId('home-play').click();
      await page.getByTestId('home-classic').click();
      await chooseArena(page, 'balogunMarket');
      await page.waitForTimeout(2500);
      expect(await page.evaluate(() => (window as any).__WAHALA__.warming())).toBeNull();
      expect([...new Set(requested)].sort()).toEqual(HEROES);
    });

  test('City Rumble stage: nothing missing, and the same static scene as the fully preloaded build', async ({
    page,
    browser,
  }) => {
    test.setTimeout(480_000);
    const stage = 'rumbleMushin';
    async function run(p: Page, query: string) {
      await open(p, `&noattract${query}`);
      await p.evaluate(() => (window as any).__WAHALA__.assetRecorder(true));
      await toRumbleSetup(p, 'survival');
      await chooseStage(p, stage);
      await launch(p);
      await inMatch(p);
      await p.waitForTimeout(3000);
      return { access: await W(p).access(), scene: await W(p).scene(), loaded: await W(p).loaded() };
    }
    const lazy = await run(page, '');
    expect(lazy.access.missed).toEqual([]);
    // the first match must stop drawing before the second starts: two live software-rendered matches at once starve each
    // other (on a CI runner the second never finishes building its arena)
    await page.goto('about:blank');
    const ctx2 = await browser.newContext(test.info().project.use as never);
    const eager = await run(await ctx2.newPage(), '&preloadall');
    await ctx2.close();
    expect(lazy.scene).toEqual(eager.scene);
    expect(lazy.loaded.length).toBeLessThan(eager.loaded.length);
  });

  test('?preloadall restores the old boot (every eager model before the menu)', async ({ page }) => {
    await open(page, '&noattract&preloadall');
    await expect.poll(async () => (await W(page).loaded()).length, { timeout: 120_000 }).toBeGreaterThan(40);
  });
});
