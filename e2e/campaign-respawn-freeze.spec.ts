/**
 * HOTFIX regression, real browser (desktop and phone): the campaign "DOWN - Back in 1" freeze. A defeat dealt by an
 * ENEMY ATTACK (a thrown brick, resolved by the real tick) used to leave the human down with no respawn scheduled and no
 * life spent. The first hotfix's browser test only killed the human with a generator blast (a different code path), so
 * it passed while this kept happening. Here the real campaign controller, HUD and input run in the page; time is driven
 * with `stepTicks` (the controller's own step), NOT the wall clock: on a CI runner software WebGL renders a frame in
 * seconds and the loop clamps each frame to 100 ms, so a real-time 3 s respawn can take longer than any sane timeout
 * (the first version of this spec timed out there). The wall-clock behaviour is covered by the controller test with a
 * controlled clock. Twice in a row the fighter comes back with full health and live controls; a hidden tab pauses it
 * (the established rule) and the resume completes it; the last life ends the mission.
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
    // only `stepTicks` advances the sim from here (the page still renders and publishes the HUD every frame)
    (window as any).__WAHALA__.controller().frozen = true;
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
  test('two enemy-attack deaths in a row: each countdown completes and the fighter really comes back', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await startField(page);

    for (const cycle of [1, 2]) {
      await throwBrick(page);
      // the flight (36 ticks of cue + 3 tiles) and the hit resolve through the real controller step
      await page.evaluate(() => (window as any).__WAHALA__.stepTicks(100));
      expect(await alive(page), `cycle ${cycle}: the brick defeated the fighter`).toBe(false);
      const down = (await get(
        page,
        `s => ({ used: s.mission.livesUsed, at: s.players[0].respawnAt, tick: s.tick })`,
      )) as any;
      expect(down.used, `cycle ${cycle}: the death costs a life`).toBe(cycle);
      expect(down.at, `cycle ${cycle}: a respawn is scheduled (null = frozen "Back in 1")`).not.toBeNull();
      await expect(page.getByTestId('respawn-banner')).toBeVisible({ timeout: 90_000 });
      await expect(page.getByTestId('respawn-countdown')).toBeVisible();
      await expect(page.getByTestId('skip-results')).toHaveCount(0);
      await expect(page.getByTestId('spectate')).toHaveCount(0);
      // the timing boundary: one tick short the fighter is still down, on the tick that reaches `respawnAt` it is back
      const edge = (await page.evaluate(() => {
        const w = (window as any).__WAHALA__;
        const s = w.getState();
        const me = s.players[0];
        const left = me.respawnAt - s.tick;
        w.stepTicks(left - 1);
        const short = me.alive;
        w.stepTicks(1);
        return { left, short, back: me.alive, tick: s.tick, at: me.respawnAt };
      })) as any;
      expect(edge.left).toBeGreaterThan(1);
      expect(edge.short, `cycle ${cycle}: one tick short`).toBe(false);
      expect(edge.back, `cycle ${cycle}: the respawn is processed on the last tick`).toBe(true);
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
      await expect(page.getByTestId('respawn-banner')).toHaveCount(0, { timeout: 90_000 });
      // the controls answer: with A held through the real input path the fighter places a generator
      await page.evaluate(() => {
        const s = (window as any).__WAHALA__.getState();
        s.players[0].protectedUntil = 0;
      });
      await page.keyboard.down('Space');
      await page.evaluate(() => (window as any).__WAHALA__.stepTicks(6));
      await page.keyboard.up('Space');
      expect(await get(page, `s => s.generators.filter(g => g.ownerId === 0).length`)).toBeGreaterThan(0);
      // (and the second cycle starts from a clean field: no stray generator of ours kills the fighter)
      await page.evaluate(() => {
        const s = (window as any).__WAHALA__.getState();
        s.generators = s.generators.filter((g: any) => g.ownerId !== 0);
      });
    }
    expect(errors).toEqual([]);
  });

  test('a hidden tab pauses the countdown (the established rule) and the resume completes it', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await startField(page);
    await throwBrick(page);
    await page.evaluate(() => (window as any).__WAHALA__.stepTicks(100));
    expect(await alive(page)).toBe(false);
    // the real loop runs again for this one: the pause must be what stops the timer, not the staging freeze
    await page.evaluate(() => ((window as any).__WAHALA__.controller().frozen = false));
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
    await page.evaluate((n) => (window as any).__WAHALA__.stepTicks(n), left + 5);
    expect(await alive(page)).toBe(true);
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
    // the controller leaves the match when it ends (the result flow): keep a reference to read the final state
    const end = (await page.evaluate(() => {
      const w = (window as any).__WAHALA__;
      const s = w.getState();
      w.stepTicks(120);
      return {
        phase: s.match.phase,
        result: s.mission.outcome && s.mission.outcome.result,
        alive: s.players[0].alive,
      };
    })) as any;
    expect(end).toEqual({ phase: 'ended', result: 'lost', alive: false });
    await expect(page.getByTestId('skip-results')).toHaveCount(0);
    await expect(page.getByTestId('spectate')).toHaveCount(0);
  });
});
