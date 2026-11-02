/**
 * Kill-streak rewards in a real browser (decision SK4): QUICK HANDS, VEHICLE GENERATOR and GLOBAL KNOCKDOWN as the
 * player sees them - the rail cards (name, icon, seconds, charges), the action buttons' real names, the notices,
 * the carrier / release / knockdown visuals - by day and by night, on the desktop and on a phone. The rewards are
 * handed over through the debug handle (the simulation rules are covered by the unit tests); everything after
 * that is the real game loop, the real HUD and the real renderer.
 */
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { mutate, open, startMatch, stepTicks } from './helpers';

const advance = (page: Page, n: number) =>
  page.evaluate(
    (count) => (window as never as { __WAHALA__: { advance(n: number): void } }).__WAHALA__.advance(count),
    n,
  );

/**
 * The HUD is published from a rendered frame at most every ~100 ms of real time (or when an event happens):
 * wait a moment, then advance one tick, so the HUD shows the state a `mutate` just wrote.
 */
async function publish(page: Page): Promise<void> {
  await page.waitForTimeout(160);
  await advance(page, 1);
}

/** Publishes the HUD again and again (software WebGL can be slow) until `what` is visible, or is gone (`visible: false`). */
async function show(page: Page, what: Locator, visible = true): Promise<void> {
  await expect(async () => {
    await publish(page);
    if (visible) await expect(what).toBeVisible({ timeout: 800 });
    else await expect(what).toHaveCount(0, { timeout: 800 });
  }).toPass({ timeout: 60_000 });
}

/** Puts the three rivals on open floor 2-5 tiles from the local player, so a follow camera sees them all. */
const GATHER = `
  const me = s.players[0];
  const free = (x, y) => x >= 0 && y >= 0 && x < s.width && y < s.height && s.tiles[y * s.width + x] === 0 &&
    !s.generators.some((g) => g.x === x && g.y === y);
  const cand = [];
  for (let r = 2; r <= 6; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (Math.abs(dx) + Math.abs(dy) === r && free(me.x + dx, me.y + dy)) cand.push([me.x + dx, me.y + dy]);
  let k = 0;
  for (const p of s.players.slice(1, 4)) {
    const c = cand[(k++ * 5) % Math.max(1, cand.length)];
    if (c) { p.x = p.stepFromX = c[0]; p.y = p.stepFromY = c[1]; p.stepRemaining = 0; p.protectedUntil = 0; p.armour = 0; }
  }
`;

const GRANT_QUICK_HANDS = `
  const me = s.players[0];
  const r = me.streakRewards;
  r.quickHandsStart = s.tick; r.quickHandsUntil = s.tick + 18 * 60; r.quickHandsExtra = 5; r.earned = [3];
  me.capacity += 5; me.stats.streak = 3; me.stats.kills = 3;
`;

async function enter(page: Page, night: boolean): Promise<void> {
  await open(page, `&nobots${night ? '&tod=night' : ''}`);
  await startMatch(page, { game: 'rumble' });
  await advance(page, 1);
}

/** Does any pair of the listed elements overlap? (Rail cards must never cover the timer, portraits or controls.) */
async function overlaps(page: Page, a: string, others: string[]): Promise<string[]> {
  return page.evaluate(
    ([sel, list]) => {
      const rects = (q: string) => [...document.querySelectorAll(q)].map((e) => e.getBoundingClientRect());
      const hits: string[] = [];
      for (const r of rects(sel!)) {
        for (const o of list as string[]) {
          for (const q of rects(o)) {
            if (q.width === 0 || q.height === 0) continue;
            if (r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top) hits.push(o);
          }
        }
      }
      return hits;
    },
    [a, others] as const,
  );
}

const anyDown = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as never as { __WAHALA__: { getState(): { tick: number; players: { knockedUntil: number }[] } } }
    ).__WAHALA__.getState();
    return s.players.some((p) => p.knockedUntil > s.tick);
  });

const shot = (page: Page, project: string, name: string) =>
  page.screenshot({ path: `e2e-shots/${project}-${name}.png` });

