import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { getState, mutate, open, startMatch, stepTicks } from './helpers';

type Debug = {
  __WAHALA__: {
    renderer(): { cameraMode(): string; debugCamera(): { arenaInView: boolean; distance: number } };
    controller(): { frozen: boolean; spectating: number | null };
    getState(): {
      settings: { game: string; friendlyFire: boolean };
      players: { team: number; alive: boolean; protectedUntil: number }[];
      config: { match: { durationTicks: number } };
      match: { playTicks: number; phase: string; result: unknown };
      tick: number;
    };
  };
};

const shot = (page: Page, project: string, name: string) =>
  page.screenshot({ path: `e2e-shots/${project}-${name}.png` });

/** Chooses City Rumble from the main menu: mode and competitor count. */
async function chooseRumble(page: Page, mode: 'survival' | 'deathmatch' | 'team', count: 8 | 16 | 24 | 32) {
  await page.getByTestId('play-rumble').click();
  await page.getByTestId(`mode-${mode}`).click();
  await page.getByTestId(`rumble-${count}`).click();
}

const settingsOf = (page: Page) =>
  page.evaluate(() => {
    const s = (window as never as Debug).__WAHALA__.getState();
    return {
      game: s.settings.game,
      ff: s.settings.friendlyFire,
      teams: s.players.map((p) => p.team),
      duration: s.config.match.durationTicks,
    };
  });

