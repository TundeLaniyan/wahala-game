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
import { inMatch, stepTicks } from './helpers';

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

/** The approved tests live in the collapsed "Completed Tests" list (decision TL7). */
const COMPLETED = new Set([
  'cityRumble',
  'occludedBuildings',
  'boss',
  'classicRearAmbush',
  'oneHit',
  'classicRaid',
  'recordsVault',
  'classicBlast',
  'fieldMission',
  'roster',
  'rearApproach',
  'patrolAmbush',
  'punchDodge',
  'pursuit',
  'flashlight',
]);

/** Taps an entry's row on Home, opening the Completed Tests list first when it sits there. */
async function openEntry(page: Page, id: string): Promise<void> {
  if (COMPLETED.has(id) && (await page.getByTestId(`testlab-entry-${id}`).count()) === 0)
    await page.getByTestId('testlab-completed-toggle').tap();
  await page.getByTestId(`testlab-entry-${id}`).tap();
  await expect(page.getByTestId('testlab-entry')).toBeVisible();
}

async function startEntry(page: Page, id: string, level?: 'easy' | 'normal' | 'hard'): Promise<void> {
  await openEntry(page, id);
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
    // decision TL7: "Tests Requiring Review" is the prominent list, in the founder's order; Completed Tests are folded away
    await expect(page.getByRole('heading', { name: /Tests Requiring Review/ })).toBeVisible();
    const review = page.getByTestId('testlab-list-review').locator('[data-testid^="testlab-entry-"]');
    await expect(review).toHaveCount(5);
    expect(await review.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))).toEqual([
      'testlab-entry-suddenDeath',
      'testlab-entry-identifyPlayer',
      'testlab-entry-teamBlastFfOff',
      'testlab-entry-teamBlastFfOn',
      'testlab-entry-teamBlastOverlap',
    ]);
    await expect(page.getByTestId('testlab-completed-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('testlab-list-completed')).toHaveCount(0);
    await page.getByTestId('testlab-completed-toggle').tap();
    await expect(page.getByTestId('testlab-list-completed').locator('button')).toHaveCount(15);
    await expect(page.locator('[data-testid^="testlab-entry-"]')).toHaveCount(20);
    await page.getByTestId('testlab-completed-toggle').tap();
    await expect(page.getByTestId('testlab-list-completed')).toHaveCount(0);
    await expect(page.getByTestId('testlab-isolation-warning')).toHaveCount(0);
  });

  test('phone fit: no page scroll, safe tap targets (44 px), every entry reachable', async ({ page }) => {
    await openLab(page);
    await page.getByTestId('testlab-completed-toggle').tap(); // the folded list fits too once open
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
    await page.getByTestId('testlab-completed-toggle').tap();
    await expect(page.getByTestId('testlab-status-classicRaid')).toHaveText('Not tested');
    await page.getByTestId('testlab-entry-classicRaid').tap();
    await page.getByTestId('testlab-level-hard').tap();
    await page.getByTestId('testlab-feedback-needsWork').tap();
    await page.getByTestId('testlab-note').fill('guard saw me too early');
    await page.getByTestId('testlab-back').tap();
    await expect(page.getByTestId('testlab-completed-toggle')).toHaveAttribute('aria-expanded', 'true'); // stays open
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
    expect(text.indexOf('TESTS REQUIRING REVIEW')).toBeLessThan(text.indexOf('COMPLETED TESTS'));
    expect(text).toContain('Totals: 0 pass, 1 needs improvement, 0 failed, 19 not tested');
    // it comes back after a reload
    await page.reload();
    await page.getByTestId('testlab-completed-toggle').tap();
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

  test('City Rumble parity: with nothing saved the lab shows the normal defaults (Rookie, 16, Free-for-All) and starts them', async ({
    page,
  }) => {
    await openLab(page);
    await openEntry(page, 'cityRumble');
    await expect(page.getByTestId('rumble-source')).toHaveAttribute('data-source', 'defaults');
    await expect(page.getByTestId('rumble-use-current')).toBeDisabled(); // nothing saved to copy
    // the exact configuration is shown before Start
    const lines = page.getByTestId('rumble-summary');
    await expect(lines).toContainText('Free-for-All');
    await expect(lines).toContainText('Oshodi Transport Metropolis');
    await expect(lines).toContainText('16 (you and 15 bots)');
    await expect(lines).toContainText('Rookie');
    await expect(page.getByTestId('rumble-level-rookie')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('testlab-level-easy')).toHaveCount(0); // no Easy / Normal / Hard here any more
    await page.getByTestId('testlab-start').tap();
    await inMatch(page);
    const s = await live(page);
    expect(s.game).toBe('deathmatch');
    expect(s.arena).toBe('rumbleOshodi');
    expect(s.players).toBe(16);
    expect(await page.evaluate(() => (window as any).__WAHALA__.store.getState().settings.difficulty)).toBe(
      'rookie',
    );
    await returnToLab(page);
  });

  test('City Rumble parity: Use Current Rumble Settings copies what the player really plays with, shows it, starts it, and writes nothing', async ({
    page,
    context,
  }) => {
    // the player's real saved settings, written by the normal game before the lab is opened
    await page.goto('./?debug&q=low&seed=7&noattract');
    await page.evaluate(() =>
      localStorage.setItem(
        'wahala.settings.v1',
        JSON.stringify({
          play: 'rumble',
          rumbleArenaId: 'rumbleLagosIsland',
          rumbleCompetitors: 24,
          rumbleMode: 'team',
          difficulty: 'casual',
          rumbleMixed: true,
          rumbleMinutes: 3,
          character: 'lekkiBoy',
        }),
      ),
    );
    const before = await realStorage(context);
    await openLab(page);
    await openEntry(page, 'cityRumble');
    // the lab opened on the player's own set-up, read from the real storage before isolation, and says so
    await expect(page.getByTestId('rumble-source')).toHaveAttribute('data-source', 'current');
    const summary = page.getByTestId('rumble-summary');
    await expect(summary).toContainText('Team Deathmatch');
    await expect(summary).toContainText('Lagos Island');
    await expect(summary).toContainText('24 (12 v 12, you and 23 bots)');
    await expect(summary).toContainText('mixed roster');
    await expect(summary).toContainText('3 min');
    await expect(summary).toContainText('Lekki Boy');
    // changing anything makes it Custom; the button brings the real settings back
    await page.getByTestId('rumble-level-expert').tap();
    await expect(page.getByTestId('rumble-source')).toHaveAttribute('data-source', 'custom');
    await expect(summary).toContainText('Expert');
    await page.getByTestId('rumble-use-current').tap();
    await expect(page.getByTestId('rumble-source')).toHaveAttribute('data-source', 'current');
    await expect(summary).not.toContainText('Expert');
    await page.getByTestId('testlab-start').tap();
    await inMatch(page);
    const s = await live(page);
    expect(s.game).toBe('team');
    expect(s.arena).toBe('rumbleLagosIsland');
    expect(s.players).toBe(24);
    const me = await page.evaluate(() => (window as any).__WAHALA__.getState().players[0].characterId);
    expect(me).toBe('lekkiBoy');
    await returnToLab(page);
    expect(await realStorage(context)).toEqual(before); // the real settings were only read
  });

  test('City Rumble parity: every size, level and mode is selectable on the card', async ({ page }) => {
    await openLab(page);
    await openEntry(page, 'cityRumble');
    for (const n of [8, 16, 24, 32]) {
      await page.getByTestId(`rumble-size-${n}`).tap();
      await expect(page.getByTestId('rumble-summary')).toContainText(`${n} (`);
    }
    for (const d of ['rookie', 'beginner', 'casual', 'standard', 'skilled', 'expert', 'nightmare'])
      await expect(page.getByTestId(`rumble-level-${d}`)).toBeVisible();
    await page.getByTestId('rumble-mode-survival').tap();
    await expect(page.getByTestId('rumble-minutes-3')).toHaveCount(0); // no clock in Last Player Standing
    await page.getByTestId('rumble-mode-team').tap();
    await expect(page.getByTestId('rumble-ff-on')).toBeVisible();
  });

  test('Occluded building visibility: a real City Rumble on the Lekki stage (the fading buildings)', async ({
    page,
  }) => {
    await openLab(page);
    await startEntry(page, 'occludedBuildings');
    const s = await live(page);
    expect(s.arena).toBe('rumbleLekki');
    expect(s.game).toBe('deathmatch');
    expect(s.players).toBe(8);
    const vc = await page.evaluate(() => (window as any).__WAHALA__.viewClear());
    expect(vc.groups).toBeGreaterThan(0); // the buildings that can fade are there
    await returnToLab(page);
  });

  test('Sudden Death banner and victory: a real City Rumble that starts in the sudden-death round', async ({
    page,
  }) => {
    await openLab(page);
    await startEntry(page, 'suddenDeath');
    await stepTicks(page, 400); // the pre-match countdown and the title card (as e2e/sudden-death-test.spec.ts)
    const s = await page.evaluate(() => {
      const w = (window as any).__WAHALA__;
      const st = w.getState();
      return {
        arena: st.arenaId as string,
        players: st.players.length as number,
        bots: st.players.filter((p: any) => p.isBot).length as number,
        stage: st.match.suddenDeath?.stage ?? null,
        camera: w.store.getState().settings.cameraView as string,
      };
    });
    expect(s.arena).toBe('rumbleOjuelegba');
    expect(s.players).toBe(3);
    expect(s.bots).toBe(2);
    expect(s.stage).toBe('countdown'); // straight into the sudden-death round
    expect(s.camera).toBe('overview'); // the whole stage in frame, set in memory only
    await returnToLab(page);
  });

  test('Classic rear ambush: the real first raid, nothing prepared; One-hit lethality: a chosen enemy at its post', async ({
    page,
  }) => {
    await openLab(page);
    await startEntry(page, 'classicRearAmbush', 'easy');
    const raid = await live(page);
    expect(raid.raid).toBe('warehouseDispatchDepot');
    expect(raid.game).toBe('raid');
    await returnToLab(page);

    await openEntry(page, 'oneHit');
    await expect(page.getByTestId('testlab-variant-agbero')).toHaveAttribute('aria-pressed', 'true'); // the first is the default
    await page.getByTestId('testlab-variant-thrower').tap();
    await page.getByTestId('testlab-level-easy').tap();
    await page.getByTestId('testlab-start').tap();
    await inMatch(page);
    const one = await page.evaluate(() => {
      const st = (window as any).__WAHALA__.getState();
      const open = st.raid.seats.filter((x: any) => !x.active);
      return {
        raid: st.raid.raidId as string,
        enemies: open.map((x: any) => [x.kind, x.spot.x, x.spot.y]),
        me: [st.players[0].x, st.players[0].y],
      };
    });
    expect(one.raid).toBe('warehouseDispatchDepot');
    expect(one.enemies).toEqual([['thrower', 2, 11]]);
    expect(one.me).toEqual([1, 9]);
    // Restart keeps the chosen enemy
    await pause(page);
    await page.getByTestId('testlab-restart').tap();
    await inMatch(page);
    const again = await page.evaluate(() =>
      (window as any).__WAHALA__
        .getState()
        .raid.seats.filter((x: any) => !x.active)
        .map((x: any) => x.kind),
    );
    expect(again).toEqual(['thrower']);
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
    await openEntry(page, 'roster');
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

  test('Who am I? scenario: the combined Indicator + Ground marker is drawn in the real renderer and there is no switch (decision PM1)', async ({
    page,
  }) => {
    await openLab(page);
    await page.getByTestId('testlab-entry-identifyPlayer').tap();
    await expect(page.getByTestId('marker-switch')).toHaveCount(0);
    await page.getByTestId('testlab-start').tap();
    await inMatch(page);
    await expect(page.getByTestId('marker-hud-button')).toHaveCount(0);
    await page.evaluate(() => {
      const w = (window as any).__WAHALA__;
      w.controller().frozen = true;
      w.stepTicks(300);
      w.advance(30);
    });
    /** What the real three.js scene draws for the local fighter's marker right now (pixels of an animated scene are noisy). */
    const drawn = () =>
      page.evaluate(() => {
        const scene = (window as any).__WAHALA__.renderer().scene;
        const out = { tag: 0, chevron: 0, ground: 0, groundOpacity: 0, groundScale: 0 };
        scene.traverse((o: any) => {
          if (!o.visible) return;
          if (o.isSprite && o.renderOrder === 40) out.tag++;
          if (o.isSprite && o.renderOrder === 32) out.chevron++;
          if (o.isMesh && o.position.y === 0.025 && o.scale.x >= 1.5) {
            out.ground++;
            out.groundOpacity = o.material.opacity;
            out.groundScale = o.scale.x;
          }
        });
        return out;
      });
    expect(await page.evaluate(() => (window as any).__WAHALA__.playerMarker())).toBe('indicatorGround');
    // the YOU plate over the head AND the floor ring under the fighter; no old chevron; exactly one of each (no duplicates)
    await expect.poll(drawn, { timeout: 60_000 }).toMatchObject({ tag: 1, chevron: 0, ground: 1 });
    const ground = await drawn();
    // the floor mark is big and strong enough to see at the fixed camera, still a decal
    expect(ground.groundScale).toBeGreaterThanOrEqual(1.5);
    expect(ground.groundOpacity).toBeGreaterThanOrEqual(0.5);
    expect(ground.groundOpacity).toBeLessThan(0.95);
  });
});