for (const night of [false, true]) {
  const tod = night ? 'night' : 'day';

  test.describe(`kill-streak rewards (${tod})`, () => {
    test.setTimeout(600_000); // software WebGL on a Rumble city is slow

    test('the rail cards and the action buttons say what you hold, with real names', async ({
      page,
      isMobile,
    }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await enter(page, night);
      await mutate(page, GRANT_QUICK_HANDS + `s.players[0].streakRewards.vehicleGenerator = 'taxi';`);
      await publish(page);

      const hands = page.getByTestId('streak-quick-hands');
      await show(page, hands);
      await expect(hands).toContainText('QUICK HANDS');
      await expect(hands).toContainText(/\d+s/);
      await expect(page.getByTestId('streak-charges')).toContainText(/\d+\/\d+ generators/);
      await expect(hands.locator('svg.streak-icon')).toHaveCount(1);
      const vg = page.getByTestId('streak-vehicle-generator');
      await show(page, vg);
      await expect(vg).toHaveAttribute('data-vehicle', 'taxi');
      await expect(vg).toContainText('YELLOW CAB');

      // never over the timer, the portraits, the inventory row or the action buttons
      const hits = await overlaps(page, '[data-testid="streak-status"]', [
        '.timer',
        '.portrait',
        '.round-btn',
        '[data-testid="inventory"]',
        '.abtn',
        '[data-testid="stick-pad"]',
      ]);
      expect(hits).toEqual([]);

      if (isMobile) {
        const a = page.getByTestId('btn-place');
        const b = page.getByTestId('btn-special');
        await expect(a).toContainText('GENERATOR');
        await expect(a).toContainText('HOLD: LAY');
        await expect(b).toContainText('YELLOW CAB');
        await expect(b).toContainText('+ GENERATOR');
        // no generic controller letters anywhere on the buttons
        for (const el of [a, b]) {
          const words = (await el.innerText()).split(/\s+/).filter(Boolean);
          expect(words).not.toContain('A');
          expect(words).not.toContain('B');
        }
        // the labels stay inside their round faces
        const spill = await page.evaluate(() => {
          const worst = (sel: string) => {
            const btn = document.querySelector(sel)!;
            const r = btn.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const face = r.width / 2 - 5;
            let out = -Infinity;
            const walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT);
            const boxes: DOMRect[] = [];
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
              if (!n.textContent?.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(n);
              boxes.push(range.getBoundingClientRect());
            }
            for (const i of btn.querySelectorAll('img,svg')) boxes.push(i.getBoundingClientRect());
            for (const q of boxes)
              for (const [px, py] of [
                [q.left, q.top],
                [q.right, q.top],
                [q.left, q.bottom],
                [q.right, q.bottom],
              ] as const)
                out = Math.max(out, Math.hypot(px - cx, py - cy) - face);
            return out;
          };
          return { a: worst('[data-testid="btn-place"]'), b: worst('[data-testid="btn-special"]') };
        });
        expect(spill.a, 'A label inside the circle').toBeLessThanOrEqual(0);
        expect(spill.b, 'B label inside the circle').toBeLessThanOrEqual(0);
      }
      await shot(page, info.project.name, `streak-hud-${tod}`);

      // the other reward: KNOCKDOWN replaces the vehicle on the button once the generator is spent
      await mutate(
        page,
        `s.players[0].streakRewards.vehicleGenerator = null; s.players[0].streakRewards.knockdown = true;`,
      );
      await advance(page, 1);
      await show(page, page.getByTestId('streak-knockdown'));
      if (isMobile) {
        await expect(page.getByTestId('btn-special')).toContainText('KNOCKDOWN');
        await shot(page, info.project.name, `streak-knockdown-button-${tod}`);
      }
      expect(errors).toEqual([]);
    });

    test('GLOBAL KNOCKDOWN: a visible throw, a hit, a fall; nobody dies; the owner stays free', async ({
      page,
      isMobile,
    }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await enter(page, night);
      await mutate(
        page,
        GATHER + `s.players[0].streakRewards.knockdown = true; s.players[0].stats.streak = 7;`,
      );
      await advance(page, 1);
      await show(page, page.getByTestId('streak-knockdown'));

      // press B like a player: the key (desktop) or the on-screen button (phone)
      if (isMobile) {
        const b = page.getByTestId('btn-special');
        await b.dispatchEvent('pointerdown', { pointerId: 11, isPrimary: true, pointerType: 'touch' });
        await b.dispatchEvent('pointerup', { pointerId: 11, isPrimary: true, pointerType: 'touch' });
      } else {
        await page.keyboard.press('k');
      }
      await advance(page, 2);
      // the throw is in the air: one object per rival (everyone but the owner), nobody down yet
      const air = await page.evaluate(() => {
        const s = (
          window as never as {
            __WAHALA__: { getState(): { knockdowns: unknown[]; players: { knockedUntil: number }[] } };
          }
        ).__WAHALA__.getState();
        return {
          objects: s.knockdowns.length,
          rivals: s.players.length - 1,
          down: s.players.filter((p) => p.knockedUntil > 0).length,
        };
      });
      expect(air.objects).toBe(air.rivals);
      expect(air.down).toBe(0);
      await show(page, page.getByTestId('streak-knockdown'), false); // spent: it leaves the rail
      await shot(page, info.project.name, `knockdown-throw-${tod}`);

      // mid-flight, then the impact and the fall - every tick is routed to the renderer, as in real play
      await advance(page, 18);
      await shot(page, info.project.name, `knockdown-flight-${tod}`);
      for (let i = 0; i < 60 && !(await anyDown(page)); i++) await advance(page, 1); // the objects land
      await advance(page, 3);
      await shot(page, info.project.name, `knockdown-fall-${tod}`);
      const down = await page.evaluate(() => {
        const s = (
          window as never as {
            __WAHALA__: {
              getState(): {
                tick: number;
                players: { knockedUntil: number; alive: boolean; dazedUntil: number }[];
              };
            };
          }
        ).__WAHALA__.getState();
        return s.players.map((p) => ({
          down: p.knockedUntil > s.tick,
          alive: p.alive,
          locked: p.dazedUntil > s.tick,
        }));
      });
      expect(down[0]).toMatchObject({ down: false, alive: true }); // the owner is untouched
      for (const p of down.slice(1)) expect(p).toMatchObject({ down: true, alive: true, locked: true });
      expect(errors).toEqual([]);
    });

    test('VEHICLE GENERATOR: the carrier, the late release, the landing footprint, then the blast', async ({
      page,
      isMobile,
    }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await enter(page, night);
      await mutate(
        page,
        GATHER + `s.players[0].streakRewards.vehicleGenerator = 'danfo'; s.players[0].stats.streak = 5;`,
      );
      await advance(page, 1);
      await show(page, page.getByTestId('streak-vehicle-generator'));
      await expect(page.getByTestId('streak-vehicle-generator')).toHaveAttribute('data-vehicle', 'danfo');

      if (isMobile) {
        const b = page.getByTestId('btn-special');
        await expect(b).toContainText('DANFO');
        await b.dispatchEvent('pointerdown', { pointerId: 12, isPrimary: true, pointerType: 'touch' });
        await b.dispatchEvent('pointerup', { pointerId: 12, isPrimary: true, pointerType: 'touch' });
      } else {
        await page.keyboard.press('k');
      }
      await advance(page, 2);
      await show(page, page.getByTestId('streak-vehicle-generator'), false); // consumed

      // the carrier runs its lane carrying a live generator, then lets go
      const probe = () =>
        page.evaluate(() => {
          const s = (
            window as never as {
              __WAHALA__: {
                getState(): {
                  tick: number;
                  generators: {
                    vehicleBorne?: boolean;
                    mountedOn?: number;
                    timer: number;
                    flight: unknown;
                  }[];
                  vehicles: { payload: unknown; phase: string }[];
                  players: { alive: boolean }[];
                };
              };
            }
          ).__WAHALA__.getState();
          const g = s.generators.find((o) => o.vehicleBorne);
          return {
            carrier: s.vehicles.some((v) => v.payload && v.phase === 'driving'),
            mounted: !!g && g.mountedOn !== undefined,
            thrown: !!g && g.mountedOn === undefined && g.flight !== null,
            timer: g?.timer ?? -1,
            owner: s.players[0]!.alive,
          };
        });
      let state = await probe();
      for (let i = 0; i < 40 && !state.mounted; i++) {
        await stepTicks(page, 6);
        state = await probe();
      }
      expect(state.mounted).toBe(true);
      expect(state.carrier).toBe(true);
      await advance(page, 1);
      await shot(page, info.project.name, `vehicle-carrier-${tod}`);

      for (let i = 0; i < 60 && !state.thrown; i++) {
        await stepTicks(page, 4);
        state = await probe();
      }
      expect(state.thrown).toBe(true);
      expect(state.timer).toBeGreaterThan(30); // the late release is about a second before the end
      await advance(page, 1);
      await shot(page, info.project.name, `vehicle-release-${tod}`);

      // the blast; the owner is never caught
      await stepTicks(page, 120);
      await advance(page, 1);
      expect((await probe()).owner).toBe(true);
      expect(errors).toEqual([]);
    });
  });
}

