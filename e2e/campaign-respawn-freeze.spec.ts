/**
 * HOTFIX regression, real browser (desktop and phone): the campaign "DOWN - Back in 1" freeze. A defeat dealt by an
 * ENEMY ATTACK (a thrown brick, resolved by the real tick) used to leave the human down with no respawn scheduled and no
 * life spent. The first hotfix's browser test only killed the human with a generator blast (a different code path), so
 * it passed while this kept happening. Here the real-time loop runs (no `stepTicks` shortcut for the respawn itself):
 * the countdown must run on the wall clock, the fighter must come back with full health and live controls, twice in a
 * row; a hidden tab pauses it (the established rule) and the resume completes it; the last life ends the mission.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { open } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const get = (page: Page, fn: string) =>
  page.evaluate(`(() => { const s = window.__WAHALA__.getState(); return (${fn})(s); })()`);

async function startField(page: Page): Promise<void> {
  await open(page, '&noattract');
  await page.evaluate(() => {
    const c = (window as any).__WAHALA__.campaign();
    c.load();
    c.startNew();
    c.storyDone();
  });
  expect(
    await page.evaluate(() => (window as any).__WAHALA__.campaign().startSectionMission('oshodi.approach')),
  ).toBe(true);
  await expect(page.getByTestId('hud')).toBeVisible();
  await page.evaluate(() => {
    const s = (window as any).__WAHALA__.getState();
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
  });
}

/**
 * Stages an enemy brick flying at the human (one segment left, no protection) and returns at once: the REAL loop then
 * resolves the flight, the hit and the defeat. The enemy and the others are parked so nothing else interferes.
 */
async function throwBrick(page: Page): Promise<void> {
  await page.evaluate(() => {
    const s = (window as any).__WAHALA__.getState();
    const w = s.width;
    for (const p of s.players) if (p.id > 1) p.alive = false;
    let at: any = null;
    for (let y = 1; y < s.height - 1 && !at; y++)
      for (let x = 1; x < s.width - 5 && !at; x++)
        if ([0, 1, 2, 3].every((k) => s.tiles[y * w + x + k] === 0)) at = { x, y };
    const put = (id: number, x: number, y: number) => {
      const p = s.players[id];
      p.x = p.stepFromX = x;
      p.y = p.stepFromY = y;
      p.stepRemaining = 0;
    };
    put(1, at.x, at.y);
    put(0, at.x + 3, at.y);
    s.players[1].enemyKind = 'lieutenant';
    const me = s.players[0];
    me.protectedUntil = 0;
    me.armour = 0;
    me.mounted = false;
    me.vitals.hp = 1;
    me.vitals.invulnUntil = 0;
    if (s.enemyFire) s.enemyFire.victimSafeUntil = {};
    (s.projectiles ??= []).push({
      id: s.nextId++,
      ownerId: 1,
      kind: 'brick',
      path: [1, 2, 3].map((k) => at.y * w + at.x + k),
      stepTicks: 12,
      launchTick: s.tick,
      index: 0,
      strong: false,
      warnTicks: 36,
      dir: 'right',
    });
  });
}

const alive = (page: Page) => get(page, `s => s.players[0].alive`) as Promise<boolean>;

test.describe('campaign respawn does not freeze', () => {
  test('two enemy-attack deaths in a row: each countdown runs in real time and the fighter really comes back', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await startField(page);

    for (const cycle of [1, 2]) {
      await throwBrick(page);
      // the real loop resolves the flight and the defeat
      await expect.poll(() => alive(page), { timeout: 90_000 }).toBe(false);
      const down = (await get(
        page,
        `s => ({ used: s.mission.livesUsed, at: s.players[0].respawnAt, tick: s.tick })`,
      )) as any;
      expect(down.used, `cycle ${cycle}: the death costs a life`).toBe(cycle);
      expect(down.at, `cycle ${cycle}: a respawn is scheduled (null = frozen "Back in 1")`).not.toBeNull();
      await expect(page.getByTestId('respawn-banner')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId('respawn-countdown')).toBeVisible();
      await expect(page.getByTestId('skip-results')).toHaveCount(0);
      await expect(page.getByTestId('spectate')).toHaveCount(0);
      // the wall-clock countdown ends in a real respawn (no stepTicks): the timing boundary 1 -> 0
      await expect.poll(() => alive(page), { timeout: 120_000 }).toBe(true);
      const back = (await get(
        page,
        `s => ({ hp: s.players[0].vitals.hp, max: s.players[0].vitals.maxHp, used: s.mission.livesUsed,
                 cp: s.mission.field.checkpoint, x: s.players[0].x, y: s.players[0].y, outcome: s.mission.outcome,
                 phase: s.match.phase })`,
      )) as any;
      expect(back.hp).toBe(back.max);
      expect(back.used).toBe(cycle);
      expect({ x: back.x, y: back.y }).toEqual(back.cp);
      expect(back.outcome).toBeNull();
      expect(back.phase).toBe('playing');
      await expect(page.getByTestId('respawn-banner')).toHaveCount(0, { timeout: 60_000 });
      // the controls answer: the fighter can place a generator
      await page.evaluate(() => {
        const s = (window as any).__WAHALA__.getState();
        s.players[0].protectedUntil = 0;
      });
      await page.keyboard.down('Space');
      await page.waitForTimeout(250);
      await page.keyboard.up('Space');
      await expect
        .poll(() => get(page, `s => s.generators.filter(g => g.ownerId === 0).length`), { timeout: 30_000 })
        .toBeGreaterThan(0);
    }
    expect(errors).toEqual([]);
  });

  test('a hidden tab pauses the countdown (the established rule) and the resume completes it', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await startField(page);
    await throwBrick(page);
    await expect.poll(() => alive(page), { timeout: 90_000 }).toBe(false);
    const left = (await get(page, `s => s.players[0].respawnAt - s.tick`)) as number;
    expect(left).toBeGreaterThan(0);
    // the tab goes to the background: the game pauses, so the timer must not run
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => page.evaluate(() => (window as any).__WAHALA__.controller().isPaused)).toBe(true);
    const t0 = (await get(page, `s => s.tick`)) as number;
    await page.waitForTimeout(3000);
    expect(await get(page, `s => s.tick`)).toBe(t0);
    expect(await alive(page)).toBe(false);
    // back in the foreground, resume: the countdown completes
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
      (window as any).__WAHALA__.controller().setPaused(false);
    });
    await expect.poll(() => alive(page), { timeout: 120_000 }).toBe(true);
    expect(await get(page, `s => s.mission.livesUsed`)).toBe(1);
  });

  test('the last life: the mission ends through the result flow, no respawn, no spectator UI', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await startField(page);
    await page.evaluate(() => {
      const s = (window as any).__WAHALA__.getState();
      s.mission.livesUsed = s.mission.livesMax - 1;
    });
    await throwBrick(page);
    await expect.poll(() => get(page, `s => s.match.phase`), { timeout: 120_000 }).toBe('ended');
    expect(await get(page, `s => s.mission.outcome && s.mission.outcome.result`)).toBe('lost');
    await expect(page.getByTestId('skip-results')).toHaveCount(0);
    await expect(page.getByTestId('spectate')).toHaveCount(0);
  });
});