test.describe('main menu', () => {
  test('City Rumble is the main entry; Team Rumble from a phone; Classic Battle still one tap away', async ({
    page,
  }, info) => {
    test.setTimeout(600_000); // software WebGL on a busy shared machine
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 640, height: 360 });
    await open(page);

    // City Rumble is selected by default and Play is on screen without scrolling
    await expect(page.getByTestId('play-rumble')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('mode-survival')).toBeVisible();
    const play = (await page.getByTestId('start-button').boundingBox())!;
    expect(play.y + play.height).toBeLessThanOrEqual(360);
    expect(play.x + play.width).toBeLessThanOrEqual(640);
    // the 3D cast preloads first (the button reads "Loading…" until then; slow on software WebGL)
    await expect(page.getByTestId('start-button')).toContainText('Rumble', { timeout: 120_000 });
    await shot(page, info.project.name, 'menu-phone-rumble');

    // Team Rumble: 4 v 4, 5 minutes, friendly fire on; the length / friendly fire rows follow the mode
    await page.getByTestId('mode-survival').click();
    await expect(page.getByTestId('minutes-5')).toHaveCount(0);
    await expect(page.getByTestId('ff-on')).toHaveCount(0);
    await chooseRumble(page, 'team', 8);
    await expect(page.getByTestId('rumble-8')).toContainText('4 v 4');
    await page.getByTestId('minutes-5').click();
    await page.getByTestId('ff-on').click();
    await expect(page.getByTestId('setup-summary')).toContainText(
      'Team Rumble · 4 v 4 · 5 min · friendly fire',
    );
    await page.getByTestId('mode-team').scrollIntoViewIfNeeded();
    await shot(page, info.project.name, 'menu-phone-team');

    await startMatch(page, { game: 'rumble' });
    let s = await settingsOf(page);
    expect(s.game).toBe('team');
    expect(s.ff).toBe(true);
    expect(s.duration).toBe(300 * 60);
    expect(s.teams.filter((t) => t === 0)).toHaveLength(4);
    expect(s.teams.filter((t) => t === 1)).toHaveLength(4);
    expect(s.teams[0]).toBe(0);
    await expect(page.getByTestId('team-scores')).toBeVisible();
    await expect(page.getByTestId('ff-on')).toBeVisible();
    await expect(page.getByTestId('ring-status')).toHaveCount(0);
    await page.evaluate(() => ((window as never as Debug).__WAHALA__.controller().frozen = false));
    await page.waitForTimeout(600);
    await shot(page, info.project.name, 'team-rumble-phone');

    // back to the menu: Classic Battle keeps the quick four-player game with no Rumble rules
    await page.getByTestId('pause-button').click();
    await page.getByTestId('quit').click();
    await expect(page.getByTestId('title-screen')).toBeVisible();
    await page.getByTestId('play-classic').click();
    await expect(page.getByTestId('players-4')).toBeVisible();
    await expect(page.getByTestId('arena-danfoBusPark')).toBeVisible();
    await expect(page.getByTestId('mode-team')).toHaveCount(0);
    await shot(page, info.project.name, 'menu-phone-classic');
    await startMatch(page, { competitors: 4 });
    s = await settingsOf(page);
    expect(s.game).toBe('classic');
    expect(s.ff).toBe(false);
    expect(s.teams.every((t) => t === -1)).toBe(true);
    await expect(page.getByTestId('portrait-3')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('City Rumble: Deathmatch respawns', () => {
  test('down means back soon: countdown, no skip, spawn protection, K/D/A results', async ({
    page,
  }, info) => {
    test.setTimeout(600_000); // software WebGL on a busy shared machine
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page);
    await chooseRumble(page, 'deathmatch', 8);
    await page.getByTestId('minutes-10').click();
    await startMatch(page, { game: 'rumble' });
    expect((await settingsOf(page)).duration).toBe(600 * 60);
    await expect(page.getByTestId('dm-rank')).toBeVisible();

    // the local player is knocked out by player 3
    await mutate(
      page,
      `const me = s.players[0];
       me.alive = false; me.eliminatedTick = s.tick; me.eliminatedBy = 3; me.stats.deaths++;
       s.players[3].stats.kills++; s.players[3].stats.lastKillTick = s.tick;
       me.elimination = { kind: 'flame', ownerId: 3, eventId: 0 };
       me.respawnAt = s.tick + s.config.respawn.delayTicks;`,
    );
    await stepTicks(page, 2);
    await expect(page.getByTestId('respawn-banner')).toBeVisible();
    await expect(page.getByTestId('respawn-countdown')).toContainText('Back in');
    await expect(page.getByTestId('skip-results')).toHaveCount(0);
    await shot(page, info.project.name, 'deathmatch-down');

    await stepTicks(page, 240);
    const st = await getState(page);
    expect(st.players[0]!.alive).toBe(true);
    await expect(page.getByTestId('respawn-banner')).toHaveCount(0);
    await expect(page.getByTestId('spawn-protected')).toBeVisible();
    await shot(page, info.project.name, 'deathmatch-respawned');

    // the clock decides: jump to the last second and read the ranking
    await mutate(page, `s.match.playTicks = s.config.match.durationTicks - 2;`);
    await stepTicks(page, 4);
    await expect(page.getByTestId('results')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('rumble-results')).toHaveAttribute('data-mode', 'deathmatch');
    await expect(page.getByTestId('ranking')).toBeVisible();
    await expect(page.getByTestId('my-deaths')).toHaveText('1');
    await shot(page, info.project.name, 'deathmatch-results');
    expect(errors).toEqual([]);
  });
});

test.describe('City Rumble: 32 competitors (Survival)', () => {
  test('follow camera, minimap and roster; spectating a survivor, cycling, skipping to results', async ({
    page,
    isMobile,
  }, info) => {
    // 32 rigged characters on software WebGL: GitHub's two-vCPU runners need far longer than the container
    test.setTimeout(900_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await open(page);
    await chooseRumble(page, 'survival', 32);
    await startMatch(page, { game: 'rumble' });

    // the big city uses the follow camera, never the whole-arena frame
    const cam = await page.evaluate(() => (window as never as Debug).__WAHALA__.renderer().cameraMode());
    expect(cam).toBe('stadium');
    let st = await getState(page);
    expect(st.players).toHaveLength(32);
    await expect(page.getByTestId('minimap')).toBeVisible();
    await expect(page.getByTestId('rumble-hud')).toBeVisible();
    await expect(page.getByTestId('alive-count')).toContainText('/32');
    await expect(page.getByTestId('ring-status')).toBeVisible();
    await expect(page.locator('.portrait')).toHaveCount(0); // no 32 portraits on screen

    // the bots play: they spread out and put generators down (the idle human is kept safe meanwhile, so
    // the knock-out below is the one that counts)
    await mutate(page, `s.players[0].protectedUntil = 1e9;`);
    const before = st.players.map((p) => `${p.x},${p.y}`);
    await stepTicks(page, 480);
    st = await getState(page);
    const moved = st.players.filter((p, i) => `${p.x},${p.y}` !== before[i] || !p.alive).length;
    expect(moved).toBeGreaterThan(20);
    await page.evaluate(() => ((window as never as Debug).__WAHALA__.controller().frozen = false));
    await page.waitForTimeout(800);
    const camPose = await page.evaluate(() => (window as never as Debug).__WAHALA__.renderer().debugCamera());
    expect(camPose.arenaInView).toBe(false);
    await shot(page, info.project.name, 'rumble-play');
    // stop real-time play so the chosen killer cannot fall before the spectator camera picks it
    await page.evaluate(() => ((window as never as Debug).__WAHALA__.controller().frozen = true));

    // the local player is knocked out by the nearest bot: the camera rides with that bot
    await mutate(
      page,
      `const me = s.players[0];
       me.protectedUntil = 0;
       let best = null;
       for (const p of s.players) {
         if (!p.alive || p.id === 0) continue;
         const d = Math.abs(p.x - me.x) + Math.abs(p.y - me.y);
         if (!best || d < best.d) best = { id: p.id, d };
       }
       me.alive = false; me.eliminatedTick = s.tick; me.eliminatedBy = best.id;
       s.players[best.id].stats.kills++;
       me.elimination = { kind: 'flame', ownerId: best.id, eventId: 0 };
       window.__killer = best.id;`,
    );
    const killer = await page.evaluate(() => (window as never as { __killer: number }).__killer);
    const target = page.getByTestId('spectate-target');
    await expect(target).toBeVisible();
    await expect(target).toHaveAttribute('data-id', String(killer));
    expect(await page.evaluate(() => (window as never as Debug).__WAHALA__.controller().spectating)).toBe(
      killer,
    );
    await expect(page.getByTestId('kill-feed')).toContainText('YOU');
    await shot(page, info.project.name, 'rumble-spectate');

    // cycle to another survivor (key on desktop, button on the phone)
    if (isMobile) await page.getByTestId('spectate-next').click();
    else await page.keyboard.press('ArrowRight');
    await expect(target).not.toHaveAttribute('data-id', String(killer));
    const watched = Number(await target.getAttribute('data-id'));
    expect((await getState(page)).players[watched]!.alive).toBe(true);
    await page.getByTestId('spectate-prev').click();
    await expect(target).toHaveAttribute('data-id', /\d+/);

    // skip: the rest of the match fast-forwards (the page stays responsive), then the results
    await page.getByTestId('skip-results').click();
    await expect(page.getByTestId('results')).toBeVisible({ timeout: process.env.CI ? 600_000 : 180_000 });
    await expect(page.getByTestId('rumble-results')).toBeVisible();
    await expect(page.getByTestId('placement')).toContainText('/32');
    expect((await getState(page)).phase).toBe('ended');
    await shot(page, info.project.name, 'rumble-results');
    expect(errors).toEqual([]);
  });
});
