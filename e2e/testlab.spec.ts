/**
 * The founder Test Lab (docs/TEST_LAB.md, decisions TL1-TL7) on a landscape phone: `?testlab=1` opens it instead of the
 * main menu; every Full Playtest starts the real mode (arena, game kind, raid id); Restart and Return work behind a
 * confirmation; an isolated scenario starts prepared; nothing the game persists leaves the page (the real localStorage is
 * compared before and after, through the browser context); the feedback and its summary work; without the query Home is
 * unchanged. Each test starts its mode, verifies and leaves: no match is played out.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { inMatch } from './helpers';

const FEEDBACK_KEY = 'wahala.testlab.feedback.v1';
const LAB = './?debug&q=low&seed=7&noattract&testlab=1';

/** The real localStorage of the site (the page itself only sees the Test Lab's in-memory one). */
async function realStorage(context: BrowserContext): Promise<Record<string, string>> {
  const state = await context.storageState();
  const out: Record<string, string> = {};
  for (const o of state.origins) for (const item of o.localStorage) out[item.name] = item.value;
  return out;
}

async function openLab(page: Page, query = ''): Promise<void> {
  await page.goto(`${LAB}${query}`);
  await expect(page.getByTestId('testlab-home')).toBeVisible();
}

async function startEntry(page: Page, id: string, level?: 'easy' | 'normal' | 'hard'): Promise<void> {
  await page.getByTestId(`testlab-entry-${id}`).tap();
  await expect(page.getByTestId('testlab-entry')).toBeVisible();
  if (level) await page.getByTestId(`testlab-level-${level}`).tap();
  await page.getByTestId('testlab-start').tap();
  await inMatch(page);
}

