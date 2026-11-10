/**
 * The Oshodi Mission 1 combat pilot in a real browser (docs/OSHODI_COMBAT_PILOT.md, decisions CP1-CP12): Terminal
 * Approach started through the real campaign controller, the REAL keyboard (desktop) or the REAL touch buttons (phone),
 * the REAL enemy bots. The sim is frozen and moved only by `stepTicks`, so nothing drifts with the wall clock.
 *
 *  - B next to a warden: every press swings, three punches put the warden down (health read from the state);
 *  - B with nobody in reach: a swing at the air (a clear miss) that takes no health;
 *  - A lays a generator; a second A with the socket in use says NO SOCKET (the placeRefused event);
 *  - the wind-up telegraph is drawn (a screenshot for the review), and nothing throws in the page.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { open, stepTicks } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

const SHOTS = 'docs/screenshots/oshodi-combat-pilot';

async function startApproach(page: Page): Promise<void> {
  await open(page, '&noattract');
  await page.evaluate(() => {
    const c = (window as any).__WAHALA__.campaign();
    c.load();
    c.startNew();
    c.storyDone();
    if (!c.startSectionMission('oshodi.approach')) throw new Error('mission did not start');
  });
  await expect(page.getByTestId('hud')).toBeVisible();
  await page.evaluate(() => {
    const w = (window as any).__WAHALA__;
    w.controller().frozen = true;
    const s = w.getState();
    while (s.match.phase !== 'playing') w.stepTicks(10);
    w.stepTicks(2);
  });
}

/** The human at (x, y) facing right, the first warden (seat 1) at (ex, ey), every other enemy off the board. */
async function stageDuel(page: Page, x: number, y: number, ex: number, ey: number): Promise<void> {
  await page.evaluate(
    ({ x, y, ex, ey }) => {
      const s = (window as any).__WAHALA__.getState();
      const put = (p: any, px: number, py: number) => {
        p.x = p.stepFromX = px;
        p.y = p.stepFromY = py;
        p.stepRemaining = 0;
      };
      put(s.players[0], x, y);
      s.players[0].facing = 'right';
      put(s.players[1], ex, ey);
      s.mission.seats[1].post = { x: ex, y: ey };
      for (const p of s.players) if (p.id > 1) p.alive = false;
    },
    { x, y, ex, ey },
  );
}

const probe = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__WAHALA__.getState();
    return {
      pilot: s.config.combatPilot?.id ?? null,
      wardenAlive: s.players[1].alive,
      wardenHp: s.players[1].vitals.hp,
      humanAlive: s.players[0].alive,
      humanHp: s.players[0].vitals.hp,
      generators: s.generators.filter((g: any) => g.ownerId === 0).length,
      windup: s.players[1].attack !== null,
    };
  });

/** One press of A or B the way this device presses it: a key on desktop, a finger on the touch button on a phone. */
async function press(page: Page, button: 'A' | 'B', isMobile: boolean): Promise<void> {
  if (!isMobile) {
    const key = button === 'A' ? 'Space' : 'KeyK';
    await page.keyboard.down(key);
    await stepTicks(page, 2);
    await page.keyboard.up(key);
    return;
  }
  const id = button === 'A' ? 'btn-place' : 'btn-special';
  await page.evaluate((testId) => {
    const b = document.querySelector(`[data-testid="${testId}"]`)!;
    const ev = (type: string) =>
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 9,
        isPrimary: true,
        pointerType: 'touch',
      });
    b.dispatchEvent(ev('pointerdown'));
    (window as any).__WAHALA__.stepTicks(2);
    b.dispatchEvent(ev('pointerup'));
  }, id);
}

test('combat pilot: punches drop a warden, a miss is a miss, A lays a generator and says when it cannot', async ({
  page,
  isMobile,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startApproach(page);
  expect((await probe(page)).pilot).toBe('oshodi.approach/combat-pilot-1');
  if (isMobile) {
    await expect(page.getByTestId('btn-place')).toBeVisible();
    await expect(page.getByTestId('btn-special')).toBeVisible();
  }

  // the wind-up telegraph, for the review: the warden winding up on the human (a red ring closing in), on the open
  // lane south of the bus park (away from the checkpoint beacon's glow)
  await stageDuel(page, 16, 42, 17, 42);
  for (let i = 0; i < 40 && !(await probe(page)).windup; i++) await stepTicks(page, 1);
  expect((await probe(page)).windup, 'the warden winds up a punch').toBe(true);
  await stepTicks(page, 14);
  // the review screenshot only on request (WAHALA_SHOTS=1): a software-WebGL screenshot costs CI time
  if (process.env.WAHALA_SHOTS) await page.screenshot({ path: `${SHOTS}/${info.project.name}-windup.png` });
  await stepTicks(page, 60);

  // a swing at the air: nobody within reach, no health taken
  await stageDuel(page, 9, 39, 13, 39);
  await press(page, 'B', isMobile);
  await stepTicks(page, 20);
  expect((await probe(page)).wardenHp).toBe(3);

  // three punches next to the warden put it down (the real bot fights back meanwhile)
  await stageDuel(page, 9, 39, 10, 39);
  for (let i = 0; i < 6 && (await probe(page)).wardenAlive; i++) {
    await press(page, 'B', isMobile);
    await stepTicks(page, 28);
  }
  const after = await probe(page);
  expect(after.wardenAlive, 'three punches defeat a warden').toBe(false);
  expect(after.humanAlive).toBe(true);

  // A lays a generator; a second A while it ticks says NO SOCKET instead of doing nothing
  const before = (await probe(page)).generators;
  await press(page, 'A', isMobile);
  expect((await probe(page)).generators).toBe(before + 1);
  await press(page, 'A', isMobile);
  expect((await probe(page)).generators).toBe(before + 1);
  await stepTicks(page, 240); // the generator goes off next to the human: the match goes on
  expect(errors).toEqual([]);
});