/**
 * The same two rewards on a standard 15 x 11 board (a fixed whole-board camera), so the carrier, the thrown generator
 * and the throwers on the building side are all in frame. (The rewards belong to the Rumble rulesets; here the ruleset
 * flag is switched on through the debug handle only to frame the visuals.)
 */
for (const night of [false, true]) {
  const tod = night ? 'night' : 'day';
  test.describe(`kill-streak visuals on a whole board (${tod})`, () => {
    test.setTimeout(600_000);

    async function board(page: Page): Promise<void> {
      await open(page, `&nobots${night ? '&tod=night' : ''}`);
      await startMatch(page, { competitors: 4 });
      await mutate(
        page,
        `s.config.streaks.enabled = true; for (const p of s.players) { p.protectedUntil = 0; p.armour = 0; }`,
      );
      await advance(page, 1);
    }

    test('VEHICLE GENERATOR on a whole board: the carrier, then the release', async ({
      page,
      isMobile,
    }, info) => {
      await board(page);
      await mutate(page, `s.players[0].streakRewards.vehicleGenerator = 'taxi';`);
      await show(page, page.getByTestId('streak-vehicle-generator'));
      if (isMobile) {
        const b = page.getByTestId('btn-special');
        await b.dispatchEvent('pointerdown', { pointerId: 21, isPrimary: true, pointerType: 'touch' });
        await b.dispatchEvent('pointerup', { pointerId: 21, isPrimary: true, pointerType: 'touch' });
      } else {
        await page.keyboard.press('k');
      }
      await advance(page, 2);
      const phase = () =>
        page.evaluate(() => {
          const s = (
            window as never as {
              __WAHALA__: {
                getState(): { generators: { vehicleBorne?: boolean; mountedOn?: number; flight: unknown }[] };
              };
            }
          ).__WAHALA__.getState();
          const g = s.generators.find((o) => o.vehicleBorne);
          return g ? (g.mountedOn !== undefined ? 'carried' : g.flight ? 'thrown' : 'landed') : 'none';
        });
      let now = await phase();
      for (let i = 0; i < 60 && now !== 'carried'; i++) {
        await stepTicks(page, 4);
        now = await phase();
      }
      expect(now).toBe('carried');
      await stepTicks(page, 40);
      await advance(page, 1);
      await page.screenshot({ path: `e2e-shots/${info.project.name}-board-vehicle-carrier-${tod}.png` });
      for (let i = 0; i < 60 && now !== 'thrown'; i++) {
        await stepTicks(page, 2);
        now = await phase();
      }
      expect(now).toBe('thrown');
      await stepTicks(page, 12);
      await advance(page, 1);
      await page.screenshot({ path: `e2e-shots/${info.project.name}-board-vehicle-release-${tod}.png` });
    });

    test('GLOBAL KNOCKDOWN on a whole board: the throwers, the flight, the fall', async ({
      page,
      isMobile,
    }, info) => {
      await board(page);
      await mutate(page, `s.players[0].streakRewards.knockdown = true;`);
      await show(page, page.getByTestId('streak-knockdown'));
      if (isMobile) {
        const b = page.getByTestId('btn-special');
        await b.dispatchEvent('pointerdown', { pointerId: 22, isPrimary: true, pointerType: 'touch' });
        await b.dispatchEvent('pointerup', { pointerId: 22, isPrimary: true, pointerType: 'touch' });
      } else {
        await page.keyboard.press('k');
      }
      await advance(page, 14);
      await page.screenshot({ path: `e2e-shots/${info.project.name}-board-knockdown-flight-${tod}.png` });
      // advance tick by tick until the objects land (the fall pose is a render-time animation: shoot right after)
      for (let i = 0; i < 60 && !(await anyDown(page)); i++) await advance(page, 1);
      await advance(page, 3);
      await page.screenshot({ path: `e2e-shots/${info.project.name}-board-knockdown-fall-${tod}.png` });
      const down = await page.evaluate(() => {
        const s = (
          window as never as {
            __WAHALA__: { getState(): { tick: number; players: { knockedUntil: number }[] } };
          }
        ).__WAHALA__.getState();
        return s.players.map((p) => p.knockedUntil > s.tick);
      });
      expect(down[0]).toBe(false);
      expect(down.slice(1).every(Boolean)).toBe(true);
    });
  });
}