const live = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__WAHALA__.getState();
    return {
      arena: s.arenaId as string,
      game: s.settings.game as string,
      raid: (s.raid?.raidId ?? null) as string | null,
      mission: (s.mission?.id ?? null) as string | null,
      boss: (s.mission ? s.mission.bossId : null) as number | null,
      players: s.players.length as number,
      tick: s.tick as number,
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

async function pause(page: Page): Promise<void> {
  await page.getByTestId('pause-button').tap();
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
}

/** Pause -> Return to Test Lab -> confirm. */
async function returnToLab(page: Page): Promise<void> {
  await pause(page);
  await page.getByTestId('testlab-return').tap();
  await expect(page.getByTestId('testlab-confirm')).toBeVisible();
  await page.getByTestId('testlab-confirm-leave').tap();
  await expect(page.getByTestId('testlab-home')).toBeVisible({ timeout: 60_000 });
}

test.describe('Test Lab', () => {
  test.beforeEach(async ({ browserName: _b }, info) => {
    void _b;
    test.skip(info.project.name !== 'mobile', 'the founder tests on a phone: one landscape run');
    test.setTimeout(420_000);
  });

  test('without ?testlab the main menu is the normal Home; with it the Test Lab replaces the menu', async ({
    page,
  }) => {
    await page.goto('./?debug&q=low&seed=7&noattract');
    await expect(page.getByTestId('menu-home')).toBeVisible();
    await expect(page.getByTestId('home-play')).toBeVisible();
    await expect(page.getByTestId('home-academy')).toBeVisible();
    await expect(page.getByTestId('testlab')).toHaveCount(0);
    await expect(page.getByTestId('home-qa-raid')).toHaveCount(0); // the old ?qaraid= button is gone
    await page.goto('./?debug&q=low&seed=7&noattract&qaraid=recordsVault');
    await expect(page.getByTestId('menu-home')).toBeVisible();
    await expect(page.getByTestId('home-qa-raid')).toHaveCount(0);

    await openLab(page);
    await expect(page.getByTestId('menu-home')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Full Playtests' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Isolated Scenarios' })).toBeVisible();
    await expect(page.locator('[data-testid^="testlab-entry-"]')).toHaveCount(14);
    await expect(page.getByTestId('testlab-list-playtest').locator('button')).toHaveCount(7);
    await expect(page.getByTestId('testlab-list-scenario').locator('button')).toHaveCount(7);
    await expect(page.getByTestId('testlab-isolation-warning')).toHaveCount(0);
  });

  test('phone fit: no page scroll, safe tap targets (44 px), every entry reachable', async ({ page }) => {
    await openLab(page);
    const fit = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="testlab"]') as HTMLElement;
      const small: string[] = [];
      for (const el of root.querySelectorAll<HTMLElement>('button, input')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.height < 43.5) small.push(`${el.dataset.testid ?? el.textContent}:${Math.round(r.height)}`);
      }
      return {
        scrollsX: document.documentElement.scrollWidth > window.innerWidth + 1,
        scrollsY: document.documentElement.scrollHeight > window.innerHeight + 1,
        small,
      };
    });
    expect(fit.scrollsX).toBe(false);
    expect(fit.scrollsY).toBe(false);
    expect(fit.small).toEqual([]);
    // an entry's card fits too, and Esc / Back return
    await page.getByTestId('testlab-entry-oneHit').tap();
    await expect(page.getByTestId('testlab-entry')).toBeVisible();
    const card = await page.evaluate(() => ({
      scrollsY: document.documentElement.scrollHeight > window.innerHeight + 1,
      small: [
        ...document.querySelectorAll<HTMLElement>(
          '[data-testid="testlab"] button, [data-testid="testlab"] input',
        ),
      ]
        .filter((el) => el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().height < 43.5)
        .map((el) => el.dataset.testid),
    }));
    expect(card.scrollsY).toBe(false);
    expect(card.small).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('testlab-home')).toBeVisible();
    await page.getByTestId('testlab-entry-oneHit').tap();
    await page.getByTestId('testlab-back').tap();
    await expect(page.getByTestId('testlab-home')).toBeVisible();
  });

  test('feedback: status and note are kept (own key only), never set for you; Copy summary pastes plain text', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openLab(page);
    await expect(page.getByTestId('testlab-status-classicRaid')).toHaveText('Not tested');
    await page.getByTestId('testlab-entry-classicRaid').tap();
    await page.getByTestId('testlab-level-hard').tap();
    await page.getByTestId('testlab-feedback-needsWork').tap();
    await page.getByTestId('testlab-note').fill('guard saw me too early');
    await page.getByTestId('testlab-back').tap();
    await expect(page.getByTestId('testlab-status-classicRaid')).toHaveText('Needs improvement');
    await expect(page.getByTestId('testlab-status-recordsVault')).toHaveText('Not tested');
    // the real storage holds the feedback key and nothing else
    const real = await realStorage(context);
    expect(Object.keys(real)).toEqual([FEEDBACK_KEY]);
    expect(JSON.parse(real[FEEDBACK_KEY]!)).toEqual({
      classicRaid: { status: 'needsWork', note: 'guard saw me too early', level: 'hard' },
    });
    await page.getByTestId('testlab-copy').tap();
    await expect(page.getByTestId('testlab-copy')).toHaveText('Copied');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain('WAHALA! TEST LAB');
    expect(text).toContain('- [NEEDS IMPROVEMENT] Classic Campaign Raid (Hard): guard saw me too early');
    expect(text).toContain('- [NOT TESTED] Records Vault, night raid');
    expect(text).toContain('Totals: 0 pass, 1 needs improvement, 0 failed, 13 not tested');
    // it comes back after a reload
    await page.reload();
    await expect(page.getByTestId('testlab-status-classicRaid')).toHaveText('Needs improvement');
  });

  test('Classic Campaign Raid: the real depot raid; Restart, Return (confirmed), nothing saved, Exit', async ({
    page,
    context,
  }) => {
    const errors = watchErrors(page);
    // a real player's saves, written by the normal game before the lab is opened
    await page.goto('./?debug&q=low&seed=7&noattract');
    await page.evaluate(() => {
      localStorage.setItem('wahala.campaign.v1', 'SENTINEL-CAMPAIGN');
      localStorage.setItem('wahala.settings.v1', JSON.stringify({ play: 'classic', muted: false }));
      localStorage.setItem('wahala.audio.v1', 'SENTINEL-AUDIO');
    });
    const before = await realStorage(context);
    expect(before['wahala.campaign.v1']).toBe('SENTINEL-CAMPAIGN');

    await openLab(page);
    await startEntry(page, 'classicRaid', 'easy');
    const s = await live(page);
    expect(s.arena).toBe('raidWarehouseDispatchDepot');
    expect(s.game).toBe('raid');
    expect(s.raid).toBe('warehouseDispatchDepot');

    // change a saved setting inside the match (mute from the HUD): it lands in memory, not in the real storage
    await page.getByRole('button', { name: 'Mute' }).tap();
    const inMemory = await page.evaluate(() => localStorage.getItem('wahala.settings.v1'));
    expect(inMemory).toContain('"muted":true');

    // Restart: a clean start of the same raid
    await page.evaluate(() => {
      const w = (window as any).__WAHALA__;
      w.controller().frozen = true;
      w.stepTicks(200);
    });
    const ticked = (await live(page)).tick;
    expect(ticked).toBeGreaterThan(150);
    await pause(page);
    await page.getByTestId('testlab-restart').tap();
    await inMatch(page);
    const again = await live(page);
    expect(again.raid).toBe('warehouseDispatchDepot');
    expect(again.tick).toBeLessThan(ticked);

    // Return needs a confirmation; Keep testing stays in the raid
    await pause(page);
    await page.getByTestId('testlab-return').tap();
    await expect(page.getByTestId('testlab-confirm')).toBeVisible();
    await page.getByTestId('testlab-confirm-stay').tap();
    await expect(page.getByTestId('testlab-confirm')).toHaveCount(0);
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    await page.getByTestId('testlab-return').tap();
    await page.getByTestId('testlab-confirm-leave').tap();
    await expect(page.getByTestId('testlab-home')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('hud')).toHaveCount(0);

    // after all that: the real storage is exactly as the player left it
    expect(await realStorage(context)).toEqual(before);

    // the Test Lab Exit is a full reload on the normal URL: the normal Home, the player's own saves intact
    await page.getByTestId('testlab-exit').tap();
    await expect(page.getByTestId('menu-home')).toBeVisible();
    expect(page.url()).not.toContain('testlab');
    expect(page.url()).toContain('debug');
    // the normal game may write its own keys when it boots; the player's saves are untouched
    const after = await realStorage(context);
    expect(after['wahala.campaign.v1']).toBe('SENTINEL-CAMPAIGN');
    expect(after['wahala.settings.v1']).toBe(before['wahala.settings.v1']);
    expect(after['wahala.audio.v1']).toBe('SENTINEL-AUDIO');
    expect(errors).toEqual([]);
  });

  test('Records Vault night raid starts the complete night raid', async ({ page }) => {
    await openLab(page);
    await startEntry(page, 'recordsVault', 'hard');
    const s = await live(page);
    expect(s.arena).toBe('raidRecordsVault');
    expect(s.raid).toBe('recordsVault');
    expect(s.game).toBe('raid');
    await returnToLab(page);
  });

  test('Classic Blast starts a real 4-player Classic match with competitive rules', async ({
    page,
    context,
  }) => {
    await openLab(page);
    const before = await realStorage(context);
    await startEntry(page, 'classicBlast');
    const s = await live(page);
    expect(s.game).toBe('classic');
    expect(s.arena).toBe('danfoBusPark');
    expect(s.players).toBe(4);
    expect(s.raid).toBeNull();
    await returnToLab(page);
    expect(await realStorage(context)).toEqual(before);
  });

  test('City Rumble starts a real City Rumble match', async ({ page }) => {
    await openLab(page);
    await startEntry(page, 'cityRumble');
    const s = await live(page);
    expect(s.game).toBe('deathmatch');
    expect(s.arena).toBe('rumbleOshodi');
    expect(s.players).toBe(16);
    await returnToLab(page);
  });

  test('Campaign field mission starts Terminal Approach through the campaign controller', async ({
    page,
    context,
  }) => {
    await openLab(page);
    const before = await realStorage(context);
    await startEntry(page, 'fieldMission', 'normal');
    const s = await live(page);
    expect(s.game).toBe('mission');
    expect(s.arena).toBe('campaignOshodiOrita');
    expect(s.mission).toBe('oshodi');
    expect(s.boss).toBe(-1); // a field mission has no boss: its enemies, doors and checkpoints
    const sectionMission = await page.evaluate(
      () => (window as any).__WAHALA__.campaign().ui.active?.sectionMissionId,
    );
    expect(sectionMission).toBe('oshodi.approach');
    await returnToLab(page);
    expect(await realStorage(context)).toEqual(before);
  });

  test('Boss encounter starts the Oshodi boss mission without unlocking anything', async ({
    page,
    context,
  }) => {
    await openLab(page);
    const before = await realStorage(context);
    await startEntry(page, 'boss', 'normal');
    const s = await live(page);
    expect(s.game).toBe('mission');
    expect(s.arena).toBe('rumbleOshodi');
    expect(s.mission).toBe('oshodi');
    expect(s.boss).toBeGreaterThan(0); // the district boss's seat
    const isBot = await page.evaluate(
      (id) => (window as any).__WAHALA__.getState().players[id!].isBot,
      s.boss,
    );
    expect(isBot).toBe(true);
    await returnToLab(page);
    expect(await realStorage(context)).toEqual(before);
  });

  test('Characters and performance: a 24-fighter Team Rumble with the fighter picked, fps line on', async ({
    page,
  }) => {
    await openLab(page);
    await page.getByTestId('testlab-entry-roster').tap();
    await page.getByTestId('testlab-fighter-lekkiBoy').tap();
    await page.getByTestId('testlab-start').tap();
    await inMatch(page);
    const s = await live(page);
    expect(s.game).toBe('team');
    expect(s.arena).toBe('rumbleLagosIsland');
    expect(s.players).toBe(24);
    const me = await page.evaluate(() => (window as any).__WAHALA__.getState().players[0].characterId);
    expect(me).toBe('lekkiBoy');
    await expect(page.locator('.fps')).toBeVisible();
    await returnToLab(page);
  });

  test('an isolated scenario starts prepared on the real raid, with restart and a stable setup', async ({
    page,
    context,
  }) => {
    await openLab(page);
    const before = await realStorage(context);
    await startEntry(page, 'punchDodge', 'hard');
    const a = await page.evaluate(() => {
      const st = (window as any).__WAHALA__.getState();
      return {
        arena: st.arenaId,
        raid: st.raid.raidId,
        me: [st.players[0].x, st.players[0].y],
        seats: st.raid.seats.map((s: any) => ({ id: s.playerId, out: s.active, spot: [s.spot.x, s.spot.y] })),
        limit: st.raid.timeLimitTicks,
      };
    });
    expect(a.arena).toBe('raidWarehouseDispatchDepot');
    expect(a.raid).toBe('warehouseDispatchDepot');
    expect(a.me).toEqual([9, 5]);
    expect(a.seats[0]).toEqual({ id: 1, out: false, spot: [8, 5] });
    expect(a.seats.slice(1).every((s: any) => s.out)).toBe(true);
    expect(a.limit).toBe(600 * 60);
    // the guard wakes beside the player under the real wave code
    await page.evaluate(() => {
      const w = (window as any).__WAHALA__;
      w.controller().frozen = true;
      w.stepTicks(200);
    });
    const guard = await page.evaluate(() => {
      const p = (window as any).__WAHALA__.getState().players[1];
      return { alive: p.alive, x: p.x, y: p.y };
    });
    expect(guard.alive).toBe(true);
    // Restart gives the same prepared board
    await pause(page);
    await page.getByTestId('testlab-restart').tap();
    await inMatch(page);
    const b = await page.evaluate(() => {
      const st = (window as any).__WAHALA__.getState();
      return { me: [st.players[0].x, st.players[0].y], tick: st.tick, g: st.players[1].alive };
    });
    expect(b.me).toEqual([9, 5]);
    expect(b.g).toBe(false); // not yet woken: a clean start
    await returnToLab(page);
    expect(await realStorage(context)).toEqual(before);
  });

  test('Who am I? scenario: the marker switch (Indicator by default) is in the entry, the pause menu and the HUD', async ({
    page,
  }) => {
    await openLab(page);
    await page.getByTestId('testlab-entry-identifyPlayer').tap();
    await expect(page.getByTestId('marker-indicator')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('marker-original').tap();
    await page.getByTestId('marker-indicator').tap(); // back to the default
    await page.getByTestId('testlab-start').tap();
    await inMatch(page);
    const mode = () => page.getByTestId('marker-hud-button').textContent();
    expect(await mode()).toBe('IND');
    await page.getByTestId('marker-hud-button').tap();
    expect(await mode()).toBe('IND+G');
    await pause(page);
    await expect(page.getByTestId('marker-switch')).toBeVisible();
    await expect(page.getByTestId('marker-indicatorGround')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('marker-original').tap();
    await expect(page.getByTestId('marker-original')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('testlab-return').tap();
    await page.getByTestId('testlab-confirm-leave').tap();
    await expect(page.getByTestId('testlab-home')).toBeVisible({ timeout: 60_000 });
  });
});
