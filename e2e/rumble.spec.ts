import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { getState, mutate, open, startMatch, stepTicks } from './helpers';

type Debug = {
  __WAHALA__: {
    renderer(): { cameraMode(): string; debugCamera(): { arenaInView: boolean; distance: number } };
    controller(): { frozen: boolean; spectating: number | null };
  };
};

/** Chooses City Rumble with 32 competitors: through the menu when it offers the arena, else saved settings. */
async function chooseRumble(page: Page): Promise<void> {
  const card = page.getByTestId('arena-cityRumble');
  if ((await card.count()) > 0 && (await card.isVisible())) {
    await card.click();
    const count = page.getByTestId('rumble-32');
    if ((await count.count()) > 0) await count.click();
  }
  // the saved settings make sure of the count even if the menu has no selector for it
  await page.evaluate(() => {
    const key = 'wahala.settings.v1';
    const s = JSON.parse(localStorage.getItem(key) || '{}');
    localStorage.setItem(key, JSON.stringify({ ...s, arenaId: 'cityRumble', rumbleCompetitors: 32 }));
  });
}

test.describe('City Rumble: 32 competitors', () => {
  test('follow camera, minimap and roster; spectating a survivor, cycling, skipping to results', async ({
    page,
    isMobile,
  }, info) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await open(page);
    await chooseRumble(page);
    await page.reload();
    await expect(page.getByTestId('title-screen')).toBeVisible();
    await startMatch(page);

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

    // the bots play: they spread out and put generators down
    const before = st.players.map((p) => `${p.x},${p.y}`);
    await stepTicks(page, 480);
    st = await getState(page);
    const moved = st.players.filter((p, i) => `${p.x},${p.y}` !== before[i] || !p.alive).length;
    expect(moved).toBeGreaterThan(20);
    await page.evaluate(() => ((window as never as Debug).__WAHALA__.controller().frozen = false));
    await page.waitForTimeout(800);
    const camPose = await page.evaluate(() => (window as never as Debug).__WAHALA__.renderer().debugCamera());
    expect(camPose.arenaInView).toBe(false);
    await page.screenshot({ path: `e2e-shots/${info.project.name}-rumble-play.png` });

    // the local player is knocked out by the nearest bot: the camera rides with that bot
    await mutate(
      page,
      `const me = s.players[0];
       let best = null;
       for (const p of s.players) {
         if (!p.alive || p.id === 0) continue;
         const d = Math.abs(p.x - me.x) + Math.abs(p.y - me.y);
         if (!best || d < best.d) best = { id: p.id, d };
       }
       me.alive = false; me.eliminatedTick = s.tick;
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
    await page.screenshot({ path: `e2e-shots/${info.project.name}-rumble-spectate.png` });

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
    await expect(page.getByTestId('results')).toBeVisible({ timeout: 180_000 });
    await expect(page.getByTestId('rumble-results')).toBeVisible();
    await expect(page.getByTestId('placement')).toContainText('/32');
    expect((await getState(page)).phase).toBe('ended');
    await page.screenshot({ path: `e2e-shots/${info.project.name}-rumble-results.png` });
    expect(errors).toEqual([]);
  });
});
